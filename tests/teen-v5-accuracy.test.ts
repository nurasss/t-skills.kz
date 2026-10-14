import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  selectTeenClarificationQuestions,
  teenCareerRanking,
  teenFinalTotals,
  teenPairwiseItemsForAssessmentVersion,
  teenRuntimeContent,
  teenTotalsToProfile,
  TEEN_PAIRWISE_ITEMS,
  TEEN_PAIRWISE_ITEMS_V4,
  TEEN_PAIRWISE_ITEMS_V5,
} from "@/lib/t-skills/teen/runtime";
import { estimateTeenTraitsGraph, rankTeenTraitIds, scoreTeenStage1, teenTotalsForScoringVersion } from "@/lib/t-skills/teen/scoring";
import { scoreTeenCareers } from "@/lib/t-skills/teen/matching";
import { buildTeenReport } from "@/lib/t-skills/teen/report";
import { TEEN_CAREER_CATALOG_V2, teenCareerCatalog } from "@/lib/t-skills/teen/careers";
import { TEEN_SUBJECTS, TEEN_TRAIT_IDS, TEEN_V5_VERSION_IDS, TEEN_VALUES, type TeenStage1Totals, type TeenTraitId } from "@/lib/t-skills/teen/taxonomy";
import { careerRuntimeForAssessmentVersion, executableAssessmentVersionReason } from "@/lib/assessment-runtime-registry";
import { teenCareerCatalogVersionForAssessment } from "@/lib/t-skills/teen/careers";
import { isTSkillsTeenVersion, teenVersionIdsForAssessment, T_SKILLS_TEEN_V4_VERSION_IDS, T_SKILLS_TEEN_V5_VERSION_IDS } from "@/lib/t-skills/versions";
import orientationV2 from "@/lib/t-skills/teen/orientation-v2.json";

const V4 = T_SKILLS_TEEN_V4_VERSION_IDS.assessment;
const V5 = T_SKILLS_TEEN_V5_VERSION_IDS.assessment;

function sideCounts(items: readonly { leftTraitId: string; rightTraitId: string }[]) {
  const counts = new Map<string, [number, number]>();
  for (const item of items) {
    counts.set(item.leftTraitId, [(counts.get(item.leftTraitId)?.[0] ?? 0) + 1, counts.get(item.leftTraitId)?.[1] ?? 0]);
    counts.set(item.rightTraitId, [counts.get(item.rightTraitId)?.[0] ?? 0, (counts.get(item.rightTraitId)?.[1] ?? 0) + 1]);
  }
  return counts;
}

function stage1ItemsFor(version: string) {
  return teenPairwiseItemsForAssessmentVersion(version)
    .map((item) => ({ id: item.id, leftTraitId: item.leftTraitId as TeenTraitId, rightTraitId: item.rightTraitId as TeenTraitId }));
}

test("v5 is the current pathway and keeps v4 texts, pairs and catalog", () => {
  assert.deepEqual(TEEN_PAIRWISE_ITEMS, TEEN_PAIRWISE_ITEMS_V5);
  assert.equal(teenVersionIdsForAssessment(V5), T_SKILLS_TEEN_V5_VERSION_IDS);
  assert.ok(isTSkillsTeenVersion(V5));
  assert.equal(teenCareerCatalogVersionForAssessment(V5), TEEN_CAREER_CATALOG_V2);
  assert.equal(T_SKILLS_TEEN_V5_VERSION_IDS.scoring, "teen-scoring-v3");
  assert.equal(T_SKILLS_TEEN_V5_VERSION_IDS.careerMatching, "teen-career-matching-v2");
  assert.equal(T_SKILLS_TEEN_V5_VERSION_IDS.adaptive, T_SKILLS_TEEN_V4_VERSION_IDS.adaptive);
  assert.equal(T_SKILLS_TEEN_V5_VERSION_IDS.report, T_SKILLS_TEEN_V4_VERSION_IDS.report);
  // Every v5 item is the v4 item, possibly mirrored: same id, same trait pair, same texts.
  const swapped = new Set(orientationV2.swapLeftRight.map((number) => `t75-${number}`));
  for (const [index, item] of TEEN_PAIRWISE_ITEMS_V5.entries()) {
    const v4 = TEEN_PAIRWISE_ITEMS_V4[index]!;
    assert.equal(item.id, v4.id);
    const mirrored = swapped.has(item.id);
    assert.equal(item.leftTraitId, mirrored ? v4.rightTraitId : v4.leftTraitId);
    assert.equal(item.leftText, mirrored ? v4.rightText : v4.leftText);
    assert.equal(item.rightText, mirrored ? v4.leftText : v4.rightText);
  }
  assert.equal(swapped.size, 14, "14 mirrored pairs is the proven minimum for a 3:3 layout");
  const content = teenRuntimeContent("ru", V5);
  assert.deepEqual(content.stage2, teenRuntimeContent("ru", V4).stage2);
  assert.equal(content.professions.length, 111);
});

test("v5 shows every trait three times left and three times right in RU and KK", () => {
  for (const locale of ["ru", "kk"] as const) {
    const counts = sideCounts(teenRuntimeContent(locale, V5).items75);
    assert.equal(counts.size, 25);
    for (const [trait, [left, right]] of counts) assert.deepEqual([left, right], [3, 3], `${locale} ${trait}`);
  }
  // The frozen v4 layout is what v5 corrects.
  assert.deepEqual(sideCounts(TEEN_PAIRWISE_ITEMS_V4).get("curiosity"), [6, 0]);
});

test("pressing the same side on every pair yields a flat v5 profile", () => {
  for (const value of [-2, -1, 1, 2]) {
    const answers = Object.fromEntries(TEEN_PAIRWISE_ITEMS_V5.map((item) => [item.id, value]));
    const totals = teenFinalTotals(answers, [], V5);
    for (const trait of TEEN_TRAIT_IDS) assert.equal(totals[trait], 0, `${value} on every pair must not favour ${trait}`);
  }
  // v4 for comparison: the same habit pushed one trait to the top.
  const v4 = teenFinalTotals(Object.fromEntries(TEEN_PAIRWISE_ITEMS_V4.map((item) => [item.id, 1])), [], V4);
  assert.equal(rankTeenTraitIds(v4)[0], "autonomy");
});

test("graph estimator keeps the zero-sum scale and is monotone in each answer", () => {
  const items = stage1ItemsFor(V5);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let round = 0; round < 40; round += 1) {
    const answers = Object.fromEntries(items.map((item) => [item.id, Math.floor(rnd() * 5) - 2]));
    const raw = scoreTeenStage1(items, answers).totals;
    const estimate = estimateTeenTraitsGraph(items, raw);
    const sum = TEEN_TRAIT_IDS.reduce((total, trait) => total + estimate[trait], 0);
    assert.ok(Math.abs(sum) < 1e-4, "ipsative zero sum is preserved");
    const rms = (totals: TeenStage1Totals) => Math.sqrt(TEEN_TRAIT_IDS.reduce((total, trait) => total + totals[trait] ** 2, 0) / 25);
    assert.ok(Math.abs(rms(estimate) - rms(raw)) < 1e-4, "scale matches the raw sums");
    // Moving one answer towards the right trait never lowers that trait.
    const item = items[Math.floor(rnd() * items.length)]!;
    if (answers[item.id] < 2) {
      const before = estimateTeenTraitsGraph(items, scoreTeenStage1(items, answers).totals);
      const after = estimateTeenTraitsGraph(items, scoreTeenStage1(items, { ...answers, [item.id]: answers[item.id] + 1 }).totals);
      const beforeRank = rankTeenTraitIds(before).indexOf(item.rightTraitId);
      const afterRank = rankTeenTraitIds(after).indexOf(item.rightTraitId);
      assert.ok(afterRank <= beforeRank, `${item.rightTraitId} must not drop after a stronger preference`);
    }
  }
  const zero = estimateTeenTraitsGraph(items, scoreTeenStage1(items, {}).totals);
  assert.ok(TEEN_TRAIT_IDS.every((trait) => zero[trait] === 0));
});

test("graph estimator credits a win over a strong trait more than a win over a weak one", () => {
  const items = stage1ItemsFor(V5);
  // Strong trait: wins all its pairs. Then compare two traits with equal raw sums.
  const strong = "leadership" as TeenTraitId;
  const answers: Record<string, number> = {};
  for (const item of items) {
    if (item.leftTraitId === strong) answers[item.id] = -2;
    else if (item.rightTraitId === strong) answers[item.id] = 2;
    else answers[item.id] = 0;
  }
  const raw = scoreTeenStage1(items, answers).totals;
  const estimate = estimateTeenTraitsGraph(items, raw);
  const beatenByStrong = items.filter((item) => item.leftTraitId === strong || item.rightTraitId === strong)
    .map((item) => (item.leftTraitId === strong ? item.rightTraitId : item.leftTraitId));
  const untouched = TEEN_TRAIT_IDS.filter((trait) => trait !== strong && !beatenByStrong.includes(trait));
  // Losing only to the strongest trait is less informative than the raw −2 suggests.
  for (const loser of beatenByStrong) assert.ok(estimate[loser] > raw[loser] * 1.0001 || raw[loser] === 0, `${loser} shrinks towards 0`);
  for (const trait of untouched) assert.ok(estimate[trait] <= 0, `${trait} has no direct evidence and stays ≤ 0`);
  assert.equal(rankTeenTraitIds(estimate, raw)[0], strong);
});

test("v5 ties are broken by raw stage-1 sums; frozen versions keep id order", () => {
  const totals = Object.fromEntries(TEEN_TRAIT_IDS.map((trait) => [trait, 0])) as TeenStage1Totals;
  totals.networker = 3;
  totals.adaptability = 3;
  const raw = { ...totals, networker: 5, adaptability: 1 };
  assert.deepEqual(rankTeenTraitIds(totals).slice(0, 2), ["adaptability", "networker"]);
  assert.deepEqual(rankTeenTraitIds(totals, raw).slice(0, 2), ["networker", "adaptability"]);
});

test("server and browser flows produce identical v5 results", () => {
  const items = teenRuntimeContent("ru", V5).items75;
  const answers = Object.fromEntries(items.map((item, index) => [item.id, [2, -1, 0, 1, -2, 1][index % 6]]));
  const questions = selectTeenClarificationQuestions(answers, V5);
  assert.equal(questions.length, 8);
  const serverResponses: Record<string, number> = { ...answers };
  const browserStage2: { traitId: TeenTraitId; value: number }[] = [];
  questions.forEach((question, index) => {
    serverResponses[question.id] = index % 4;
    browserStage2.push({ traitId: question.id.replace(/^t2-/, "") as TeenTraitId, value: [-2, -1, 1, 2][index % 4]! });
  });
  const server = teenFinalTotals(serverResponses, questions.map((question) => question.id), V5);
  const browser = teenTotalsForScoringVersion(T_SKILLS_TEEN_V5_VERSION_IDS.scoring, items, answers, browserStage2);
  assert.deepEqual(server, browser);
  const onboarding = { valueRanking: [...TEEN_VALUES], subjects: ["math", "physics"] as ("math" | "physics")[] };
  const serverCareers = teenCareerRanking(server, onboarding, TEEN_CAREER_CATALOG_V2, T_SKILLS_TEEN_V5_VERSION_IDS.careerMatching);
  const browserCareers = scoreTeenCareers(browser, teenCareerCatalog(TEEN_CAREER_CATALOG_V2, "ru"), onboarding, T_SKILLS_TEEN_V5_VERSION_IDS.careerMatching);
  assert.deepEqual(serverCareers.slice(0, 5).map((entry) => entry.professionId), browserCareers.slice(0, 5).map((entry) => entry.professionId));
  const profile = teenTotalsToProfile(server, 8, { answers: serverResponses }, T_SKILLS_TEEN_V5_VERSION_IDS);
  const report = buildTeenReport(teenRuntimeContent("ru", V5), browser, browserCareers, onboarding, 5, 5, TEEN_V5_VERSION_IDS, scoreTeenStage1(items, answers).totals);
  assert.deepEqual(profile.traits.map((trait) => trait.code), report.traits.map((trait) => trait.traitId));
});

test("matching v2 is invariant to the size of a profession's weight vector", () => {
  const catalog = teenCareerCatalog(TEEN_CAREER_CATALOG_V2, "ru");
  const base = catalog[0]!;
  const doubled = { ...base, id: "doubled", traitWeights: Object.fromEntries(Object.entries(base.traitWeights).map(([trait, weight]) => [trait, (weight ?? 0) / 2])) };
  const totals = Object.fromEntries(TEEN_TRAIT_IDS.map((trait, index) => [trait, (index % 7) - 3])) as TeenStage1Totals;
  const onboarding = { valueRanking: [...TEEN_VALUES], subjects: [] };
  const [v2a, v2b] = [base, doubled].map((profession) => scoreTeenCareers(totals, [profession], onboarding, "teen-career-matching-v2")[0]!.traitScore);
  assert.ok(Math.abs(v2a - v2b) < 1e-9);
  const [v1a, v1b] = [base, doubled].map((profession) => scoreTeenCareers(totals, [profession], onboarding)[0]!.traitScore);
  assert.ok(Math.abs(v1a - 2 * v1b) < 1e-9, "frozen v1 formula is unchanged");
});

test("registry and migration 0027 publish v5 and retire v4 without touching sessions", () => {
  assert.equal(executableAssessmentVersionReason({
    productId: "t-skills",
    version: V5,
    scoringVersion: "teen-scoring-v3",
    contentVersion: "t-skills-teen-items-v5",
    careerModelVersion: "teen-career-matching-v2",
    reportVersion: "t-skills-teen-report-v2",
    adaptiveVersion: "teen-clarification-v1",
    itemCount: 100,
  }), null);
  assert.equal(careerRuntimeForAssessmentVersion(V5), "built-in:t-skills-teen-career-v1");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = OFF");
    const migrations = readdirSync("drizzle").filter((file) => file.endsWith(".sql") && file < "0027").sort();
    for (const migration of migrations) db.exec(readFileSync(`drizzle/${migration}`, "utf8"));
    db.exec("PRAGMA foreign_keys = OFF");
    const unfinishedV4 = JSON.stringify(T_SKILLS_TEEN_V4_VERSION_IDS);
    db.prepare(
      `INSERT INTO assessments (id, user_id, test_id, state, versions_json, created_at, updated_at, final_score_json, report_id)
       VALUES ('unfinished-v4', 'migration-test-user', 't-skills', 'CORE_IN_PROGRESS', ?, 1, 1, NULL, NULL)`,
    ).run(unfinishedV4);
    db.exec(readFileSync("drizzle/0027_teen_v5_accuracy.sql", "utf8"));
    const row = db.prepare("SELECT status, scoring_version, content_version, career_model_version, report_version, adaptive_version, item_count FROM assessment_versions WHERE version = ?").get(V5) as Record<string, unknown>;
    assert.deepEqual({ ...row }, {
      status: "PUBLISHED",
      scoring_version: "teen-scoring-v3",
      content_version: "t-skills-teen-items-v5",
      career_model_version: "teen-career-matching-v2",
      report_version: "t-skills-teen-report-v2",
      adaptive_version: "teen-clarification-v1",
      item_count: 100,
    });
    assert.equal(db.prepare("SELECT status FROM assessment_versions WHERE version = ?").get(V4)?.status, "RETIRED");
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM assessment_versions WHERE status = 'PUBLISHED' AND product_id = 't-skills'").get() as { n: number }).n, 1);
    const kept = db.prepare("SELECT versions_json, state FROM assessments WHERE id = 'unfinished-v4'").get() as { versions_json: string; state: string };
    assert.equal(kept.versions_json, unfinishedV4);
    assert.equal(kept.state, "CORE_IN_PROGRESS");
  } finally {
    db.close();
  }
});

/**
 * Regression guard for measurement quality. Simulated respondents have a
 * latent 25-trait profile, answer pairs with noise and a personal tendency to
 * press one side. v5 must recover the latent profile and the latent-best
 * profession better than v4, and must neutralise the side habit.
 */
test("simulation: v5 measures traits and professions more accurately than v4", () => {
  let seed = 2026;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const catalog = teenCareerCatalog(TEEN_CAREER_CATALOG_V2, "ru");
  const subjects = TEEN_SUBJECTS.filter((subject) => subject !== "pedagogy");
  const ord = (delta: number) => (delta > 1.2 ? 2 : delta > 0.35 ? 1 : delta < -1.2 ? -2 : delta < -0.35 ? -1 : 0);
  const people = Array.from({ length: 300 }, () => ({
    theta: Object.fromEntries(TEEN_TRAIT_IDS.map((trait) => [trait, gauss()])) as Record<TeenTraitId, number>,
    bias: gauss() * 0.35,
    onboarding: {
      valueRanking: [...TEEN_VALUES].sort(() => rnd() - 0.5),
      subjects: [...subjects].sort(() => rnd() - 0.5).slice(0, 3),
    },
  }));
  const result: Record<string, { traitTop5: number; careerTop1InTrueTop5: number; sideHabitAutonomy: number }> = {};
  for (const version of [V4, V5]) {
    const ids = teenVersionIdsForAssessment(version)!;
    const items = teenPairwiseItemsForAssessmentVersion(version);
    let traitTop5 = 0;
    let careerHits = 0;
    for (const person of people) {
      const responses: Record<string, number> = {};
      for (const item of items) responses[item.id] = ord(person.theta[item.rightTraitId as TeenTraitId] - person.theta[item.leftTraitId as TeenTraitId] + person.bias + gauss() * 0.8);
      const questions = selectTeenClarificationQuestions(responses, version);
      for (const question of questions) {
        const signal = person.theta[question.id.replace(/^t2-/, "") as TeenTraitId] + gauss() * 0.8;
        responses[question.id] = signal < -0.8 ? 0 : signal < 0 ? 1 : signal < 0.8 ? 2 : 3;
      }
      const totals = teenFinalTotals(responses, questions.map((question) => question.id), version);
      const estimated = teenTotalsToProfile(totals, questions.length, { answers: responses }, ids).traits.slice(0, 5).map((trait) => trait.code);
      const latent = [...TEEN_TRAIT_IDS].sort((a, b) => person.theta[b] - person.theta[a]).slice(0, 5);
      traitTop5 += estimated.filter((trait) => latent.includes(trait as TeenTraitId)).length / 5;
      const latentTotals = Object.fromEntries(TEEN_TRAIT_IDS.map((trait) => [trait, Math.max(-12, Math.min(12, (person.theta[trait] / 2.5) * 12))])) as TeenStage1Totals;
      const trueTop5 = scoreTeenCareers(latentTotals, catalog, person.onboarding as never, "teen-career-matching-v2").slice(0, 5).map((entry) => entry.professionId);
      const top1 = teenCareerRanking(totals, person.onboarding as never, TEEN_CAREER_CATALOG_V2, ids.careerMatching)[0]!.professionId;
      careerHits += trueTop5.includes(top1) ? 1 : 0;
    }
    // Side habit only, no real preferences: how often does autonomy reach the top 5?
    let autonomy = 0;
    for (let index = 0; index < 200; index += 1) {
      const responses: Record<string, number> = {};
      for (const item of items) responses[item.id] = ord(0.6 + gauss() * 0.8);
      const totals = teenFinalTotals(responses, [], version);
      autonomy += rankTeenTraitIds(totals).slice(0, 5).includes("autonomy") ? 1 : 0;
    }
    result[version] = { traitTop5: traitTop5 / people.length, careerTop1InTrueTop5: careerHits / people.length, sideHabitAutonomy: autonomy / 200 };
  }
  const v4 = result[V4]!;
  const v5 = result[V5]!;
  assert.ok(v5.traitTop5 > v4.traitTop5 + 0.03, `trait top-5 recovery ${JSON.stringify(result)}`);
  assert.ok(v5.careerTop1InTrueTop5 > v4.careerTop1InTrueTop5 + 0.05, `career #1 validity ${JSON.stringify(result)}`);
  assert.ok(v4.sideHabitAutonomy > 0.6, `v4 is dominated by the side habit ${JSON.stringify(result)}`);
  assert.ok(v5.sideHabitAutonomy < 0.4, "v5 neutralises the side habit");
});
