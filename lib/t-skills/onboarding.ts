import {
  assertValid,
  invalid,
  isRecord,
  issue,
  type OnboardingContext,
  type ValidationResult,
  valid,
} from "@/lib/t-skills/contracts";

const MAX_LIST_ITEMS = 20;
const MAX_TEXT_LENGTH = 160;

function cleanText(value: unknown, path: string, issues: ReturnType<typeof issue>[]) {
  if (typeof value !== "string" || !value.trim()) {
    issues.push(issue("REQUIRED_TEXT", path, "Expected a non-empty string."));
    return "";
  }
  const text = value.trim();
  if (text.length > MAX_TEXT_LENGTH) issues.push(issue("TEXT_TOO_LONG", path, `Text exceeds ${MAX_TEXT_LENGTH} characters.`));
  return text;
}

function cleanOptionalText(value: unknown, path: string, issues: ReturnType<typeof issue>[]) {
  if (value === undefined || value === null) return undefined;
  return cleanText(value, path, issues);
}

function cleanList(value: unknown, path: string, issues: ReturnType<typeof issue>[], required: boolean) {
  if (value === undefined || value === null) {
    if (required) issues.push(issue("REQUIRED_LIST", path, "Expected a non-empty list."));
    return [];
  }
  if (!Array.isArray(value)) {
    issues.push(issue("LIST_NOT_ARRAY", path, "Expected an array of strings."));
    return [];
  }
  if (value.length > MAX_LIST_ITEMS) issues.push(issue("LIST_TOO_LONG", path, `Expected at most ${MAX_LIST_ITEMS} entries.`));
  const result = value.map((item, index) => cleanText(item, `${path}[${index}]`, issues)).filter(Boolean);
  if (required && result.length === 0) issues.push(issue("REQUIRED_LIST", path, "Expected at least one entry."));
  return [...new Set(result)];
}

export function validateOnboarding(input: unknown): ValidationResult<OnboardingContext> {
  const issues: ReturnType<typeof issue>[] = [];
  if (!isRecord(input)) return invalid([issue("ONBOARDING_NOT_OBJECT", "$", "Onboarding must be an object.")]);
  const age = input.age;
  if (typeof age !== "number" || !Number.isInteger(age) || age < 10 || age > 100) issues.push(issue("AGE_INVALID", "age", "Age must be an integer between 10 and 100."));
  const educationLevel = cleanText(input.educationLevel, "educationLevel", issues);
  const favoriteSubjects = cleanList(input.favoriteSubjects, "favoriteSubjects", issues, true);
  const result: OnboardingContext = {
    age: typeof age === "number" ? age : 0,
    educationLevel,
    favoriteSubjects,
    valueRanking: input.valueRanking === undefined ? undefined : cleanList(input.valueRanking, "valueRanking", issues, true),
    interests: input.interests === undefined ? undefined : cleanList(input.interests, "interests", issues, false),
    hobbies: input.hobbies === undefined ? undefined : cleanList(input.hobbies, "hobbies", issues, false),
    preferredActivities: input.preferredActivities === undefined ? undefined : cleanList(input.preferredActivities, "preferredActivities", issues, false),
    country: cleanOptionalText(input.country, "country", issues),
    language: cleanOptionalText(input.language, "language", issues),
    plannedEducationPath: cleanOptionalText(input.plannedEducationPath, "plannedEducationPath", issues),
  };
  if ("values" in input || "basicValues" in input) issues.push(issue("VALUES_REMOVED", "$", "Basic values are not part of the T-Skills onboarding contract."));
  return issues.length ? invalid(issues) : valid(result);
}

export function assertOnboarding(input: unknown): OnboardingContext {
  return assertValid(validateOnboarding(input));
}

export function ageBandFor(age: number) {
  if (age < 14) return "10-13";
  if (age < 18) return "14-17";
  if (age < 25) return "18-24";
  if (age < 35) return "25-34";
  if (age < 50) return "35-49";
  return "50+";
}

export function sanitizeOnboardingForAdaptive(input: OnboardingContext) {
  return {
    ageBand: ageBandFor(input.age),
    educationLevel: input.educationLevel,
    favoriteSubjects: input.favoriteSubjects,
  };
}
