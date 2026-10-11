import {
  T_SKILLS_ADAPTIVE_MAX_QUESTIONS,
  T_SKILLS_ADAPTIVE_MIN_QUESTIONS,
  T_SKILLS_STATIC_ITEM_COUNT,
  T_SKILLS_TOTAL_QUESTION_COUNT,
  T_SKILLS_TRAIT_COUNT,
  T_SKILLS_TRAIT_EXPOSURE_MAX,
  T_SKILLS_TRAIT_EXPOSURE_MIN,
  T_SKILLS_VERSION_IDS,
} from "@/lib/t-skills/versions";

export type ContractIssue = {
  code: string;
  path: string;
  message: string;
};

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ContractIssue[] };

export class TSkillsContractError extends Error {
  constructor(public readonly issues: ContractIssue[]) {
    super(issues.map((issue) => `${issue.code}:${issue.path}`).join(", ") || "Invalid T-Skills contract");
    this.name = "TSkillsContractError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function issue(code: string, path: string, message: string): ContractIssue {
  return { code, path, message };
}

export function invalid<T>(issues: ContractIssue[]): ValidationResult<T> {
  return { ok: false, issues };
}

export function valid<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

export function assertValid<T>(result: ValidationResult<T>): T {
  if (!result.ok) throw new TSkillsContractError(result.issues);
  return result.value;
}

export type TraitDefinition = {
  id: string;
  name: string;
  shortDescription: string;
  longDescription?: string;
  reportDescription?: string;
  status: "active" | "draft";
};

export type PairwiseItem = {
  id: string;
  leftTraitId: string;
  rightTraitId: string;
  leftText: string;
  rightText: string;
  version: string;
};

export type PairwiseAnswerValue = -2 | -1 | 0 | 1 | 2;

export type PairwiseAnswer = {
  itemId: string;
  value: PairwiseAnswerValue;
};

export type PairwiseAnswerMap = Record<string, PairwiseAnswerValue>;

export type TraitResult = {
  traitId: string;
  rawScore: number;
  normalizedScore: number;
  rank: number;
  strengthOfPreference: number;
  strongPositiveCount: number;
  positiveCount: number;
  exposure: number;
};

export type OnboardingContext = {
  age: number;
  educationLevel: string;
  favoriteSubjects: string[];
  /** Full value ranking, most important first (current T-Skills Teen pathway). */
  valueRanking?: string[];
  interests?: string[];
  hobbies?: string[];
  preferredActivities?: string[];
  country?: string;
  language?: string;
  plannedEducationPath?: string;
};

export const CAREER_DIMENSIONS = [
  "people",
  "systems",
  "creativity",
  "analysis",
  "leadership",
  "communication",
  "structure",
  "autonomy",
  "uncertainty",
  "projectScale",
] as const;

export type CareerDimension = (typeof CAREER_DIMENSIONS)[number];
export type CareerDimensions = Partial<Record<CareerDimension, number>>;

export type Profession = {
  id: string;
  title: string;
  description?: string;
  traitProfile: Record<string, number>;
  subjectTags?: string[];
  careerDimensions?: CareerDimensions;
  educationPaths?: string[];
  active: boolean;
  version: string;
};

export type CareerCandidate = {
  professionId: string;
  title: string;
  traitMatch: number;
  subjectMatch: number;
  adaptiveMatch: number;
  totalScore: number;
  rank: number;
};

export type CareerSignal = {
  dimension: CareerDimension;
  value: number;
  weight?: number;
};

export type AdaptiveOption = {
  id: "A" | "B" | "C" | "D";
  text: string;
  signals: CareerSignal[];
};

export type AdaptiveQuestion = {
  id: string;
  prompt: string;
  dimension?: CareerDimension;
  options: [AdaptiveOption, AdaptiveOption, AdaptiveOption, AdaptiveOption];
  rationaleInternal?: string;
  minAge?: number;
  maxAge?: number;
};

export type AdaptiveAnswer = {
  questionId: string;
  optionId: "A" | "B" | "C" | "D";
};

export type AdaptiveCareerContext = {
  ageBand: string;
  educationLevel: string;
  favoriteSubjects: string[];
  topTraits: TraitResult[];
  lowTraits: TraitResult[];
  fullTraitVector: Record<string, number>;
  currentCandidates: CareerCandidate[];
  previousQuestions: AdaptiveQuestion[];
  previousAnswers: AdaptiveAnswer[];
  remainingQuestions: number;
  rankingHistory?: CareerCandidate[][];
};

export type TSkillsReportVersions = {
  assessment: string;
  traitTaxonomy: string;
  itemBank: string;
  scoring: string;
  careerCatalog: string;
  careerMatching: string;
  adaptive: string;
  adaptivePrompt: string;
  report: string;
};

export const DEFAULT_T_SKILLS_REPORT_VERSIONS: TSkillsReportVersions = {
  assessment: T_SKILLS_VERSION_IDS.assessment,
  traitTaxonomy: T_SKILLS_VERSION_IDS.traitTaxonomy,
  itemBank: T_SKILLS_VERSION_IDS.itemBank,
  scoring: T_SKILLS_VERSION_IDS.scoring,
  careerCatalog: T_SKILLS_VERSION_IDS.careerCatalog,
  careerMatching: T_SKILLS_VERSION_IDS.careerMatching,
  adaptive: T_SKILLS_VERSION_IDS.adaptive,
  adaptivePrompt: T_SKILLS_VERSION_IDS.adaptivePrompt,
  report: T_SKILLS_VERSION_IDS.report,
};

export const T_SKILLS_CONTRACT_LIMITS = {
  itemCount: T_SKILLS_STATIC_ITEM_COUNT,
  totalQuestionCount: T_SKILLS_TOTAL_QUESTION_COUNT,
  traitCount: T_SKILLS_TRAIT_COUNT,
  traitExposureMin: T_SKILLS_TRAIT_EXPOSURE_MIN,
  traitExposureMax: T_SKILLS_TRAIT_EXPOSURE_MAX,
  adaptiveMinQuestions: T_SKILLS_ADAPTIVE_MIN_QUESTIONS,
  adaptiveMaxQuestions: T_SKILLS_ADAPTIVE_MAX_QUESTIONS,
} as const;
