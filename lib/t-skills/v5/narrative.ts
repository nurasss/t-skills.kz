import type { NarrativeInput, NarrativeOutput, TSkillsReportPayloadV5, V5TraitDefinition, V5ValidationIssue, V5ValidationResult } from "@/lib/t-skills/v5/contracts";

const ABSOLUTE_CLAIMS = [
  /идеальн(ая|о|ый) професс/i,
  /идеально подходит/i,
  /гарантированно подходит/i,
  /\bвы\s+должны\s+(стать|выбрать|заниматься)\b/i,
  /\bвам\s+(нужно|следует|необходимо)\s+стать\b/i,
  /\bточно\s+подходит/i,
  /your ideal career/i,
  /perfectly suited/i,
  /you must become/i,
];

function issue(code: string, path: string, message: string): V5ValidationIssue {
  return { code, path, message };
}

function containsAbsoluteClaim(value: string) {
  return ABSOLUTE_CLAIMS.some((pattern) => pattern.test(value));
}

export function buildNarrativeInput(input: {
  traits: TSkillsReportPayloadV5["traits"]["final"];
  professions: TSkillsReportPayloadV5["careers"];
  catalog: NarrativeInput["recommendedProfessions"];
  taxonomy?: readonly V5TraitDefinition[];
  favoriteSubjects: string[];
  ageBand?: string;
  educationLevel?: string;
}): NarrativeInput {
  const catalogById = new Map(input.catalog.map((profession) => [profession.professionId, profession]));
  const taxonomyById = new Map((input.taxonomy ?? []).map((trait) => [trait.id, trait]));
  return {
    traitProfile: input.traits.map((trait) => ({
      traitId: trait.traitId,
      name: taxonomyById.get(trait.traitId)?.name ?? trait.traitId,
      rank: trait.rank,
      meanScore: trait.meanScore,
      description: taxonomyById.get(trait.traitId)?.reportDescription ?? taxonomyById.get(trait.traitId)?.longDescription ?? taxonomyById.get(trait.traitId)?.shortDescription ?? "Утверждённое описание качества из taxonomy.",
    })),
    recommendedProfessions: input.professions.map((recommendation) => {
      const profession = catalogById.get(recommendation.professionId);
      if (!profession) throw new Error(`NARRATIVE_PROFESSION_NOT_FOUND:${recommendation.professionId}`);
      return profession;
    }),
    favoriteSubjects: [...input.favoriteSubjects],
    ageBand: input.ageBand,
    educationLevel: input.educationLevel,
  };
}

export function validateNarrativeOutput(
  input: unknown,
  source: NarrativeInput,
): V5ValidationResult<NarrativeOutput> {
  const issues: V5ValidationIssue[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, issues: [issue("NARRATIVE_NOT_OBJECT", "$", "Narrative output must be an object.")] };
  const candidate = input as Record<string, unknown>;
  for (const field of ["profileSummary", "roadmapIntroduction"]) if (typeof candidate[field] !== "string" || !candidate[field].trim()) issues.push(issue("NARRATIVE_TEXT", field, "Narrative text is required."));
  const expectedIds = source.recommendedProfessions.map((profession) => profession.professionId);
  const validateEntries = (value: unknown, field: string) => {
    if (!Array.isArray(value) || value.length !== expectedIds.length) {
      issues.push(issue("NARRATIVE_COUNT", field, `Expected exactly ${expectedIds.length} entries.`));
      return [] as Array<{ professionId: string; text: string }>;
    }
    return value.map((entry, index) => {
      const path = `${field}[${index}]`;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        issues.push(issue("NARRATIVE_ENTRY", path, "Narrative entry must be an object."));
        return { professionId: "", text: "" };
      }
      const object = entry as Record<string, unknown>;
      if (typeof object.professionId !== "string" || !expectedIds.includes(object.professionId)) issues.push(issue("NARRATIVE_UNKNOWN_PROFESSION", `${path}.professionId`, "Profession is not present in the source input."));
      if (typeof object.text !== "string" || !object.text.trim()) issues.push(issue("NARRATIVE_TEXT", `${path}.text`, "Narrative text is required."));
      return { professionId: typeof object.professionId === "string" ? object.professionId : "", text: typeof object.text === "string" ? object.text.trim() : "" };
    });
  };
  const professionExplanations = validateEntries(candidate.professionExplanations, "professionExplanations");
  const roadmapSections = validateEntries(candidate.roadmapSections, "roadmapSections");
  const allTexts = [typeof candidate.profileSummary === "string" ? candidate.profileSummary : "", typeof candidate.roadmapIntroduction === "string" ? candidate.roadmapIntroduction : "", ...professionExplanations.map((entry) => entry.text), ...roadmapSections.map((entry) => entry.text)];
  if (allTexts.some(containsAbsoluteClaim)) issues.push(issue("NARRATIVE_ABSOLUTE_CLAIM", "$", "Narrative contains an absolute career claim."));
  const uniqueProfessionIds = (entries: Array<{ professionId: string }>) => new Set(entries.map((entry) => entry.professionId)).size === expectedIds.length && entries.every((entry) => expectedIds.includes(entry.professionId));
  if (!uniqueProfessionIds(professionExplanations)) issues.push(issue("NARRATIVE_PROFESSION_SET", "professionExplanations", "Profession IDs must match the source set exactly once."));
  if (!uniqueProfessionIds(roadmapSections)) issues.push(issue("NARRATIVE_PROFESSION_SET", "roadmapSections", "Profession IDs must match the source set exactly once."));
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: { profileSummary: (candidate.profileSummary as string).trim(), professionExplanations, roadmapIntroduction: (candidate.roadmapIntroduction as string).trim(), roadmapSections } };
}

/** Guardrail for the final payload: facts and ordering stay server-owned. */
export function assertNarrativeDoesNotChangeFacts(before: TSkillsReportPayloadV5, after: TSkillsReportPayloadV5) {
  if (JSON.stringify(before.traits) !== JSON.stringify(after.traits)) throw new Error("NARRATIVE_CHANGED_TRAITS");
  if (JSON.stringify(before.careers) !== JSON.stringify(after.careers)) throw new Error("NARRATIVE_CHANGED_CAREERS");
  if (JSON.stringify(before.roadmap) !== JSON.stringify(after.roadmap)) throw new Error("NARRATIVE_CHANGED_ROADMAP");
  return after;
}
