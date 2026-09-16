import assert from "node:assert/strict";
import test from "node:test";

import { buildAdaptiveContext, buildV2DemoResponses, core60Coverage, scoreCore60 } from "@/lib/orbita-v2-engine";
import { CORE60_BANK, CORE60_TRAIT_CODES, V2_ITEM_BANK_VERSION, V2_SCORING_VERSION } from "@/lib/v2-item-bank";

test("v2 Core60 is fixed, complete, and balanced across the taxonomy", () => {
  const coverage = core60Coverage();
  assert.equal(coverage.itemCount, 60);
  assert.equal(coverage.uniqueIds, 60);
  assert.equal(coverage.traits, 30);
  assert.equal(coverage.domains, 6);
  assert.equal(coverage.formats.likert, 30);
  assert.equal(coverage.formats.forcedChoice, 30);
  assert.deepEqual([...coverage.traitCounts.values()].sort((a, b) => a - b), new Array(30).fill(3));
  assert.deepEqual(new Set(CORE60_TRAIT_CODES), new Set(CORE60_BANK.flatMap((item) => item.targetTraits)));
  assert.ok(CORE60_BANK.every((item) => item.version === V2_ITEM_BANK_VERSION && item.semanticCluster.length > 0));
  assert.ok(CORE60_BANK.every((item) => item.format === "likert" ? item.scoring.min === 1 && item.scoring.max === 7 : item.scoring.min === -2 && item.scoring.max === 2));
});

test("v2 preliminary and frozen adaptive scoring are deterministic and norm-safe", () => {
  const coreResponses = buildV2DemoResponses();
  const preliminary = scoreCore60(coreResponses);
  const context = buildAdaptiveContext(preliminary, Object.keys(coreResponses));
  const adaptive = context.ambiguousTraitPairs.slice(0, 10).map(([left, right], index) => ({
    questionId: `AI-${String(index + 1).padStart(2, "0")}`,
    format: "forced_choice" as const,
    targetTraits: [left, right],
    reverse: false,
  }));
  const responses = { ...coreResponses, ...Object.fromEntries(adaptive.map((item, index) => [item.questionId, index % 5 - 2])) };
  const first = scoreCore60(responses, {}, adaptive);
  const second = scoreCore60(responses, {}, adaptive);
  assert.deepEqual(first, second);
  assert.equal(first.versions.scoring, V2_SCORING_VERSION);
  assert.equal(first.normStatus, "unvalidated");
  assert.equal(first.traits.length, 30);
  assert.equal(first.domains.length, 6);
  assert.ok(first.traits.every((trait) => trait.standardScore >= 1 && trait.standardScore <= 99));
  assert.ok(first.traits.every((trait) => trait.uncertaintyRange[0] <= trait.standardScore && trait.uncertaintyRange[1] >= trait.standardScore));
});

