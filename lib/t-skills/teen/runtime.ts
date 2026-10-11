/**
 * Server-backed runtime for the T-Skills teen pathway.
 *
 * - t-skills-teen-v1: frozen legacy bank (inverted scorer, retired).
 * - t-skills-teen-v2: frozen balanced bank (3:3 exposure via orientation-v2).
 * - t-skills-teen-v3 (current): corrected short wording from the approved
 *   RU/KK DOCX pair (75 pairs verbatim, A left / B right, no balancing swaps).
 *   Scoring convention is unchanged from v2 (teen-scoring-v2: UI -2 selects
 *   left, +2 selects right). Language switch changes only display texts.
 * The same pure functions run on the server (authoritative scoring)
 * and on the client (question rendering), so both read one bundle.
 */
import type { ScoreProfile, ScoreTrait } from "@/lib/assessment-engine";
import type { AdaptiveOption, AdaptiveQuestion, PairwiseItem } from "@/lib/t-skills/contracts";
import { applyTeenPairSideLayout, parseTeenContentBundle, type TeenContentBundle } from "@/lib/t-skills/teen/content";
import { scoreTeenCareers } from "@/lib/t-skills/teen/matching";
import { applyTeenStage2Correction, normalizeTeenTotal, scoreTeenStage1, scoreTeenStage1V1, selectTeenStage2 } from "@/lib/t-skills/teen/scoring";
import {
  TEEN_SUBJECTS,
  TEEN_TRAIT_EXPOSURE,
  TEEN_VALUE_FIT_TOP,
  TEEN_VALUES,
  type TeenOnboarding,
  type TeenStage1Totals,
  type TeenSubjectId,
  type TeenTraitId,
  type TeenValueId,
} from "@/lib/t-skills/teen/taxonomy";
import { teenVersionIdsForAssessment, T_SKILLS_TEEN_V1_FIX_VERSION_IDS, T_SKILLS_TEEN_V1_VERSION_IDS, T_SKILLS_TEEN_V3_VERSION_IDS, T_SKILLS_TEEN_V4_VERSION_IDS, T_SKILLS_TEEN_VERSION_IDS } from "@/lib/t-skills/versions";
import { TEEN_CAREER_CATALOG_V1, TEEN_CAREER_CATALOG_V2, teenCareerCatalog } from "@/lib/t-skills/teen/careers";
import { teenResponseQuality, type TeenQualityInput } from "@/lib/t-skills/profile-adapter";
import bundleRu from "@/lib/t-skills/teen/content.v1.json";
import bundleKk from "@/lib/t-skills/teen/content.v1.kk.json";
import bundleV3Ru from "@/lib/t-skills/teen/content.v2.json";
import bundleV3Kk from "@/lib/t-skills/teen/content.v2.kk.json";
import bundleV4Ru from "@/lib/t-skills/teen/content.careers-v2.json";
import bundleV4Kk from "@/lib/t-skills/teen/content.careers-v2.kk.json";
import orientationV2 from "@/lib/t-skills/teen/orientation-v2.json";

export type TeenRuntimeLocale = "ru" | "kk";

const CONTENT_V1: Record<TeenRuntimeLocale, TeenContentBundle> = {
  ru: parseTeenContentBundle(bundleRu),
  kk: parseTeenContentBundle(bundleKk),
};

const CONTENT_V2: Record<TeenRuntimeLocale, TeenContentBundle> = {
  ru: applyTeenPairSideLayout(CONTENT_V1.ru, orientationV2.swapLeftRight),
  kk: applyTeenPairSideLayout(CONTENT_V1.kk, orientationV2.swapLeftRight),
};

/**
 * V3 content: corrected short wording, display exactly as the approved
 * documents (left = А, right = Б). No balancing swaps are applied on top of
 * the documents — see orientation-v3.json ([]).
 */
const CONTENT_V3: Record<TeenRuntimeLocale, TeenContentBundle> = {
  ru: parseTeenContentBundle(bundleV3Ru),
  kk: parseTeenContentBundle(bundleV3Kk),
};

/**
 * V4 content: same 75 pairs, layout, stage2 and trait taxonomy as V3
 * (byte-identical items75/stage2), but the profession catalog is the
 * approved 111 (t-skills-teen-items-v4 / t-skills-teen-careers-v2).
 */
const CONTENT_V4: Record<TeenRuntimeLocale, TeenContentBundle> = {
  ru: parseTeenContentBundle(bundleV4Ru),
  kk: parseTeenContentBundle(bundleV4Kk),
};

export function teenRuntimeContent(locale: TeenRuntimeLocale = "ru", assessmentVersion: string = T_SKILLS_TEEN_V4_VERSION_IDS.assessment) {
  const itemBank = teenVersionIdsForAssessment(assessmentVersion)?.itemBank;
  if (itemBank === T_SKILLS_TEEN_V1_VERSION_IDS.itemBank) return CONTENT_V1[locale];
  if (itemBank === T_SKILLS_TEEN_VERSION_IDS.itemBank) return CONTENT_V2[locale];
  if (itemBank === T_SKILLS_TEEN_V4_VERSION_IDS.itemBank) return CONTENT_V4[locale];
  return CONTENT_V3[locale];
}

/** Subjects offered in the onboarding (client list of 13; pedagogy is a catalog-only tag). */
export const TEEN_ONBOARDING_SUBJECTS = TEEN_SUBJECTS.filter((subject) => subject !== "pedagogy");
export const TEEN_ONBOARDING_SUBJECTS_MIN = 2;
export const TEEN_ONBOARDING_SUBJECTS_MAX = 3;

function pairwiseItems(content: TeenContentBundle, itemBankVersion: string): readonly PairwiseItem[] {
  return content.items75.map((item) => ({
  id: item.id,
  leftTraitId: item.leftTraitId,
  rightTraitId: item.rightTraitId,
  leftText: content.items75Texts[item.id].left,
  rightText: content.items75Texts[item.id].right,
  version: itemBankVersion,
  }));
}

export const TEEN_PAIRWISE_ITEMS_V1 = pairwiseItems(CONTENT_V1.ru, T_SKILLS_TEEN_V1_VERSION_IDS.itemBank);
export const TEEN_PAIRWISE_ITEMS_V2: readonly PairwiseItem[] = pairwiseItems(CONTENT_V2.ru, T_SKILLS_TEEN_VERSION_IDS.itemBank);
export const TEEN_PAIRWISE_ITEMS_V3: readonly PairwiseItem[] = pairwiseItems(CONTENT_V3.ru, T_SKILLS_TEEN_V3_VERSION_IDS.itemBank);
export const TEEN_PAIRWISE_ITEMS_V4: readonly PairwiseItem[] = pairwiseItems(CONTENT_V4.ru, T_SKILLS_TEEN_V4_VERSION_IDS.itemBank);
/** Current pathway items (v4 = v3 pairs + 111 catalog). Frozen v1/v2/v3 aliases stay for old sessions. */
export const TEEN_PAIRWISE_ITEMS: readonly PairwiseItem[] = TEEN_PAIRWISE_ITEMS_V4;

export const TEEN_PAIRWISE_ITEM_BY_ID: ReadonlyMap<string, PairwiseItem> = new Map(TEEN_PAIRWISE_ITEMS.map((item) => [item.id, item]));
export const TEEN_PAIRWISE_ITEM_BY_ID_V1: ReadonlyMap<string, PairwiseItem> = new Map(TEEN_PAIRWISE_ITEMS_V1.map((item) => [item.id, item]));
export const TEEN_PAIRWISE_ITEM_BY_ID_V2: ReadonlyMap<string, PairwiseItem> = new Map(TEEN_PAIRWISE_ITEMS_V2.map((item) => [item.id, item]));
export const TEEN_PAIRWISE_ITEM_BY_ID_V3: ReadonlyMap<string, PairwiseItem> = new Map(TEEN_PAIRWISE_ITEMS_V3.map((item) => [item.id, item]));
export const TEEN_PAIRWISE_ITEM_BY_ID_V4: ReadonlyMap<string, PairwiseItem> = TEEN_PAIRWISE_ITEM_BY_ID;

export function teenPairwiseItemsForAssessmentVersion(assessmentVersion: string): readonly PairwiseItem[] {
  const itemBank = teenVersionIdsForAssessment(assessmentVersion)?.itemBank;
  if (itemBank === T_SKILLS_TEEN_V1_VERSION_IDS.itemBank) return TEEN_PAIRWISE_ITEMS_V1;
  if (itemBank === T_SKILLS_TEEN_VERSION_IDS.itemBank) return TEEN_PAIRWISE_ITEMS_V2;
  if (itemBank === T_SKILLS_TEEN_V4_VERSION_IDS.itemBank) return TEEN_PAIRWISE_ITEMS_V4;
  return TEEN_PAIRWISE_ITEMS_V3;
}

export function teenPairwiseItemMapForAssessmentVersion(assessmentVersion: string): ReadonlyMap<string, PairwiseItem> {
  const itemBank = teenVersionIdsForAssessment(assessmentVersion)?.itemBank;
  if (itemBank === T_SKILLS_TEEN_V1_VERSION_IDS.itemBank) return TEEN_PAIRWISE_ITEM_BY_ID_V1;
  if (itemBank === T_SKILLS_TEEN_VERSION_IDS.itemBank) return TEEN_PAIRWISE_ITEM_BY_ID_V2;
  if (itemBank === T_SKILLS_TEEN_V4_VERSION_IDS.itemBank) return TEEN_PAIRWISE_ITEM_BY_ID_V4;
  return TEEN_PAIRWISE_ITEM_BY_ID_V3;
}

const STAGE2_BY_ID = new Map(CONTENT_V4.ru.stage2.map((question) => [question.id, question]));

const TEEN_CORE_IDS: ReadonlySet<string> = new Set(TEEN_PAIRWISE_ITEMS.map((item) => item.id));
const TEEN_SCORED_IDS: ReadonlySet<string> = new Set([...TEEN_CORE_IDS, ...CONTENT_V4.ru.stage2.map((question) => question.id)]);

export function isTeenStage2QuestionId(questionId: string) {
  return STAGE2_BY_ID.has(questionId);
}

function stage2Question(questionId: string, locale: TeenRuntimeLocale, assessmentVersion: string = T_SKILLS_TEEN_V4_VERSION_IDS.assessment): AdaptiveQuestion | null {
  const question = teenRuntimeContent(locale, assessmentVersion).stage2.find((candidate) => candidate.id === questionId);
  if (!question) return null;
  const options = question.options.map((option) => ({ id: option.id as AdaptiveOption["id"], text: option.text, signals: [] }));
  return { id: question.id, prompt: question.scenario, options: options as unknown as AdaptiveQuestion["options"] };
}

/** Answer value (−2, −1, +1, +2) for the chosen option index of a situational question. */
export function teenStage2ValueForIndex(questionId: string, optionIndex: number): number | null {
  const question = STAGE2_BY_ID.get(questionId);
  const option = Number.isInteger(optionIndex) ? question?.options[optionIndex] : undefined;
  return option ? option.value : null;
}

function stage1For(responses: Record<string, number>, assessmentVersion: string = T_SKILLS_TEEN_V4_VERSION_IDS.assessment) {
  const legacyV1 = teenVersionIdsForAssessment(assessmentVersion)?.scoring === T_SKILLS_TEEN_V1_VERSION_IDS.scoring;
  const items = teenPairwiseItemsForAssessmentVersion(assessmentVersion);
  const score = legacyV1 ? scoreTeenStage1V1 : scoreTeenStage1;
  return score(items.map((item) => ({ id: item.id, leftTraitId: item.leftTraitId as TeenTraitId, rightTraitId: item.rightTraitId as TeenTraitId })), responses);
}

/** Stage 2: the ambiguous traits' situational questions, in selection order. */
export function selectTeenClarificationQuestions(responses: Record<string, number>, assessmentVersion: string = T_SKILLS_TEEN_V4_VERSION_IDS.assessment): AdaptiveQuestion[] {
  const stage1 = stage1For(responses, assessmentVersion);
  return selectTeenStage2(stage1.totals, stage1.contributions)
    .map((traitId) => stage2Question(`t2-${traitId}`, "ru", assessmentVersion))
    .filter((question): question is AdaptiveQuestion => Boolean(question));
}

/** Final trait totals: stage 1 pairs plus ×2 situational corrections. */
export function teenFinalTotals(
  responses: Record<string, number>,
  clarificationIds: readonly string[],
  assessmentVersion: string = T_SKILLS_TEEN_V4_VERSION_IDS.assessment,
): TeenStage1Totals {
  let totals = stage1For(responses, assessmentVersion).totals;
  for (const questionId of clarificationIds) {
    const question = STAGE2_BY_ID.get(questionId);
    const value = teenStage2ValueForIndex(questionId, responses[questionId]);
    if (!question || value === null) throw new Error(`TEEN_CLARIFICATION_ANSWER:${questionId}`);
    totals = applyTeenStage2Correction(totals, question.traitId, value);
  }
  return totals;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Ranked trait list (strongest first, id as deterministic tie-break). */
function rankTeenTraits(totals: TeenStage1Totals) {
  return (Object.keys(totals) as TeenTraitId[])
    .map((traitId) => ({ traitId, total: totals[traitId], normalized: normalizeTeenTotal(totals[traitId]) }))
    .sort((a, b) => b.normalized - a.normalized || (a.traitId < b.traitId ? -1 : 1));
}

/** Transport-compatible profile for the existing results screen and PDF. */
export function teenTotalsToProfile(
  totals: TeenStage1Totals,
  adaptiveAnswered: number,
  quality: TeenQualityInput = {},
  versions: typeof T_SKILLS_TEEN_V4_VERSION_IDS | typeof T_SKILLS_TEEN_V3_VERSION_IDS | typeof T_SKILLS_TEEN_VERSION_IDS | typeof T_SKILLS_TEEN_V1_VERSION_IDS | typeof T_SKILLS_TEEN_V1_FIX_VERSION_IDS = T_SKILLS_TEEN_V4_VERSION_IDS,
): ScoreProfile {
  const names = CONTENT_V4.ru.traitNames;
  const traits: ScoreTrait[] = rankTeenTraits(totals).map((entry, index) => {
    const standardScore = Math.round(clamp(50 + entry.normalized * 34, 1, 99));
    return {
      code: entry.traitId as ScoreTrait["code"],
      name: names[entry.traitId] ?? entry.traitId,
      definition: "Качество из 25-факторной модели T-Skills: 75 парных сравнений и ситуативные уточнения.",
      overuseRisk: "Интерпретируйте этот результат вместе с конкретными ситуациями и собственными наблюдениями.",
      theta: entry.normalized,
      se: 1,
      standardScore,
      profileIndex: Math.round(clamp(50 + entry.normalized * 49, 1, 99)),
      rank: index + 1,
      uncertaintyRange: [1, 99],
      exposure: TEEN_TRAIT_EXPOSURE,
      contradiction: 0,
    };
  });
  return {
    versions,
    normStatus: "unvalidated",
    traits,
    domains: [],
    rankClusters: traits.map((trait) => [trait.rank]),
    responseQuality: teenResponseQuality(quality, { coreIds: TEEN_CORE_IDS, scoredIds: TEEN_SCORED_IDS }),
    answered: TEEN_PAIRWISE_ITEMS.length + adaptiveAnswered,
    coreAnswered: TEEN_PAIRWISE_ITEMS.length,
    adaptiveAnswered,
  };
}

export type TeenCareerRankingEntry = {
  professionId: string;
  title: string;
  sphere: string;
  education: string;
  description: string;
  rank: number;
  traitScore: number;
  valueBonus: number;
  subjectBonus: number;
  matchScore: number;
};

/** Full catalog ranking; value_fit uses the top-3 values, subject_bonus the chosen subjects. */
export function teenCareerRanking(
  totals: TeenStage1Totals,
  onboarding: TeenOnboarding,
  careerCatalogVersion: string = TEEN_CAREER_CATALOG_V1,
): TeenCareerRankingEntry[] {
  // Дефолт — боевой каталог 170; старые результаты и текущие сессии unaffected.
  const professions = teenCareerCatalog(careerCatalogVersion, "ru");
  const byId = new Map(professions.map((profession) => [profession.id, profession]));
  return scoreTeenCareers(totals, professions, onboarding).map((entry, index) => {
    const profession = byId.get(entry.professionId)!;
    return {
      professionId: entry.professionId,
      title: profession.title,
      sphere: profession.sphere,
      education: profession.education,
      description: profession.description,
      rank: index + 1,
      traitScore: entry.traitScore,
      valueBonus: entry.valueBonus,
      subjectBonus: entry.subjectBonus,
      matchScore: entry.totalScore,
    };
  });
}

/** Reads the onboarding extension; invalid or missing data yields null. */
export function teenOnboardingFrom(input: { favoriteSubjects?: readonly string[]; valueRanking?: readonly string[] } | null | undefined): TeenOnboarding | null {
  if (!input) return null;
  const ranking = (input.valueRanking ?? []).filter((value): value is TeenValueId => (TEEN_VALUES as readonly string[]).includes(value));
  const subjects = (input.favoriteSubjects ?? []).filter((value): value is TeenSubjectId => (TEEN_SUBJECTS as readonly string[]).includes(value));
  if (ranking.length !== TEEN_VALUES.length || new Set(ranking).size !== TEEN_VALUES.length) return null;
  return { valueRanking: ranking, subjects };
}

/** Server-side contract for the current pathway's onboarding. */
export function teenOnboardingIssue(input: { favoriteSubjects: readonly string[]; valueRanking?: readonly string[] }): string | null {
  const ranking = input.valueRanking ?? [];
  if (ranking.length !== TEEN_VALUES.length || new Set(ranking).size !== TEEN_VALUES.length || ranking.some((value) => !(TEEN_VALUES as readonly string[]).includes(value))) {
    return "VALUE_RANKING_INVALID";
  }
  const subjects = input.favoriteSubjects;
  if (subjects.length < TEEN_ONBOARDING_SUBJECTS_MIN || subjects.length > TEEN_ONBOARDING_SUBJECTS_MAX || subjects.some((subject) => !(TEEN_ONBOARDING_SUBJECTS as readonly string[]).includes(subject))) {
    return "SUBJECTS_INVALID";
  }
  return null;
}

export function teenTopValues(onboarding: TeenOnboarding) {
  return onboarding.valueRanking.slice(0, TEEN_VALUE_FIT_TOP);
}

/** Display-only localisation of a pathway question; ids and scoring stay RU-bank based. */
export function localizeTeenQuestion<T>(item: T, locale: TeenRuntimeLocale, assessmentVersion?: string): T {
  if (locale === "ru" || !item || typeof item !== "object" || !("id" in item)) return item;
  const itemVersion = assessmentVersion
    ?? ("version" in item && (item as { version?: unknown }).version === T_SKILLS_TEEN_V1_VERSION_IDS.itemBank
      ? T_SKILLS_TEEN_V1_VERSION_IDS.assessment
      : "version" in item && (item as { version?: unknown }).version === T_SKILLS_TEEN_VERSION_IDS.itemBank
        ? T_SKILLS_TEEN_VERSION_IDS.assessment
        : "version" in item && (item as { version?: unknown }).version === T_SKILLS_TEEN_V4_VERSION_IDS.itemBank
          ? T_SKILLS_TEEN_V4_VERSION_IDS.assessment
          : T_SKILLS_TEEN_V3_VERSION_IDS.assessment);
  const content = teenRuntimeContent(locale, itemVersion);
  const id = String((item as { id: unknown }).id);
  const texts = content.items75Texts[id];
  if (texts && "leftText" in item) return { ...item, leftText: texts.left, rightText: texts.right };
  if (STAGE2_BY_ID.has(id)) return (stage2Question(id, locale, itemVersion) ?? item) as T;
  return item;
}

export function teenTraitName(traitId: string, locale: TeenRuntimeLocale) {
  return CONTENT_V3[locale].traitNames[traitId as TeenTraitId] ?? null;
}

export function teenProfessionTitle(professionId: string, locale: TeenRuntimeLocale) {
  return CONTENT_V3[locale].professions.find((profession) => profession.id === professionId)?.title ?? null;
}

import { buildTSkillsReport } from "@/lib/t-skills/report-adapter";
import type { ReportJSON } from "@/lib/assessment-engine";

export function buildTeenDemoData(): { profile: ScoreProfile; report: ReportJSON } {
  const demoTotals: TeenStage1Totals = {
    curiosity: 8,
    "strategic-thinking": 7,
    innovativeness: 6,
    "aesthetic-sense": 5,
    discipline: 4,
    "result-orientation": 4,
    organizer: 3,
    leadership: 3,
    autonomy: 2,
    "team-player": 2,
    "analytical-interest": 1,
    "technical-interest": 1,
    communicator: 1,
    "creative-expression": 0,
    "entrepreneurial-drive": 0,
    reliability: -1,
    "stress-resilience": -1,
    persistence: -2,
    "data-systemizing": -2,
    adaptability: -3,
    composure: -3,
    empathy: -4,
    harmonizer: -4,
    energizer: -5,
    networker: -6,
  };
  const profile = teenTotalsToProfile(demoTotals, 8);
  const demoOnboarding: TeenOnboarding = {
    valueRanking: ["growth", "creative-freedom", "income", "stability", "value-autonomy", "social-impact", "status", "work-life-balance"],
    subjects: ["informatics", "physics", "english"],
  };
  const careers = teenCareerRanking(demoTotals, demoOnboarding, TEEN_CAREER_CATALOG_V2);
  const baseReport = buildTSkillsReport(profile, 8, {
    coreQuestionCount: 75,
    versions: T_SKILLS_TEEN_V4_VERSION_IDS,
  });
  const report: ReportJSON = {
    ...baseReport,
    assessmentVersion: T_SKILLS_TEEN_V4_VERSION_IDS.assessment,
    coreQuestionCount: 75,
    adaptiveQuestionCount: 8,
    adaptiveProvider: "approved-bank",
    adaptiveFallbackUsed: false,
    adaptiveVersion: T_SKILLS_TEEN_V4_VERSION_IDS.adaptive,
    reportVersion: T_SKILLS_TEEN_V4_VERSION_IDS.report,
    career: {
      traitProfile: [],
      clarificationAnswers: [],
      careerPreferences: [],
      ranking: careers.slice(0, 5).map((entry) => ({
        professionId: entry.professionId,
        title: entry.title,
        sphere: entry.sphere,
        education: entry.education,
        rank: entry.rank,
        traitScore: entry.traitScore,
        valueBonus: entry.valueBonus,
        subjectBonus: entry.subjectBonus,
        totalScore: entry.matchScore,
      })),
      versions: T_SKILLS_TEEN_V4_VERSION_IDS,
      topValues: demoOnboarding.valueRanking.slice(0, 3),
      subjects: demoOnboarding.subjects,
    },
  };
  return { profile, report };
}
