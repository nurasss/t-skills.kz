import type {
  BaseTraitScore,
  ClarificationAnswer,
  ClarificationItem,
  FinalTraitScore,
  V5AnswerValue,
  V5PairwiseAnswer,
  V5PairwiseAnswerMap,
  V5PairwiseItem,
  V5TraitDefinition,
} from "@/lib/t-skills/v5/contracts";
import { validateV5PairwiseItemBank } from "@/lib/t-skills/v5/item-bank";
import { T_SKILLS_V5_VERSION_IDS } from "@/lib/t-skills/v5/versions";

export const V5_SCORING_VERSION = T_SKILLS_V5_VERSION_IDS.scoring;
export const V5_TIE_BREAK_VERSION = "final-mean-base-mean-consistency-head-to-head-trait-id-v1" as const;

export type V5BaseScoreResult = {
  scoringVersion: typeof V5_SCORING_VERSION;
  tieBreakingVersion: typeof V5_TIE_BREAK_VERSION;
  base: BaseTraitScore[];
};

export type V5FinalScoreResult = V5BaseScoreResult & {
  final: FinalTraitScore[];
  clarificationAnswers: ClarificationAnswer[];
};

function issue(message: string): never {
  throw new Error(message);
}

function isAnswerValue(value: unknown): value is V5AnswerValue {
  return Number.isInteger(value) && Number(value) >= -2 && Number(value) <= 2;
}

function normalizeAnswers(items: readonly V5PairwiseItem[], input: V5PairwiseAnswerMap | readonly V5PairwiseAnswer[]) {
  const map: V5PairwiseAnswerMap = {};
  if (Array.isArray(input)) {
    for (const answer of input) {
      if (!answer || typeof answer.itemId !== "string" || !isAnswerValue(answer.value)) issue("V5_INVALID_ANSWER");
      if (answer.itemId in map) issue(`V5_DUPLICATE_ANSWER:${answer.itemId}`);
      map[answer.itemId] = answer.value;
    }
  } else if (input && typeof input === "object") {
    for (const [itemId, value] of Object.entries(input)) {
      if (!isAnswerValue(value)) issue(`V5_INVALID_ANSWER:${itemId}`);
      map[itemId] = value;
    }
  } else issue("V5_ANSWERS_NOT_OBJECT");
  const ids = new Set(items.map((item) => item.id));
  for (const itemId of Object.keys(map)) if (!ids.has(itemId)) issue(`V5_UNKNOWN_ITEM:${itemId}`);
  for (const item of items) if (!(item.id in map)) issue(`V5_MISSING_ANSWER:${item.id}`);
  return map;
}

export function signedContribution(value: V5AnswerValue, side: "left" | "right") {
  return side === "left" ? -value : value;
}

function mean(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function variance(values: readonly number[], average = mean(values)) {
  return values.length ? values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length : 0;
}

function weightedVariance(
  baseValues: readonly number[],
  extraValues: readonly number[],
  extraWeight: number,
  average: number,
) {
  const totalWeight = baseValues.length + extraValues.length * extraWeight;
  if (!totalWeight) return 0;
  const weightedSum = baseValues.reduce((sum, value) => sum + (value - average) ** 2, 0) +
    extraValues.reduce((sum, value) => sum + extraWeight * (value - average) ** 2, 0);
  return weightedSum / totalWeight;
}

function rounded(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function headToHeadMap(items: readonly V5PairwiseItem[], answers: V5PairwiseAnswerMap) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = [item.leftTraitId, item.rightTraitId].sort().join("|");
    const left = signedContribution(answers[item.id]!, "left");
    const canonical = item.leftTraitId < item.rightTraitId ? left : -left;
    map.set(key, (map.get(key) ?? 0) + canonical);
  }
  return map;
}

function rankBase(scores: BaseTraitScore[], traits: readonly V5TraitDefinition[], h2h: Map<string, number>) {
  const traitOrder = new Map(traits.map((trait, index) => [trait.id, index]));
  return [...scores]
    .sort((left, right) => {
      const meanDifference = right.meanScore - left.meanScore;
      if (meanDifference !== 0) return meanDifference;
      const consistencyDifference = left.variance - right.variance;
      if (consistencyDifference !== 0) return consistencyDifference;
      const key = [left.traitId, right.traitId].sort().join("|");
      const pairScore = h2h.get(key) ?? 0;
      const pairDifference = left.traitId < right.traitId ? -pairScore : pairScore;
      if (pairDifference !== 0) return pairDifference;
      return (traitOrder.get(left.traitId) ?? Number.MAX_SAFE_INTEGER) - (traitOrder.get(right.traitId) ?? Number.MAX_SAFE_INTEGER) || left.traitId.localeCompare(right.traitId);
    })
    .map((score, index) => ({ ...score, rank: index + 1 }));
}

function rankFinal(scores: FinalTraitScore[], traits: readonly V5TraitDefinition[], h2h: Map<string, number>) {
  const traitOrder = new Map(traits.map((trait, index) => [trait.id, index]));
  return [...scores]
    .sort((left, right) => {
      const finalMeanDifference = right.meanScore - left.meanScore;
      if (finalMeanDifference !== 0) return finalMeanDifference;
      const baseMeanDifference = right.baseMeanScore - left.baseMeanScore;
      if (baseMeanDifference !== 0) return baseMeanDifference;
      const consistencyDifference = left.variance - right.variance;
      if (consistencyDifference !== 0) return consistencyDifference;
      const key = [left.traitId, right.traitId].sort().join("|");
      const pairScore = h2h.get(key) ?? 0;
      const pairDifference = left.traitId < right.traitId ? -pairScore : pairScore;
      if (pairDifference !== 0) return pairDifference;
      return (traitOrder.get(left.traitId) ?? Number.MAX_SAFE_INTEGER) - (traitOrder.get(right.traitId) ?? Number.MAX_SAFE_INTEGER) || left.traitId.localeCompare(right.traitId);
    })
    .map((score, index) => ({ ...score, rank: index + 1 }));
}

export function scoreBaseProfile(input: {
  items: readonly V5PairwiseItem[];
  traits: readonly V5TraitDefinition[];
  answers: V5PairwiseAnswerMap | readonly V5PairwiseAnswer[];
}): V5BaseScoreResult {
  const bank = validateV5PairwiseItemBank(input.items, input.traits);
  if (!bank.ok) issue(bank.issues.map((item) => `${item.code}:${item.path}`).join(","));
  const answers = normalizeAnswers(input.items, input.answers);
  const contributions = new Map(input.traits.map((trait) => [trait.id, [] as number[]]));
  for (const item of input.items) {
    contributions.get(item.leftTraitId)?.push(signedContribution(answers[item.id]!, "left"));
    contributions.get(item.rightTraitId)?.push(signedContribution(answers[item.id]!, "right"));
  }
  const scores = input.traits.map((trait) => {
    const values = contributions.get(trait.id) ?? [];
    const average = mean(values);
    return { traitId: trait.id, rawScore: values.reduce((sum, value) => sum + value, 0), meanScore: rounded(average), variance: rounded(variance(values, average)), contributions: [...values] } satisfies BaseTraitScore;
  });
  return {
    scoringVersion: V5_SCORING_VERSION,
    tieBreakingVersion: V5_TIE_BREAK_VERSION,
    base: rankBase(scores, input.traits, headToHeadMap(input.items, answers)),
  };
}

export function scoreFinalProfile(input: {
  items: readonly V5PairwiseItem[];
  traits: readonly V5TraitDefinition[];
  answers: V5PairwiseAnswerMap | readonly V5PairwiseAnswer[];
  clarificationItems: readonly ClarificationItem[];
  clarificationAnswers: readonly ClarificationAnswer[];
  clarificationWeight?: number;
}): V5FinalScoreResult {
  const baseResult = scoreBaseProfile(input);
  const weight = input.clarificationWeight ?? 1;
  if (!Number.isFinite(weight) || weight <= 0 || weight > 10) issue("V5_INVALID_CLARIFICATION_WEIGHT");
  const clarificationById = new Map(input.clarificationItems.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const perTrait = new Map(input.traits.map((trait) => [trait.id, [] as number[]]));
  const h2h = headToHeadMap(input.items, normalizeAnswers(input.items, input.answers));
  for (const answer of input.clarificationAnswers) {
    if (seen.has(answer.itemId)) issue(`V5_DUPLICATE_CLARIFICATION:${answer.itemId}`);
    seen.add(answer.itemId);
    if (!isAnswerValue(answer.value)) issue(`V5_INVALID_CLARIFICATION:${answer.itemId}`);
    const item = clarificationById.get(answer.itemId);
    if (!item || item.type !== "trait_clarification" || item.targetTraits.length !== 2) issue(`V5_INVALID_CLARIFICATION_ITEM:${answer.itemId}`);
    const [leftTraitId, rightTraitId] = item!.targetTraits;
    if (!perTrait.has(leftTraitId) || !perTrait.has(rightTraitId)) issue(`V5_UNKNOWN_CLARIFICATION_TRAIT:${answer.itemId}`);
    const left = signedContribution(answer.value, "left");
    const right = signedContribution(answer.value, "right");
    perTrait.get(leftTraitId)?.push(left);
    perTrait.get(rightTraitId)?.push(right);
    const key = [leftTraitId, rightTraitId].sort().join("|");
    const canonical = leftTraitId < rightTraitId ? left : -left;
    h2h.set(key, (h2h.get(key) ?? 0) + canonical * weight);
  }

  const scores: FinalTraitScore[] = baseResult.base.map((base) => {
    const extra = perTrait.get(base.traitId) ?? [];
    const weightedExtra = extra.reduce((sum, value) => sum + value * weight, 0);
    const effectiveObservations = base.contributions.length + extra.length * weight;
    const finalMean = effectiveObservations ? (base.rawScore + weightedExtra) / effectiveObservations : 0;
    return {
      ...base,
      rawScore: rounded(base.rawScore + weightedExtra),
      meanScore: rounded(finalMean),
      variance: rounded(weightedVariance(base.contributions, extra, weight, finalMean)),
      baseRawScore: base.rawScore,
      baseMeanScore: base.meanScore,
      clarificationContributions: [...extra],
      effectiveObservations: rounded(effectiveObservations),
      rank: base.rank ?? 0,
    };
  });
  return {
    scoringVersion: V5_SCORING_VERSION,
    tieBreakingVersion: V5_TIE_BREAK_VERSION,
    base: baseResult.base,
    final: rankFinal(scores, input.traits, h2h),
    clarificationAnswers: input.clarificationAnswers.map((answer) => ({ ...answer })),
  };
}
