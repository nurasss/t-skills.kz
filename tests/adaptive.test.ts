import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ADAPTIVE_REASON_CODES,
  buildDemoResponses,
  scoreAssessment,
  selectAdaptiveItems,
  validateAdaptiveSelection,
} from "@/lib/assessment-engine";
import { ITEM_BANK } from "@/lib/item-bank";

const profile = scoreAssessment(buildDemoResponses());
const answeredCore = ITEM_BANK.filter((item) => Number(item.id.slice(1)) <= 250).map((item) => item.id);

test("adaptive validator enforces every cardinality and identity boundary", () => {
  const ten = selectAdaptiveItems(profile, answeredCore, 10);
  const fifteen = selectAdaptiveItems(profile, answeredCore, 15);
  assert.equal(ten.selectedItemIds.length, 10);
  assert.equal(fifteen.selectedItemIds.length, 15);
  assert.equal(validateAdaptiveSelection(ten.selectedItemIds, answeredCore, 3, {}, ten.reasonCodes), true);
  assert.equal(validateAdaptiveSelection(fifteen.selectedItemIds, answeredCore, 3, {}, fifteen.reasonCodes), true);
  assert.equal(validateAdaptiveSelection(ten.selectedItemIds.slice(0, 9), answeredCore), false);
  assert.equal(validateAdaptiveSelection([...fifteen.selectedItemIds, "Q251"], answeredCore), false);
  assert.equal(validateAdaptiveSelection([...ten.selectedItemIds.slice(0, 9), ten.selectedItemIds[0]], answeredCore), false);
  assert.equal(validateAdaptiveSelection([...ten.selectedItemIds.slice(0, 9), "Q001"], answeredCore), false);
  assert.equal(validateAdaptiveSelection(ten.selectedItemIds, [...answeredCore, ten.selectedItemIds[0]]), false);
});

test("adaptive validator enforces trait quota, semantic uniqueness, and reason allowlist", () => {
  const selected = selectAdaptiveItems(profile, answeredCore, 12);
  const clusters = Object.fromEntries(selected.selectedItemIds.map((id) => [id, "same"]));
  assert.equal(validateAdaptiveSelection(selected.selectedItemIds, answeredCore, 3, clusters, selected.reasonCodes), false);

  const unknownReason = { ...selected.reasonCodes, [selected.selectedItemIds[0]]: ["UNKNOWN_REASON"] };
  assert.equal(validateAdaptiveSelection(selected.selectedItemIds, answeredCore, 3, {}, unknownReason), false);
  assert.ok(Object.values(selected.reasonCodes).flat().every((reason) => ADAPTIVE_REASON_CODES.includes(reason)));

  const t01Items = ["Q251", "Q281", "Q282"];
  const quotaVector = [...t01Items, ...selected.selectedItemIds.filter((id) => !t01Items.includes(id)).slice(0, 7)];
  assert.equal(quotaVector.length, 10);
  assert.equal(validateAdaptiveSelection(quotaVector, answeredCore, 2), false);
});
