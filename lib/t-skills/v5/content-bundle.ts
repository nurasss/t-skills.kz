import type { ClarificationItem, CareerTieBreakQuestion, ProfessionV5, V5PairwiseItem, V5TraitDefinition, V5ValidationIssue, V5ValidationResult } from "@/lib/t-skills/v5/contracts";
import { validateClarificationBank } from "@/lib/t-skills/v5/clarification";
import { validateV5CareerCatalog } from "@/lib/t-skills/v5/career";
import { validateV5PairwiseItemBank } from "@/lib/t-skills/v5/item-bank";
import { validateV5TraitTaxonomy } from "@/lib/t-skills/v5/taxonomy";
import { T_SKILLS_V5_VERSION_IDS } from "@/lib/t-skills/v5/versions";
import { T_SKILLS_V5_IMPORTED_CONTENT } from "@/lib/t-skills/v5/production-content";

export type TSkillsV5ContentBundle = {
  assessmentVersion: typeof T_SKILLS_V5_VERSION_IDS.assessment;
  traitTaxonomyVersion: typeof T_SKILLS_V5_VERSION_IDS.traitTaxonomy;
  itemBankVersion: typeof T_SKILLS_V5_VERSION_IDS.itemBank;
  scoringVersion: typeof T_SKILLS_V5_VERSION_IDS.scoring;
  uncertaintyVersion: typeof T_SKILLS_V5_VERSION_IDS.uncertainty;
  clarificationBankVersion: typeof T_SKILLS_V5_VERSION_IDS.clarificationBank;
  careerCatalogVersion: typeof T_SKILLS_V5_VERSION_IDS.careerCatalog;
  careerMatchingVersion: typeof T_SKILLS_V5_VERSION_IDS.careerMatching;
  careerTiebreakVersion: typeof T_SKILLS_V5_VERSION_IDS.careerTiebreak;
  narrativePromptVersion: typeof T_SKILLS_V5_VERSION_IDS.narrativePrompt;
  reportVersion: typeof T_SKILLS_V5_VERSION_IDS.report;
  traits: V5TraitDefinition[];
  items: V5PairwiseItem[];
  clarificationItems: ClarificationItem[];
  careerTieBreakQuestions: CareerTieBreakQuestion[];
  professions: ProfessionV5[];
};

function issue(code: string, path: string, message: string): V5ValidationIssue {
  return { code, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateTieBreakQuestions(input: unknown, expectedVersion: string, professionIds: Set<string>): V5ValidationResult<CareerTieBreakQuestion[]> {
  const issues: V5ValidationIssue[] = [];
  if (!Array.isArray(input)) return { ok: false, issues: [issue("TIEBREAK_BANK_NOT_ARRAY", "careerTieBreakQuestions", "Career tie-break bank must be an array.")] };
  const seen = new Set<string>();
  const result: CareerTieBreakQuestion[] = [];
  const optionIds = ["A", "B", "C", "D"] as const;
  for (const [index, candidate] of input.entries()) {
    const path = `careerTieBreakQuestions[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(issue("TIEBREAK_NOT_OBJECT", path, "Career tie-break question must be an object."));
      continue;
    }
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const prompt = typeof candidate.prompt === "string" ? candidate.prompt.trim() : "";
    const version = typeof candidate.version === "string" ? candidate.version.trim() : "";
    if (!id) issues.push(issue("TIEBREAK_ID", `${path}.id`, "Question id is required."));
    if (seen.has(id)) issues.push(issue("DUPLICATE_TIEBREAK_ID", `${path}.id`, `Duplicate question id: ${id}.`));
    if (id) seen.add(id);
    if (!prompt) issues.push(issue("TIEBREAK_PROMPT", `${path}.prompt`, "Prompt is required."));
    if (version !== expectedVersion) issues.push(issue("TIEBREAK_VERSION", `${path}.version`, `Expected ${expectedVersion}.`));
    const groups = Array.isArray(candidate.candidateGroups) ? candidate.candidateGroups.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()) : [];
    if (!groups.length) issues.push(issue("TIEBREAK_GROUPS", `${path}.candidateGroups`, "At least one candidate group is required."));
    if (groups.some((group) => !professionIds.has(group))) issues.push(issue("TIEBREAK_UNKNOWN_PROFESSION", `${path}.candidateGroups`, "Candidate group contains an unknown profession."));
    if (!Array.isArray(candidate.options) || candidate.options.length !== 4) issues.push(issue("TIEBREAK_OPTIONS", `${path}.options`, "Exactly four options are required."));
    const options = (Array.isArray(candidate.options) ? candidate.options : []).map((raw, optionIndex) => {
      const optionPath = `${path}.options[${optionIndex}]`;
      if (!isRecord(raw)) {
        issues.push(issue("TIEBREAK_OPTION_OBJECT", optionPath, "Option must be an object."));
        return { id: optionIds[optionIndex] ?? "A", text: "", careerSignals: {} };
      }
      const idExpected = optionIds[optionIndex];
      if (raw.id !== idExpected) issues.push(issue("TIEBREAK_OPTION_ID", `${optionPath}.id`, `Expected ${idExpected}.`));
      const text = typeof raw.text === "string" ? raw.text.trim() : "";
      if (!text) issues.push(issue("TIEBREAK_OPTION_TEXT", `${optionPath}.text`, "Option text is required."));
      const rawSignals = raw.careerSignals;
      const careerSignals: Record<string, number> = {};
      if (!isRecord(rawSignals)) issues.push(issue("TIEBREAK_SIGNALS", `${optionPath}.careerSignals`, "careerSignals must be an object."));
      else for (const [dimension, signal] of Object.entries(rawSignals)) {
        if (!DIMENSIONS.has(dimension) || typeof signal !== "number" || !Number.isFinite(signal) || signal < -1 || signal > 1) issues.push(issue("TIEBREAK_SIGNAL_VALUE", `${optionPath}.careerSignals.${dimension}`, "Signal must use a known dimension and be between -1 and 1."));
        else careerSignals[dimension] = signal;
      }
      return { id: idExpected, text, careerSignals };
    });
    if (options.length === 4) result.push({ id, candidateGroups: groups, prompt, options: options as CareerTieBreakQuestion["options"], version });
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: result };
}

const DIMENSIONS = new Set(["people", "systems", "creativity", "analysis", "leadership", "communication", "structure", "autonomy", "uncertainty", "projectScale"]);

export function validateTSkillsV5ContentBundle(input: unknown): V5ValidationResult<TSkillsV5ContentBundle> {
  if (!isRecord(input)) return { ok: false, issues: [issue("BUNDLE_NOT_OBJECT", "$", "T-Skills v5 content bundle must be an object.")] };
  const versions: Array<[keyof TSkillsV5ContentBundle, string]> = [
    ["assessmentVersion", T_SKILLS_V5_VERSION_IDS.assessment],
    ["traitTaxonomyVersion", T_SKILLS_V5_VERSION_IDS.traitTaxonomy],
    ["itemBankVersion", T_SKILLS_V5_VERSION_IDS.itemBank],
    ["scoringVersion", T_SKILLS_V5_VERSION_IDS.scoring],
    ["uncertaintyVersion", T_SKILLS_V5_VERSION_IDS.uncertainty],
    ["clarificationBankVersion", T_SKILLS_V5_VERSION_IDS.clarificationBank],
    ["careerCatalogVersion", T_SKILLS_V5_VERSION_IDS.careerCatalog],
    ["careerMatchingVersion", T_SKILLS_V5_VERSION_IDS.careerMatching],
    ["careerTiebreakVersion", T_SKILLS_V5_VERSION_IDS.careerTiebreak],
    ["narrativePromptVersion", T_SKILLS_V5_VERSION_IDS.narrativePrompt],
    ["reportVersion", T_SKILLS_V5_VERSION_IDS.report],
  ];
  const issues: V5ValidationIssue[] = [];
  for (const [field, expected] of versions) if (input[field] !== expected) issues.push(issue("VERSION_MISMATCH", String(field), `Expected ${expected}.`));
  const taxonomy = validateV5TraitTaxonomy(input.traits);
  const traits = taxonomy.ok ? taxonomy.value : [];
  if (!taxonomy.ok) issues.push(...taxonomy.issues);
  const items = validateV5PairwiseItemBank(input.items, traits);
  if (!items.ok) issues.push(...items.issues);
  const clarifications = validateClarificationBank(input.clarificationItems, traits.map((trait) => trait.id), T_SKILLS_V5_VERSION_IDS.clarificationBank, { requireTraitCoverage: true });
  if (!clarifications.ok) issues.push(...clarifications.issues);
  const professions = validateV5CareerCatalog(input.professions, traits);
  if (!professions.ok) issues.push(...professions.issues);
  if (professions.ok && professions.value.filter((profession) => profession.active).length < 5) issues.push(issue("CAREER_CATALOG_ACTIVE_COUNT", "professions", "At least five active professions are required for a Top-5 result."));
  const tieBreaks = validateTieBreakQuestions(input.careerTieBreakQuestions, T_SKILLS_V5_VERSION_IDS.careerTiebreak, new Set(professions.ok ? professions.value.map((profession) => profession.id) : []));
  if (!tieBreaks.ok) issues.push(...tieBreaks.issues);
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { ...(input as unknown as TSkillsV5ContentBundle), traits, items: items.ok ? items.value : [], clarificationItems: clarifications.ok ? clarifications.value : [], professions: professions.ok ? professions.value : [], careerTieBreakQuestions: tieBreaks.ok ? tieBreaks.value : [] } };
}

export function parseTSkillsV5ContentBundleJson(json: string) {
  try {
    return validateTSkillsV5ContentBundle(JSON.parse(json) as unknown);
  } catch {
    return { ok: false, issues: [issue("INVALID_JSON", "$", "T-Skills v5 content bundle is not valid JSON.")] } as V5ValidationResult<TSkillsV5ContentBundle>;
  }
}

/**
 * The generated module is null until the client-approved bundle is imported.
 * Even imported content is validated again at module load so an incomplete or
 * mismatched bundle can never become the production registry.
 */
export const T_SKILLS_V5_PRODUCTION_CONTENT: TSkillsV5ContentBundle | null = (() => {
  if (T_SKILLS_V5_IMPORTED_CONTENT === null) return null;
  const result = validateTSkillsV5ContentBundle(T_SKILLS_V5_IMPORTED_CONTENT);
  return result.ok ? result.value : null;
})();

export function tSkillsV5ContentIsReady() {
  return T_SKILLS_V5_PRODUCTION_CONTENT !== null;
}
