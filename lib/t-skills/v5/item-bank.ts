import {
  type V5PairwiseItem,
  type V5TraitDefinition,
  type V5ValidationIssue,
  type V5ValidationResult,
} from "@/lib/t-skills/v5/contracts";
import {
  T_SKILLS_V5_APPROVED_ITEM_BANK,
  T_SKILLS_V5_APPROVED_TRAIT_LABELS,
} from "@/lib/t-skills/v5/approved-item-bank";
import { T_SKILLS_V5_ITEM_COUNT, T_SKILLS_V5_TRAIT_COUNT, T_SKILLS_V5_TRAIT_EXPOSURE, T_SKILLS_V5_VERSION_IDS } from "@/lib/t-skills/v5/versions";

export { T_SKILLS_V5_APPROVED_ITEM_BANK, T_SKILLS_V5_APPROVED_TRAIT_LABELS } from "@/lib/t-skills/v5/approved-item-bank";

function issue(code: string, path: string, message: string): V5ValidationIssue {
  return { code, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, path: string, issues: V5ValidationIssue[]) {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(issue("REQUIRED_TEXT", path, "Expected a non-empty string."));
    return "";
  }
  if (value.length > 2_000) issues.push(issue("TEXT_TOO_LONG", path, "Text exceeds 2000 characters."));
  return value.trim();
}

export function itemPairKey(leftTraitId: string, rightTraitId: string) {
  return [leftTraitId, rightTraitId].sort().join("|");
}

export type ItemBankSideBalance = {
  left: Record<string, number>;
  right: Record<string, number>;
  balanced: boolean;
};

export function sideBalance(items: readonly V5PairwiseItem[], traitIds: readonly string[]): ItemBankSideBalance {
  const left = Object.fromEntries(traitIds.map((traitId) => [traitId, 0])) as Record<string, number>;
  const right = Object.fromEntries(traitIds.map((traitId) => [traitId, 0])) as Record<string, number>;
  for (const item of items) {
    left[item.leftTraitId] = (left[item.leftTraitId] ?? 0) + 1;
    right[item.rightTraitId] = (right[item.rightTraitId] ?? 0) + 1;
  }
  return {
    left,
    right,
    balanced: traitIds.every((traitId) => left[traitId] === 3 && right[traitId] === 3),
  };
}

export function validateV5PairwiseItemBank(
  input: unknown,
  taxonomy: readonly V5TraitDefinition[],
  expectedVersion = T_SKILLS_V5_VERSION_IDS.itemBank,
): V5ValidationResult<V5PairwiseItem[]> {
  const issues: V5ValidationIssue[] = [];
  if (!Array.isArray(input)) return { ok: false, issues: [issue("ITEM_BANK_NOT_ARRAY", "$", "Pairwise item bank must be an array.")] };
  if (input.length !== T_SKILLS_V5_ITEM_COUNT) issues.push(issue("ITEM_COUNT", "$", `Expected exactly ${T_SKILLS_V5_ITEM_COUNT} items.`));
  if (taxonomy.length !== T_SKILLS_V5_TRAIT_COUNT) issues.push(issue("TAXONOMY_COUNT", "taxonomy", `Expected exactly ${T_SKILLS_V5_TRAIT_COUNT} traits.`));

  const taxonomyIds = new Set(taxonomy.map((trait) => trait.id));
  const seenIds = new Set<string>();
  const seenPairs = new Set<string>();
  const exposure = new Map<string, number>();
  const items: V5PairwiseItem[] = [];

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
    const itemBankVersion = text(candidate.itemBankVersion, `${path}.itemBankVersion`, issues);
    if (id && seenIds.has(id)) issues.push(issue("DUPLICATE_ITEM_ID", `${path}.id`, `Duplicate item id: ${id}.`));
    if (id) seenIds.add(id);
    if (itemBankVersion && itemBankVersion !== expectedVersion) issues.push(issue("ITEM_BANK_VERSION", `${path}.itemBankVersion`, `Expected ${expectedVersion}.`));
    if (leftTraitId && !taxonomyIds.has(leftTraitId)) issues.push(issue("UNKNOWN_TRAIT", `${path}.leftTraitId`, `Unknown trait: ${leftTraitId}.`));
    if (rightTraitId && !taxonomyIds.has(rightTraitId)) issues.push(issue("UNKNOWN_TRAIT", `${path}.rightTraitId`, `Unknown trait: ${rightTraitId}.`));
    if (leftTraitId && rightTraitId && leftTraitId === rightTraitId) issues.push(issue("SELF_PAIR", path, "Left and right traits must differ."));
    if (leftText && rightText && leftText === rightText) issues.push(issue("DUPLICATE_STATEMENT", path, "Left and right statements must be different."));
    const pair = leftTraitId && rightTraitId ? itemPairKey(leftTraitId, rightTraitId) : "";
    if (pair && seenPairs.has(pair)) issues.push(issue("DUPLICATE_TRAIT_PAIR", path, `Duplicate trait pair: ${pair}.`));
    if (pair) seenPairs.add(pair);
    if (leftTraitId) exposure.set(leftTraitId, (exposure.get(leftTraitId) ?? 0) + 1);
    if (rightTraitId) exposure.set(rightTraitId, (exposure.get(rightTraitId) ?? 0) + 1);
    items.push({ id, leftTraitId, rightTraitId, leftText, rightText, itemBankVersion });
  }

  const uniqueTraits = new Set(items.flatMap((item) => [item.leftTraitId, item.rightTraitId].filter(Boolean)));
  if (uniqueTraits.size !== T_SKILLS_V5_TRAIT_COUNT) issues.push(issue("UNIQUE_TRAIT_COUNT", "$", `Expected ${T_SKILLS_V5_TRAIT_COUNT} represented traits.`));
  for (const traitId of taxonomyIds) {
    const count = exposure.get(traitId) ?? 0;
    if (count !== T_SKILLS_V5_TRAIT_EXPOSURE) issues.push(issue("TRAIT_EXPOSURE", `trait:${traitId}`, `Expected exactly ${T_SKILLS_V5_TRAIT_EXPOSURE} exposures; got ${count}.`));
  }

  return issues.length ? { ok: false, issues } : { ok: true, value: items };
}

export function parseV5PairwiseItemBankJson(json: string, taxonomy: readonly V5TraitDefinition[], expectedVersion = T_SKILLS_V5_VERSION_IDS.itemBank) {
  try {
    return validateV5PairwiseItemBank(JSON.parse(json) as unknown, taxonomy, expectedVersion);
  } catch {
    return { ok: false, issues: [issue("INVALID_JSON", "$", "Pairwise item bank is not valid JSON.")] } as V5ValidationResult<V5PairwiseItem[]>;
  }
}

/**
 * The approved question contribution for v5. The complete v5 runtime remains
 * content-gated until the taxonomy and career content are imported as one
 * version-consistent bundle.
 */
export const T_SKILLS_V5_PRODUCTION_ITEM_BANK: readonly V5PairwiseItem[] = T_SKILLS_V5_APPROVED_ITEM_BANK;

export const T_SKILLS_V5_PRODUCTION_TRAIT_LABELS = T_SKILLS_V5_APPROVED_TRAIT_LABELS;
