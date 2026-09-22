import type { V5TraitDefinition, V5ValidationIssue, V5ValidationResult } from "@/lib/t-skills/v5/contracts";
import { T_SKILLS_V5_TRAIT_COUNT, T_SKILLS_V5_VERSION_IDS } from "@/lib/t-skills/v5/versions";

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

export function validateV5TraitTaxonomy(
  input: unknown,
  expectedVersion = T_SKILLS_V5_VERSION_IDS.traitTaxonomy,
): V5ValidationResult<V5TraitDefinition[]> {
  const issues: V5ValidationIssue[] = [];
  if (!Array.isArray(input)) return { ok: false, issues: [issue("TAXONOMY_NOT_ARRAY", "$", "Trait taxonomy must be an array.")] };
  if (input.length !== T_SKILLS_V5_TRAIT_COUNT) issues.push(issue("TRAIT_COUNT", "$", `Expected exactly ${T_SKILLS_V5_TRAIT_COUNT} traits.`));
  const seen = new Set<string>();
  const traits: V5TraitDefinition[] = [];
  for (const [index, candidate] of input.entries()) {
    const path = `$[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(issue("TRAIT_NOT_OBJECT", path, "Trait must be an object."));
      continue;
    }
    const id = requiredText(candidate.id, `${path}.id`, issues);
    const name = requiredText(candidate.name, `${path}.name`, issues);
    const shortDescription = requiredText(candidate.shortDescription, `${path}.shortDescription`, issues);
    const status = candidate.status;
    if (id && seen.has(id)) issues.push(issue("DUPLICATE_TRAIT_ID", `${path}.id`, `Duplicate trait id: ${id}.`));
    if (id) seen.add(id);
    if (status !== "active" && status !== "draft") issues.push(issue("TRAIT_STATUS", `${path}.status`, "Status must be active or draft."));
    if (candidate.version !== undefined && candidate.version !== expectedVersion) issues.push(issue("TRAIT_VERSION", `${path}.version`, `Expected ${expectedVersion}.`));
    const longDescription = candidate.longDescription === undefined ? undefined : requiredText(candidate.longDescription, `${path}.longDescription`, issues);
    const reportDescription = candidate.reportDescription === undefined ? undefined : requiredText(candidate.reportDescription, `${path}.reportDescription`, issues);
    traits.push({ id, name, shortDescription, longDescription, reportDescription, status: status === "active" ? "active" : "draft" });
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: traits };
}

export function parseV5TraitTaxonomyJson(json: string, expectedVersion = T_SKILLS_V5_VERSION_IDS.traitTaxonomy) {
  try {
    return validateV5TraitTaxonomy(JSON.parse(json) as unknown, expectedVersion);
  } catch {
    return { ok: false, issues: [issue("INVALID_JSON", "$", "Trait taxonomy is not valid JSON.")] } as V5ValidationResult<V5TraitDefinition[]>;
  }
}
