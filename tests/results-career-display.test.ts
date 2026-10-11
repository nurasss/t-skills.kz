import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { teenCareerRanking } from "@/lib/t-skills/teen/runtime";
import { teenFinalTotals } from "@/lib/t-skills/teen/runtime";
import { buildTeenDemoData } from "@/lib/t-skills/teen/runtime";
import { TEEN_VALUES } from "@/lib/t-skills/teen/taxonomy";

test("live example hides raw profession scores but keeps names, ranking and details", () => {
  const source = readFileSync("app/views/results/results-view.tsx", "utf-8");
  // No raw numeric scores next to professions (e.g. 1.63) in any language.
  assert.ok(!source.includes("ov-results-career-score"));
  assert.ok(!source.includes("career-score-note"));
  assert.ok(!source.includes("matchScore"));
  // Ranking display stays: order numbers, titles, expandable explanations.
  assert.ok(source.includes("ov-results-rank-num"));
  assert.ok(source.includes("ov-results-career-details"));
  assert.ok(source.includes("careers.slice(0, 5)"));
  // Both languages keep the section and its explanations.
  assert.ok(source.includes("Мансап бағыттары") && source.includes("Карьерные направления"));
  assert.ok(source.includes("О направлении") && source.includes("Бағыт туралы"));
});

test("live example hides the full-profile section, real reports keep it", () => {
  const source = readFileSync("app/views/results/results-view.tsx", "utf-8");
  // The full-profile section renders only outside the live example.
  assert.ok(source.includes("{demo ? null : ("));
  assert.ok(source.includes("t.fullProfile(profile.traits.length)"));
  // Real-report rendering is intact: score rows over all profile traits.
  assert.ok(source.includes("ov-results-score-list"));
  assert.ok(source.includes("profile.traits.map((trait, index)"));
  // The router feeds demo mode into the results view.
  const router = readFileSync("app/orbita-view-router.tsx", "utf-8");
  assert.ok(router.includes("demo={demoMode}"));
});

test("live example hides the plan section, real reports keep it", () => {
  const source = readFileSync("app/views/results/results-view.tsx", "utf-8");
  // Both removed sections (full profile + plan) are demo-conditional.
  assert.equal(source.match(/\{demo \? null : \(/g)?.length, 2);
  assert.ok(source.includes("t.planT"));
  assert.ok(source.includes("report.development30Days"));
  assert.ok(source.includes("report.teamwork"));
  assert.ok(source.includes("report.workEnvironments"));
  // Numbering stays automatic: no hardcoded section numbers around removed blocks.
  assert.ok(!source.includes("ov-results-section-num\">05"));
  assert.ok(!source.includes("ov-results-section-num\">06"));
});
test("demo data still computes the full 25-trait profile", () => {
  const { profile } = buildTeenDemoData();
  assert.equal(profile.traits.length, 25);
  assert.deepEqual(profile.traits.map((trait) => trait.rank), Array.from({ length: 25 }, (_, index) => index + 1));
});
test("profession scores stay in calculations and ranking is unchanged", () => {
  const totals = teenFinalTotals(
    Object.fromEntries(Array.from({ length: 75 }, (_, i) => [`t75-${i + 1}`, [-2, -1, 0, 1, 2][i % 5]])),
    [],
  );
  const ranked = teenCareerRanking(totals, { valueRanking: [...TEEN_VALUES], subjects: [] });
  assert.ok(ranked.length > 5);
  for (const entry of ranked) {
    assert.equal(typeof entry.matchScore, "number");
    assert.ok(Number.isFinite(entry.matchScore));
  }
  const scores = ranked.map((entry) => entry.matchScore);
  assert.deepEqual([...scores].sort((a, b) => b - a), scores);
  assert.deepEqual(ranked.map((entry) => entry.rank), ranked.map((_, index) => index + 1));
});
