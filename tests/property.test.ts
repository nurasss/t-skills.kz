import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";

import { scoreAssessment, selectAdaptiveItems, VERSION_IDS, type ResponseMap } from "@/lib/assessment-engine";
import { ITEM_BANK } from "@/lib/item-bank";

const PROPERTY_SEED = 300_251;
const PROPERTY_RUNS = 1_000;

function validResponseMap(values: number[]): ResponseMap {
  return Object.fromEntries(ITEM_BANK.map((item, index) => {
    const value = values[index] ?? 0;
    if (item.type === "forced" || item.type === "adaptive_forced") return [item.id, ((value % 5) + 5) % 5 - 2];
    return [item.id, ((value % 7) + 7) % 7 + 1];
  }));
}

test("property scoring invariants seed=300251 runs=1000", () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: -1_000, max: 1_000 }), { minLength: ITEM_BANK.length, maxLength: ITEM_BANK.length }),
      (values) => {
        const responses = validResponseMap(values);
        const first = scoreAssessment(responses);
        const second = scoreAssessment(responses);
        assert.deepEqual(first, second);
        assert.deepEqual(first.versions, VERSION_IDS);
        assert.equal(first.normStatus, "unvalidated");
        assert.equal(new Set(first.traits.map((trait) => trait.rank)).size, 30);
        assert.ok(first.traits.every((trait) =>
          trait.se >= 0.2 && trait.se <= 0.48 &&
          trait.profileIndex >= 1 && trait.profileIndex <= 99 &&
          trait.uncertaintyRange[0] >= 1 && trait.uncertaintyRange[1] <= 99));
      },
    ),
    { seed: PROPERTY_SEED, numRuns: PROPERTY_RUNS, endOnFailure: true },
  );
});

test("property adaptive bounds seed=300252 runs=1000", () => {
  const profile = scoreAssessment(validResponseMap(new Array(ITEM_BANK.length).fill(1)));
  const answered = ITEM_BANK.filter((item) => Number(item.id.slice(1)) <= 250).map((item) => item.id);
  fc.assert(
    fc.property(fc.integer({ min: -100, max: 100 }), (requested) => {
      const selection = selectAdaptiveItems(profile, answered, requested);
      assert.ok(selection.selectedItemIds.length >= 10 && selection.selectedItemIds.length <= 15);
      assert.equal(new Set(selection.selectedItemIds).size, selection.selectedItemIds.length);
      assert.ok(selection.selectedItemIds.every((id) => Number(id.slice(1)) >= 251 && Number(id.slice(1)) <= 300));
    }),
    { seed: PROPERTY_SEED + 1, numRuns: PROPERTY_RUNS, endOnFailure: true },
  );
});
