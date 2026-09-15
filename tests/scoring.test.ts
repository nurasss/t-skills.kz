import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  buildDemoResponses,
  scoreAssessment,
  VERSION_IDS,
  type ScoreProfile,
} from "@/lib/assessment-engine";
import { ITEM_BANK } from "@/lib/item-bank";
import { responsesForRecipe, type ScoringFixtureRecipe } from "@/tests/scoring-fixtures";

type FrozenFixture = {
  name: string;
  recipe: ScoringFixtureRecipe;
  expectedTop5: string[];
  expectedScoreSha256: string;
};

const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/scoring/profiles.json", import.meta.url), "utf8"),
) as FrozenFixture[];

function scoreDigest(score: ScoreProfile) {
  return createHash("sha256").update(JSON.stringify(score)).digest("hex");
}

test("frozen scoring fixtures preserve exact outputs and Top 5", () => {
  for (const fixture of fixtures) {
    const score = scoreAssessment(responsesForRecipe(fixture.recipe));
    assert.deepEqual(score.traits.slice(0, 5).map((trait) => trait.code), fixture.expectedTop5, fixture.name);
    assert.equal(scoreDigest(score), fixture.expectedScoreSha256, fixture.name);
    assert.deepEqual(score.versions, VERSION_IDS, fixture.name);
  }
});

test("scoring boundaries stay norm-safe for every trait and domain", () => {
  const score = scoreAssessment(buildDemoResponses());
  assert.equal(score.traits.length, 30);
  assert.equal(score.domains.length, 6);
  assert.ok(score.traits.every((trait) => trait.se >= 0.2 && trait.se <= 0.48));
  assert.ok(score.traits.every((trait) => trait.profileIndex >= 1 && trait.profileIndex <= 99));
  assert.ok(score.traits.every((trait) => trait.rank >= 1 && trait.rank <= 30));
  assert.ok(score.traits.every((trait) =>
    trait.uncertaintyRange[0] >= 1 &&
    trait.uncertaintyRange[1] <= 99 &&
    trait.uncertaintyRange[0] <= trait.standardScore &&
    trait.uncertaintyRange[1] >= trait.standardScore));
  assert.ok(score.domains.every((domain) => domain.profileIndex >= 1 && domain.profileIndex <= 99));
  assert.equal(new Set(score.traits.map((trait) => trait.rank)).size, 30);
});

test("forced-choice accepts only -2..2 and invalid items are rejected", () => {
  const forced = ITEM_BANK.find((item) => item.type === "forced");
  assert.ok(forced);
  for (const value of [-2, -1, 0, 1, 2]) assert.doesNotThrow(() => scoreAssessment({ [forced.id]: value }));
  for (const value of [-3, 3, 1.5, Number.NaN]) {
    assert.throws(() => scoreAssessment({ [forced.id]: value }), /INVALID_RESPONSE/);
  }
  assert.throws(() => scoreAssessment({ Q999: 4 }), /INVALID_ITEM:Q999/);
});

test("research-only Q243/Q246/Q249/Q250 never alter trait or domain scores", () => {
  const baseline = buildDemoResponses();
  const changed = { ...baseline, Q243: 1, Q246: 7, Q249: 1, Q250: 7 };
  const before = scoreAssessment(baseline);
  const after = scoreAssessment(changed);
  assert.deepEqual(after.traits, before.traits);
  assert.deepEqual(after.domains, before.domains);
});
