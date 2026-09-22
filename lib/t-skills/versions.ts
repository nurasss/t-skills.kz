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
