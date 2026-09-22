/** Independent version boundary for the deterministic T-Skills v5 pathway. */
export const T_SKILLS_V5_VERSION_IDS = {
  assessment: "t-skills_pairwise_v5",
  traitTaxonomy: "t-skills-traits-v5",
  itemBank: "t-skills-pairwise-items-v5",
  scoring: "pairwise25-v1",
  uncertainty: "uncertainty-v1",
  clarificationBank: "clarification-bank-v1",
  careerCatalog: "t-skills-career-catalog-v5",
  careerMatching: "career-match-v1",
  careerTiebreak: "career-tiebreak-v1",
  narrativePrompt: "t-skills-narrative-v1",
  report: "t-skills-report-v5",
} as const;

export const T_SKILLS_V5_TRAIT_COUNT = 25 as const;
export const T_SKILLS_V5_ITEM_COUNT = 75 as const;
export const T_SKILLS_V5_TRAIT_EXPOSURE = 6 as const;
export const T_SKILLS_V5_CLARIFICATION_TARGET = 6 as const;
export const T_SKILLS_V5_CLARIFICATION_MAX = 7 as const;

export type TSkillsV5VersionIds = typeof T_SKILLS_V5_VERSION_IDS;
