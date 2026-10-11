/** Teen trait taxonomy and current pipeline contract. */

export const TEEN_VERSION_IDS = {
  assessment: "t-skills-teen-v2",
  itemBank: "t-skills-teen-items-v2",
  traitTaxonomy: "t-skills-teen-traits-v1",
  scoring: "teen-scoring-v2",
  stage2: "teen-clarification-v1",
  careerCatalog: "t-skills-teen-careers-v1",
  careerMatching: "teen-career-matching-v1",
  onboarding: "teen-onboarding-v1",
} as const;

export const TEEN_V1_VERSION_IDS = {
  assessment: "t-skills-teen-v1",
  itemBank: "t-skills-teen-items-v1",
  traitTaxonomy: "t-skills-teen-traits-v1",
  scoring: "teen-scoring-v1",
  stage2: "teen-clarification-v1",
  careerCatalog: "t-skills-teen-careers-v1",
  careerMatching: "teen-career-matching-v1",
  onboarding: "teen-onboarding-v1",
} as const;

export const TEEN_V1_FIX_VERSION_IDS = {
  ...TEEN_V1_VERSION_IDS,
  assessment: "t-skills-teen-v1-fix",
  scoring: "teen-scoring-v2",
} as const;

/**
 * Corrected wording revision (2026-10): same 75 pair structure and trait IDs
 * as v1/v2 source, but short teen-friendly statements from the approved
 * RU/KK DOCX pair. Display follows the documents verbatim (A left, B right)
 * with no balancing swaps, so exposure is not 3:3. Scoring convention is
 * unchanged (teen-scoring-v2: negative selects left, positive selects right).
 */
export const TEEN_V3_VERSION_IDS = {
  assessment: "t-skills-teen-v3",
  itemBank: "t-skills-teen-items-v3",
  traitTaxonomy: "t-skills-teen-traits-v1",
  scoring: "teen-scoring-v2",
  stage2: "teen-clarification-v1",
  careerCatalog: "t-skills-teen-careers-v1",
  careerMatching: "teen-career-matching-v1",
  onboarding: "teen-onboarding-v1",
} as const;

/**
 * Catalog-111 revision: same pairs, layout, scorer, clarification selection
 * and report shape as v3; profession catalog t-skills-teen-careers-v2.
 */
export const TEEN_V4_VERSION_IDS = {
  assessment: "t-skills-teen-v4",
  itemBank: "t-skills-teen-items-v4",
  traitTaxonomy: "t-skills-teen-traits-v1",
  scoring: "teen-scoring-v2",
  stage2: "teen-clarification-v1",
  careerCatalog: "t-skills-teen-careers-v2",
  careerMatching: "teen-career-matching-v1",
  onboarding: "teen-onboarding-v1",
} as const;

export const TEEN_TRAIT_IDS = [  "curiosity",
  "strategic-thinking",
  "innovativeness",
  "aesthetic-sense",
  "discipline",
  "result-orientation",
  "organizer",
  "reliability",
  "stress-resilience",
  "adaptability",
  "composure",
  "empathy",
  "harmonizer",
  "team-player",
  "energizer",
  "networker",
  "autonomy",
  "communicator",
  "leadership",
  "analytical-interest",
  "data-systemizing",
  "technical-interest",
  "creative-expression",
  "entrepreneurial-drive",
  "persistence",
] as const;

/**
 * DECIDED-BY-AGENT: adaptability нигде не взвешен в каталоге v1.
 * Считаем намеренным: вес 0 (нейтрально), ничего не выдумываем.
 * Трейт участвует в этапах 1–2 и рейтинге, но не влияет на матчинг профессий.
 */

export type TeenTraitId = (typeof TEEN_TRAIT_IDS)[number];

/** Сырые суммы этапа 1 по трейтам (до нормализации). */
export type TeenStage1Totals = Record<TeenTraitId, number>;

export const TEEN_STATIC_ITEM_COUNT = 75;
export const TEEN_TRAIT_EXPOSURE = 6;

/** Этап 2: топ-30% неоднозначных, не меньше 5 и не больше 15. */
export const TEEN_STAGE2_FRACTION = 0.3;
export const TEEN_STAGE2_MIN = 5;
export const TEEN_STAGE2_MAX = 15;

/** Этап 2: вес точечной коррекции поверх балла этапа 1. */
export const TEEN_STAGE2_CORRECTION_WEIGHT = 2;

/** Бонусы матчинга. PENDING_METHODOLOGIST: величины по умолчанию, ждёт методолога. */
export const TEEN_VALUE_FIT_BONUS = 0.15;
export const TEEN_SUBJECT_BONUS = 0.1;

/** Сколько топ-ценностей из ранжирования идёт в матчинг. */
export const TEEN_VALUE_FIT_TOP = 3;

export const TEEN_VALUES = [
  "stability",
  "income",
  "growth",
  "value-autonomy",
  "social-impact",
  "creative-freedom",
  "status",
  "work-life-balance",
] as const;

export type TeenValueId = (typeof TEEN_VALUES)[number];

export const TEEN_SUBJECTS = [
  "math",
  "physics",
  "chemistry",
  "biology",
  "geography",
  "informatics",
  "history",
  "social-studies",
  "kazakh",
  "russian",
  "english",
  "creative",
  "pe",
  /** DECIDED-BY-AGENT: «Педагогика» у 11 профессий, нет в исходных 13 — добавлен 14-м, а не выкинут. */
  "pedagogy",
] as const;

export type TeenSubjectId = (typeof TEEN_SUBJECTS)[number];

export type TeenPairwiseItem = {
  id: string;
  leftTraitId: TeenTraitId;
  rightTraitId: TeenTraitId;
};

export type TeenStage2Question = {
  id: string;
  traitId: TeenTraitId;
};

export type TeenProfession = {
  id: string;
  /** Веса −1..1 (в файле −2..+2, делится на 2 при импорте). */
  traitWeights: Partial<Record<TeenTraitId, number>>;
  subjectTags: TeenSubjectId[];
  valueFit: TeenValueId[];
  active: boolean;
};

export type TeenOnboarding = {
  /** Полный порядок 8 ценностей, сверху — самое важное. */
  valueRanking: TeenValueId[];
  /** 2–3 выбранных предмета. */
  subjects: TeenSubjectId[];
};
