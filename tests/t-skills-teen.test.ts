import assert from "node:assert/strict";
import test from "node:test";

import {
  TEEN_TRAIT_IDS,
  type TeenOnboarding,
  type TeenPairwiseItem,
  type TeenProfession,
  type TeenStage1Totals,
} from "@/lib/t-skills/teen/taxonomy";
import {
  applyTeenStage2Correction,
  emptyTotals,
  normalizeTeenTotal,
  scoreTeenStage1,
  selectTeenStage2,
  teenAmbiguity,
} from "@/lib/t-skills/teen/scoring";
import { scoreTeenCareers, topTeenCareers } from "@/lib/t-skills/teen/matching";

function pair(id: string, left: (typeof TEEN_TRAIT_IDS)[number], right: (typeof TEEN_TRAIT_IDS)[number]): TeenPairwiseItem {
  return { id, leftTraitId: left, rightTraitId: right };
}

test("stage 1 is ipsative: totals sum to zero", () => {
  const items = [pair("q1", "curiosity", "discipline"), pair("q2", "discipline", "empathy")];
  const { totals } = scoreTeenStage1(items, { q1: 2, q2: -1 });
  assert.equal(totals.curiosity, 2);
  assert.equal(totals.discipline, -3);
  assert.equal(totals.empathy, 1);
  const sum = TEEN_TRAIT_IDS.reduce((acc, id) => acc + totals[id], 0);
  assert.equal(sum, 0);
});

test("ambiguity prefers inconsistent traits over decided ones", () => {
  const flat = teenAmbiguity([2, 2, 2, 2, 2, 2], 12);
  const split = teenAmbiguity([2, 2, 2, -2, -2, -2], 0);
  assert.ok(split > flat);
});

test("stage 2 selection is bounded 5..15 and deterministic", () => {
  const totals = emptyTotals();
  const contributions: Record<string, number[]> = Object.fromEntries(
    TEEN_TRAIT_IDS.map((id, i) => [id, [2, -2, 1, -1, 0, 0].map((v) => v + ((i + v) % 3))]),
  );
  const first = selectTeenStage2(totals, contributions as never);
  const second = selectTeenStage2(totals, contributions as never);
  assert.deepEqual(first, second);
  assert.ok(first.length >= 5 && first.length <= 15);
  assert.equal(new Set(first).size, first.length);
});

test("stage 2 correction applies x2 and validates values", () => {
  const totals = emptyTotals();
  const next = applyTeenStage2Correction(totals, "curiosity", 1);
  assert.equal(next.curiosity, 2);
  assert.equal(totals.curiosity, 0);
  assert.throws(() => applyTeenStage2Correction(totals, "curiosity", 0), /TEEN_STAGE2_VALUE/);
  assert.throws(() => applyTeenStage2Correction(totals, "curiosity", 3), /TEEN_STAGE2_VALUE/);
});

test("normalizeTeenTotal clamps to -1..1", () => {
  assert.equal(normalizeTeenTotal(12), 1);
  assert.equal(normalizeTeenTotal(-12), -1);
  assert.equal(normalizeTeenTotal(0), 0);
  assert.ok(normalizeTeenTotal(6) === 0.5);
});

const catalog: TeenProfession[] = [
  { id: "p1", traitWeights: { curiosity: 1, discipline: -1 }, subjectTags: ["math"], valueFit: ["growth"], active: true },
  { id: "p2", traitWeights: { curiosity: 0.5 }, subjectTags: ["pe"], valueFit: ["status"], active: true },
  { id: "p3", traitWeights: { curiosity: 1 }, subjectTags: [], valueFit: [], active: false },
];

function totalsWith(curiosity: number, discipline = 0): TeenStage1Totals {
  const totals = emptyTotals();
  totals.curiosity = curiosity;
  totals.discipline = discipline;
  return totals;
}

test("matching rewards trait fit, value top-3 and subjects; inactive excluded", () => {
  const onboarding: TeenOnboarding = { valueRanking: ["growth", "income", "status", "stability", "value-autonomy", "creative-freedom", "social-impact", "work-life-balance"], subjects: ["math"] };
  const scores = scoreTeenCareers(totalsWith(12), catalog, onboarding);
  assert.deepEqual(scores.map((s) => s.professionId), ["p1", "p2"]);
  const [first, second] = scores;
  assert.ok(first.totalScore > second.totalScore);
  assert.equal(first.valueBonus, 0.15);
  assert.equal(first.subjectBonus, 0.1);
  assert.equal(second.valueBonus, 0.15);
  assert.equal(second.subjectBonus, 0);
});

test("negative weights penalize counter-indicative traits", () => {
  const onboarding: TeenOnboarding = { valueRanking: [], subjects: [] };
  const ranked = scoreTeenCareers(totalsWith(0, 12), catalog, onboarding);
  const pro = ranked[ranked.length - 1];
  assert.equal(pro.professionId, "p1");
  assert.ok(pro.traitScore < 0);
});

test("topTeenCareers is deterministic with id tie-break", () => {
  const onboarding: TeenOnboarding = { valueRanking: [], subjects: [] };
  const tied: TeenProfession[] = [
    { id: "b", traitWeights: {}, subjectTags: [], valueFit: [], active: true },
    { id: "a", traitWeights: {}, subjectTags: [], valueFit: [], active: true },
  ];
  assert.deepEqual(topTeenCareers(emptyTotals(), tied, onboarding, 2).map((s) => s.professionId), ["a", "b"]);
});

test("teen onboarding helpers: move, toggle, validate", async () => {
  const { moveTeenValue, toggleTeenSubject, validateTeenOnboarding, defaultTeenValueRanking } =
    await import("@/lib/t-skills/teen/onboarding-content");
  const ranking = defaultTeenValueRanking();
  assert.equal(ranking.length, 8);
  const moved = moveTeenValue(ranking, 0, 7);
  assert.equal(moved[7], ranking[0]);
  assert.equal(moved[0], ranking[1]);
  assert.deepEqual(moveTeenValue(ranking, 2, 2), ranking);
  assert.deepEqual(moveTeenValue(ranking, -1, 3), ranking);

  let selected = toggleTeenSubject([], "math");
  selected = toggleTeenSubject(selected, "physics");
  selected = toggleTeenSubject(selected, "chemistry");
  assert.deepEqual(selected, ["math", "physics", "chemistry"]);
  assert.deepEqual(toggleTeenSubject(selected, "biology"), selected);
  assert.deepEqual(toggleTeenSubject(selected, "math"), ["physics", "chemistry"]);

  assert.equal(validateTeenOnboarding({ valueRanking: ranking, subjects: ["math"] }), "Выберите от 2 до 3 любимых предметов.");
  assert.equal(validateTeenOnboarding({ valueRanking: ranking, subjects: ["math", "physics"] }), null);
});
