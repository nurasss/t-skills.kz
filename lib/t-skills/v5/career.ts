import type {
  CareerCandidateV5,
  CareerRule,
  CareerRecommendation,
  CareerTieBreakAnswer,
  CareerTieBreakQuestion,
  FinalTraitScore,
  ProfessionV5,
  V5TraitDefinition,
  V5ValidationIssue,
  V5ValidationResult,
} from "@/lib/t-skills/v5/contracts";
import { T_SKILLS_V5_VERSION_IDS } from "@/lib/t-skills/v5/versions";

const DIMENSIONS = new Set(["people", "systems", "creativity", "analysis", "leadership", "communication", "structure", "autonomy", "uncertainty", "projectScale"]);

function issue(code: string, path: string, message: string): V5ValidationIssue {
  return { code, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, path: string, issues: V5ValidationIssue[]) {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(issue("REQUIRED_TEXT", path, "Expected a non-empty string."));
    return "";
  }
  return value.trim();
}

function number(value: unknown, path: string, issues: V5ValidationIssue[], min = -1, max = 1) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    issues.push(issue("NUMBER_RANGE", path, `Expected a finite number between ${min} and ${max}.`));
    return 0;
  }
  return value;
}

function stringList(value: unknown, path: string, issues: V5ValidationIssue[]) {
  if (!Array.isArray(value)) {
    issues.push(issue("LIST_REQUIRED", path, "Expected an array of strings."));
    return [];
  }
  return value.map((entry, index) => text(entry, `${path}[${index}]`, issues)).filter(Boolean);
}

function roadmapAction(value: unknown, path: string, issues: V5ValidationIssue[]) {
  if (!isRecord(value)) {
    issues.push(issue("ROADMAP_ACTION_OBJECT", path, "Roadmap action must be an object."));
    return { id: "", type: "practice" as const, title: "", description: "", verified: false };
  }
  const type = value.type;
  const types = ["skill", "project", "research", "course", "practice", "career_experiment"] as const;
  if (!types.includes(type as typeof types[number])) issues.push(issue("ROADMAP_ACTION_TYPE", `${path}.type`, "Unknown roadmap action type."));
  if (typeof value.verified !== "boolean") issues.push(issue("ROADMAP_ACTION_VERIFIED", `${path}.verified`, "verified must be boolean."));
  return {
    id: text(value.id, `${path}.id`, issues),
    type: types.includes(type as typeof types[number]) ? type as typeof types[number] : "practice",
    title: text(value.title, `${path}.title`, issues),
    description: text(value.description, `${path}.description`, issues),
    verified: value.verified === true,
  };
}

function roadmap(value: unknown, path: string, issues: V5ValidationIssue[]) {
  if (!isRecord(value)) {
    issues.push(issue("ROADMAP_OBJECT", path, "Roadmap must be an object."));
    return { firstMonth: [], months1to3: [], months3to6: [], months6to12: [] } as ProfessionV5["roadmap"];
  }
  return {
    firstMonth: Array.isArray(value.firstMonth) ? value.firstMonth.map((entry, index) => roadmapAction(entry, `${path}.firstMonth[${index}]`, issues)) : (issues.push(issue("ROADMAP_LIST", `${path}.firstMonth`, "Expected an array.")), []),
    months1to3: Array.isArray(value.months1to3) ? value.months1to3.map((entry, index) => roadmapAction(entry, `${path}.months1to3[${index}]`, issues)) : (issues.push(issue("ROADMAP_LIST", `${path}.months1to3`, "Expected an array.")), []),
    months3to6: Array.isArray(value.months3to6) ? value.months3to6.map((entry, index) => roadmapAction(entry, `${path}.months3to6[${index}]`, issues)) : (issues.push(issue("ROADMAP_LIST", `${path}.months3to6`, "Expected an array.")), []),
    months6to12: Array.isArray(value.months6to12) ? value.months6to12.map((entry, index) => roadmapAction(entry, `${path}.months6to12[${index}]`, issues)) : (issues.push(issue("ROADMAP_LIST", `${path}.months6to12`, "Expected an array.")), []),
  };
}

function rules(value: unknown, path: string, traitIds: Set<string>, issues: V5ValidationIssue[]) {
  if (!Array.isArray(value)) {
    issues.push(issue("RULES_LIST", path, "rules must be an array."));
    return [];
  }
  return value.map((entry, index) => {
    const rulePath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      issues.push(issue("RULE_OBJECT", rulePath, "Career rule must be an object."));
      return { id: "", adjustment: 0 } satisfies CareerRule;
    }
    const id = text(entry.id, `${rulePath}.id`, issues);
    const traitId = entry.traitId === undefined ? undefined : text(entry.traitId, `${rulePath}.traitId`, issues);
    if (traitId && !traitIds.has(traitId)) issues.push(issue("RULE_UNKNOWN_TRAIT", `${rulePath}.traitId`, `Unknown trait: ${traitId}.`));
    const minRank = entry.minRank === undefined ? undefined : number(entry.minRank, `${rulePath}.minRank`, issues, 1, 25);
    const maxRank = entry.maxRank === undefined ? undefined : number(entry.maxRank, `${rulePath}.maxRank`, issues, 1, 25);
    const minMean = entry.minMean === undefined ? undefined : number(entry.minMean, `${rulePath}.minMean`, issues, -2, 2);
    const subjectTagsAny = entry.subjectTagsAny === undefined ? undefined : stringList(entry.subjectTagsAny, `${rulePath}.subjectTagsAny`, issues);
    const adjustment = number(entry.adjustment, `${rulePath}.adjustment`, issues, -1, 1);
    return { id, traitId, minRank, maxRank, minMean, subjectTagsAny, adjustment } satisfies CareerRule;
  });
}

export function validateV5CareerCatalog(input: unknown, traits: readonly V5TraitDefinition[], expectedVersion: string = T_SKILLS_V5_VERSION_IDS.careerCatalog): V5ValidationResult<ProfessionV5[]> {
  const issues: V5ValidationIssue[] = [];
  if (!Array.isArray(input)) return { ok: false, issues: [issue("CAREER_CATALOG_NOT_ARRAY", "$", "Career catalog must be an array.")] };
  const traitIds = new Set(traits.map((trait) => trait.id));
  const seen = new Set<string>();
  const professions: ProfessionV5[] = [];
  for (const [index, candidate] of input.entries()) {
    const path = `$[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(issue("PROFESSION_NOT_OBJECT", path, "Profession must be an object."));
      continue;
    }
    const id = text(candidate.id, `${path}.id`, issues);
    const title = text(candidate.title, `${path}.title`, issues);
    const description = text(candidate.description, `${path}.description`, issues);
    const version = text(candidate.version, `${path}.version`, issues);
    if (seen.has(id)) issues.push(issue("DUPLICATE_PROFESSION_ID", `${path}.id`, `Duplicate profession id: ${id}.`));
    if (id) seen.add(id);
    if (version !== expectedVersion) issues.push(issue("PROFESSION_VERSION", `${path}.version`, `Expected ${expectedVersion}.`));
    if (typeof candidate.active !== "boolean") issues.push(issue("PROFESSION_ACTIVE", `${path}.active`, "active must be boolean."));
    if (!isRecord(candidate.traitWeights)) issues.push(issue("TRAIT_WEIGHTS_OBJECT", `${path}.traitWeights`, "traitWeights must be an object."));
    const traitWeights: Record<string, number> = {};
    for (const traitId of traitIds) {
      const value = isRecord(candidate.traitWeights) ? candidate.traitWeights[traitId] : undefined;
      traitWeights[traitId] = number(value, `${path}.traitWeights.${traitId}`, issues, 0, 1);
    }
    if (isRecord(candidate.traitWeights)) for (const key of Object.keys(candidate.traitWeights)) if (!traitIds.has(key)) issues.push(issue("UNKNOWN_TRAIT_WEIGHT", `${path}.traitWeights.${key}`, `Unknown trait: ${key}.`));
    const rawDimensions = candidate.dimensions;
    if (!isRecord(rawDimensions)) issues.push(issue("DIMENSIONS_OBJECT", `${path}.dimensions`, "dimensions must be an object."));
    const dimensions: Record<string, number> = {};
    if (isRecord(rawDimensions)) for (const [key, value] of Object.entries(rawDimensions)) {
      if (!DIMENSIONS.has(key)) {
        issues.push(issue("UNKNOWN_DIMENSION", `${path}.dimensions.${key}`, `Unknown dimension: ${key}.`));
        continue;
      }
      dimensions[key] = number(value, `${path}.dimensions.${key}`, issues, 0, 1);
    }
    professions.push({
      id,
      title,
      description,
      traitWeights,
      subjectTags: stringList(candidate.subjectTags, `${path}.subjectTags`, issues),
      dimensions,
      rules: rules(candidate.rules, `${path}.rules`, traitIds, issues),
      roadmap: roadmap(candidate.roadmap, `${path}.roadmap`, issues),
      active: candidate.active === true,
      version,
    });
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: professions };
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function subjectMatch(subjects: readonly string[], tags: readonly string[]) {
  const normalizedSubjects = new Set(subjects.map((value) => value.trim().toLocaleLowerCase("ru")).filter(Boolean));
  const matches = tags.map((value) => value.trim().toLocaleLowerCase("ru")).filter((value) => normalizedSubjects.has(value));
  return tags.length && normalizedSubjects.size ? matches.length / Math.max(1, Math.min(tags.length, normalizedSubjects.size)) : 0;
}

function traitMatch(traits: readonly FinalTraitScore[], profession: ProfessionV5) {
  if (!traits.length) return 0;
  return traits.reduce((sum, trait) => {
    const userValue = clamp((trait.meanScore + 2) / 4);
    const expectedValue = clamp(profession.traitWeights[trait.traitId] ?? 0);
    return sum + (1 - Math.abs(userValue - expectedValue));
  }, 0) / traits.length;
}

function ruleMatches(rule: CareerRule, traits: readonly FinalTraitScore[], subjects: readonly string[]) {
  const trait = rule.traitId ? traits.find((candidate) => candidate.traitId === rule.traitId) : undefined;
  if (rule.traitId && !trait) return false;
  if (rule.minRank !== undefined && (trait?.rank ?? 0) < rule.minRank) return false;
  if (rule.maxRank !== undefined && (trait?.rank ?? Number.MAX_SAFE_INTEGER) > rule.maxRank) return false;
  if (rule.minMean !== undefined && (trait?.meanScore ?? -Infinity) < rule.minMean) return false;
  if (rule.subjectTagsAny?.length && !rule.subjectTagsAny.some((tag) => subjects.some((subject) => subject.toLocaleLowerCase("ru") === tag.toLocaleLowerCase("ru")))) return false;
  return true;
}

function tieBreakMatch(profession: ProfessionV5, answers: readonly CareerTieBreakAnswer[], questions: ReadonlyMap<string, CareerTieBreakQuestion>) {
  const observations: number[] = [];
  for (const answer of answers) {
    const question = questions.get(answer.questionId);
    const option = question?.options.find((candidate) => candidate.id === answer.optionId);
    for (const [dimension, desired] of Object.entries(option?.careerSignals ?? {})) {
      if (typeof profession.dimensions[dimension] !== "number") continue;
      observations.push(1 - Math.abs(profession.dimensions[dimension]! - clamp((desired + 1) / 2)));
    }
  }
  return observations.length ? observations.reduce((sum, value) => sum + value, 0) / observations.length : 0;
}

export function validateCareerTieBreakAnswers(
  input: unknown,
  questions: readonly CareerTieBreakQuestion[],
): V5ValidationResult<CareerTieBreakAnswer[]> {
  const issues: V5ValidationIssue[] = [];
  if (!Array.isArray(input)) return { ok: false, issues: [issue("TIEBREAK_ANSWERS_NOT_ARRAY", "$", "Career tie-break answers must be an array.")] };
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const seen = new Set<string>();
  const answers: CareerTieBreakAnswer[] = [];
  for (const [index, candidate] of input.entries()) {
    const path = `$[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(issue("TIEBREAK_ANSWER_OBJECT", path, "Career tie-break answer must be an object."));
      continue;
    }
    const questionId = typeof candidate.questionId === "string" ? candidate.questionId.trim() : "";
    const optionId = candidate.optionId;
    if (!questionId || !questionById.has(questionId)) issues.push(issue("TIEBREAK_UNKNOWN_QUESTION", `${path}.questionId`, "Question is not present in the prepared bank."));
    if (seen.has(questionId)) issues.push(issue("TIEBREAK_DUPLICATE_ANSWER", `${path}.questionId`, "A tie-break question can be answered only once."));
    if (questionId) seen.add(questionId);
    if (!(["A", "B", "C", "D"] as const).includes(optionId as "A" | "B" | "C" | "D")) issues.push(issue("TIEBREAK_OPTION_ID", `${path}.optionId`, "Option must be A, B, C or D."));
    const question = questionById.get(questionId);
    if (question && !question.options.some((option) => option.id === optionId)) issues.push(issue("TIEBREAK_UNKNOWN_OPTION", `${path}.optionId`, "Option is not present for the selected question."));
    if (questionId && question && ["A", "B", "C", "D"].includes(optionId as string)) answers.push({ questionId, optionId: optionId as CareerTieBreakAnswer["optionId"] });
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: answers };
}

export function matchCareersV5(input: {
  traits: readonly FinalTraitScore[];
  favoriteSubjects: readonly string[];
  catalog: readonly ProfessionV5[];
  tieBreakAnswers?: readonly CareerTieBreakAnswer[];
  tieBreakQuestions?: readonly CareerTieBreakQuestion[];
  limit?: number;
}) {
  const questions = new Map((input.tieBreakQuestions ?? []).map((question) => [question.id, question]));
  const answerValidation = validateCareerTieBreakAnswers(input.tieBreakAnswers ?? [], input.tieBreakQuestions ?? []);
  if (!answerValidation.ok) throw new Error(answerValidation.issues.map((current) => `${current.code}:${current.path}`).join(","));
  const answers = answerValidation.value;
  const candidates = input.catalog.filter((profession) => profession.active).map((profession) => {
    const trait = traitMatch(input.traits, profession);
    const subject = subjectMatch(input.favoriteSubjects, profession.subjectTags);
    const adjustment = profession.rules.filter((rule) => ruleMatches(rule, input.traits, input.favoriteSubjects)).reduce((sum, rule) => sum + rule.adjustment, 0);
    const clarification = tieBreakMatch(profession, answers, questions);
    const totalScore = clamp(trait * 0.75 + subject * 0.1 + clamp(adjustment, -0.2, 0.2) * 0.15 + clarification * 0.15);
    return { professionId: profession.id, title: profession.title, traitMatch: round(trait), subjectMatch: round(subject), ruleAdjustment: round(adjustment), clarificationMatch: round(clarification), totalScore: round(totalScore), rank: 0 } satisfies CareerCandidateV5;
  }).sort((left, right) => right.totalScore - left.totalScore || right.traitMatch - left.traitMatch || right.subjectMatch - left.subjectMatch || left.professionId.localeCompare(right.professionId));
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 20)));
  return candidates.slice(0, limit).map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

export function selectCareerTieBreakQuestion(input: {
  candidates: readonly CareerCandidateV5[];
  questions: readonly CareerTieBreakQuestion[];
  usedIds?: readonly string[];
  nearTieThreshold?: number;
}) {
  const sorted = [...input.candidates].sort((left, right) => left.rank - right.rank);
  if (sorted.length < 6) return null;
  const threshold = input.nearTieThreshold ?? 0.03;
  const boundary = (sorted[4]?.totalScore ?? 0) - (sorted[5]?.totalScore ?? 0);
  if (boundary > threshold) return null;
  const used = new Set(input.usedIds ?? []);
  const group = new Set(sorted.slice(3, 8).map((candidate) => candidate.professionId));
  return [...input.questions]
    .filter((question) => !used.has(question.id) && question.candidateGroups.some((candidateId) => group.has(candidateId)))
    .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
}

export function recommendationsFromCandidates(candidates: readonly CareerCandidateV5[], reasons: (candidate: CareerCandidateV5) => Pick<CareerRecommendation, "traitEvidence" | "subjectEvidence" | "clarificationEvidence">) {
  return candidates.slice(0, 5).map((candidate, index) => ({ professionId: candidate.professionId, rank: index + 1, score: candidate.totalScore, ...reasons(candidate) } satisfies CareerRecommendation));
}

/** No production catalog is bundled until client-approved facts are imported. */
export const T_SKILLS_V5_PRODUCTION_CAREER_CATALOG: readonly ProfessionV5[] = [];
