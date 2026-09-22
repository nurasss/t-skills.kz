import {
  assertValid,
  invalid,
  issue,
  type Profession,
  type TraitDefinition,
  type ValidationResult,
  valid,
} from "@/lib/t-skills/contracts";
import { validateCareerCatalog } from "@/lib/t-skills/career";
import { validatePairwiseItemBank } from "@/lib/t-skills/item-bank";
import { validateTraitTaxonomy } from "@/lib/t-skills/taxonomy";
import { T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";
import type { PairwiseItem } from "@/lib/t-skills/contracts";

export type TSkillsContentBundle = {
  assessmentVersion: typeof T_SKILLS_VERSION_IDS.assessment;
  traitTaxonomyVersion: typeof T_SKILLS_VERSION_IDS.traitTaxonomy;
  itemBankVersion: typeof T_SKILLS_VERSION_IDS.itemBank;
  careerCatalogVersion: typeof T_SKILLS_VERSION_IDS.careerCatalog;
  traits: TraitDefinition[];
  items: PairwiseItem[];
  professions: Profession[];
};

export function validateTSkillsContentBundle(input: unknown): ValidationResult<TSkillsContentBundle> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return invalid([issue("BUNDLE_NOT_OBJECT", "$", "Content bundle must be an object.")]);
  const candidate = input as Record<string, unknown>;
  const issues = [] as ReturnType<typeof issue>[];
  const expectedVersions: Array<[string, string]> = [
    ["assessmentVersion", T_SKILLS_VERSION_IDS.assessment],
    ["traitTaxonomyVersion", T_SKILLS_VERSION_IDS.traitTaxonomy],
    ["itemBankVersion", T_SKILLS_VERSION_IDS.itemBank],
    ["careerCatalogVersion", T_SKILLS_VERSION_IDS.careerCatalog],
  ];
  for (const [field, expected] of expectedVersions) if (candidate[field] !== expected) issues.push(issue("VERSION_MISMATCH", field, `Expected ${expected}.`));
  const taxonomy = validateTraitTaxonomy(candidate.traits);
  if (!taxonomy.ok) issues.push(...taxonomy.issues);
  const traits = taxonomy.ok ? taxonomy.value : [];
  const items = validatePairwiseItemBank(candidate.items, traits);
  if (!items.ok) issues.push(...items.issues);
  const professions = validateCareerCatalog(candidate.professions, traits.map((trait) => trait.id));
  if (!professions.ok) issues.push(...professions.issues);
  if (issues.length) return invalid(issues);
  return valid({
    assessmentVersion: T_SKILLS_VERSION_IDS.assessment,
    traitTaxonomyVersion: T_SKILLS_VERSION_IDS.traitTaxonomy,
    itemBankVersion: T_SKILLS_VERSION_IDS.itemBank,
    careerCatalogVersion: T_SKILLS_VERSION_IDS.careerCatalog,
    traits,
    items: assertValid(items),
    professions: assertValid(professions),
  });
}

export function parseTSkillsContentBundleJson(json: string): ValidationResult<TSkillsContentBundle> {
  try {
    return validateTSkillsContentBundle(JSON.parse(json) as unknown);
  } catch {
    return invalid([issue("INVALID_JSON", "$", "T-Skills content bundle is not valid JSON.")]);
  }
}

export function assertTSkillsContentBundle(input: unknown) {
  return assertValid(validateTSkillsContentBundle(input));
}
