import type {
  CareerRecommendation,
  NarrativeInput,
  NarrativeOutput,
  ProfessionV5,
  RoadmapTemplate,
  TSkillsReportPayloadV5,
  TraitProfileV5,
  V5TraitDefinition,
  V5ValidationIssue,
  V5ValidationResult,
} from "@/lib/t-skills/v5/contracts";
import { buildNarrativeInput, validateNarrativeOutput } from "@/lib/t-skills/v5/narrative";
import { T_SKILLS_V5_VERSION_IDS } from "@/lib/t-skills/v5/versions";

function issue(code: string, path: string, message: string): V5ValidationIssue {
  return { code, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactRanks(values: readonly unknown[], expectedCount: number) {
  const ranks = [...values]
    .map((value) => isRecord(value) && typeof value.rank === "number" ? value.rank : undefined)
    .sort((left, right) => (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER));
  return ranks.length === expectedCount && ranks.every((rank, index) => rank === index + 1);
}

function hasValidBaseRawScore(value: unknown) {
  if (!isRecord(value)) return false;
  return Number.isInteger(value.rawScore) && typeof value.rawScore === "number" && value.rawScore >= -12 && value.rawScore <= 12;
}

function professionFacts(
  recommendations: readonly CareerRecommendation[],
  catalog: readonly ProfessionV5[],
): NarrativeInput["recommendedProfessions"] {
  const byId = new Map(catalog.map((profession) => [profession.id, profession]));
  return recommendations.map((recommendation) => {
    const profession = byId.get(recommendation.professionId);
    if (!profession) throw new Error(`REPORT_PROFESSION_NOT_FOUND:${recommendation.professionId}`);
    return {
      professionId: profession.id,
      title: profession.title,
      approvedDescription: profession.description,
      reasons: [...recommendation.traitEvidence, ...recommendation.subjectEvidence, ...recommendation.clarificationEvidence],
      roadmapTemplate: profession.roadmap,
    };
  });
}

export function buildDeterministicV5Narrative(input: {
  traits: TraitProfileV5["final"];
  recommendations: readonly CareerRecommendation[];
  taxonomy: readonly V5TraitDefinition[];
  catalog: readonly ProfessionV5[];
}): NarrativeOutput {
  const taxonomyById = new Map(input.taxonomy.map((trait) => [trait.id, trait]));
  const topTraits = [...input.traits].sort((left, right) => left.rank - right.rank).slice(0, 5).map((trait) => taxonomyById.get(trait.traitId)?.name ?? trait.traitId);
  const facts = professionFacts(input.recommendations, input.catalog);
  const descriptionFor = (profession: NarrativeInput["recommendedProfessions"][number]) => {
    const reason = profession.reasons[0] ? ` Основание в расчёте: ${profession.reasons[0]}.` : " Это направление стоит проверить небольшими практическими шагами.";
    return `${profession.approvedDescription}${reason}`;
  };
  return {
    profileSummary: topTraits.length
      ? `Ваш текущий профиль в первую очередь отражает сочетание качеств: ${topTraits.join(", ")}. Это развивающий срез, который полезно проверять в учебных и карьерных экспериментах.`
      : "Ваш текущий профиль — развивающий срез, который полезно проверять в учебных и карьерных экспериментах.",
    professionExplanations: facts.map((profession) => ({ professionId: profession.professionId, text: descriptionFor(profession) })),
    roadmapIntroduction: "План ниже собран из утверждённых действий каталога. Начинайте с небольших проверок гипотезы и фиксируйте результат.",
    roadmapSections: facts.map((profession) => {
      const actionTitles = Object.values(profession.roadmapTemplate).flat().slice(0, 3).map((action) => action.title);
      const actionText = actionTitles.length ? ` Ближайшие шаги: ${actionTitles.join("; ")}.` : " Для этого направления в каталоге пока нет детализированных шагов.";
      return { professionId: profession.professionId, text: `Для направления «${profession.title}» используйте утверждённый план и проверяйте его через практику.${actionText}` };
    }),
  };
}

export function buildV5ReportPayload(input: {
  completedAt: string;
  profile: TraitProfileV5;
  recommendations: readonly CareerRecommendation[];
  taxonomy: readonly V5TraitDefinition[];
  catalog: readonly ProfessionV5[];
  favoriteSubjects: readonly string[];
  ageBand?: string;
  educationLevel?: string;
  narrative?: NarrativeOutput;
}): TSkillsReportPayloadV5 {
  const finalTraits = [...input.profile.final].sort((left, right) => left.rank - right.rank);
  const recommendations = [...input.recommendations].sort((left, right) => left.rank - right.rank);
  const facts = professionFacts(recommendations, input.catalog);
  const narrativeInput = buildNarrativeInput({
    traits: finalTraits,
    professions: recommendations,
    catalog: facts,
    taxonomy: input.taxonomy,
    favoriteSubjects: [...input.favoriteSubjects],
    ageBand: input.ageBand,
    educationLevel: input.educationLevel,
  });
  const narrative = input.narrative ?? buildDeterministicV5Narrative({ traits: finalTraits, recommendations, taxonomy: input.taxonomy, catalog: input.catalog });
  const narrativeValidation = validateNarrativeOutput(narrative, narrativeInput);
  if (!narrativeValidation.ok) throw new Error(narrativeValidation.issues.map((current) => `${current.code}:${current.path}`).join(","));
  const payload = {
    assessment: {
      assessmentVersion: T_SKILLS_V5_VERSION_IDS.assessment,
      itemBankVersion: T_SKILLS_V5_VERSION_IDS.itemBank,
      scoringVersion: T_SKILLS_V5_VERSION_IDS.scoring,
      completedAt: input.completedAt,
    },
    traits: { base: [...input.profile.base], final: finalTraits, clarificationAnswers: [...input.profile.clarificationAnswers] },
    careers: recommendations,
    narrative: narrativeValidation.value,
    roadmap: recommendations.map((recommendation) => ({ professionId: recommendation.professionId, template: input.catalog.find((profession) => profession.id === recommendation.professionId)!.roadmap })),
    methodology: {
      versions: T_SKILLS_V5_VERSION_IDS,
      mainQuestionCount: 75 as const,
      traitCount: 25 as const,
      clarificationRange: { min: 0 as const, max: 7 as const },
      scoringDeterministic: true as const,
      llmRole: "narrative-only" as const,
    },
  } satisfies TSkillsReportPayloadV5;
  assertV5ReportPayload(payload, input.catalog);
  return payload;
}

export function validateV5ReportPayload(input: unknown, catalog: readonly ProfessionV5[] = []): V5ValidationResult<TSkillsReportPayloadV5> {
  const issues: V5ValidationIssue[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, issues: [issue("REPORT_NOT_OBJECT", "$", "Report payload must be an object.")] };
  const payload = input as TSkillsReportPayloadV5;
  const root = input as Record<string, unknown>;
  const assessment = isRecord(root.assessment) ? root.assessment : null;
  if (!assessment || assessment.assessmentVersion !== T_SKILLS_V5_VERSION_IDS.assessment) issues.push(issue("REPORT_ASSESSMENT_VERSION", "assessment.assessmentVersion", "Unexpected assessment version."));
  if (!assessment || assessment.itemBankVersion !== T_SKILLS_V5_VERSION_IDS.itemBank) issues.push(issue("REPORT_ITEM_BANK_VERSION", "assessment.itemBankVersion", "Unexpected item bank version."));
  if (!assessment || assessment.scoringVersion !== T_SKILLS_V5_VERSION_IDS.scoring) issues.push(issue("REPORT_SCORING_VERSION", "assessment.scoringVersion", "Unexpected scoring version."));
  const traits = isRecord(root.traits) ? root.traits : null;
  const base = traits && Array.isArray(traits.base) ? traits.base : [];
  const final = traits && Array.isArray(traits.final) ? traits.final : [];
  if (!traits || !exactRanks(base, 25)) issues.push(issue("REPORT_BASE_RANKING", "traits.base", "Base profile must contain ranks 1..25."));
  if (!traits || !exactRanks(final, 25)) issues.push(issue("REPORT_FINAL_RANKING", "traits.final", "Final profile must contain ranks 1..25."));
  const baseIds = new Set(base.map((entry) => isRecord(entry) ? entry.traitId : undefined));
  const finalIds = new Set(final.map((entry) => isRecord(entry) ? entry.traitId : undefined));
  if (baseIds.size !== 25 || finalIds.size !== 25 || [...baseIds].some((traitId) => !finalIds.has(traitId))) issues.push(issue("REPORT_TRAIT_SET", "traits", "Base and final profiles must contain the same 25 trait IDs."));
  if (base.some((entry) => !hasValidBaseRawScore(entry))) issues.push(issue("REPORT_BASE_SCORE", "traits.base", "Base raw scores must be integers between -12 and 12."));
  const careers = Array.isArray(root.careers) ? root.careers : [];
  if (careers.length !== 5 || !exactRanks(careers, 5)) issues.push(issue("REPORT_CAREER_RANKING", "careers", "Report must contain exactly five career recommendations ranked 1..5."));
  const careerIds = new Set(careers.map((career) => isRecord(career) && typeof career.professionId === "string" ? career.professionId : ""));
  if (careerIds.size !== 5 || careerIds.has("")) issues.push(issue("REPORT_CAREER_IDS", "careers", "Career recommendation IDs must be unique and non-empty."));
  if (catalog.length) for (const careerId of careerIds) if (!careerId || !catalog.some((profession) => profession.id === careerId && profession.active)) issues.push(issue("REPORT_UNKNOWN_CAREER", "careers", `Career is not active in the catalog: ${careerId}.`));
  const methodology = isRecord(root.methodology) ? root.methodology : null;
  if (!methodology || methodology.scoringDeterministic !== true || methodology.llmRole !== "narrative-only") issues.push(issue("REPORT_METHOD", "methodology", "Report must declare deterministic scoring and narrative-only LLM role."));
  const methodologyVersions = methodology && isRecord(methodology.versions) ? methodology.versions : null;
  for (const [key, expected] of Object.entries(T_SKILLS_V5_VERSION_IDS)) {
    if (!methodologyVersions || methodologyVersions[key] !== expected) issues.push(issue("REPORT_VERSION", `methodology.versions.${key}`, `Expected ${expected}.`));
  }
  if (!methodology || methodology.mainQuestionCount !== 75 || methodology.traitCount !== 25) issues.push(issue("REPORT_COUNTS", "methodology", "Report must declare 75 main questions and 25 traits."));
  const clarificationRange = methodology && isRecord(methodology.clarificationRange) ? methodology.clarificationRange : null;
  if (!clarificationRange || clarificationRange.min !== 0 || clarificationRange.max !== 7) issues.push(issue("REPORT_CLARIFICATION_RANGE", "methodology.clarificationRange", "Report must declare the 0..7 clarification range."));
  const roadmap = Array.isArray(root.roadmap) ? root.roadmap : [];
  if (roadmap.length !== 5 || new Set(roadmap.map((entry) => isRecord(entry) && typeof entry.professionId === "string" ? entry.professionId : "")).size !== careerIds.size || roadmap.some((entry) => !isRecord(entry) || typeof entry.professionId !== "string" || !careerIds.has(entry.professionId))) issues.push(issue("REPORT_ROADMAP_SET", "roadmap", "Roadmap must match the five recommended professions."));
  if (catalog.length && roadmap.some((entry) => {
    if (!isRecord(entry) || typeof entry.professionId !== "string" || !isRecord(entry.template)) return true;
    const source = catalog.find((profession) => profession.id === entry.professionId);
    return Boolean(source && JSON.stringify(source.roadmap) !== JSON.stringify(entry.template));
  })) issues.push(issue("REPORT_ROADMAP_FACTS", "roadmap", "Roadmap must preserve the approved catalog templates."));
  const narrativeSource = {
    traitProfile: [],
    recommendedProfessions: careers.filter(isRecord).map((career) => {
      const source = catalog.find((profession) => profession.id === career.professionId);
      return {
        professionId: typeof career.professionId === "string" ? career.professionId : "",
        title: source?.title ?? "",
        approvedDescription: source?.description ?? "approved catalog description",
        reasons: [],
        roadmapTemplate: source?.roadmap ?? { firstMonth: [], months1to3: [], months3to6: [], months6to12: [] },
      };
    }),
    favoriteSubjects: [],
  } satisfies NarrativeInput;
  const narrativeValidation = validateNarrativeOutput(root.narrative, narrativeSource);
  if (!narrativeValidation.ok) issues.push(...narrativeValidation.issues.map((current) => issue(`REPORT_${current.code}`, `narrative.${current.path}`, current.message)));
  if (issues.length) return { ok: false, issues };
  return { ok: true, value: payload };
}

export function assertV5ReportPayload(payload: TSkillsReportPayloadV5, catalog: readonly ProfessionV5[] = []) {
  const result = validateV5ReportPayload(payload, catalog);
  if (!result.ok) throw new Error(result.issues.map((current) => `${current.code}:${current.path}`).join(","));
  return result.value;
}

export function roadmapForProfession(catalog: readonly ProfessionV5[], professionId: string): RoadmapTemplate {
  const profession = catalog.find((candidate) => candidate.id === professionId);
  if (!profession) throw new Error(`REPORT_PROFESSION_NOT_FOUND:${professionId}`);
  return profession.roadmap;
}
