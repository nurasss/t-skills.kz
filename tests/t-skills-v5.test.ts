import assert from "node:assert/strict";
import test from "node:test";

import { canSessionTransition } from "@/lib/assessment-state-machine";
import { isTelemetryEventName } from "@/lib/analytics";
import {
  type CareerTieBreakQuestion,
  type ClarificationAnswer,
  type ClarificationItem,
  type ProfessionV5,
  type TSkillsReportPayloadV5,
  type V5PairwiseItem,
  type V5TraitDefinition,
} from "@/lib/t-skills/v5/contracts";
import { parseClarificationBankJson, selectClarificationItems, validateClarificationAnswer, validateClarificationBank } from "@/lib/t-skills/v5/clarification";
import { matchCareersV5, recommendationsFromCandidates, selectCareerTieBreakQuestion, validateCareerTieBreakAnswers, validateV5CareerCatalog } from "@/lib/t-skills/v5/career";
import { parseTSkillsV5ContentBundleJson, tSkillsV5ContentIsReady, validateTSkillsV5ContentBundle } from "@/lib/t-skills/v5/content-bundle";
import { buildNarrativeInput, assertNarrativeDoesNotChangeFacts, validateNarrativeOutput } from "@/lib/t-skills/v5/narrative";
import {
  parseV5PairwiseItemBankJson,
  sideBalance,
  T_SKILLS_V5_APPROVED_ITEM_BANK,
  T_SKILLS_V5_APPROVED_TRAIT_LABELS,
  validateV5PairwiseItemBank,
} from "@/lib/t-skills/v5/item-bank";
import { assertV5ReportPayload, buildDeterministicV5Narrative, buildV5ReportPayload, roadmapForProfession, validateV5ReportPayload } from "@/lib/t-skills/v5/report";
import { scoreBaseProfile, scoreFinalProfile, signedContribution } from "@/lib/t-skills/v5/scoring";
import { parseV5TraitTaxonomyJson, validateV5TraitTaxonomy } from "@/lib/t-skills/v5/taxonomy";
import { analyzeTraitUncertainty, selectUncertainTraits } from "@/lib/t-skills/v5/uncertainty";
import { runTSkillsV5Pipeline } from "@/lib/t-skills/v5/pipeline";
import { T_SKILLS_V5_VERSION_IDS } from "@/lib/t-skills/v5/versions";

function traits(): V5TraitDefinition[] {
  return Array.from({ length: 25 }, (_, index) => ({
    id: `trait-${String(index + 1).padStart(2, "0")}`,
    name: `Trait ${index + 1}`,
    shortDescription: `Description ${index + 1}`,
    status: "active" as const,
  }));
}

function items(): V5PairwiseItem[] {
  const result: V5PairwiseItem[] = [];
  let number = 1;
  for (const distance of [1, 2, 3]) {
    for (let left = 0; left < 25; left += 1) {
      const right = (left + distance) % 25;
      result.push({
        id: `V5-${String(number++).padStart(3, "0")}`,
        leftTraitId: traits()[left]!.id,
        rightTraitId: traits()[right]!.id,
        leftText: `Левое утверждение ${number}`,
        rightText: `Правое утверждение ${number}`,
        itemBankVersion: T_SKILLS_V5_VERSION_IDS.itemBank,
      });
    }
  }
  return result;
}

function clarificationBank(): ClarificationItem[] {
  return traits().map((trait, index) => ({
    id: `CL-${String(index + 1).padStart(2, "0")}`,
    type: "trait_clarification" as const,
    targetTraits: [trait.id, traits()[(index + 1) % 25]!.id],
    leftText: `Мне ближе способ ${index + 1}A`,
    rightText: `Мне ближе способ ${index + 1}B`,
    priority: index,
    version: T_SKILLS_V5_VERSION_IDS.clarificationBank,
  }));
}

function profession(id: string, subjectTags = ["математика"], active = true): ProfessionV5 {
  return {
    id,
    title: id,
    description: `Утверждённое описание ${id}`,
    traitWeights: Object.fromEntries(traits().map((trait, index) => [trait.id, index === 0 ? 1 : 0.5])),
    subjectTags,
    dimensions: { people: 0.5, systems: 0.5, creativity: 0.5, analysis: 0.5, leadership: 0.5, communication: 0.5, structure: 0.5, autonomy: 0.5, uncertainty: 0.5, projectScale: 0.5 },
    rules: [],
    roadmap: {
      firstMonth: [{ id: `${id}-a1`, type: "career_experiment", title: "Мини-проект", description: "Проверить гипотезу маленьким проектом.", verified: true }],
      months1to3: [],
      months3to6: [],
      months6to12: [],
    },
    active,
    version: T_SKILLS_V5_VERSION_IDS.careerCatalog,
  };
}

function baseScores() {
  return traits().map((trait, index) => ({
    traitId: trait.id,
    rawScore: index === 0 ? 1 : 0,
    meanScore: index === 0 ? 0.166667 : 0,
    variance: index === 0 ? 3 : 0.1,
    contributions: index === 0 ? [2, -2, 2, -2, 2, -2] : [0, 0, 0, 0, 0, 0],
    rank: index + 1,
  }));
}

function contentBundle() {
  return {
    assessmentVersion: T_SKILLS_V5_VERSION_IDS.assessment,
    traitTaxonomyVersion: T_SKILLS_V5_VERSION_IDS.traitTaxonomy,
    itemBankVersion: T_SKILLS_V5_VERSION_IDS.itemBank,
    scoringVersion: T_SKILLS_V5_VERSION_IDS.scoring,
    uncertaintyVersion: T_SKILLS_V5_VERSION_IDS.uncertainty,
    clarificationBankVersion: T_SKILLS_V5_VERSION_IDS.clarificationBank,
    careerCatalogVersion: T_SKILLS_V5_VERSION_IDS.careerCatalog,
    careerMatchingVersion: T_SKILLS_V5_VERSION_IDS.careerMatching,
    careerTiebreakVersion: T_SKILLS_V5_VERSION_IDS.careerTiebreak,
    narrativePromptVersion: T_SKILLS_V5_VERSION_IDS.narrativePrompt,
    reportVersion: T_SKILLS_V5_VERSION_IDS.report,
    traits: traits(),
    items: items(),
    clarificationItems: clarificationBank(),
    careerTieBreakQuestions: [],
    professions: Array.from({ length: 5 }, (_, index) => profession(`p${index + 1}`)),
  };
}

test("v5 item bank requires 75 items, unique pairs and six exposures", () => {
  const bank = items();
  const taxonomy = traits();
  assert.equal(validateV5PairwiseItemBank(bank, taxonomy).ok, true);
  assert.deepEqual(sideBalance(bank, taxonomy.map((trait) => trait.id)).balanced, true);
  const invalid = validateV5PairwiseItemBank([{ ...bank[0]!, id: bank[1]!.id, rightTraitId: bank[0]!.rightTraitId }, ...bank.slice(1)], taxonomy);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.ok(invalid.issues.some((entry) => entry.code === "DUPLICATE_ITEM_ID" || entry.code === "DUPLICATE_TRAIT_PAIR"));
});

test("client-approved v5 question bank imports all 75 supplied pairs without changing the active v1 path", () => {
  const taxonomy = T_SKILLS_V5_APPROVED_TRAIT_LABELS.map((trait) => ({
    id: trait.id,
    name: trait.name,
    shortDescription: trait.name,
    status: "draft" as const,
  }));
  const result = validateV5PairwiseItemBank(T_SKILLS_V5_APPROVED_ITEM_BANK, taxonomy);
  assert.equal(result.ok, true);
  assert.equal(T_SKILLS_V5_APPROVED_ITEM_BANK.length, 75);
  assert.equal(new Set(T_SKILLS_V5_APPROVED_ITEM_BANK.map((item) => item.id)).size, 75);
  assert.equal(new Set(T_SKILLS_V5_APPROVED_ITEM_BANK.map((item) => [item.leftTraitId, item.rightTraitId].sort().join("|"))).size, 75);
  assert.equal(T_SKILLS_V5_APPROVED_ITEM_BANK.every((item) => item.itemBankVersion === T_SKILLS_V5_VERSION_IDS.itemBank), true);
  // Preserve the source document's ordered A/B presentation; psychometric balancing
  // must be approved as a content change rather than applied during import.
  assert.equal(sideBalance(T_SKILLS_V5_APPROVED_ITEM_BANK, taxonomy.map((trait) => trait.id)).balanced, false);
});

test("v5 scoring keeps six contributions, mean and variance and resolves head-to-head in the winner's direction", () => {
  const bank = items();
  const answers = Object.fromEntries(bank.map((item) => [item.id, 0 as const])) as Record<string, -2 | -1 | 0 | 1 | 2>;
  answers[bank[0]!.id] = -2;
  answers[bank[1]!.id] = -2;
  answers[bank[25]!.id] = 2;
  const result = scoreBaseProfile({ items: bank, traits: traits(), answers });
  const first = result.base.find((entry) => entry.traitId === "trait-01")!;
  const second = result.base.find((entry) => entry.traitId === "trait-02")!;
  assert.equal(first.rawScore, second.rawScore);
  assert.equal(first.meanScore, second.meanScore);
  assert.ok(first.rank! < second.rank!);
  assert.equal(first.contributions.length, 6);
  assert.ok(first.variance > 0);
});

test("v5 signed five-point mapping supports both raw score boundaries", () => {
  assert.equal(signedContribution(-2, "left"), 2);
  assert.equal(signedContribution(-2, "right"), -2);
  const bank = items();
  const positive = Object.fromEntries(bank.map((item) => [item.id, 0 as const])) as Record<string, -2 | -1 | 0 | 1 | 2>;
  const negative = Object.fromEntries(bank.map((item) => [item.id, 0 as const])) as Record<string, -2 | -1 | 0 | 1 | 2>;
  for (const item of bank) {
    if (item.leftTraitId === "trait-01") positive[item.id] = -2;
    if (item.rightTraitId === "trait-01") positive[item.id] = 2;
    if (item.leftTraitId === "trait-02") negative[item.id] = 2;
    if (item.rightTraitId === "trait-02") negative[item.id] = -2;
  }
  assert.equal(scoreBaseProfile({ items: bank, traits: traits(), answers: positive }).base.find((entry) => entry.traitId === "trait-01")!.rawScore, 12);
  assert.equal(scoreBaseProfile({ items: bank, traits: traits(), answers: negative }).base.find((entry) => entry.traitId === "trait-02")!.rawScore, -12);
});

test("v5 final scoring preserves base profile and applies clarification evidence with a versioned weight", () => {
  const bank = items();
  const answers = Object.fromEntries(bank.map((item) => [item.id, 0 as const]));
  const clarifications = clarificationBank();
  const clarificationAnswers: ClarificationAnswer[] = [{ itemId: clarifications[0]!.id, value: -2 }];
  const result = scoreFinalProfile({ items: bank, traits: traits(), answers, clarificationItems: clarifications, clarificationAnswers, clarificationWeight: 1 });
  assert.equal(result.base.every((entry) => entry.meanScore === 0), true);
  assert.equal(result.final.length, 25);
  assert.equal(result.final.find((entry) => entry.traitId === "trait-01")!.clarificationContributions[0], 2);
  assert.equal(result.final.find((entry) => entry.traitId === "trait-01")!.effectiveObservations, 7);
  assert.deepEqual(result.clarificationAnswers, clarificationAnswers);
});

test("uncertainty prioritizes variance, top-five boundary and career impact", () => {
  const catalog = [profession("p1")];
  const result = analyzeTraitUncertainty({ base: baseScores(), catalog });
  assert.equal(result.length, 25);
  assert.equal(result[0]!.traitId, "trait-01");
  assert.equal(selectUncertainTraits({ uncertainty: result, count: 1 })[0]!.traitId, "trait-01");
});

test("clarification selector uses only prepared trait items and never duplicates ids", () => {
  const bank = clarificationBank();
  const uncertainty = analyzeTraitUncertainty({ base: baseScores() });
  const validation = validateClarificationBank(bank, traits().map((trait) => trait.id), T_SKILLS_V5_VERSION_IDS.clarificationBank, { requireTraitCoverage: true });
  assert.equal(validation.ok, true);
  const selected = selectClarificationItems({ bank, uncertainty, target: 6, max: 7 });
  assert.equal(selected.length, 6);
  assert.equal(new Set(selected.map((item) => item.id)).size, selected.length);
  assert.ok(selected.every((item) => item.type === "trait_clarification"));
});

test("career matching is deterministic, uses subjects softly and excludes disabled professions", () => {
  const catalog = [profession("math"), profession("other", ["язык"]), profession("disabled", ["математика"], false)];
  const validated = validateV5CareerCatalog(catalog, traits());
  assert.equal(validated.ok, true);
  const final = baseScores().map((entry) => ({ ...entry, rank: entry.rank!, baseRawScore: entry.rawScore, baseMeanScore: entry.meanScore, clarificationContributions: [], effectiveObservations: 6 }));
  const first = matchCareersV5({ traits: final, favoriteSubjects: ["математика"], catalog });
  const second = matchCareersV5({ traits: final, favoriteSubjects: ["математика"], catalog });
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((candidate) => candidate.professionId), ["math", "other"]);
  assert.equal(first.every((candidate) => candidate.totalScore >= 0 && candidate.totalScore <= 1), true);
});

test("career tie-break is selected only for a close fifth/sixth boundary", () => {
  const candidates = Array.from({ length: 7 }, (_, index) => ({ professionId: `p${index + 1}`, title: `P${index + 1}`, traitMatch: 0.8, subjectMatch: 0.5, ruleAdjustment: 0, clarificationMatch: 0, totalScore: 0.84 - index * 0.005, rank: index + 1 }));
  const question: CareerTieBreakQuestion = { id: "TB-1", candidateGroups: ["p4", "p5", "p6"], prompt: "Что вам ближе?", options: [
    { id: "A", text: "Вариант A", careerSignals: { analysis: 0.5 } },
    { id: "B", text: "Вариант B", careerSignals: { analysis: 0.5 } },
    { id: "C", text: "Вариант C", careerSignals: { analysis: 0.5 } },
    { id: "D", text: "Вариант D", careerSignals: { analysis: 0.5 } },
  ], version: T_SKILLS_V5_VERSION_IDS.careerTiebreak };
  assert.equal(selectCareerTieBreakQuestion({ candidates, questions: [question] })?.id, "TB-1");
  assert.equal(validateCareerTieBreakAnswers([{ questionId: "TB-1", optionId: "A" }], [question]).ok, true);
  assert.equal(validateCareerTieBreakAnswers([{ questionId: "TB-1", optionId: "Z" }], [question]).ok, false);
  assert.equal(selectCareerTieBreakQuestion({ candidates: candidates.map((candidate) => ({ ...candidate, totalScore: candidate.rank >= 5 ? 0.6 - (candidate.rank - 5) * 0.05 : candidate.totalScore })), questions: [question] }), null);
});

test("narrative validation accepts only the source profession set and rejects fact-changing output", () => {
  const catalog = [profession("p1"), profession("p2"), profession("p3"), profession("p4"), profession("p5")];
  const source = {
    traitProfile: traits().map((trait, index) => ({ traitId: trait.id, name: trait.name, rank: index + 1, meanScore: 0, description: trait.shortDescription })),
    recommendedProfessions: catalog.map((item) => ({ professionId: item.id, title: item.title, approvedDescription: item.description, reasons: ["reason"], roadmapTemplate: item.roadmap })),
    favoriteSubjects: ["математика"],
  };
  const entry = source.recommendedProfessions.map((item) => ({ professionId: item.professionId, text: "Это направление стоит проверить на практике." }));
  const valid = validateNarrativeOutput({ profileSummary: "Текущий развивающий срез.", professionExplanations: entry, roadmapIntroduction: "Начните с небольших экспериментов.", roadmapSections: entry }, source);
  assert.equal(valid.ok, true);
  const invalid = validateNarrativeOutput({ profileSummary: "Ваша идеальная профессия.", professionExplanations: entry, roadmapIntroduction: "Начните.", roadmapSections: entry }, source);
  assert.equal(invalid.ok, false);
  const payload = { traits: { base: [], final: [], clarificationAnswers: [] }, careers: [], roadmap: [], methodology: {} } as unknown as TSkillsReportPayloadV5;
  assert.throws(() => assertNarrativeDoesNotChangeFacts(payload, { ...payload, careers: [{ professionId: "other" }] } as unknown as TSkillsReportPayloadV5), /NARRATIVE_CHANGED_CAREERS/);
  assert.equal(recommendationsFromCandidates([], () => ({ traitEvidence: [], subjectEvidence: [], clarificationEvidence: [] })).length, 0);
});

test("v5 report payload is built from locked facts and has a deterministic no-AI fallback", () => {
  const taxonomy = traits();
  const catalog = Array.from({ length: 5 }, (_, index) => profession(`p${index + 1}`));
  const final = baseScores().map((entry) => ({
    ...entry,
    rank: entry.rank!,
    baseRawScore: entry.rawScore,
    baseMeanScore: entry.meanScore,
    clarificationContributions: [],
    effectiveObservations: 6,
  }));
  const recommendations = catalog.map((item, index) => ({
    professionId: item.id,
    rank: index + 1,
    score: 0.9 - index / 100,
    traitEvidence: ["Полный профиль качеств"],
    subjectEvidence: ["Совпадение с любимым предметом"],
    clarificationEvidence: [],
  }));
  const profile = { base: final, final, clarificationAnswers: [] };
  const first = buildV5ReportPayload({ completedAt: "2026-09-18T00:00:00.000Z", profile, recommendations, taxonomy, catalog, favoriteSubjects: ["математика"] });
  const second = buildV5ReportPayload({ completedAt: "2026-09-18T00:00:00.000Z", profile, recommendations, taxonomy, catalog, favoriteSubjects: ["математика"] });
  assert.deepEqual(first, second);
  assert.equal(first.careers.length, 5);
  assert.equal(first.methodology.llmRole, "narrative-only");
  assert.equal(validateV5ReportPayload(first, catalog).ok, true);
  assert.equal(buildDeterministicV5Narrative({ traits: final, recommendations, taxonomy, catalog }).professionExplanations.length, 5);
  assert.deepEqual(assertV5ReportPayload(first, catalog), first);
  const changed = { ...first, roadmap: first.roadmap.slice(0, 4) };
  assert.equal(validateV5ReportPayload(changed, catalog).ok, false);
});

test("v5 pipeline runs base, prepared clarification and locked report stages without AI", () => {
  const content = contentBundle();
  const answers = Object.fromEntries(items().map((item) => [item.id, 0 as const]));
  const first = runTSkillsV5Pipeline({
    content,
    baseAnswers: answers,
    onboarding: { favoriteSubjects: ["математика"], ageBand: "15-17", educationLevel: "school" },
  });
  assert.equal(first.stage, "CLARIFICATION");
  assert.equal(first.selectedClarifications.length, 6);
  assert.equal(first.report, null);

  const completedInput = {
    content,
    baseAnswers: answers,
    selectedClarificationIds: first.selectedClarifications.map((item) => item.id),
    clarificationAnswers: first.selectedClarifications.map((item) => ({ itemId: item.id, value: 0 as const })),
    onboarding: { favoriteSubjects: ["математика"], ageBand: "15-17", educationLevel: "school" },
    completedAt: "2026-09-18T00:00:00.000Z",
  };
  const completed = runTSkillsV5Pipeline(completedInput);
  const repeated = runTSkillsV5Pipeline(completedInput);
  assert.equal(completed.stage, "COMPLETED");
  assert.equal(completed.report?.careers.length, 5);
  assert.equal(completed.report?.traits.base.length, 25);
  assert.deepEqual(completed, repeated);
});

test("v5 state machine exposes the documented resumable stages", () => {
  const flow = ["PAID", "CONSENTED", "ONBOARDING", "BASE_ASSESSMENT", "BASE_SCORING", "CLARIFICATION", "FINAL_SCORING", "CAREER_MATCHING", "NARRATIVE_GENERATION", "COMPLETE"] as const;
  for (let index = 0; index < flow.length - 1; index += 1) assert.equal(canSessionTransition(flow[index]!, flow[index + 1]!), true);
  assert.equal(canSessionTransition("CAREER_MATCHING", "NARRATIVE_GENERATION"), true);
  assert.equal(canSessionTransition("COMPLETE", "BASE_ASSESSMENT"), false);
});

test("v5 analytics events are allowlisted without exposing answer payloads", () => {
  for (const name of [
    "base_question_answered",
    "base_assessment_completed",
    "base_profile_computed",
    "clarification_started",
    "clarification_answered",
    "clarification_completed",
    "final_profile_computed",
    "career_matching_completed",
    "career_tiebreak_answered",
    "narrative_generation_started",
    "narrative_generation_completed",
    "narrative_fallback_used",
    "report_generated",
  ]) assert.equal(isTelemetryEventName(name), true);
});

test("v5 taxonomy and item-bank import validators fail closed", () => {
  const taxonomy = traits();
  const traitIds = taxonomy.map((trait) => trait.id);
  assert.equal(validateV5TraitTaxonomy(null).ok, false);
  assert.equal(parseV5TraitTaxonomyJson("{").ok, false);
  assert.equal(parseV5TraitTaxonomyJson(JSON.stringify(taxonomy)).ok, true);

  const malformedTaxonomy = validateV5TraitTaxonomy([
    taxonomy[0],
    null,
    { ...taxonomy[0], id: taxonomy[0]!.id, name: " ", shortDescription: " ", status: "invalid", version: "wrong", longDescription: "Long", reportDescription: "Report" },
  ]);
  assert.equal(malformedTaxonomy.ok, false);
  if (!malformedTaxonomy.ok) {
    for (const code of ["TRAIT_COUNT", "TRAIT_NOT_OBJECT", "DUPLICATE_TRAIT_ID", "TRAIT_STATUS", "TRAIT_VERSION", "REQUIRED_TEXT"]) {
      assert.ok(malformedTaxonomy.issues.some((entry) => entry.code === code), code);
    }
  }

  assert.equal(validateV5PairwiseItemBank(null, taxonomy).ok, false);
  assert.equal(parseV5PairwiseItemBankJson("[", taxonomy).ok, false);
  assert.equal(parseV5PairwiseItemBankJson(JSON.stringify(items()), taxonomy).ok, true);
  const malformedItems = validateV5PairwiseItemBank([
    null,
    { id: "", leftTraitId: "unknown", rightTraitId: "unknown", leftText: "same", rightText: "same", itemBankVersion: "wrong" },
    { id: "bad", leftTraitId: "trait-01", rightTraitId: "trait-02", leftText: "x".repeat(2_001), rightText: "" , itemBankVersion: T_SKILLS_V5_VERSION_IDS.itemBank },
    { id: "bad", leftTraitId: "trait-03", rightTraitId: "trait-04", leftText: "a", rightText: "b", itemBankVersion: T_SKILLS_V5_VERSION_IDS.itemBank },
    { id: "missing-fields" },
  ], taxonomy);
  assert.equal(malformedItems.ok, false);
  if (!malformedItems.ok) {
    for (const code of ["ITEM_COUNT", "ITEM_NOT_OBJECT", "REQUIRED_TEXT", "TEXT_TOO_LONG", "ITEM_BANK_VERSION", "UNKNOWN_TRAIT", "SELF_PAIR", "DUPLICATE_STATEMENT", "DUPLICATE_ITEM_ID", "UNIQUE_TRAIT_COUNT", "TRAIT_EXPOSURE"]) {
      assert.ok(malformedItems.issues.some((entry) => entry.code === code), code);
    }
  }
  assert.equal(sideBalance([], traitIds).balanced, false);
});

test("v5 clarification contracts validate both prepared banks and bad imports", () => {
  const traitIds = traits().map((trait) => trait.id);
  assert.equal(validateClarificationBank(null, traitIds).ok, false);
  assert.equal(parseClarificationBankJson("[", traitIds).ok, false);

  const malformed = validateClarificationBank([
    null,
    { id: "", type: "trait_clarification", version: "wrong", priority: "high", targetTraits: ["trait-01", "trait-01", "unknown"], leftText: "", rightText: "" },
    {
      id: "career-bad",
      type: "career_tiebreak",
      version: "wrong",
      priority: 1,
      targetTraits: ["trait-01"],
      options: [null, { id: "Z", text: "", careerSignals: { unknown: 2 } }, { id: "C", text: "", careerSignals: null }],
      candidateGroups: "not-an-array",
      weight: -1,
    },
    { id: "other", type: "unsupported", version: T_SKILLS_V5_VERSION_IDS.clarificationBank, priority: Number.NaN },
  ], traitIds);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    for (const code of ["CLARIFICATION_NOT_OBJECT", "REQUIRED_TEXT", "CLARIFICATION_TYPE", "CLARIFICATION_VERSION", "CLARIFICATION_PRIORITY", "DUPLICATE_TARGET_TRAIT", "UNKNOWN_TRAIT", "TRAIT_TEXT_REQUIRED", "OPTION_NOT_OBJECT", "TIEBREAK_OPTION_COUNT", "OPTION_ID_ORDER", "CAREER_SIGNAL_VALUE", "CAREER_SIGNALS_OBJECT", "CANDIDATE_GROUPS", "CLARIFICATION_WEIGHT"]) {
      assert.ok(malformed.issues.some((entry) => entry.code === code), code);
    }
  }

  const validCareerItem: ClarificationItem = {
    id: "TB-VALID",
    type: "career_tiebreak",
    targetTraits: [],
    candidateGroups: ["p1"],
    priority: 1,
    weight: 1,
    version: T_SKILLS_V5_VERSION_IDS.clarificationBank,
    options: [
      { id: "A", text: "A", careerSignals: { analysis: 0.5 } },
      { id: "B", text: "B", careerSignals: { analysis: 0 } },
      { id: "C", text: "C", careerSignals: { analysis: -0.5 } },
      { id: "D", text: "D", careerSignals: {} },
    ],
  };
  const valid = validateClarificationBank([...clarificationBank(), validCareerItem], traitIds, T_SKILLS_V5_VERSION_IDS.clarificationBank, { requireTraitCoverage: true });
  assert.equal(valid.ok, true);
  assert.equal(parseClarificationBankJson(JSON.stringify([validCareerItem]), traitIds).ok, true);

  const item = clarificationBank()[0]!;
  assert.equal(validateClarificationAnswer({ itemId: item.id, value: 0 }, item), true);
  assert.equal(validateClarificationAnswer({ itemId: "other", value: 0 }, item), false);
  assert.equal(validateClarificationAnswer({ itemId: item.id, value: 3 }, item), false);
  assert.equal(validateClarificationAnswer(null, item), false);
  assert.deepEqual(selectClarificationItems({ bank: [], uncertainty: [], target: -1, max: -1 }), []);
  assert.deepEqual(selectClarificationItems({ bank: [item], uncertainty: [], target: 0, max: 0 }), []);
});

test("v5 career catalog rejects incomplete mappings and matching handles edge rules", () => {
  const taxonomy = traits();
  const malformed = validateV5CareerCatalog([
    null,
    {
      id: "bad",
      title: "",
      description: "",
      version: "wrong",
      active: "yes",
      traitWeights: { "trait-01": 2, unknown: 0.5 },
      subjectTags: ["математика", 7],
      dimensions: { analysis: 2, unknown: 0.5 },
      rules: [null, { id: "", traitId: "unknown", minRank: 0, maxRank: 26, minMean: -3, subjectTagsAny: "math", adjustment: 2 }],
      roadmap: { firstMonth: [null, { id: "", type: "unknown", title: "", description: "", verified: "yes" }], months1to3: null, months3to6: [], months6to12: [] },
    },
    {
      id: "bad-2",
      title: "Valid title",
      description: "Valid description",
      version: T_SKILLS_V5_VERSION_IDS.careerCatalog,
      active: true,
      traitWeights: null,
      subjectTags: null,
      dimensions: null,
      rules: null,
      roadmap: null,
    },
    {
      id: "bad-2",
      title: "Duplicate",
      description: "Duplicate",
      version: T_SKILLS_V5_VERSION_IDS.careerCatalog,
      active: false,
      traitWeights: {},
      subjectTags: [],
      dimensions: {},
      rules: [],
      roadmap: { firstMonth: [], months1to3: [], months3to6: [], months6to12: [] },
    },
  ], taxonomy);
  assert.equal(malformed.ok, false);
  if (!malformed.ok) {
    for (const code of ["PROFESSION_NOT_OBJECT", "REQUIRED_TEXT", "PROFESSION_VERSION", "PROFESSION_ACTIVE", "NUMBER_RANGE", "UNKNOWN_TRAIT_WEIGHT", "LIST_REQUIRED", "UNKNOWN_DIMENSION", "RULE_OBJECT", "RULE_UNKNOWN_TRAIT", "ROADMAP_ACTION_OBJECT", "ROADMAP_ACTION_TYPE", "ROADMAP_ACTION_VERIFIED", "ROADMAP_LIST", "RULES_LIST", "ROADMAP_OBJECT", "DUPLICATE_PROFESSION_ID"]) {
      assert.ok(malformed.issues.some((entry) => entry.code === code), code);
    }
  }
  assert.equal(validateV5CareerCatalog([], taxonomy).ok, true);

  const edge = {
    ...profession("edge", []),
    traitWeights: {},
    dimensions: { analysis: 0.3 },
    rules: [
      { id: "missing-trait", traitId: "missing", adjustment: 0.1 },
      { id: "subject-gate", traitId: "trait-01", minRank: 1, maxRank: 25, minMean: -1, subjectTagsAny: ["другой"], adjustment: 0.1 },
      { id: "always", adjustment: 0.1 },
    ],
  } satisfies ProfessionV5;
  const emptyTraits = matchCareersV5({ traits: [], favoriteSubjects: [], catalog: [edge] });
  assert.equal(emptyTraits[0]!.subjectMatch, 0);

  const question: CareerTieBreakQuestion = {
    id: "TB-MATCH",
    candidateGroups: ["edge"],
    prompt: "Что ближе?",
    options: [
      { id: "A", text: "A", careerSignals: { analysis: 0.5, people: 0.5 } },
      { id: "B", text: "B", careerSignals: { analysis: 0 } },
      { id: "C", text: "C", careerSignals: { analysis: -0.5 } },
      { id: "D", text: "D", careerSignals: {} },
    ],
    version: T_SKILLS_V5_VERSION_IDS.careerTiebreak,
  };
  const final = baseScores().map((entry) => ({ ...entry, rank: entry.rank!, baseRawScore: entry.rawScore, baseMeanScore: entry.meanScore, clarificationContributions: [], effectiveObservations: 6 }));
  const withTieBreak = matchCareersV5({ traits: final, favoriteSubjects: ["Математика"], catalog: [edge], tieBreakQuestions: [question], tieBreakAnswers: [{ questionId: question.id, optionId: "A" }] });
  assert.ok(withTieBreak[0]!.clarificationMatch > 0);
  assert.equal(validateCareerTieBreakAnswers(null, [question]).ok, false);
  assert.equal(validateCareerTieBreakAnswers([{ questionId: "missing", optionId: "Z" }, { questionId: question.id, optionId: "A" }, { questionId: question.id, optionId: "B" }], [question]).ok, false);
  assert.throws(() => matchCareersV5({ traits: final, favoriteSubjects: [], catalog: [edge], tieBreakAnswers: [{ questionId: "missing", optionId: "A" }], tieBreakQuestions: [question] }), /TIEBREAK_UNKNOWN_QUESTION/);
  assert.equal(selectCareerTieBreakQuestion({ candidates: withTieBreak, questions: [question] }), null);
  assert.equal(selectCareerTieBreakQuestion({ candidates: Array.from({ length: 5 }, (_, index) => ({ ...withTieBreak[0]!, professionId: `p${index}`, rank: index + 1 })), questions: [question] }), null);
  assert.equal(selectCareerTieBreakQuestion({ candidates: Array.from({ length: 6 }, (_, index) => ({ ...withTieBreak[0]!, professionId: `p${index}`, rank: index + 1, totalScore: 1 - index * 0.001 })), questions: [question], usedIds: [question.id] }), null);
});

test("v5 content bundle validates independent versions and prepared career tiebreaks", () => {
  assert.equal(tSkillsV5ContentIsReady(), false);
  assert.equal(validateTSkillsV5ContentBundle(null).ok, false);
  assert.equal(parseTSkillsV5ContentBundleJson("{").ok, false);
  const base = contentBundle();
  const question: CareerTieBreakQuestion = {
    id: "TB-BUNDLE",
    candidateGroups: ["p1", "p2"],
    prompt: "Какой вариант ближе?",
    options: [
      { id: "A", text: "A", careerSignals: { analysis: 0.5 } },
      { id: "B", text: "B", careerSignals: { analysis: 0 } },
      { id: "C", text: "C", careerSignals: { analysis: -0.5 } },
      { id: "D", text: "D", careerSignals: {} },
    ],
    version: T_SKILLS_V5_VERSION_IDS.careerTiebreak,
  };
  const valid = { ...base, careerTieBreakQuestions: [question] };
  assert.equal(validateTSkillsV5ContentBundle(valid).ok, true);
  assert.equal(parseTSkillsV5ContentBundleJson(JSON.stringify(valid)).ok, true);

  const invalid = validateTSkillsV5ContentBundle({
    ...valid,
    assessmentVersion: "wrong",
    traitTaxonomyVersion: "wrong",
    itemBankVersion: "wrong",
    scoringVersion: "wrong",
    uncertaintyVersion: "wrong",
    clarificationBankVersion: "wrong",
    careerCatalogVersion: "wrong",
    careerMatchingVersion: "wrong",
    careerTiebreakVersion: "wrong",
    narrativePromptVersion: "wrong",
    reportVersion: "wrong",
    traits: null,
    items: [],
    clarificationItems: null,
    professions: [],
    careerTieBreakQuestions: [null, { id: "", prompt: "", version: "wrong", candidateGroups: "bad", options: [null, { id: "Z", text: "", careerSignals: { unknown: 2 } }, { id: "C", text: "", careerSignals: null }] }],
  });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.ok(invalid.issues.some((entry) => entry.code === "VERSION_MISMATCH"));
    assert.ok(invalid.issues.some((entry) => entry.code === "TAXONOMY_NOT_ARRAY"));
    assert.ok(invalid.issues.some((entry) => entry.code === "CLARIFICATION_BANK_NOT_ARRAY"));
    assert.ok(invalid.issues.some((entry) => entry.code === "TIEBREAK_NOT_OBJECT"));
    assert.ok(invalid.issues.some((entry) => entry.code === "TIEBREAK_OPTION_OBJECT"));
  }
});

test("v5 scoring accepts resumable answer arrays and rejects malformed state", () => {
  const bank = items();
  const answers = bank.map((item) => ({ itemId: item.id, value: 0 as const }));
  const scored = scoreBaseProfile({ items: bank, traits: traits(), answers });
  assert.equal(scored.base.length, 25);
  assert.throws(() => scoreBaseProfile({ items: bank, traits: traits(), answers: [] }), /V5_MISSING_ANSWER/);
  assert.throws(() => scoreBaseProfile({ items: bank, traits: traits(), answers: null as unknown as never }), /V5_ANSWERS_NOT_OBJECT/);
  assert.throws(() => scoreBaseProfile({ items: bank, traits: traits(), answers: [{ itemId: bank[0]!.id, value: 3 as unknown as 0 }] }), /V5_INVALID_ANSWER/);
  assert.throws(() => scoreBaseProfile({ items: bank, traits: traits(), answers: [{ itemId: bank[0]!.id, value: 0 }, { itemId: bank[0]!.id, value: 0 }] }), /V5_DUPLICATE_ANSWER/);
  const final = scoreFinalProfile({ items: bank, traits: traits(), answers, clarificationItems: [], clarificationAnswers: [], clarificationWeight: 1 });
  assert.equal(final.final.length, 25);
  assert.throws(() => scoreFinalProfile({ items: bank, traits: traits(), answers, clarificationItems: [], clarificationAnswers: [], clarificationWeight: 0 }), /V5_INVALID_CLARIFICATION_WEIGHT/);
  assert.throws(() => scoreFinalProfile({ items: bank, traits: traits(), answers, clarificationItems: [], clarificationAnswers: [{ itemId: "unknown", value: 0 }] }), /V5_INVALID_CLARIFICATION_ITEM/);
});

test("v5 report and narrative fallbacks cover empty and malformed contracts", () => {
  const taxonomy = traits();
  const catalog = Array.from({ length: 5 }, (_, index) => profession(`r${index + 1}`));
  const final = baseScores().map((entry) => ({ ...entry, rank: entry.rank!, baseRawScore: entry.rawScore, baseMeanScore: entry.meanScore, clarificationContributions: [], effectiveObservations: 6 }));
  const recommendations = catalog.map((item, index) => ({ professionId: item.id, rank: index + 1, score: 0.9 - index / 100, traitEvidence: [], subjectEvidence: [], clarificationEvidence: [] }));
  const profile = { base: final, final, clarificationAnswers: [] };
  const payload = buildV5ReportPayload({ completedAt: "2026-09-18T00:00:00.000Z", profile, recommendations, taxonomy, catalog, favoriteSubjects: [] });
  assert.equal(validateV5ReportPayload(payload).ok, true);
  assert.equal(validateV5ReportPayload(null, catalog).ok, false);
  assert.equal(roadmapForProfession(catalog, "r1").firstMonth.length, 1);
  assert.throws(() => roadmapForProfession(catalog, "missing"), /REPORT_PROFESSION_NOT_FOUND/);
  assert.throws(() => buildV5ReportPayload({ completedAt: payload.assessment.completedAt, profile, recommendations: [{ ...recommendations[0]!, professionId: "missing" }, ...recommendations.slice(1)], taxonomy, catalog, favoriteSubjects: [] }), /REPORT_PROFESSION_NOT_FOUND/);

  const providedNarrative = buildDeterministicV5Narrative({ traits: final, recommendations, taxonomy, catalog });
  const withProvidedNarrative = buildV5ReportPayload({ completedAt: payload.assessment.completedAt, profile, recommendations, taxonomy, catalog, favoriteSubjects: [], narrative: providedNarrative });
  assert.deepEqual(withProvidedNarrative.narrative, providedNarrative);

  const emptyProfession = { ...profession("empty"), roadmap: { firstMonth: [], months1to3: [], months3to6: [], months6to12: [] } };
  const emptyNarrative = buildDeterministicV5Narrative({ traits: [], recommendations: [{ ...recommendations[0]!, professionId: "empty" }], taxonomy: [], catalog: [emptyProfession] });
  assert.match(emptyNarrative.profileSummary, /развивающий срез/);
  assert.match(emptyNarrative.roadmapSections[0]!.text, /нет детализированных шагов/);
  assert.throws(() => buildNarrativeInput({ traits: final, professions: recommendations.map((recommendation) => ({ ...recommendation, professionId: "missing" })), catalog: [], favoriteSubjects: [] }), /NARRATIVE_PROFESSION_NOT_FOUND/);

  const malformed = validateV5ReportPayload({ ...payload, assessment: null, traits: null, careers: [], roadmap: [], narrative: null, methodology: null }, catalog);
  assert.equal(malformed.ok, false);
  const badScore = structuredClone(payload);
  badScore.traits.base[0]!.rawScore = 99;
  assert.equal(validateV5ReportPayload(badScore, catalog).ok, false);
  const badRoadmap = structuredClone(payload);
  badRoadmap.roadmap[0]!.template = { firstMonth: [], months1to3: [], months3to6: [], months6to12: [] };
  assert.equal(validateV5ReportPayload(badRoadmap, catalog).ok, false);
  const badCareer = structuredClone(payload);
  badCareer.careers[0]!.professionId = "unknown";
  assert.equal(validateV5ReportPayload(badCareer, catalog).ok, false);

  assert.throws(() => assertNarrativeDoesNotChangeFacts(payload, { ...payload, traits: [] } as unknown as TSkillsReportPayloadV5), /NARRATIVE_CHANGED_TRAITS/);
  assert.throws(() => assertNarrativeDoesNotChangeFacts(payload, { ...payload, roadmap: [] } as unknown as TSkillsReportPayloadV5), /NARRATIVE_CHANGED_ROADMAP/);
});

test("v5 pipeline supports early stopping, career tiebreak and resumable validation", () => {
  const base = contentBundle();
  const content = { ...base, professions: Array.from({ length: 6 }, (_, index) => profession(`p${index + 1}`)), careerTieBreakQuestions: [] as CareerTieBreakQuestion[] };
  const question: CareerTieBreakQuestion = {
    id: "TB-PIPELINE",
    candidateGroups: ["p4", "p5", "p6"],
    prompt: "Какой вариант ближе?",
    options: [
      { id: "A", text: "A", careerSignals: { analysis: 0.5 } },
      { id: "B", text: "B", careerSignals: { analysis: 0 } },
      { id: "C", text: "C", careerSignals: { analysis: -0.5 } },
      { id: "D", text: "D", careerSignals: {} },
    ],
    version: T_SKILLS_V5_VERSION_IDS.careerTiebreak,
  };
  content.careerTieBreakQuestions = [question];
  const answers = Object.fromEntries(items().map((item) => [item.id, 0 as const]));
  const early = runTSkillsV5Pipeline({ content, baseAnswers: answers, onboarding: { favoriteSubjects: [] }, earlyStopClarification: true });
  assert.equal(early.stage, "CAREER_TIEBREAK");
  assert.equal(early.careerTieBreakQuestion?.id, question.id);
  const completed = runTSkillsV5Pipeline({ content, baseAnswers: answers, onboarding: { favoriteSubjects: [] }, earlyStopClarification: true, careerTieBreakAnswers: [{ questionId: question.id, optionId: "A" }], completedAt: "2026-09-18T00:00:00.000Z" });
  assert.equal(completed.stage, "COMPLETED");
  assert.equal(completed.report?.careers.length, 5);

  const fiveCareerContent = contentBundle();
  assert.throws(() => runTSkillsV5Pipeline({ content: fiveCareerContent, baseAnswers: answers, onboarding: { favoriteSubjects: [] }, earlyStopClarification: true }), /V5_COMPLETED_AT_REQUIRED/);
  assert.throws(() => runTSkillsV5Pipeline({ content: fiveCareerContent, baseAnswers: answers, selectedClarificationIds: ["CL-01", "CL-01"], onboarding: { favoriteSubjects: [] } }), /V5_INVALID_SELECTED_CLARIFICATION/);
  assert.throws(() => runTSkillsV5Pipeline({ content: fiveCareerContent, baseAnswers: answers, selectedClarificationIds: ["missing"], onboarding: { favoriteSubjects: [] } }), /V5_UNKNOWN_SELECTED_CLARIFICATION/);
  assert.throws(() => runTSkillsV5Pipeline({ content: fiveCareerContent, baseAnswers: answers, selectedClarificationIds: Array.from({ length: 8 }, (_, index) => `CL-${String(index + 1).padStart(2, "0")}`), onboarding: { favoriteSubjects: [] } }), /V5_TOO_MANY_CLARIFICATIONS/);
  assert.throws(() => runTSkillsV5Pipeline({ content: fiveCareerContent, baseAnswers: answers, selectedClarificationIds: ["CL-01"], clarificationAnswers: [{ itemId: "CL-02", value: 0 }], onboarding: { favoriteSubjects: [] }, earlyStopClarification: true }), /V5_INVALID_CLARIFICATION_ANSWER/);
});
