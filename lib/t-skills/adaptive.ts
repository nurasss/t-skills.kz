import {
  CAREER_DIMENSIONS,
  type AdaptiveAnswer,
  type AdaptiveCareerContext,
  type AdaptiveQuestion,
  type CareerCandidate,
  type CareerDimension,
  type CareerSignal,
  type OnboardingContext,
  type Profession,
  type TraitResult,
  invalid,
  isRecord,
  issue,
  type ValidationResult,
  valid,
} from "@/lib/t-skills/contracts";
import { sanitizeOnboardingForAdaptive } from "@/lib/t-skills/onboarding";
import { matchCareers } from "@/lib/t-skills/career";
import {
  T_SKILLS_ADAPTIVE_MAX_QUESTIONS,
  T_SKILLS_ADAPTIVE_MIN_QUESTIONS,
  T_SKILLS_VERSION_IDS,
} from "@/lib/t-skills/versions";

export const T_SKILLS_ADAPTIVE_VERSION = T_SKILLS_VERSION_IDS.adaptive;
export const T_SKILLS_ADAPTIVE_PROMPT_VERSION = T_SKILLS_VERSION_IDS.adaptivePrompt;

/** The approved fallback bank is injected with the content bundle; no
 * unapproved career questions are shipped as production content. */
export const T_SKILLS_PRODUCTION_ADAPTIVE_BANK: readonly AdaptiveQuestion[] = [];

const OPTION_IDS = ["A", "B", "C", "D"] as const;
const FORBIDDEN_CONTENT = [
  /медицин/i,
  /medical/i,
  /диагноз/i,
  /diagnos/i,
  /болезн/i,
  /политик/i,
  /politic/i,
  /парт(ия|ии|ию)/i,
  /религи/i,
  /relig/i,
  /бог\b/i,
  /молитв/i,
  /сексуал/i,
  /sexual/i,
  /паспорт/i,
  /телефон/i,
  /\bphone\b/i,
  /e-?mail/i,
  /электронн.*почт/i,
  /адрес/i,
  /\baddress\b/i,
  /фамили/i,
  /\bname\b/i,
  /напиши/i,
  /введи/i,
  /\bwrite\b/i,
  /\benter\b/i,
  /свободн.*ответ/i,
  /free[- ]?text/i,
];

function normalizedText(value: string) {
  return value.trim().toLocaleLowerCase("ru").replace(/\s+/g, " ");
}

function hasForbiddenContent(value: string) {
  return FORBIDDEN_CONTENT.some((pattern) => pattern.test(value));
}

function validateSignal(value: unknown, path: string, issues: ReturnType<typeof issue>[]) {
  if (!isRecord(value)) {
    issues.push(issue("SIGNAL_NOT_OBJECT", path, "Signal must be an object."));
    return null;
  }
  const dimension = value.dimension;
  if (!(CAREER_DIMENSIONS as readonly string[]).includes(String(dimension))) {
    issues.push(issue("SIGNAL_DIMENSION", `${path}.dimension`, "Signal uses an unknown career dimension."));
  }
  const signalValue = value.value;
  if (typeof signalValue !== "number" || !Number.isFinite(signalValue) || signalValue < -1 || signalValue > 1) {
    issues.push(issue("SIGNAL_VALUE", `${path}.value`, "Signal value must be a finite number between -1 and 1."));
  }
  const weight = value.weight;
  if (weight !== undefined && (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0 || weight > 3)) {
    issues.push(issue("SIGNAL_WEIGHT", `${path}.weight`, "Signal weight must be greater than 0 and no more than 3."));
  }
  if (typeof dimension !== "string" || !(CAREER_DIMENSIONS as readonly string[]).includes(dimension)) return null;
  return {
    dimension: dimension as CareerDimension,
    value: typeof signalValue === "number" && Number.isFinite(signalValue) ? signalValue : 0,
    ...(typeof weight === "number" ? { weight } : {}),
  } satisfies CareerSignal;
}

export function validateAdaptiveQuestion(
  input: unknown,
  context: { age?: number; previousQuestions?: readonly AdaptiveQuestion[] } = {},
): ValidationResult<AdaptiveQuestion> {
  const issues: ReturnType<typeof issue>[] = [];
  if (!isRecord(input)) return invalid([issue("QUESTION_NOT_OBJECT", "$", "Adaptive question must be an object.")]);
  const id = input.id;
  const prompt = input.prompt;
  if (typeof id !== "string" || !id.trim()) issues.push(issue("QUESTION_ID", "id", "Question id is required."));
  if (typeof prompt !== "string" || !prompt.trim()) issues.push(issue("QUESTION_PROMPT", "prompt", "Question prompt is required."));
  const cleanPrompt = typeof prompt === "string" ? prompt.trim() : "";
  if (cleanPrompt.length > 1_000) issues.push(issue("QUESTION_PROMPT_LENGTH", "prompt", "Question prompt exceeds 1000 characters."));
  if (hasForbiddenContent(cleanPrompt)) issues.push(issue("QUESTION_FORBIDDEN_CONTENT", "prompt", "Question contains prohibited content."));

  const options = input.options;
  if (!Array.isArray(options) || options.length !== 4) {
    issues.push(issue("OPTION_COUNT", "options", "Adaptive question must contain exactly four options."));
  }
  const parsedOptions: Array<{ id: "A" | "B" | "C" | "D"; text: string; signals: CareerSignal[] }> = [];
  const optionTexts = new Set<string>();
  for (const [index, candidate] of (Array.isArray(options) ? options : []).entries()) {
    const path = `options[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(issue("OPTION_NOT_OBJECT", path, "Option must be an object."));
      continue;
    }
    const expectedId = OPTION_IDS[index];
    if (candidate.id !== expectedId) issues.push(issue("OPTION_ID_ORDER", `${path}.id`, `Expected option id ${expectedId}.`));
    const text = candidate.text;
    if (typeof text !== "string" || !text.trim()) issues.push(issue("OPTION_TEXT", `${path}.text`, "Option text is required."));
    const cleanText = typeof text === "string" ? text.trim() : "";
    const normalized = normalizedText(cleanText);
    if (normalized && optionTexts.has(normalized)) issues.push(issue("OPTION_DUPLICATE", `${path}.text`, "Option texts must be different."));
    if (normalized) optionTexts.add(normalized);
    if (hasForbiddenContent(cleanText)) issues.push(issue("OPTION_FORBIDDEN_CONTENT", `${path}.text`, "Option contains prohibited content."));
    if (!Array.isArray(candidate.signals) || candidate.signals.length === 0 || candidate.signals.length > 8) {
      issues.push(issue("OPTION_SIGNALS", `${path}.signals`, "Each option must have between one and eight machine-readable signals."));
    }
    const signals = (Array.isArray(candidate.signals) ? candidate.signals : [])
      .map((signal, signalIndex) => validateSignal(signal, `${path}.signals[${signalIndex}]`, issues))
      .filter((signal): signal is CareerSignal => Boolean(signal));
    parsedOptions.push({ id: expectedId, text: cleanText, signals });
  }

  const minAge = input.minAge;
  const maxAge = input.maxAge;
  const dimension = input.dimension;
  if (dimension !== undefined && (!(CAREER_DIMENSIONS as readonly string[]).includes(String(dimension)))) {
    issues.push(issue("QUESTION_DIMENSION", "dimension", "Question uses an unknown career dimension."));
  }
  if (minAge !== undefined && (typeof minAge !== "number" || !Number.isInteger(minAge) || minAge < 10 || minAge > 100)) issues.push(issue("MIN_AGE", "minAge", "minAge must be an integer between 10 and 100."));
  if (maxAge !== undefined && (typeof maxAge !== "number" || !Number.isInteger(maxAge) || maxAge < 10 || maxAge > 100)) issues.push(issue("MAX_AGE", "maxAge", "maxAge must be an integer between 10 and 100."));
  if (typeof minAge === "number" && typeof maxAge === "number" && minAge > maxAge) issues.push(issue("AGE_RANGE", "$", "minAge cannot exceed maxAge."));
  if (typeof context.age === "number" && typeof minAge === "number" && context.age < minAge) issues.push(issue("AGE_MISMATCH", "minAge", "Question is not valid for this age."));
  if (typeof context.age === "number" && typeof maxAge === "number" && context.age > maxAge) issues.push(issue("AGE_MISMATCH", "maxAge", "Question is not valid for this age."));

  const previous = context.previousQuestions ?? [];
  if (typeof id === "string" && previous.some((question) => question.id === id)) issues.push(issue("QUESTION_DUPLICATE", "id", "Question id was already used."));
  if (previous.some((question) => normalizedText(question.prompt) === normalizedText(cleanPrompt))) issues.push(issue("QUESTION_DUPLICATE", "prompt", "Question prompt was already used."));
  if (hasForbiddenContent(typeof input.rationaleInternal === "string" ? input.rationaleInternal : "")) issues.push(issue("RATIONALE_FORBIDDEN_CONTENT", "rationaleInternal", "Internal rationale contains prohibited content."));
  if (input.rationaleInternal !== undefined && (typeof input.rationaleInternal !== "string" || input.rationaleInternal.length > 2_000)) issues.push(issue("RATIONALE_LENGTH", "rationaleInternal", "Internal rationale must be a string of at most 2000 characters."));

  if (issues.length || parsedOptions.length !== 4 || typeof id !== "string") return invalid(issues.length ? issues : [issue("QUESTION_INVALID", "$", "Question is invalid.")]);
  return valid({
    id: id.trim(),
    prompt: cleanPrompt,
    dimension: typeof dimension === "string" ? dimension as CareerDimension : undefined,
    options: parsedOptions as [typeof parsedOptions[0], typeof parsedOptions[1], typeof parsedOptions[2], typeof parsedOptions[3]],
    rationaleInternal: typeof input.rationaleInternal === "string" ? input.rationaleInternal : undefined,
    minAge: typeof minAge === "number" ? minAge : undefined,
    maxAge: typeof maxAge === "number" ? maxAge : undefined,
  });
}

export function publicAdaptiveQuestion(question: AdaptiveQuestion): Omit<AdaptiveQuestion, "rationaleInternal"> {
  const publicQuestion: Omit<AdaptiveQuestion, "rationaleInternal"> = {
    id: question.id,
    prompt: question.prompt,
    options: question.options,
  };
  if (typeof question.minAge === "number") publicQuestion.minAge = question.minAge;
  if (typeof question.maxAge === "number") publicQuestion.maxAge = question.maxAge;
  return publicQuestion;
}

export type AdaptiveQuestionProvider = {
  generate(context: AdaptiveCareerContext): Promise<unknown>;
};

export type AdaptiveQuestionSelection =
  | { question: AdaptiveQuestion; source: "ai" | "fallback" }
  | { question: null; source: "stopped" | "unavailable"; reason: "EARLY_STOP" | "MAX_QUESTIONS" | "CONTENT_NOT_READY" };

export function shouldStopAdaptiveQuiz(input: {
  answeredCount: number;
  rankingHistory: readonly (readonly CareerCandidate[])[];
  minQuestions?: number;
  maxQuestions?: number;
  requiredStableRounds?: number;
  minimumTopMargin?: number;
}) {
  const minQuestions = input.minQuestions ?? T_SKILLS_ADAPTIVE_MIN_QUESTIONS;
  const maxQuestions = input.maxQuestions ?? T_SKILLS_ADAPTIVE_MAX_QUESTIONS;
  if (input.answeredCount >= maxQuestions) return true;
  if (input.answeredCount < minQuestions) return false;
  const requiredStableRounds = input.requiredStableRounds ?? 2;
  if (input.rankingHistory.length < requiredStableRounds) return false;
  const recent = input.rankingHistory.slice(-requiredStableRounds);
  const topIds = recent.map((ranking) => ranking.slice(0, 5).map((candidate) => candidate.professionId).join("|"));
  if (new Set(topIds).size !== 1) return false;
  const latest = recent[recent.length - 1] ?? [];
  const margin = (latest[0]?.totalScore ?? 0) - (latest[1]?.totalScore ?? 0);
  return margin >= (input.minimumTopMargin ?? 0.05);
}

export function applyAdaptiveAnswer(input: {
  traits: readonly TraitResult[];
  onboarding: OnboardingContext;
  catalog: readonly Profession[];
  questions: readonly AdaptiveQuestion[];
  answers: readonly AdaptiveAnswer[];
  answer: AdaptiveAnswer;
  limit?: number;
}) {
  const question = input.questions.find((candidate) => candidate.id === input.answer.questionId);
  if (!question) throw new Error("ADAPTIVE_QUESTION_NOT_FOUND");
  const option = question.options.find((candidate) => candidate.id === input.answer.optionId);
  if (!option) throw new Error("ADAPTIVE_OPTION_NOT_FOUND");
  if (input.answers.some((answer) => answer.questionId === input.answer.questionId)) throw new Error("ADAPTIVE_QUESTION_ALREADY_ANSWERED");
  const answers = [...input.answers, input.answer];
  return matchCareers({
    traits: input.traits,
    onboarding: input.onboarding,
    catalog: input.catalog,
    adaptiveAnswers: answers,
    adaptiveQuestions: input.questions,
    limit: input.limit,
  });
}

export function buildAdaptiveCareerContext(input: {
  onboarding: OnboardingContext;
  traits: readonly TraitResult[];
  currentCandidates: readonly CareerCandidate[];
  previousQuestions: readonly AdaptiveQuestion[];
  previousAnswers: readonly AdaptiveAnswer[];
  remainingQuestions: number;
  rankingHistory?: readonly (readonly CareerCandidate[])[];
}): AdaptiveCareerContext {
  const onboarding = sanitizeOnboardingForAdaptive(input.onboarding);
  return {
    ...onboarding,
    topTraits: [...input.traits].sort((left, right) => left.rank - right.rank).slice(0, 5),
    lowTraits: [...input.traits].sort((left, right) => right.rank - left.rank).slice(0, 5),
    fullTraitVector: Object.fromEntries(input.traits.map((trait) => [trait.traitId, trait.rawScore])),
    currentCandidates: [...input.currentCandidates],
    previousQuestions: [...input.previousQuestions].map(publicAdaptiveQuestion),
    previousAnswers: [...input.previousAnswers],
    remainingQuestions: Math.max(0, Math.min(T_SKILLS_ADAPTIVE_MAX_QUESTIONS, Math.trunc(input.remainingQuestions))),
    rankingHistory: input.rankingHistory?.map((ranking) => [...ranking]),
  };
}

export async function selectNextAdaptiveQuestion(input: {
  context: AdaptiveCareerContext;
  fallbackBank?: readonly AdaptiveQuestion[];
  provider?: AdaptiveQuestionProvider;
  age?: number;
  minQuestions?: number;
  maxQuestions?: number;
}): Promise<AdaptiveQuestionSelection> {
  const answeredCount = input.context.previousAnswers.length;
  const maxQuestions = input.maxQuestions ?? T_SKILLS_ADAPTIVE_MAX_QUESTIONS;
  const minQuestions = input.minQuestions ?? T_SKILLS_ADAPTIVE_MIN_QUESTIONS;
  if (answeredCount >= maxQuestions || input.context.remainingQuestions <= 0) return { question: null, source: "stopped", reason: "MAX_QUESTIONS" };
  if (shouldStopAdaptiveQuiz({
    answeredCount,
    rankingHistory: input.context.rankingHistory ?? [],
    minQuestions,
    maxQuestions,
  })) return { question: null, source: "stopped", reason: "EARLY_STOP" };
  const previous = input.context.previousQuestions;
  if (input.provider) {
    try {
      const generated = await input.provider.generate(input.context);
      const validated = validateAdaptiveQuestion(generated, { age: input.age, previousQuestions: previous });
      if (validated.ok) return { question: validated.value, source: "ai" };
    } catch {
      // A provider failure is expected to fall through to the approved bank.
    }
  }
  const validFallbacks = (input.fallbackBank ?? T_SKILLS_PRODUCTION_ADAPTIVE_BANK)
    .map((question) => validateAdaptiveQuestion(question, { age: input.age, previousQuestions: previous }))
    .filter((result): result is { ok: true; value: AdaptiveQuestion } => result.ok)
    .map((result) => result.value)
    .sort((left, right) => left.id.localeCompare(right.id));
  const next = validFallbacks[0];
  return next ? { question: next, source: "fallback" } : { question: null, source: "unavailable", reason: "CONTENT_NOT_READY" };
}
