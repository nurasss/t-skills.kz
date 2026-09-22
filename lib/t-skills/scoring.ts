import {
  assertValid,
  invalid,
  issue,
  type PairwiseAnswer,
  type PairwiseAnswerMap,
  type PairwiseAnswerValue,
  type PairwiseItem,
  type TraitDefinition,
  type TraitResult,
  type ValidationResult,
  valid,
} from "@/lib/t-skills/contracts";
import { validatePairwiseItemBank } from "@/lib/t-skills/item-bank";
import { T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";

export const PAIRWISE_SCORING_VERSION = T_SKILLS_VERSION_IDS.scoring;
export const PAIRWISE_TIE_BREAKING_VERSION = "normalized-head-to-head-strong-positive-positive-trait-id-v1" as const;

export type PairwiseScore = {
  scoringVersion: typeof PAIRWISE_SCORING_VERSION;
  tieBreakingVersion: typeof PAIRWISE_TIE_BREAKING_VERSION;
  traitResults: TraitResult[];
  topTraits: TraitResult[];
  lowTraits: TraitResult[];
  rawVector: Record<string, number>;
  normalizedVector: Record<string, number>;
};

export type PairwiseScoringStrategy = {
  version: string;
  score(input: { items: readonly PairwiseItem[]; traits: readonly TraitDefinition[]; answers: PairwiseAnswerMap }): PairwiseScore;
};

export function signedContribution(value: PairwiseAnswerValue, side: "left" | "right") {
  return side === "left" ? -value : value;
}

export function normalizePairwiseAnswers(input: PairwiseAnswerMap | readonly PairwiseAnswer[]): ValidationResult<PairwiseAnswerMap> {
  const issues = [] as ReturnType<typeof issue>[];
  const answerMap: PairwiseAnswerMap = {};
  if (Array.isArray(input)) {
    for (const [index, answer] of input.entries()) {
      if (!answer || typeof answer.itemId !== "string") {
        issues.push(issue("ANSWER_NOT_OBJECT", `$[${index}]`, "Answer must contain itemId and value."));
        continue;
      }
      if (answer.itemId in answerMap) issues.push(issue("DUPLICATE_ANSWER", `${answer.itemId}`, "An item may be answered only once."));
      answerMap[answer.itemId] = answer.value;
    }
  } else if (input && typeof input === "object") {
    for (const [itemId, value] of Object.entries(input)) answerMap[itemId] = value;
  } else {
    return invalid([issue("ANSWERS_NOT_OBJECT", "$", "Answers must be an object or array.")]) as ValidationResult<PairwiseAnswerMap>;
  }
  for (const [itemId, value] of Object.entries(answerMap)) {
    if (!Number.isInteger(value) || value < -2 || value > 2) issues.push(issue("ANSWER_RANGE", itemId, "Pairwise answer must be one of -2, -1, 0, 1, 2."));
  }
  return issues.length ? invalid(issues) : valid(answerMap);
}

export function validatePairwiseAnswers(items: readonly PairwiseItem[], input: PairwiseAnswerMap | readonly PairwiseAnswer[]): ValidationResult<PairwiseAnswerMap> {
  const normalized = normalizePairwiseAnswers(input);
  if (!normalized.ok) return normalized;
  const issues = [] as ReturnType<typeof issue>[];
  const itemIds = new Set(items.map((item) => item.id));
  for (const itemId of Object.keys(normalized.value)) {
    if (!itemIds.has(itemId)) issues.push(issue("UNKNOWN_ITEM", itemId, `Answer references an item outside the item bank: ${itemId}.`));
  }
  for (const item of items) {
    if (!(item.id in normalized.value)) issues.push(issue("MISSING_ANSWER", item.id, `Missing answer for ${item.id}.`));
  }
  return issues.length ? invalid(issues) : valid(normalized.value);
}

export const PairwiseScoringV1: PairwiseScoringStrategy = {
  version: PAIRWISE_SCORING_VERSION,
  score({ items, traits, answers }) {
    const bankResult = validatePairwiseItemBank(items, traits);
    assertValid(bankResult);
    const answerResult = validatePairwiseAnswers(items, answers);
    const normalized = assertValid(answerResult);
    const rawVector = Object.fromEntries(traits.map((trait) => [trait.id, 0])) as Record<string, number>;
    const normalizedVector = Object.fromEntries(traits.map((trait) => [trait.id, 0])) as Record<string, number>;
    const strength = Object.fromEntries(traits.map((trait) => [trait.id, 0])) as Record<string, number>;
    const strongPositive = Object.fromEntries(traits.map((trait) => [trait.id, 0])) as Record<string, number>;
    const positive = Object.fromEntries(traits.map((trait) => [trait.id, 0])) as Record<string, number>;
    const exposure = Object.fromEntries(traits.map((trait) => [trait.id, 0])) as Record<string, number>;
    const headToHead = new Map<string, number>();

    for (const item of items) {
      const value = normalized[item.id];
      const leftContribution = signedContribution(value, "left");
      const rightContribution = signedContribution(value, "right");
      rawVector[item.leftTraitId] += leftContribution;
      rawVector[item.rightTraitId] += rightContribution;
      strength[item.leftTraitId] += Math.abs(leftContribution);
      strength[item.rightTraitId] += Math.abs(rightContribution);
      if (leftContribution === 2) strongPositive[item.leftTraitId] += 1;
      if (rightContribution === 2) strongPositive[item.rightTraitId] += 1;
      if (leftContribution > 0) positive[item.leftTraitId] += 1;
      if (rightContribution > 0) positive[item.rightTraitId] += 1;
      exposure[item.leftTraitId] += 1;
      exposure[item.rightTraitId] += 1;
      const pairKey = [item.leftTraitId, item.rightTraitId].sort().join("|");
      const canonicalFirst = item.leftTraitId < item.rightTraitId ? leftContribution : rightContribution;
      headToHead.set(pairKey, (headToHead.get(pairKey) ?? 0) + canonicalFirst);
    }

    for (const trait of traits) {
      normalizedVector[trait.id] = rawVector[trait.id] / Math.max(1, exposure[trait.id] * 2);
    }

    const ranked = traits
      .map((trait) => ({
        traitId: trait.id,
        rawScore: rawVector[trait.id],
        normalizedScore: normalizedVector[trait.id],
        rank: 0,
        strengthOfPreference: strength[trait.id],
        strongPositiveCount: strongPositive[trait.id],
        positiveCount: positive[trait.id],
        exposure: exposure[trait.id],
      } satisfies TraitResult))
      .sort((left, right) => {
        const normalizedDifference = right.normalizedScore - left.normalizedScore;
        if (normalizedDifference !== 0) return normalizedDifference;
        const pairKey = [left.traitId, right.traitId].sort().join("|");
        const pairScore = headToHead.get(pairKey) ?? 0;
        // Array#sort expects a negative value when `left` should appear first.
        // `pairScore` is positive when the lexicographically first trait won,
        // so the comparator must invert it here. Keeping this sign explicit is
        // important: a reversed tie-break silently changes the public 1..25
        // ranking while leaving all raw scores untouched.
        const headToHeadDifference = left.traitId < right.traitId ? -pairScore : pairScore;
        return headToHeadDifference ||
          right.strongPositiveCount - left.strongPositiveCount ||
          right.positiveCount - left.positiveCount ||
          left.traitId.localeCompare(right.traitId);
      })
      .map((result, index) => ({ ...result, rank: index + 1 }));

    return {
      scoringVersion: PAIRWISE_SCORING_VERSION,
      tieBreakingVersion: PAIRWISE_TIE_BREAKING_VERSION,
      traitResults: ranked,
      topTraits: ranked.slice(0, 5),
      lowTraits: ranked.slice(-5),
      rawVector,
      normalizedVector,
    };
  },
};

export function scorePairwiseV1(input: { items: readonly PairwiseItem[]; traits: readonly TraitDefinition[]; answers: PairwiseAnswerMap | readonly PairwiseAnswer[] }) {
  const normalized = assertValid(normalizePairwiseAnswers(input.answers));
  return PairwiseScoringV1.score({ items: input.items, traits: input.traits, answers: normalized });
}

/**
 * Strategy boundary for a future Bradley–Terry/Thurstone implementation. The
 * item and response contracts stay unchanged when a different strategy is
 * introduced.
 */
export function scoreWithStrategy(strategy: PairwiseScoringStrategy, input: { items: readonly PairwiseItem[]; traits: readonly TraitDefinition[]; answers: PairwiseAnswerMap | readonly PairwiseAnswer[] }) {
  const normalized = assertValid(normalizePairwiseAnswers(input.answers));
  return strategy.score({ items: input.items, traits: input.traits, answers: normalized });
}
