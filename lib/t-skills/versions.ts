/**
 * Version contract for the new T-Skills assessment pathway.
 *
 * These IDs are deliberately separate from the legacy/Core60 IDs. A
 * version is immutable once it has been used by an assessment.
 */
export const T_SKILLS_TEST_ID = "t-skills" as const;
/** Explicit legacy slug kept for historical sessions and compatibility tests. */
export const LEGACY_TEST_ID = "orbita30" as const;

export const SUPPORTED_TEST_IDS = [T_SKILLS_TEST_ID, LEGACY_TEST_ID] as const;

export function isSupportedTestId(value: string): value is (typeof SUPPORTED_TEST_IDS)[number] {
  return (SUPPORTED_TEST_IDS as readonly string[]).includes(value);
}

export const T_SKILLS_VERSION_IDS = {
  assessment: "t-skills_pairwise_v1",
  itemBank: "t-skills-pairwise-items-v1",
  traitTaxonomy: "t-skills-traits-v1",
  scoring: "pairwise-scoring-v1",
  norms: "unvalidated-t-skills-v1",
  norm: "unvalidated-t-skills-v1",
  selector: "career-matching-v1",
  careerCatalog: "t-skills-career-catalog-v1",
  careerMatching: "career-matching-v1",
  adaptive: "career-adaptive-v1",
  adaptivePrompt: "career-adaptive-prompt-v1",
  report: "t-skills-report-v1",
  translation: "ru-source-v1",
} as const;

export type TSkillsVersionIds = typeof T_SKILLS_VERSION_IDS;

/** Immutable first teen release. Keep the original inverted scorer for sessions already created with this contract. */
export const T_SKILLS_TEEN_V1_VERSION_IDS = {
  ...T_SKILLS_VERSION_IDS,
  assessment: "t-skills-teen-v1",
  itemBank: "t-skills-teen-items-v1",
  traitTaxonomy: "t-skills-teen-traits-v1",
  scoring: "teen-scoring-v1",
  selector: "teen-clarification-v1",
  careerCatalog: "t-skills-teen-careers-v1",
  careerMatching: "teen-career-matching-v1",
  adaptive: "teen-clarification-v1",
  adaptivePrompt: "teen-clarification-v1",
  report: "t-skills-teen-report-v1",
} as const;

/** Current teen pathway: corrected left/right scoring and balanced item-side exposure. */
export const T_SKILLS_TEEN_VERSION_IDS = {
  ...T_SKILLS_VERSION_IDS,
  assessment: "t-skills-teen-v2",
  itemBank: "t-skills-teen-items-v2",
  traitTaxonomy: "t-skills-teen-traits-v1",
  scoring: "teen-scoring-v2",
  selector: "teen-clarification-v1",
  careerCatalog: "t-skills-teen-careers-v1",
  careerMatching: "teen-career-matching-v1",
  adaptive: "teen-clarification-v1",
  adaptivePrompt: "teen-clarification-v1",
  report: "t-skills-teen-report-v2",
} as const;

/**
 * Corrected wording revision (2026-10): same 75 pair IDs and trait layout as
 * the v1 source (docs verbatim, no balancing swaps). Reuses the corrected
 * scorer (teen-scoring-v2: negative = left, positive = right) and the v2
 * report/career contracts. Frozen v1/v2 banks stay untouched so already
 * recorded numeric answers are never reinterpreted under a new layout.
 */
export const T_SKILLS_TEEN_V3_VERSION_IDS = {
  ...T_SKILLS_TEEN_VERSION_IDS,
  assessment: "t-skills-teen-v3",
  itemBank: "t-skills-teen-items-v3",
} as const;

/**
 * Session-only bridge for unfinished v1 attempts. It keeps the original item
 * layout so already-recorded UI answers still point at the same statements,
 * but applies the corrected scorer/report contract. It is never published for
 * new assessments.
 */
export const T_SKILLS_TEEN_V1_FIX_VERSION_IDS = {
  ...T_SKILLS_TEEN_V1_VERSION_IDS,
  assessment: "t-skills-teen-v1-fix",
  scoring: T_SKILLS_TEEN_VERSION_IDS.scoring,
  report: T_SKILLS_TEEN_VERSION_IDS.report,
} as const;

/**
 * Catalog-111 revision (2026-10): same 75 pairs, layout, scorer, clarification
 * selection, report shape and career formula as v3; only the profession
 * catalog is replaced (170 → 111, t-skills-teen-careers-v2). Frozen v1/v2/v3
 * contracts stay untouched.
 */
export const T_SKILLS_TEEN_V4_VERSION_IDS = {
  ...T_SKILLS_TEEN_V3_VERSION_IDS,
  assessment: "t-skills-teen-v4",
  itemBank: "t-skills-teen-items-v4",
  careerCatalog: "t-skills-teen-careers-v2",
} as const;

export function isTSkillsTeenVersion(assessmentVersion: unknown) {
  return assessmentVersion === T_SKILLS_TEEN_VERSION_IDS.assessment
    || assessmentVersion === T_SKILLS_TEEN_V3_VERSION_IDS.assessment
    || assessmentVersion === T_SKILLS_TEEN_V4_VERSION_IDS.assessment
    || assessmentVersion === T_SKILLS_TEEN_V1_VERSION_IDS.assessment
    || assessmentVersion === T_SKILLS_TEEN_V1_FIX_VERSION_IDS.assessment;
}

export function teenVersionIdsForAssessment(assessmentVersion: unknown) {
  if (assessmentVersion === T_SKILLS_TEEN_V4_VERSION_IDS.assessment) return T_SKILLS_TEEN_V4_VERSION_IDS;
  if (assessmentVersion === T_SKILLS_TEEN_V3_VERSION_IDS.assessment) return T_SKILLS_TEEN_V3_VERSION_IDS;
  if (assessmentVersion === T_SKILLS_TEEN_VERSION_IDS.assessment) return T_SKILLS_TEEN_VERSION_IDS;
  if (assessmentVersion === T_SKILLS_TEEN_V1_VERSION_IDS.assessment) return T_SKILLS_TEEN_V1_VERSION_IDS;
  if (assessmentVersion === T_SKILLS_TEEN_V1_FIX_VERSION_IDS.assessment) return T_SKILLS_TEEN_V1_FIX_VERSION_IDS;
  return null;
}

export const T_SKILLS_TEEN_STATIC_ITEM_COUNT = 75 as const;
export const T_SKILLS_TEEN_CLARIFICATION_COUNT = 8 as const;
export const T_SKILLS_TEEN_CLARIFICATION_POOL = 25 as const;

export const T_SKILLS_STATIC_ITEM_COUNT = 67 as const;
export const T_SKILLS_TOTAL_QUESTION_COUNT = 75 as const;
export const T_SKILLS_TRAIT_COUNT = 25 as const;
export const T_SKILLS_TRAIT_EXPOSURE_MIN = 5 as const;
export const T_SKILLS_TRAIT_EXPOSURE_MAX = 6 as const;
export const T_SKILLS_TRAITS_WITH_MAX_EXPOSURE = 9 as const;
export const T_SKILLS_TRAITS_WITH_MIN_EXPOSURE = 16 as const;
export const T_SKILLS_ADAPTIVE_MIN_QUESTIONS = 5 as const;
export const T_SKILLS_ADAPTIVE_MAX_QUESTIONS = 8 as const;

/** No production content is bundled until the client's bank is approved. */
export const T_SKILLS_CONTENT_STATUS = "working-content-v4" as const;
