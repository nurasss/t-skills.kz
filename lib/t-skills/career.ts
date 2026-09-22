import {
  CAREER_DIMENSIONS,
  type AdaptiveAnswer,
  type CareerCandidate,
  type CareerDimension,
  type OnboardingContext,
  type Profession,
  type TraitResult,
  assertValid,
  invalid,
  isRecord,
  issue,
  type ValidationResult,
  valid,
} from "@/lib/t-skills/contracts";
import { T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";
import { productionCareerCatalog } from "@/lib/t-skills/production-career-model";

export const T_SKILLS_CAREER_CATALOG_VERSION = T_SKILLS_VERSION_IDS.careerCatalog;

function cleanString(value: unknown, path: string, issues: ReturnType<typeof issue>[]) {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(issue("REQUIRED_TEXT", path, "Expected a non-empty string."));
    return "";
  }
  return value.trim();
}

function validateNumber(value: unknown, path: string, issues: ReturnType<typeof issue>[]) {
  if (typeof value !== "number" || !Number.isFinite(value)) issues.push(issue("NUMBER_INVALID", path, "Expected a finite number."));
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function validateCareerCatalog(
  input: unknown,
  traitIds: readonly string[],
  expectedVersion: string = T_SKILLS_CAREER_CATALOG_VERSION,
): ValidationResult<Profession[]> {
  const issues: ReturnType<typeof issue>[] = [];
  if (!Array.isArray(input)) return invalid([issue("CAREER_CATALOG_NOT_ARRAY", "$", "Career catalog must be an array.")]);
  const traitSet = new Set(traitIds);
  const seen = new Set<string>();
  const professions: Profession[] = [];
  for (const [index, candidate] of input.entries()) {
    const path = `$[${index}]`;
    if (!isRecord(candidate)) {
      issues.push(issue("PROFESSION_NOT_OBJECT", path, "Profession must be an object."));
      continue;
    }
    const id = cleanString(candidate.id, `${path}.id`, issues);
    const title = cleanString(candidate.title, `${path}.title`, issues);
    const version = cleanString(candidate.version, `${path}.version`, issues);
    if (id && seen.has(id)) issues.push(issue("DUPLICATE_PROFESSION_ID", `${path}.id`, `Duplicate profession id: ${id}.`));
    if (id) seen.add(id);
    if (version !== expectedVersion) issues.push(issue("PROFESSION_VERSION", `${path}.version`, `Expected catalog version ${expectedVersion}.`));
    if (typeof candidate.active !== "boolean") issues.push(issue("PROFESSION_ACTIVE", `${path}.active`, "Active must be boolean."));
    if (!isRecord(candidate.traitProfile)) {
      issues.push(issue("TRAIT_PROFILE_NOT_OBJECT", `${path}.traitProfile`, "Trait profile must be an object."));
    }
    const traitProfile: Record<string, number> = {};
    for (const traitId of traitSet) {
      const value = isRecord(candidate.traitProfile) ? candidate.traitProfile[traitId] : undefined;
      const score = validateNumber(value, `${path}.traitProfile.${traitId}`, issues);
      if (score < -1 || score > 1) issues.push(issue("TRAIT_PROFILE_RANGE", `${path}.traitProfile.${traitId}`, "Trait profile values must be between -1 and 1."));
      traitProfile[traitId] = score;
    }
    if (isRecord(candidate.traitProfile)) {
      for (const key of Object.keys(candidate.traitProfile)) {
        if (!traitSet.has(key)) issues.push(issue("UNKNOWN_TRAIT", `${path}.traitProfile.${key}`, `Unknown trait: ${key}.`));
      }
    }
    const careerDimensions: Partial<Record<CareerDimension, number>> = {};
    if (candidate.careerDimensions !== undefined) {
      if (!isRecord(candidate.careerDimensions)) issues.push(issue("DIMENSIONS_NOT_OBJECT", `${path}.careerDimensions`, "Career dimensions must be an object."));
      else {
        for (const key of Object.keys(candidate.careerDimensions)) {
          if (!(CAREER_DIMENSIONS as readonly string[]).includes(key)) {
            issues.push(issue("UNKNOWN_DIMENSION", `${path}.careerDimensions.${key}`, `Unknown career dimension: ${key}.`));
            continue;
          }
          const value = validateNumber(candidate.careerDimensions[key], `${path}.careerDimensions.${key}`, issues);
          if (value < 0 || value > 1) issues.push(issue("DIMENSION_RANGE", `${path}.careerDimensions.${key}`, "Career dimension values must be between 0 and 1."));
          careerDimensions[key as CareerDimension] = value;
        }
      }
    }
    const list = (value: unknown, field: string) => {
      if (value === undefined) return undefined;
      if (!Array.isArray(value)) {
        issues.push(issue("LIST_NOT_ARRAY", `${path}.${field}`, "Expected an array of strings."));
        return [];
      }
      return value.map((entry, entryIndex) => cleanString(entry, `${path}.${field}[${entryIndex}]`, issues)).filter(Boolean);
    };
    const subjectTags = list(candidate.subjectTags, "subjectTags");
    const educationPaths = list(candidate.educationPaths, "educationPaths");
    const description = candidate.description === undefined ? undefined : cleanString(candidate.description, `${path}.description`, issues);
    professions.push({ id, title, description, traitProfile, subjectTags, careerDimensions, educationPaths, active: candidate.active === true, version });
  }
  return issues.length ? invalid(issues) : valid(professions);
}

export function parseCareerCatalogJson(json: string, traitIds: readonly string[], expectedVersion: string = T_SKILLS_CAREER_CATALOG_VERSION) {
  try {
    return validateCareerCatalog(JSON.parse(json) as unknown, traitIds, expectedVersion);
  } catch {
    return invalid<Profession[]>([issue("INVALID_JSON", "$", "Career catalog is not valid JSON.")]);
  }
}

export function assertCareerCatalog(input: unknown, traitIds: readonly string[], expectedVersion: string = T_SKILLS_CAREER_CATALOG_VERSION) {
  return assertValid(validateCareerCatalog(input, traitIds, expectedVersion));
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ru");
}

function traitMatch(traits: readonly TraitResult[], profession: Profession) {
  if (!traits.length) return 0;
  const scores = traits.map((trait) => {
    const userValue = clamp(typeof trait.normalizedScore === "number" ? trait.normalizedScore : trait.rawScore / Math.max(1, trait.exposure * 2), -1, 1);
    const targetValue = clamp(profession.traitProfile[trait.traitId] ?? 0, -1, 1);
    return 1 - Math.abs(userValue - targetValue) / 2;
  });
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function subjectMatch(onboarding: OnboardingContext, profession: Profession) {
  const subjects = new Set(onboarding.favoriteSubjects.map(normalize));
  const tags = (profession.subjectTags ?? []).map(normalize).filter(Boolean);
  if (!subjects.size || !tags.length) return 0;
  return tags.filter((tag) => subjects.has(tag)).length / Math.max(1, Math.min(subjects.size, tags.length));
}

function adaptiveMatch(profession: Profession, answers: readonly AdaptiveAnswer[], questions: ReadonlyMap<string, { options: Array<{ id: string; signals: Array<{ dimension: CareerDimension; value: number; weight?: number }> }> }>) {
  const observations: number[] = [];
  for (const answer of answers) {
    const question = questions.get(answer.questionId);
    const option = question?.options.find((candidate) => candidate.id === answer.optionId);
    for (const signal of option?.signals ?? []) {
      const dimension = profession.careerDimensions?.[signal.dimension];
      if (typeof dimension !== "number") continue;
      const desired = (clamp(signal.value, -1, 1) + 1) / 2;
      observations.push((1 - Math.abs(dimension - desired)) * (signal.weight ?? 1));
    }
  }
  if (!observations.length) return 0;
  const weight = answers.length ? observations.reduce((sum, value) => sum + value, 0) / observations.length : 0;
  return clamp(weight);
}

export function matchCareers(input: {
  traits: readonly TraitResult[];
  onboarding: OnboardingContext;
  catalog: readonly Profession[];
  adaptiveAnswers?: readonly AdaptiveAnswer[];
  adaptiveQuestions?: readonly { id: string; options: Array<{ id: "A" | "B" | "C" | "D"; signals: Array<{ dimension: CareerDimension; value: number; weight?: number }> }> }[];
  limit?: number;
}) {
  const questions = new Map((input.adaptiveQuestions ?? []).map((question) => [question.id, question]));
  const answers = input.adaptiveAnswers ?? [];
  const withAdaptive = answers.length > 0;
  const candidates = input.catalog
    .filter((profession) => profession.active)
    .map((profession) => {
      const trait = traitMatch(input.traits, profession);
      const subject = subjectMatch(input.onboarding, profession);
      const adaptive = withAdaptive ? adaptiveMatch(profession, answers, questions) : 0;
      const total = withAdaptive ? trait * 0.7 + subject * 0.1 + adaptive * 0.2 : trait * 0.85 + subject * 0.15;
      return {
        professionId: profession.id,
        title: profession.title,
        traitMatch: round(trait),
        subjectMatch: round(subject),
        adaptiveMatch: round(adaptive),
        totalScore: round(total),
        rank: 0,
      } satisfies CareerCandidate;
    })
    .sort((left, right) => right.totalScore - left.totalScore || right.traitMatch - left.traitMatch || left.professionId.localeCompare(right.professionId));
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 20)));
  return candidates.slice(0, limit).map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function round(value: number) {
  return Math.round(value * 10_000) / 10_000;
}

/** The runtime fallback mirrors the published seed; matching weights live in
 * the immutable model registry, not in CMS-editable career entries. */
export const T_SKILLS_PRODUCTION_CAREER_CATALOG: readonly Profession[] = productionCareerCatalog();
