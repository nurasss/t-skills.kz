import {
  assertValid,
  invalid,
  isRecord,
  issue,
  type PairwiseItem,
  type TraitDefinition,
  type ValidationResult,
  valid,
} from "@/lib/t-skills/contracts";
import {
  T_SKILLS_STATIC_ITEM_COUNT,
  T_SKILLS_TRAIT_COUNT,
  T_SKILLS_TRAIT_EXPOSURE_MAX,
  T_SKILLS_TRAIT_EXPOSURE_MIN,
  T_SKILLS_TRAITS_WITH_MAX_EXPOSURE,
  T_SKILLS_TRAITS_WITH_MIN_EXPOSURE,
  T_SKILLS_VERSION_IDS,
} from "@/lib/t-skills/versions";
import { T_SKILLS_PAIRWISE_BANK_V1 } from "@/lib/t-skills/content-v4";

export const T_SKILLS_ITEM_BANK_VERSION = T_SKILLS_VERSION_IDS.itemBank;

function text(value: unknown, path: string, issues: ReturnType<typeof issue>[]) {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(issue("REQUIRED_TEXT", path, "Expected a non-empty string."));
    return "";
  }
  if (value.length > 2_000) issues.push(issue("TEXT_TOO_LONG", path, "Text exceeds 2000 characters."));
  return value.trim();
}

export function validatePairwiseItemBank(
  input: unknown,
  taxonomy: readonly TraitDefinition[],
  expectedVersion = T_SKILLS_ITEM_BANK_VERSION,
): ValidationResult<PairwiseItem[]> {
  const issues: ReturnType<typeof issue>[] = [];
  if (!Array.isArray(input)) return invalid([issue("ITEM_BANK_NOT_ARRAY", "$", "Pairwise item bank must be an array.")]);
  if (input.length !== T_SKILLS_STATIC_ITEM_COUNT) {
    issues.push(issue("ITEM_COUNT", "$", `Expected exactly ${T_SKILLS_STATIC_ITEM_COUNT} items.`));
  }
  if (taxonomy.length !== T_SKILLS_TRAIT_COUNT) {
    issues.push(issue("TAXONOMY_COUNT", "taxonomy", `Expected exactly ${T_SKILLS_TRAIT_COUNT} taxonomy traits.`));
  }
  const taxonomyIds = new Set(taxonomy.map((trait) => trait.id));
  const seenIds = new Set<string>();
  const exposure = new Map<string, number>();
  const items: PairwiseItem[] = [];

  for (const [index, candidate] of input.entries()) {
    const path = `$[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(issue("ITEM_NOT_OBJECT", path, "Item must be an object."));
      continue;
    }
    const id = text(candidate.id, `${path}.id`, issues);
    const leftTraitId = text(candidate.leftTraitId, `${path}.leftTraitId`, issues);
    const rightTraitId = text(candidate.rightTraitId, `${path}.rightTraitId`, issues);
    const leftText = text(candidate.leftText, `${path}.leftText`, issues);
    const rightText = text(candidate.rightText, `${path}.rightText`, issues);
    const version = text(candidate.version, `${path}.version`, issues);
    if (id && seenIds.has(id)) issues.push(issue("DUPLICATE_ITEM_ID", `${path}.id`, `Duplicate item id: ${id}.`));
    if (id) seenIds.add(id);
    if (version && version !== expectedVersion) issues.push(issue("ITEM_VERSION", `${path}.version`, `Expected item bank version ${expectedVersion}.`));
    if (leftTraitId && !taxonomyIds.has(leftTraitId)) issues.push(issue("UNKNOWN_TRAIT", `${path}.leftTraitId`, `Unknown trait: ${leftTraitId}.`));
    if (rightTraitId && !taxonomyIds.has(rightTraitId)) issues.push(issue("UNKNOWN_TRAIT", `${path}.rightTraitId`, `Unknown trait: ${rightTraitId}.`));
    if (leftTraitId && rightTraitId && leftTraitId === rightTraitId) issues.push(issue("SELF_PAIR", path, "Left and right traits must be different."));
    if (leftText && rightText && leftText === rightText) issues.push(issue("DUPLICATE_STATEMENT", path, "Left and right statements must be different."));
    if (leftTraitId) exposure.set(leftTraitId, (exposure.get(leftTraitId) ?? 0) + 1);
    if (rightTraitId) exposure.set(rightTraitId, (exposure.get(rightTraitId) ?? 0) + 1);
    items.push({ id, leftTraitId, rightTraitId, leftText, rightText, version });
  }

  const uniqueTraits = new Set(items.flatMap((item) => [item.leftTraitId, item.rightTraitId].filter(Boolean)));
  if (uniqueTraits.size !== T_SKILLS_TRAIT_COUNT) {
    issues.push(issue("UNIQUE_TRAIT_COUNT", "$", `Expected exactly ${T_SKILLS_TRAIT_COUNT} traits in item pairs.`));
  }
  let minExposureCount = 0;
  let maxExposureCount = 0;
  for (const traitId of taxonomyIds) {
    const count = exposure.get(traitId) ?? 0;
    if (count < T_SKILLS_TRAIT_EXPOSURE_MIN || count > T_SKILLS_TRAIT_EXPOSURE_MAX) {
      issues.push(issue("TRAIT_EXPOSURE", `trait:${traitId}`, `Expected ${T_SKILLS_TRAIT_EXPOSURE_MIN} or ${T_SKILLS_TRAIT_EXPOSURE_MAX} participations; got ${count}.`));
    }
    if (count === T_SKILLS_TRAIT_EXPOSURE_MIN) minExposureCount += 1;
    if (count === T_SKILLS_TRAIT_EXPOSURE_MAX) maxExposureCount += 1;
  }
  if (minExposureCount !== T_SKILLS_TRAITS_WITH_MIN_EXPOSURE) {
    issues.push(issue("EXPOSURE_DISTRIBUTION", "$", `Expected ${T_SKILLS_TRAITS_WITH_MIN_EXPOSURE} traits with ${T_SKILLS_TRAIT_EXPOSURE_MIN} participations; got ${minExposureCount}.`));
  }
  if (maxExposureCount !== T_SKILLS_TRAITS_WITH_MAX_EXPOSURE) {
    issues.push(issue("EXPOSURE_DISTRIBUTION", "$", `Expected ${T_SKILLS_TRAITS_WITH_MAX_EXPOSURE} traits with ${T_SKILLS_TRAIT_EXPOSURE_MAX} participations; got ${maxExposureCount}.`));
  }
  for (const traitId of uniqueTraits) {
    if (!taxonomyIds.has(traitId)) issues.push(issue("UNKNOWN_TRAIT", "items", `Unknown trait: ${traitId}.`));
  }

  return issues.length ? invalid(issues) : valid(items);
}

export function parsePairwiseItemBankJson(
  json: string,
  taxonomy: readonly TraitDefinition[],
  expectedVersion = T_SKILLS_ITEM_BANK_VERSION,
): ValidationResult<PairwiseItem[]> {
  try {
    return validatePairwiseItemBank(JSON.parse(json) as unknown, taxonomy, expectedVersion);
  } catch {
    return invalid([issue("INVALID_JSON", "$", "Pairwise item bank is not valid JSON.")]);
  }
}

export function assertPairwiseItemBank(
  input: unknown,
  taxonomy: readonly TraitDefinition[],
  expectedVersion = T_SKILLS_ITEM_BANK_VERSION,
): PairwiseItem[] {
  return assertValid(validatePairwiseItemBank(input, taxonomy, expectedVersion));
}

export const T_SKILLS_PRODUCTION_ITEM_BANK: readonly PairwiseItem[] = T_SKILLS_PAIRWISE_BANK_V1;

/** O(1) item lookup for request validation and response persistence. */
export const T_SKILLS_PAIRWISE_ITEM_BY_ID: ReadonlyMap<string, PairwiseItem> = new Map(
  T_SKILLS_PRODUCTION_ITEM_BANK.map((item) => [item.id, item]),
);
