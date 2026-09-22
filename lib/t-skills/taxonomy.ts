import {
  assertValid,
  invalid,
  isRecord,
  issue,
  type TraitDefinition,
  type ValidationResult,
  valid,
} from "@/lib/t-skills/contracts";
import { T_SKILLS_TRAIT_COUNT, T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";
import { T_SKILLS_WORKING_TAXONOMY } from "@/lib/t-skills/content-v4";

export const T_SKILLS_TRAIT_TAXONOMY_VERSION = T_SKILLS_VERSION_IDS.traitTaxonomy;

function text(value: unknown, path: string, issues: ReturnType<typeof issue>[]) {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(issue("REQUIRED_TEXT", path, "Expected a non-empty string."));
    return "";
  }
  if (value.length > 2_000) issues.push(issue("TEXT_TOO_LONG", path, "Text exceeds 2000 characters."));
  return value.trim();
}

export function validateTraitTaxonomy(input: unknown): ValidationResult<TraitDefinition[]> {
  const issues: ReturnType<typeof issue>[] = [];
  if (!Array.isArray(input)) return invalid([issue("TAXONOMY_NOT_ARRAY", "$", "Trait taxonomy must be an array.")]);
  if (input.length !== T_SKILLS_TRAIT_COUNT) {
    issues.push(issue("TRAIT_COUNT", "$", `Expected exactly ${T_SKILLS_TRAIT_COUNT} traits.`));
  }

  const seen = new Set<string>();
  const traits: TraitDefinition[] = [];
  for (const [index, candidate] of input.entries()) {
    const path = `$[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(issue("TRAIT_NOT_OBJECT", path, "Trait must be an object."));
      continue;
    }
    const id = text(candidate.id, `${path}.id`, issues);
    const name = text(candidate.name, `${path}.name`, issues);
    const shortDescription = text(candidate.shortDescription, `${path}.shortDescription`, issues);
    const status = candidate.status;
    if (status !== "active" && status !== "draft") {
      issues.push(issue("TRAIT_STATUS", `${path}.status`, "Status must be active or draft."));
    }
    if (id && seen.has(id)) issues.push(issue("DUPLICATE_TRAIT_ID", `${path}.id`, `Duplicate trait id: ${id}.`));
    if (id) seen.add(id);
    const longDescription = candidate.longDescription === undefined ? undefined : text(candidate.longDescription, `${path}.longDescription`, issues);
    const reportDescription = candidate.reportDescription === undefined ? undefined : text(candidate.reportDescription, `${path}.reportDescription`, issues);
    traits.push({ id, name, shortDescription, longDescription, reportDescription, status: status === "active" ? "active" : "draft" });
  }
  return issues.length ? invalid(issues) : valid(traits);
}

export function parseTraitTaxonomyJson(json: string): ValidationResult<TraitDefinition[]> {
  try {
    return validateTraitTaxonomy(JSON.parse(json) as unknown);
  } catch {
    return invalid([issue("INVALID_JSON", "$", "Trait taxonomy is not valid JSON.")]);
  }
}

export function assertTraitTaxonomy(input: unknown): TraitDefinition[] {
  return assertValid(validateTraitTaxonomy(input));
}

export const T_SKILLS_PRODUCTION_TAXONOMY: readonly TraitDefinition[] = T_SKILLS_WORKING_TAXONOMY;
