import type {
  CareerRecommendation,
  CareerTieBreakAnswer,
  ClarificationAnswer,
  ClarificationItem,
  CareerCandidateV5,
  FinalTraitScore,
  TSkillsReportPayloadV5,
  TraitProfileV5,
  TraitUncertainty,
  V5PairwiseAnswer,
  V5PairwiseAnswerMap,
} from "@/lib/t-skills/v5/contracts";
import { validateClarificationAnswer, selectClarificationItems } from "@/lib/t-skills/v5/clarification";
import { matchCareersV5, recommendationsFromCandidates, selectCareerTieBreakQuestion } from "@/lib/t-skills/v5/career";
import { validateTSkillsV5ContentBundle, type TSkillsV5ContentBundle } from "@/lib/t-skills/v5/content-bundle";
import { buildV5ReportPayload } from "@/lib/t-skills/v5/report";
import { scoreFinalProfile, scoreBaseProfile } from "@/lib/t-skills/v5/scoring";
import { analyzeTraitUncertainty } from "@/lib/t-skills/v5/uncertainty";
import { T_SKILLS_V5_CLARIFICATION_MAX, T_SKILLS_V5_CLARIFICATION_TARGET } from "@/lib/t-skills/v5/versions";

export type TSkillsV5PipelineInput = {
  content: TSkillsV5ContentBundle;
  baseAnswers: V5PairwiseAnswerMap | readonly V5PairwiseAnswer[];
  clarificationAnswers?: readonly ClarificationAnswer[];
  selectedClarificationIds?: readonly string[];
  careerTieBreakAnswers?: readonly CareerTieBreakAnswer[];
  onboarding: {
    favoriteSubjects: readonly string[];
    ageBand?: string;
    educationLevel?: string;
  };
  completedAt?: string;
  earlyStopClarification?: boolean;
};

export type TSkillsV5PipelineResult = {
  stage: "CLARIFICATION" | "CAREER_TIEBREAK" | "COMPLETED";
  base: ReturnType<typeof scoreBaseProfile>;
  uncertainty: TraitUncertainty[];
  selectedClarifications: ClarificationItem[];
  final: ReturnType<typeof scoreFinalProfile>;
  preliminaryCandidates: CareerCandidateV5[];
  candidates: CareerCandidateV5[];
  careerTieBreakQuestion: TSkillsV5ContentBundle["careerTieBreakQuestions"][number] | null;
  recommendations: CareerRecommendation[];
  report: TSkillsReportPayloadV5 | null;
};

function assertContentBundle(content: TSkillsV5ContentBundle) {
  const result = validateTSkillsV5ContentBundle(content);
  if (!result.ok) throw new Error(result.issues.map((current) => `${current.code}:${current.path}`).join(","));
  return result.value;
}

function finalScoreFromBase(base: ReturnType<typeof scoreBaseProfile>["base"]): FinalTraitScore[] {
  return base.map((entry) => ({
    ...entry,
    baseRawScore: entry.rawScore,
    baseMeanScore: entry.meanScore,
    clarificationContributions: [],
    effectiveObservations: entry.contributions.length,
    rank: entry.rank ?? 0,
  }));
}

function selectedClarifications(input: TSkillsV5PipelineInput, content: TSkillsV5ContentBundle, uncertainty: readonly TraitUncertainty[]) {
  const traitItems = content.clarificationItems.filter((item) => item.type === "trait_clarification");
  if (!input.selectedClarificationIds) {
    return selectClarificationItems({
      bank: traitItems,
      uncertainty,
      target: T_SKILLS_V5_CLARIFICATION_TARGET,
      max: T_SKILLS_V5_CLARIFICATION_MAX,
    });
  }
  const ids = new Set<string>();
  const byId = new Map(traitItems.map((item) => [item.id, item]));
  const selected: ClarificationItem[] = [];
  for (const id of input.selectedClarificationIds) {
    if (typeof id !== "string" || !id.trim() || ids.has(id)) throw new Error(`V5_INVALID_SELECTED_CLARIFICATION:${id}`);
    const item = byId.get(id);
    if (!item) throw new Error(`V5_UNKNOWN_SELECTED_CLARIFICATION:${id}`);
    ids.add(id);
    selected.push(item);
  }
  if (selected.length > T_SKILLS_V5_CLARIFICATION_MAX) throw new Error("V5_TOO_MANY_CLARIFICATIONS");
  return selected;
}

function validatedClarificationAnswers(
  answers: readonly ClarificationAnswer[],
  selected: readonly ClarificationItem[],
) {
  const selectedById = new Map(selected.map((item) => [item.id, item]));
  const seen = new Set<string>();
  return answers.map((answer) => {
    if (!answer || typeof answer.itemId !== "string" || seen.has(answer.itemId)) throw new Error(`V5_INVALID_CLARIFICATION_ANSWER:${answer?.itemId ?? ""}`);
    const item = selectedById.get(answer.itemId);
    if (!item || !validateClarificationAnswer(answer, item)) throw new Error(`V5_INVALID_CLARIFICATION_ANSWER:${answer.itemId}`);
    seen.add(answer.itemId);
    return { ...answer };
  });
}

function recommendationsFor(
  candidates: readonly CareerCandidateV5[],
  traits: readonly FinalTraitScore[],
  content: TSkillsV5ContentBundle,
  favoriteSubjects: readonly string[],
): CareerRecommendation[] {
  const taxonomyById = new Map(content.traits.map((trait) => [trait.id, trait]));
  const professionById = new Map(content.professions.map((profession) => [profession.id, profession]));
  const normalizedSubjects = new Set(favoriteSubjects.map((subject) => subject.trim().toLocaleLowerCase("ru")).filter(Boolean));
  return recommendationsFromCandidates(candidates, (candidate) => {
    const profession = professionById.get(candidate.professionId);
    const rankedTraits = [...traits].sort((left, right) => left.rank - right.rank);
    const traitEvidence = rankedTraits
      .filter((trait) => (profession?.traitWeights[trait.traitId] ?? 0) >= 0.5)
      .slice(0, 3)
      .map((trait) => `Качество «${taxonomyById.get(trait.traitId)?.name ?? trait.traitId}» занимает место ${trait.rank}.`);
    const matchedSubjects = profession?.subjectTags.filter((tag) => normalizedSubjects.has(tag.toLocaleLowerCase("ru"))) ?? [];
    const subjectEvidence = matchedSubjects.map((subject) => `Учтён любимый предмет: ${subject}.`);
    const clarificationEvidence = candidate.clarificationMatch > 0
      ? ["Учтены ответы на подготовленные карьерные уточнения."]
      : [];
    return { traitEvidence, subjectEvidence, clarificationEvidence };
  });
}

/**
 * Runs the mathematical v5 pathway. The function is content-gated: it accepts
 * only a fully validated, client-approved bundle and has no AI or randomness.
 */
export function runTSkillsV5Pipeline(input: TSkillsV5PipelineInput): TSkillsV5PipelineResult {
  const content = assertContentBundle(input.content);
  const base = scoreBaseProfile({ items: content.items, traits: content.traits, answers: input.baseAnswers });
  const uncertainty = analyzeTraitUncertainty({ base: base.base, catalog: content.professions });
  const selected = selectedClarifications(input, content, uncertainty);
  const clarificationAnswers = validatedClarificationAnswers(input.clarificationAnswers ?? [], selected);
  const clarificationComplete = input.earlyStopClarification === true || clarificationAnswers.length === selected.length;
  const preliminaryCandidates = matchCareersV5({
    traits: finalScoreFromBase(base.base),
    favoriteSubjects: input.onboarding.favoriteSubjects,
    catalog: content.professions,
  });
  const final = scoreFinalProfile({
    items: content.items,
    traits: content.traits,
    answers: input.baseAnswers,
    clarificationItems: selected,
    clarificationAnswers,
  });
  const candidates = matchCareersV5({
    traits: final.final,
    favoriteSubjects: input.onboarding.favoriteSubjects,
    catalog: content.professions,
    tieBreakAnswers: input.careerTieBreakAnswers,
    tieBreakQuestions: content.careerTieBreakQuestions,
  });
  const nextTieBreakQuestion = clarificationComplete
    ? selectCareerTieBreakQuestion({
        candidates,
        questions: content.careerTieBreakQuestions,
        usedIds: (input.careerTieBreakAnswers ?? []).map((answer) => answer.questionId),
      })
    : null;
  const recommendations = recommendationsFor(candidates, final.final, content, input.onboarding.favoriteSubjects);
  const stage = !clarificationComplete
    ? "CLARIFICATION"
    : nextTieBreakQuestion
      ? "CAREER_TIEBREAK"
      : "COMPLETED";
  if (stage === "COMPLETED" && !input.completedAt) throw new Error("V5_COMPLETED_AT_REQUIRED");
  const profile: TraitProfileV5 = {
    base: base.base,
    final: final.final,
    clarificationAnswers,
  };
  const report = stage === "COMPLETED"
    ? buildV5ReportPayload({
        completedAt: input.completedAt!,
        profile,
        recommendations,
        taxonomy: content.traits,
        catalog: content.professions,
        favoriteSubjects: input.onboarding.favoriteSubjects,
        ageBand: input.onboarding.ageBand,
        educationLevel: input.onboarding.educationLevel,
      })
    : null;
  return {
    stage,
    base,
    uncertainty,
    selectedClarifications: selected,
    final,
    preliminaryCandidates,
    candidates,
    careerTieBreakQuestion: nextTieBreakQuestion,
    recommendations,
    report,
  };
}
