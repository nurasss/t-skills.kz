import { T_SKILLS_V5_VERSION_IDS } from "@/lib/t-skills/v5/versions";

export type V5ValidationIssue = { code: string; path: string; message: string };
export type V5ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: V5ValidationIssue[] };

export type V5TraitDefinition = {
  id: string;
  name: string;
  shortDescription: string;
  longDescription?: string;
  reportDescription?: string;
  status: "active" | "draft";
};

export type V5PairwiseItem = {
  id: string;
  leftTraitId: string;
  rightTraitId: string;
  leftText: string;
  rightText: string;
  itemBankVersion: string;
};

export type V5AnswerValue = -2 | -1 | 0 | 1 | 2;
export type V5PairwiseAnswer = { itemId: string; value: V5AnswerValue };
export type V5PairwiseAnswerMap = Record<string, V5AnswerValue>;

export type BaseTraitScore = {
  traitId: string;
  rawScore: number;
  meanScore: number;
  variance: number;
  contributions: number[];
  rank?: number;
};

export type FinalTraitScore = BaseTraitScore & {
  baseRawScore: number;
  baseMeanScore: number;
  clarificationContributions: number[];
  effectiveObservations: number;
  rank: number;
};

export type ClarificationAnswer = {
  itemId: string;
  value: V5AnswerValue;
};

export type TraitProfileV5 = {
  base: BaseTraitScore[];
  final: FinalTraitScore[];
  clarificationAnswers: ClarificationAnswer[];
};

export type TraitUncertainty = {
  traitId: string;
  varianceScore: number;
  rankSensitivity: number;
  careerImpact: number;
  neighborCloseness: number;
  uncertaintyScore: number;
  version: string;
};

export type ClarificationOption = {
  id: "A" | "B" | "C" | "D";
  text: string;
  careerSignals?: Record<string, number>;
};

export type ClarificationItem = {
  id: string;
  type: "trait_clarification" | "career_tiebreak";
  targetTraits: string[];
  leftText?: string;
  rightText?: string;
  options?: [ClarificationOption, ClarificationOption, ClarificationOption, ClarificationOption];
  candidateGroups?: string[];
  priority: number;
  weight?: number;
  version: string;
};

export type CareerRule = {
  id: string;
  traitId?: string;
  maxRank?: number;
  minRank?: number;
  minMean?: number;
  subjectTagsAny?: string[];
  adjustment: number;
};

export type RoadmapAction = {
  id: string;
  type: "skill" | "project" | "research" | "course" | "practice" | "career_experiment";
  title: string;
  description: string;
  verified: boolean;
};

export type RoadmapTemplate = {
  firstMonth: RoadmapAction[];
  months1to3: RoadmapAction[];
  months3to6: RoadmapAction[];
  months6to12: RoadmapAction[];
};

export type ProfessionV5 = {
  id: string;
  title: string;
  description: string;
  traitWeights: Record<string, number>;
  subjectTags: string[];
  dimensions: Record<string, number>;
  rules: CareerRule[];
  roadmap: RoadmapTemplate;
  active: boolean;
  version: string;
};

export type CareerCandidateV5 = {
  professionId: string;
  title: string;
  traitMatch: number;
  subjectMatch: number;
  ruleAdjustment: number;
  clarificationMatch: number;
  totalScore: number;
  rank: number;
};

export type CareerTieBreakQuestion = {
  id: string;
  candidateGroups: string[];
  prompt: string;
  options: [
    { id: "A"; text: string; careerSignals: Record<string, number> },
    { id: "B"; text: string; careerSignals: Record<string, number> },
    { id: "C"; text: string; careerSignals: Record<string, number> },
    { id: "D"; text: string; careerSignals: Record<string, number> },
  ];
  version: string;
};

export type CareerTieBreakAnswer = { questionId: string; optionId: "A" | "B" | "C" | "D" };

export type CareerRecommendation = {
  professionId: string;
  rank: number;
  score: number;
  traitEvidence: string[];
  subjectEvidence: string[];
  clarificationEvidence: string[];
};

export type NarrativeInput = {
  traitProfile: Array<{ traitId: string; name: string; rank: number; meanScore: number; description: string }>;
  recommendedProfessions: Array<{
    professionId: string;
    title: string;
    approvedDescription: string;
    reasons: string[];
    roadmapTemplate: RoadmapTemplate;
  }>;
  favoriteSubjects: string[];
  ageBand?: string;
  educationLevel?: string;
};

export type NarrativeOutput = {
  profileSummary: string;
  professionExplanations: Array<{ professionId: string; text: string }>;
  roadmapIntroduction: string;
  roadmapSections: Array<{ professionId: string; text: string }>;
};

export type ReportMethodologyV5 = {
  versions: typeof T_SKILLS_V5_VERSION_IDS;
  mainQuestionCount: 75;
  traitCount: 25;
  clarificationRange: { min: 0; max: 7 };
  scoringDeterministic: true;
  llmRole: "narrative-only";
};

export type TSkillsReportPayloadV5 = {
  assessment: {
    assessmentVersion: string;
    itemBankVersion: string;
    scoringVersion: string;
    completedAt: string;
  };
  traits: TraitProfileV5;
  careers: CareerRecommendation[];
  narrative: NarrativeOutput;
  roadmap: Array<{ professionId: string; template: RoadmapTemplate }>;
  methodology: ReportMethodologyV5;
};
