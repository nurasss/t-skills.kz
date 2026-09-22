import type {
  ClarificationAnswer,
  ClarificationItem,
  TraitUncertainty,
  V5AnswerValue,
  V5ValidationIssue,
  V5ValidationResult,
} from "@/lib/t-skills/v5/contracts";
import { T_SKILLS_V5_CLARIFICATION_MAX, T_SKILLS_V5_CLARIFICATION_TARGET, T_SKILLS_V5_VERSION_IDS } from "@/lib/t-skills/v5/versions";

const OPTION_IDS = ["A", "B", "C", "D"] as const;

function issue(code: string, path: string, message: string): V5ValidationIssue {
  return { code, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value: unknown, path: string, issues: V5ValidationIssue[]) {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(issue("REQUIRED_TEXT", path, "Expected a non-empty string."));
    return "";
  }
  return value.trim();
}

function isAnswerValue(value: unknown): value is V5AnswerValue {
  return Number.isInteger(value) && Number(value) >= -2 && Number(value) <= 2;
}

function validateCareerSignals(value: unknown, path: string, issues: V5ValidationIssue[]) {
  if (!isRecord(value)) {
    issues.push(issue("CAREER_SIGNALS_OBJECT", path, "careerSignals must be an object."));
    return {};
  }
  const signals: Record<string, number> = {};
  for (const [key, signal] of Object.entries(value)) {
    if (!key.trim() || typeof signal !== "number" || !Number.isFinite(signal) || signal < -1 || signal > 1) {
      issues.push(issue("CAREER_SIGNAL_VALUE", `${path}.${key}`, "Career signal must be a finite number between -1 and 1."));
      continue;
    }
    signals[key] = signal;
  }
  return signals;
}

export function validateClarificationBank(
  input: unknown,
  traitIds: readonly string[],
  expectedVersion = T_SKILLS_V5_VERSION_IDS.clarificationBank,
  options: { requireTraitCoverage?: boolean } = {},
): V5ValidationResult<ClarificationItem[]> {
  const issues: V5ValidationIssue[] = [];
  if (!Array.isArray(input)) return { ok: false, issues: [issue("CLARIFICATION_BANK_NOT_ARRAY", "$", "Clarification bank must be an array.")] };
  const knownTraits = new Set(traitIds);
  const seen = new Set<string>();
  const items: ClarificationItem[] = [];
  const traitCoverage = new Map(traitIds.map((traitId) => [traitId, 0]));

  for (const [index, candidate] of input.entries()) {
    const path = `$[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(issue("CLARIFICATION_NOT_OBJECT", path, "Clarification item must be an object."));
      continue;
    }
    const id = requiredText(candidate.id, `${path}.id`, issues);
    const type = candidate.type;
    const version = requiredText(candidate.version, `${path}.version`, issues);
    const priority = candidate.priority;
    if (id && seen.has(id)) issues.push(issue("DUPLICATE_CLARIFICATION_ID", `${path}.id`, `Duplicate clarification id: ${id}.`));
    if (id) seen.add(id);
    if (type !== "trait_clarification" && type !== "career_tiebreak") issues.push(issue("CLARIFICATION_TYPE", `${path}.type`, "Unsupported clarification type."));
    if (version !== expectedVersion) issues.push(issue("CLARIFICATION_VERSION", `${path}.version`, `Expected ${expectedVersion}.`));
    if (typeof priority !== "number" || !Number.isFinite(priority)) issues.push(issue("CLARIFICATION_PRIORITY", `${path}.priority`, "Priority must be a finite number."));

    const rawTargets = candidate.targetTraits;
    if (type === "trait_clarification" && (!Array.isArray(rawTargets) || rawTargets.length === 0)) issues.push(issue("TARGET_TRAITS", `${path}.targetTraits`, "At least one target trait is required."));
    const targetTraits = Array.isArray(rawTargets) ? rawTargets.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()) : [];
    if (new Set(targetTraits).size !== targetTraits.length) issues.push(issue("DUPLICATE_TARGET_TRAIT", `${path}.targetTraits`, "Target traits must be unique."));
    for (const [targetIndex, traitId] of targetTraits.entries()) {
      if (!knownTraits.has(traitId)) issues.push(issue("UNKNOWN_TRAIT", `${path}.targetTraits[${targetIndex}]`, `Unknown trait: ${traitId}.`));
      traitCoverage.set(traitId, (traitCoverage.get(traitId) ?? 0) + (type === "trait_clarification" ? 1 : 0));
    }

    const leftText = candidate.leftText === undefined ? undefined : requiredText(candidate.leftText, `${path}.leftText`, issues);
    const rightText = candidate.rightText === undefined ? undefined : requiredText(candidate.rightText, `${path}.rightText`, issues);
    const rawOptions = candidate.options;
    let options: ClarificationItem["options"];
    if (type === "trait_clarification") {
      if (targetTraits.length !== 2) issues.push(issue("TRAIT_TARGET_COUNT", `${path}.targetTraits`, "Trait clarification must target exactly two traits."));
      if (!leftText || !rightText) issues.push(issue("TRAIT_TEXT_REQUIRED", path, "Trait clarification requires leftText and rightText."));
    } else {
      if (!Array.isArray(rawOptions) || rawOptions.length !== 4) issues.push(issue("TIEBREAK_OPTION_COUNT", `${path}.options`, "Career tie-break requires exactly four options."));
      const parsed = (Array.isArray(rawOptions) ? rawOptions : []).map((rawOption, optionIndex) => {
        const optionPath = `${path}.options[${optionIndex}]`;
        if (!isRecord(rawOption)) {
          issues.push(issue("OPTION_NOT_OBJECT", optionPath, "Option must be an object."));
          return { id: OPTION_IDS[optionIndex] ?? "A", text: "", careerSignals: {} };
        }
        const expectedId = OPTION_IDS[optionIndex];
        if (rawOption.id !== expectedId) issues.push(issue("OPTION_ID_ORDER", `${optionPath}.id`, `Expected ${expectedId}.`));
        const optionText = requiredText(rawOption.text, `${optionPath}.text`, issues);
        const careerSignals = validateCareerSignals(rawOption.careerSignals, `${optionPath}.careerSignals`, issues);
        return { id: expectedId, text: optionText, careerSignals };
      });
      if (parsed.length === 4) options = parsed as ClarificationItem["options"];
    }

    const rawGroups = candidate.candidateGroups;
    const candidateGroups = rawGroups === undefined ? undefined : Array.isArray(rawGroups) ? rawGroups.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()) : [];
    if (type === "career_tiebreak" && (!candidateGroups || candidateGroups.length === 0)) issues.push(issue("CANDIDATE_GROUPS", `${path}.candidateGroups`, "Career tie-break requires candidate groups."));
    const weight = candidate.weight;
    if (weight !== undefined && (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0 || weight > 10)) issues.push(issue("CLARIFICATION_WEIGHT", `${path}.weight`, "Weight must be between 0 and 10."));
    items.push({ id, type: type === "career_tiebreak" ? type : "trait_clarification", targetTraits, leftText, rightText, options, candidateGroups, priority: typeof priority === "number" && Number.isFinite(priority) ? priority : 0, weight: typeof weight === "number" ? weight : undefined, version });
  }

  if (options.requireTraitCoverage && traitIds.some((traitId) => (traitCoverage.get(traitId) ?? 0) === 0)) {
    issues.push(issue("TRAIT_CLARIFICATION_COVERAGE", "$", "Every trait needs at least one clarification item before production activation."));
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: items };
}

export function parseClarificationBankJson(json: string, traitIds: readonly string[], expectedVersion = T_SKILLS_V5_VERSION_IDS.clarificationBank, options?: { requireTraitCoverage?: boolean }) {
  try {
    return validateClarificationBank(JSON.parse(json) as unknown, traitIds, expectedVersion, options);
  } catch {
    return { ok: false, issues: [issue("INVALID_JSON", "$", "Clarification bank is not valid JSON.")] } as V5ValidationResult<ClarificationItem[]>;
  }
}

function targetUncertainty(item: ClarificationItem, uncertainty: readonly TraitUncertainty[]) {
  const byId = new Map(uncertainty.map((entry) => [entry.traitId, entry.uncertaintyScore]));
  return item.targetTraits.reduce((sum, traitId) => sum + (byId.get(traitId) ?? 0), 0) / Math.max(1, item.targetTraits.length);
}

export function selectClarificationItems(input: {
  bank: readonly ClarificationItem[];
  uncertainty: readonly TraitUncertainty[];
  usedIds?: readonly string[];
  target?: number;
  max?: number;
}) {
  const target = Math.max(0, Math.min(T_SKILLS_V5_CLARIFICATION_TARGET, Math.trunc(input.target ?? T_SKILLS_V5_CLARIFICATION_TARGET)));
  const max = Math.max(target, Math.min(T_SKILLS_V5_CLARIFICATION_MAX, Math.trunc(input.max ?? T_SKILLS_V5_CLARIFICATION_MAX)));
  const used = new Set(input.usedIds ?? []);
  const ranked = input.bank
    .filter((item) => item.type === "trait_clarification" && !used.has(item.id))
    .map((item) => ({ item, score: targetUncertainty(item, input.uncertainty) + item.priority / 1_000_000 }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || right.item.priority - left.item.priority || left.item.id.localeCompare(right.item.id));
  const selected: ClarificationItem[] = [];
  const selectedTraits = new Set<string>();
  for (const entry of ranked) {
    if (selected.length >= target) break;
    const addsSignal = entry.item.targetTraits.some((traitId) => !selectedTraits.has(traitId));
    if (!addsSignal && ranked.length >= target) continue;
    selected.push(entry.item);
    entry.item.targetTraits.forEach((traitId) => selectedTraits.add(traitId));
  }
  return selected.slice(0, max);
}

export function validateClarificationAnswer(answer: unknown, item: ClarificationItem): answer is ClarificationAnswer {
  return Boolean(answer) && typeof answer === "object" && !Array.isArray(answer) && (answer as Record<string, unknown>).itemId === item.id && isAnswerValue((answer as Record<string, unknown>).value);
}
