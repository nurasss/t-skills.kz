import assert from "node:assert/strict";
import test from "node:test";

import {
  TSkillsContractError,
  type AdaptiveQuestion,
  type OnboardingContext,
  type PairwiseItem,
  type Profession,
  type TraitDefinition,
} from "@/lib/t-skills/contracts";
import {
  buildAdaptiveCareerContext,
  applyAdaptiveAnswer,
  publicAdaptiveQuestion,
  selectNextAdaptiveQuestion,
  shouldStopAdaptiveQuiz,
  validateAdaptiveQuestion,
} from "@/lib/t-skills/adaptive";
import { assertCareerCatalog, matchCareers, parseCareerCatalogJson, validateCareerCatalog } from "@/lib/t-skills/career";
import { assertPairwiseItemBank, parsePairwiseItemBankJson, validatePairwiseItemBank } from "@/lib/t-skills/item-bank";
import { ageBandFor, assertOnboarding, validateOnboarding } from "@/lib/t-skills/onboarding";
import {
  PAIRWISE_TIE_BREAKING_VERSION,
  scorePairwiseV1,
  signedContribution,
} from "@/lib/t-skills/scoring";
import {
  addPersonalization,
  assertReportPayload,
  buildReportPayload,
  finalRecommendationsFromCandidates,
  type Roadmap,
} from "@/lib/t-skills/report-contract";
import { T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";
import { T_SKILLS_PAIRWISE_BANK_V1, T_SKILLS_WORKING_TAXONOMY } from "@/lib/t-skills/content-v4";
import { productionCareerCatalog } from "@/lib/t-skills/production-career-model";
import { assertTSkillsContentBundle, parseTSkillsContentBundleJson, validateTSkillsContentBundle } from "@/lib/t-skills/content-bundle";
import { assertTraitTaxonomy, parseTraitTaxonomyJson, validateTraitTaxonomy } from "@/lib/t-skills/taxonomy";
import * as TSkills from "@/lib/t-skills";

function fixtureTraits(): TraitDefinition[] {
  return Array.from({ length: 25 }, (_, index) => ({
    id: `trait-${String(index + 1).padStart(2, "0")}`,
    name: `Trait ${index + 1}`,
    shortDescription: `Description ${index + 1}`,
    status: "active" as const,
  }));
}

function fixtureItems(traits: readonly TraitDefinition[]): PairwiseItem[] {
  const realTraitIndex = new Map(T_SKILLS_WORKING_TAXONOMY.map((trait, index) => [trait.id, index]));
  return T_SKILLS_PAIRWISE_BANK_V1.map((item, index) => ({
    ...item,
    id: `item-${String(index + 1).padStart(3, "0")}`,
    leftTraitId: traits[realTraitIndex.get(item.leftTraitId) ?? 0]!.id,
    rightTraitId: traits[realTraitIndex.get(item.rightTraitId) ?? 0]!.id,
  }));
}

function fixtureProfessions(traits: readonly TraitDefinition[]): Profession[] {
  const profile = (value: number) => Object.fromEntries(traits.map((trait) => [trait.id, value]));
  return Array.from({ length: 6 }, (_, index) => ({
    id: `profession-${index + 1}`,
    title: `Profession ${index + 1}`,
    traitProfile: profile(index % 2 ? 0.5 : -0.5),
    subjectTags: index === 0 ? ["математика"] : ["язык"],
    careerDimensions: {
      people: index / 5,
      systems: 1 - index / 5,
      creativity: 0.5,
      analysis: 0.5,
      leadership: 0.5,
      communication: 0.5,
      structure: 0.5,
      autonomy: 0.5,
      uncertainty: 0.5,
      projectScale: 0.5,
    },
    active: true,
    version: T_SKILLS_VERSION_IDS.careerCatalog,
  }));
}

function fixtureQuestion(id = "q-1"): AdaptiveQuestion {
  return {
    id,
    prompt: "В какой рабочей ситуации вам было бы интереснее провести день?",
    rationaleInternal: "Различает предпочтения по рабочим условиям.",
    options: [
      { id: "A", text: "Разобраться в системе и найти закономерность", signals: [{ dimension: "systems", value: 1 }] },
      { id: "B", text: "Обсудить задачу с несколькими людьми", signals: [{ dimension: "people", value: 1 }] },
      { id: "C", text: "Собрать несколько новых вариантов", signals: [{ dimension: "creativity", value: 1 }] },
      { id: "D", text: "Спланировать последовательность действий", signals: [{ dimension: "structure", value: 1 }] },
    ],
  };
}

function fixtureRoadmap(): Roadmap {
  return {
    steps: [
      { horizon: "0-30 days", skills: ["skill-1"], actions: ["action-1"], experiments: ["experiment-1"] },
      { horizon: "1-3 months", skills: ["skill-2"], actions: ["action-2"], experiments: ["experiment-2"] },
      { horizon: "3-6 months", skills: ["skill-3"], actions: ["action-3"], experiments: ["experiment-3"] },
      { horizon: "6-12 months", skills: ["skill-4"], actions: ["action-4"], experiments: ["experiment-4"] },
    ],
  };
}

test("new pairwise item-bank validator enforces 67/25/5-or-6 and pair validity", () => {
  const traits = fixtureTraits();
  const items = fixtureItems(traits);
  const result = validatePairwiseItemBank(items, traits);
  assert.equal(result.ok, true);
  const exposures = items.reduce((counts, item) => {
    counts.set(item.leftTraitId, (counts.get(item.leftTraitId) ?? 0) + 1);
    counts.set(item.rightTraitId, (counts.get(item.rightTraitId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  assert.equal(items.length, 67);
  assert.equal([...exposures.values()].filter((count) => count === 6).length, 9);
  assert.equal([...exposures.values()].filter((count) => count === 5).length, 16);

  const invalid = validatePairwiseItemBank([
    ...items.slice(0, -1),
    { ...items.at(-1)!, leftTraitId: items.at(-1)!.rightTraitId },
  ], traits);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.ok(invalid.issues.some((issue) => issue.code === "SELF_PAIR"));
});

test("taxonomy/item-bank import helpers expose explicit validation failures", () => {
  void TSkills;
  assert.equal(validateTraitTaxonomy(null).ok, false);
  const malformedTraits = validateTraitTaxonomy([
    null,
    { id: "x", name: "", shortDescription: "", status: "unknown", longDescription: "x".repeat(2_001) },
    { id: "x", name: "Name", shortDescription: "Short", status: "draft", reportDescription: "Report" },
  ]);
  assert.equal(malformedTraits.ok, false);
  if (!malformedTraits.ok) assert.ok(malformedTraits.issues.some((issue) => issue.code === "DUPLICATE_TRAIT_ID"));
  assert.equal(parseTraitTaxonomyJson("not-json").ok, false);
  assert.throws(() => assertTraitTaxonomy([]), TSkillsContractError);

  const traits = fixtureTraits();
  const items = fixtureItems(traits);
  assert.equal(validatePairwiseItemBank(null, traits).ok, false);
  assert.equal(validatePairwiseItemBank(items.slice(0, 1), traits.slice(0, 1)).ok, false);
  const malformedItems = validatePairwiseItemBank([
    null,
    {
      ...items[0],
      id: "",
      leftTraitId: "unknown",
      rightTraitId: "unknown-right",
      leftText: "same",
      rightText: "same",
      version: "wrong-version",
    },
    { ...items[1], id: items[0]!.id, leftText: "x".repeat(2_001) },
  ], traits);
  assert.equal(malformedItems.ok, false);
  if (!malformedItems.ok) assert.ok(malformedItems.issues.some((issue) => issue.code === "ITEM_NOT_OBJECT"));
  assert.equal(parsePairwiseItemBankJson("not-json", traits).ok, false);
  assert.throws(() => assertPairwiseItemBank([], traits), TSkillsContractError);
});

test("PairwiseScoringV1 applies signed left/right contributions and deterministic ranking", () => {
  assert.equal(signedContribution(-2, "left"), 2);
  assert.equal(signedContribution(-2, "right"), -2);
  const traits = fixtureTraits();
  const items = fixtureItems(traits);
  const answers = Object.fromEntries(items.map((item, index) => [item.id, (index % 5) - 2])) as Record<string, -2 | -1 | 0 | 1 | 2>;
  const first = scorePairwiseV1({ items, traits, answers });
  const second = scorePairwiseV1({ items, traits, answers: { ...answers } });
  assert.deepEqual(first, second);
  assert.equal(first.traitResults.length, 25);
  assert.deepEqual(first.traitResults.map((trait) => trait.rank), Array.from({ length: 25 }, (_, index) => index + 1));
  assert.ok(first.traitResults.every((trait) => (trait.exposure === 5 || trait.exposure === 6) && trait.rawScore >= -12 && trait.rawScore <= 12));
  assert.ok(first.traitResults.every((trait) => trait.normalizedScore >= -1 && trait.normalizedScore <= 1));
  assert.equal(first.tieBreakingVersion, PAIRWISE_TIE_BREAKING_VERSION);
  assert.throws(() => scorePairwiseV1({ items, traits, answers: { ...answers, [items[0]!.id]: 9 as -2 } }), TSkillsContractError);
});

test("onboarding has the required context and rejects the removed basic-values block", () => {
  const validOnboarding = validateOnboarding({ age: 17, educationLevel: "school", favoriteSubjects: ["математика"] });
  assert.equal(validOnboarding.ok, true);
  const invalidOnboarding = validateOnboarding({ age: 17, educationLevel: "school", favoriteSubjects: ["математика"], values: ["доход"] });
  assert.equal(invalidOnboarding.ok, false);
  if (!invalidOnboarding.ok) assert.ok(invalidOnboarding.issues.some((issue) => issue.code === "VALUES_REMOVED"));
});

test("onboarding normalization covers optional extensions and age bands", () => {
  assert.equal(validateOnboarding(null).ok, false);
  assert.equal(ageBandFor(10), "10-13");
  assert.equal(ageBandFor(14), "14-17");
  assert.equal(ageBandFor(18), "18-24");
  assert.equal(ageBandFor(25), "25-34");
  assert.equal(ageBandFor(35), "35-49");
  assert.equal(ageBandFor(50), "50+");
  const invalid = validateOnboarding({ age: 9, educationLevel: "", favoriteSubjects: [], interests: "not-array", country: 7 });
  assert.equal(invalid.ok, false);
  assert.throws(() => assertOnboarding({ age: 9 }), TSkillsContractError);
  const normalized = assertOnboarding({
    age: 18,
    educationLevel: " school ",
    favoriteSubjects: ["математика", "математика"],
    interests: ["analysis"],
    hobbies: null,
    preferredActivities: ["project"],
    country: null,
    language: "ru",
    plannedEducationPath: "university",
  });
  assert.deepEqual(normalized.favoriteSubjects, ["математика"]);
  assert.equal(normalized.language, "ru");
});

test("content bundle validation links all independent versions", () => {
  const traits = fixtureTraits();
  const bundle = {
    assessmentVersion: T_SKILLS_VERSION_IDS.assessment,
    traitTaxonomyVersion: T_SKILLS_VERSION_IDS.traitTaxonomy,
    itemBankVersion: T_SKILLS_VERSION_IDS.itemBank,
    careerCatalogVersion: T_SKILLS_VERSION_IDS.careerCatalog,
    traits,
    items: fixtureItems(traits),
    professions: fixtureProfessions(traits),
  };
  assert.equal(validateTSkillsContentBundle(bundle).ok, true);
  assert.equal(parseTSkillsContentBundleJson(JSON.stringify(bundle)).ok, true);
  assert.equal(validateTSkillsContentBundle({ ...bundle, itemBankVersion: "old" }).ok, false);
  assert.equal(parseTSkillsContentBundleJson("not-json").ok, false);
  assert.throws(() => assertTSkillsContentBundle({}), TSkillsContractError);
});

test("career catalog and matching remain deterministic and score the full trait vector", () => {
  const traits = fixtureTraits();
  const professions = fixtureProfessions(traits);
  const catalog = validateCareerCatalog(professions, traits.map((trait) => trait.id));
  assert.equal(catalog.ok, true);
  const onboarding: OnboardingContext = { age: 17, educationLevel: "school", favoriteSubjects: ["математика"] };
  const traitResults = traits.map((trait, index) => ({ traitId: trait.id, rawScore: index - 12, normalizedScore: (index - 12) / 12, rank: index + 1, strengthOfPreference: 1, strongPositiveCount: 1, positiveCount: 1, exposure: 6 }));
  const first = matchCareers({ traits: traitResults, onboarding, catalog: professions, limit: 20 });
  const second = matchCareers({ traits: traitResults, onboarding, catalog: professions, limit: 20 });
  assert.deepEqual(first, second);
  assert.equal(first.length, 6);
  assert.equal(first[0]!.adaptiveMatch, 0);
  assert.ok(first.every((candidate) => candidate.totalScore >= 0 && candidate.totalScore <= 1));
});

test("career clarification is authoritative for the shortlist while trait scores stay unchanged", () => {
  const traits = fixtureTraits();
  const professions = fixtureProfessions(traits);
  const onboarding: OnboardingContext = { age: 17, educationLevel: "school", favoriteSubjects: ["язык"] };
  const traitResults = traits.map((trait, index) => ({ traitId: trait.id, rawScore: 0, normalizedScore: 0, rank: index + 1, strengthOfPreference: 0, strongPositiveCount: 0, positiveCount: 0, exposure: 6 }));
  const question = fixtureQuestion("career-p0");
  const systems = matchCareers({
    traits: traitResults,
    onboarding,
    catalog: professions,
    adaptiveAnswers: [{ questionId: question.id, optionId: "A" }],
    adaptiveQuestions: [question],
    limit: 6,
  });
  const people = matchCareers({
    traits: traitResults,
    onboarding,
    catalog: professions,
    adaptiveAnswers: [{ questionId: question.id, optionId: "B" }],
    adaptiveQuestions: [question],
    limit: 6,
  });
  assert.notDeepEqual(systems.map((candidate) => candidate.professionId), people.map((candidate) => candidate.professionId));
  assert.notDeepEqual(systems.map((candidate) => candidate.adaptiveMatch), people.map((candidate) => candidate.adaptiveMatch));
  assert.deepEqual(systems, matchCareers({
    traits: traitResults,
    onboarding,
    catalog: professions,
    adaptiveAnswers: [{ questionId: question.id, optionId: "A" }],
    adaptiveQuestions: [question],
    limit: 6,
  }));
});

test("production career flow keeps traits fixed while different clarification evidence changes recommendations", () => {
  const traits = T_SKILLS_WORKING_TAXONOMY.map((trait, index) => ({ traitId: trait.id, rawScore: 0, normalizedScore: 0, rank: index + 1, strengthOfPreference: 0, strongPositiveCount: 0, positiveCount: 0, exposure: 5 }));
  const onboarding: OnboardingContext = { age: 18, educationLevel: "university", favoriteSubjects: [] };
  const catalog = productionCareerCatalog();
  const questions: AdaptiveQuestion[] = [
    { id: "prod-systems", prompt: "q", dimension: "systems", options: [{ id: "A", text: "systems", signals: [{ dimension: "systems", value: 1 }, { dimension: "analysis", value: 1 }] }, { id: "B", text: "people", signals: [{ dimension: "people", value: 1 }, { dimension: "communication", value: 1 }] }, { id: "C", text: "creative", signals: [{ dimension: "creativity", value: 1 }] }, { id: "D", text: "plan", signals: [{ dimension: "structure", value: 1 }] }] },
  ];
  const systems = matchCareers({ traits, onboarding, catalog, adaptiveQuestions: questions, adaptiveAnswers: [{ questionId: "prod-systems", optionId: "A" }] });
  const people = matchCareers({ traits, onboarding, catalog, adaptiveQuestions: questions, adaptiveAnswers: [{ questionId: "prod-systems", optionId: "B" }] });
  assert.notDeepEqual(systems.map((candidate) => candidate.professionId), people.map((candidate) => candidate.professionId));
  assert.deepEqual(systems, matchCareers({ traits, onboarding, catalog, adaptiveQuestions: questions, adaptiveAnswers: [{ questionId: "prod-systems", optionId: "A" }] }));
  assert.deepEqual(traits.map((trait) => trait.normalizedScore), Array.from({ length: 25 }, () => 0));
});

test("career catalog rejects incomplete mappings and keeps matcher fallbacks bounded", () => {
  const traits = fixtureTraits();
  const professions = fixtureProfessions(traits);
  assert.equal(validateCareerCatalog(null, traits.map((trait) => trait.id)).ok, false);
  const malformed = validateCareerCatalog([
    null,
    {
      id: "p1",
      title: "",
      version: "old",
      active: "yes",
      traitProfile: { unknown: 2 },
      careerDimensions: { people: 2, unknown: 1 },
      subjectTags: "math",
      educationPaths: [7],
      description: 4,
    },
    { ...professions[0], id: "p1" },
  ], traits.map((trait) => trait.id));
  assert.equal(malformed.ok, false);
  assert.equal(parseCareerCatalogJson("not-json", traits.map((trait) => trait.id)).ok, false);
  assert.throws(() => assertCareerCatalog([null], traits.map((trait) => trait.id)), TSkillsContractError);
  const onboarding: OnboardingContext = { age: 17, educationLevel: "school", favoriteSubjects: ["математика"] };
  const empty = matchCareers({ traits: [], onboarding, catalog: [{ ...professions[0]!, subjectTags: undefined, careerDimensions: undefined }], limit: 0 });
  assert.equal(empty.length, 1);
  assert.equal(empty[0]!.traitMatch, 0);
  assert.equal(empty[0]!.subjectMatch, 0);
});

test("adaptive contract requires A/B/C/D, validates signals, strips rationale and falls back", async () => {
  const question = fixtureQuestion();
  const valid = validateAdaptiveQuestion(question, { age: 17 });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    const publicFixture = { id: question.id, prompt: question.prompt, options: question.options };
    assert.deepEqual(publicAdaptiveQuestion(valid.value), publicFixture);
    assert.equal("rationaleInternal" in publicAdaptiveQuestion(valid.value), false);
  }
  const invalid = validateAdaptiveQuestion({ ...question, options: question.options.slice(0, 2), prompt: "Напиши свободный ответ" }, { age: 17 });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.ok(invalid.issues.some((issue) => issue.code === "OPTION_COUNT" || issue.code === "QUESTION_FORBIDDEN_CONTENT"));

  const traits = fixtureTraits().map((trait, index) => ({ traitId: trait.id, rawScore: index - 12, normalizedScore: (index - 12) / 12, rank: index + 1, strengthOfPreference: 1, strongPositiveCount: 1, positiveCount: 1, exposure: 6 }));
  const onboarding: OnboardingContext = { age: 17, educationLevel: "school", favoriteSubjects: ["математика"] };
  const candidates = fixtureProfessions(fixtureTraits()).map((profession, index) => ({ professionId: profession.id, title: profession.title, traitMatch: 0.5, subjectMatch: 0.5, adaptiveMatch: 0, totalScore: 0.5 - index / 100, rank: index + 1 }));
  const context = buildAdaptiveCareerContext({ onboarding, traits, currentCandidates: candidates, previousQuestions: [], previousAnswers: [], remainingQuestions: 8 });
  assert.equal("age" in context, false);
  const selected = await selectNextAdaptiveQuestion({ context, fallbackBank: [question], provider: { generate: async () => ({ invalid: true }) } });
  assert.equal(selected.source, "fallback");
  assert.equal(selected.question?.options.length, 4);
});

test("adaptive validation covers age, duplicate, signal and provider branches", async () => {
  const question = fixtureQuestion();
  assert.equal(validateAdaptiveQuestion(null).ok, false);
  const malformed = validateAdaptiveQuestion({
    id: "bad",
    prompt: "Напиши свободный ответ",
    minAge: 20,
    maxAge: 12,
    rationaleInternal: "медицинский вывод",
    options: [
      null,
      { id: "X", text: "", signals: [] },
      { id: "C", text: "same", signals: [{ dimension: "unknown", value: 2 }] },
      { id: "D", text: "same", signals: [{ dimension: "people", value: 0, weight: 4 }] },
    ],
  }, { age: 17, previousQuestions: [question] });
  assert.equal(malformed.ok, false);
  const duplicate = validateAdaptiveQuestion({ ...question, id: question.id }, { age: 17, previousQuestions: [question] });
  assert.equal(duplicate.ok, false);

  const traits = fixtureTraits().map((trait, index) => ({ traitId: trait.id, rawScore: index - 12, normalizedScore: (index - 12) / 12, rank: index + 1, strengthOfPreference: 1, strongPositiveCount: 1, positiveCount: 1, exposure: 6 }));
  const onboarding: OnboardingContext = { age: 17, educationLevel: "school", favoriteSubjects: ["язык"] };
  const professions = fixtureProfessions(fixtureTraits());
  const context = buildAdaptiveCareerContext({ onboarding, traits, currentCandidates: [], previousQuestions: [], previousAnswers: [], remainingQuestions: 8, rankingHistory: [] });
  const aiSelected = await selectNextAdaptiveQuestion({ context, fallbackBank: [], provider: { generate: async () => question }, age: 17 });
  assert.equal(aiSelected.source, "ai");
  const unavailable = await selectNextAdaptiveQuestion({ context, fallbackBank: [] });
  assert.deepEqual(unavailable, { question: null, source: "unavailable", reason: "CONTENT_NOT_READY" });
  const stopped = await selectNextAdaptiveQuestion({ context: { ...context, remainingQuestions: 0 }, fallbackBank: [question] });
  assert.equal("reason" in stopped ? stopped.reason : undefined, "MAX_QUESTIONS");
  const applied = applyAdaptiveAnswer({
    traits,
    onboarding,
    catalog: professions,
    questions: [question],
    answers: [],
    answer: { questionId: question.id, optionId: "A" },
  });
  assert.equal(applied.length, professions.length);
  assert.throws(() => applyAdaptiveAnswer({ traits, onboarding, catalog: professions, questions: [], answers: [], answer: { questionId: "missing", optionId: "A" } }), /ADAPTIVE_QUESTION_NOT_FOUND/);
  assert.throws(() => applyAdaptiveAnswer({ traits, onboarding, catalog: professions, questions: [question], answers: [{ questionId: question.id, optionId: "A" }], answer: { questionId: question.id, optionId: "A" } }), /ADAPTIVE_QUESTION_ALREADY_ANSWERED/);
  assert.throws(() => applyAdaptiveAnswer({ traits, onboarding, catalog: professions, questions: [question], answers: [], answer: { questionId: question.id, optionId: "Z" as "A" } }), /ADAPTIVE_OPTION_NOT_FOUND/);
});

test("adaptive quiz supports min/max bounds and early stopping", () => {
  const stable = [[
    { professionId: "p1", title: "P1", traitMatch: 0.8, subjectMatch: 0.5, adaptiveMatch: 0, totalScore: 0.8, rank: 1 },
    { professionId: "p2", title: "P2", traitMatch: 0.6, subjectMatch: 0.5, adaptiveMatch: 0, totalScore: 0.6, rank: 2 },
  ], [
    { professionId: "p1", title: "P1", traitMatch: 0.8, subjectMatch: 0.5, adaptiveMatch: 0.2, totalScore: 0.8, rank: 1 },
    { professionId: "p2", title: "P2", traitMatch: 0.6, subjectMatch: 0.5, adaptiveMatch: 0, totalScore: 0.6, rank: 2 },
  ]];
  assert.equal(shouldStopAdaptiveQuiz({ answeredCount: 4, rankingHistory: stable }), false);
  assert.equal(shouldStopAdaptiveQuiz({ answeredCount: 5, rankingHistory: stable }), true);
  assert.equal(shouldStopAdaptiveQuiz({ answeredCount: 8, rankingHistory: [] }), true);
});

test("report payload preserves authoritative ranks/scores and uses neutral lower-rank language", () => {
  const traits = fixtureTraits();
  const traitResults = traits.map((trait, index) => ({ traitId: trait.id, rawScore: index - 12, normalizedScore: (index - 12) / 12, rank: index + 1, strengthOfPreference: 1, strongPositiveCount: 1, positiveCount: 1, exposure: 6 }));
  const candidates = fixtureProfessions(traits).map((profession, index) => ({ professionId: profession.id, title: profession.title, traitMatch: 0.8 - index / 100, subjectMatch: 0.5, adaptiveMatch: 0, totalScore: 0.8 - index / 100, rank: index + 1 }));
  const recommendations = finalRecommendationsFromCandidates(candidates, () => ({ traitReasons: ["Согласуется с текущим профилем"], adaptiveReasons: ["Стоит проверить через небольшой эксперимент"] }));
  const payload = buildReportPayload({
    versions: {
      assessment: T_SKILLS_VERSION_IDS.assessment,
      traitTaxonomy: T_SKILLS_VERSION_IDS.traitTaxonomy,
      itemBank: T_SKILLS_VERSION_IDS.itemBank,
      scoring: T_SKILLS_VERSION_IDS.scoring,
      careerCatalog: T_SKILLS_VERSION_IDS.careerCatalog,
      careerMatching: T_SKILLS_VERSION_IDS.careerMatching,
      adaptive: T_SKILLS_VERSION_IDS.adaptive,
      adaptivePrompt: T_SKILLS_VERSION_IDS.adaptivePrompt,
      report: T_SKILLS_VERSION_IDS.report,
    },
    completedAt: new Date(0).toISOString(),
    onboarding: { age: 17, educationLevel: "school", favoriteSubjects: ["математика"] },
    traits: traitResults,
    taxonomy: traits,
    recommendations,
    roadmap: fixtureRoadmap(),
  });
  assertReportPayload(payload);
  assert.equal(payload.traits[24]!.category, "less-expressed");
  const personalized = addPersonalization(payload, { summary: "Это описание текущего профиля, а не окончательный вердикт." });
  assert.deepEqual(personalized.traits, payload.traits);
  assert.throws(() => addPersonalization(payload, { summary: "Это ваша идеальная профессия." }), /ABSOLUTE_CAREER_CLAIM/);
});
