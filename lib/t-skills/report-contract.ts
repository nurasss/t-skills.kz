import {
  type CareerCandidate,
  type OnboardingContext,
  type TSkillsReportVersions,
  type TraitDefinition,
  type TraitResult,
  issue,
} from "@/lib/t-skills/contracts";
import { ageBandFor } from "@/lib/t-skills/onboarding";

export type FinalCareerRecommendation = {
  rank: number;
  professionId: string;
  score: number;
  traitReasons: string[];
  adaptiveReasons: string[];
};

export type RoadmapStep = {
  horizon: "0-30 days" | "1-3 months" | "3-6 months" | "6-12 months";
  skills: string[];
  actions: string[];
  experiments: string[];
};

export type Roadmap = {
  steps: [RoadmapStep, RoadmapStep, RoadmapStep, RoadmapStep];
};

export type TSkillsReportPayload = {
  userContext: {
    ageBand: string;
    educationLevel: string;
    favoriteSubjects: string[];
  };
  assessment: {
    version: string;
    completedAt: string;
  };
  traits: Array<TraitResult & { name: string; description: string; category: "leading" | "supporting" | "less-expressed" }>;
  recommendations: FinalCareerRecommendation[];
  roadmap: Roadmap;
  methodology: {
    versions: TSkillsReportVersions;
    traitCount: 25;
    itemCount: 75;
    adaptiveQuestionRange: { min: 5; max: 8 };
    scoringDeterministic: true;
  };
  personalization?: {
    summary?: string;
    traitExplanations?: Record<string, string>;
    professionExplanations?: Record<string, string>;
  };
};

export type ReportPayload = TSkillsReportPayload;

const ABSOLUTE_CLAIMS = [
  /идеальн(ая|о|ый) професс/i,
  /идеально подходит/i,
  /гарантированно подходит/i,
  /вы должны стать/i,
  /your ideal career/i,
  /perfectly suited/i,
  /you must become/i,
];

export function assertNoAbsoluteCareerClaims(value: string) {
  if (ABSOLUTE_CLAIMS.some((pattern) => pattern.test(value))) throw new Error("ABSOLUTE_CAREER_CLAIM");
  return value;
}

function categoryFor(rank: number): "leading" | "supporting" | "less-expressed" {
  if (rank <= 5) return "leading";
  if (rank <= 15) return "supporting";
  return "less-expressed";
}

function assertTraitRanking(traits: readonly TraitResult[]) {
  const issues = [] as ReturnType<typeof issue>[];
  if (traits.length !== 25) issues.push(issue("TRAIT_RESULT_COUNT", "traits", "Report must contain exactly 25 trait results."));
  const ranks = [...traits].sort((left, right) => left.rank - right.rank).map((trait) => trait.rank);
  if (ranks.some((rank, index) => rank !== index + 1)) issues.push(issue("TRAIT_RANKING", "traits", "Trait ranks must be the complete sequence 1..25."));
  if (traits.some((trait) => !Number.isInteger(trait.rawScore) || trait.rawScore < -12 || trait.rawScore > 12)) issues.push(issue("TRAIT_SCORE_RANGE", "traits", "Trait raw scores must be integers between -12 and 12."));
  if (issues.length) throw new Error(issues.map((current) => current.code).join(","));
}

function assertRecommendations(recommendations: readonly FinalCareerRecommendation[]) {
  if (recommendations.length !== 5) throw new Error("RECOMMENDATION_COUNT");
  const ranks = [...recommendations].sort((left, right) => left.rank - right.rank).map((recommendation) => recommendation.rank);
  if (ranks.some((rank, index) => rank !== index + 1)) throw new Error("RECOMMENDATION_RANKING");
  if (recommendations.some((recommendation) => !Number.isFinite(recommendation.score))) throw new Error("RECOMMENDATION_SCORE");
  for (const recommendation of recommendations) {
    [...recommendation.traitReasons, ...recommendation.adaptiveReasons].forEach(assertNoAbsoluteCareerClaims);
  }
}

export function buildReportPayload(input: {
  versions: TSkillsReportVersions;
  completedAt: string;
  onboarding: OnboardingContext;
  traits: readonly TraitResult[];
  taxonomy: readonly TraitDefinition[];
  recommendations: readonly FinalCareerRecommendation[];
  roadmap: Roadmap;
}) {
  assertTraitRanking(input.traits);
  assertRecommendations(input.recommendations);
  const byId = new Map(input.taxonomy.map((trait) => [trait.id, trait]));
  const traits = input.traits.map((result) => {
    const definition = byId.get(result.traitId);
    if (!definition) throw new Error(`REPORT_TRAIT_NOT_FOUND:${result.traitId}`);
    return {
      ...result,
      name: definition.name,
      description: definition.reportDescription ?? definition.shortDescription,
      category: categoryFor(result.rank),
    };
  });
  return {
    userContext: {
      ageBand: ageBandFor(input.onboarding.age),
      educationLevel: input.onboarding.educationLevel,
      favoriteSubjects: [...input.onboarding.favoriteSubjects],
    },
    assessment: { version: input.versions.assessment, completedAt: input.completedAt },
    traits,
    recommendations: [...input.recommendations],
    roadmap: input.roadmap,
    methodology: {
      versions: input.versions,
      traitCount: 25 as const,
      itemCount: 75 as const,
      adaptiveQuestionRange: { min: 5 as const, max: 8 as const },
      scoringDeterministic: true as const,
    },
  } satisfies TSkillsReportPayload;
}

/**
 * Only narrative fields are accepted from an LLM. Canonical scores, ranks and
 * recommendation ordering remain the server-owned values from the payload.
 */
export function addPersonalization(
  payload: TSkillsReportPayload,
  personalization: NonNullable<TSkillsReportPayload["personalization"]>,
) {
  const texts = [personalization.summary ?? "", ...Object.values(personalization.traitExplanations ?? {}), ...Object.values(personalization.professionExplanations ?? {})];
  texts.forEach(assertNoAbsoluteCareerClaims);
  return { ...payload, personalization: { ...personalization } } satisfies TSkillsReportPayload;
}

export function finalRecommendationsFromCandidates(candidates: readonly CareerCandidate[], reasons: (candidate: CareerCandidate) => { traitReasons: string[]; adaptiveReasons: string[] }) {
  return candidates.slice(0, 5).map((candidate, index) => ({
    rank: index + 1,
    professionId: candidate.professionId,
    score: candidate.totalScore,
    ...reasons(candidate),
  } satisfies FinalCareerRecommendation));
}

export function assertReportPayload(payload: TSkillsReportPayload) {
  assertTraitRanking(payload.traits);
  assertRecommendations(payload.recommendations);
  if (payload.methodology.scoringDeterministic !== true) throw new Error("REPORT_SCORING_NOT_DETERMINISTIC");
  return payload;
}
