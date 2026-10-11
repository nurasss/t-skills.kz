import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { localizeAssessmentItem } from "@/lib/adult-kk";
import { canPublishLocale, resolveLocaleInput } from "@/lib/i18n";
import { AS_STRINGS, CTRL_STRINGS, translateControllerStatus } from "@/lib/site-strings";
import { T_SKILLS_PAIRWISE_BANK_V1 } from "@/lib/t-skills/content-v4";
import { scoreTeenStage1 } from "@/lib/t-skills/teen/scoring";
import { teenRuntimeContent } from "@/lib/t-skills/teen/runtime";
import { TEEN_UI } from "@/lib/t-skills/teen/ui-strings";
import { T_SKILLS_TEEN_V3_VERSION_IDS } from "@/lib/t-skills/versions";
import type { TeenTraitId } from "@/lib/t-skills/teen/taxonomy";

test("assessment screen renders likert scale from the display language", () => {
  for (const lang of ["ru", "kk"] as const) {
    assert.ok(AS_STRINGS[lang].likert1.length > 0);
    assert.ok(AS_STRINGS[lang].likert4.length > 0);
    assert.ok(AS_STRINGS[lang].likert7.length > 0);
  }
  assert.notEqual(AS_STRINGS.kk.likert1, AS_STRINGS.ru.likert1);
  // Regression: the Likert branch must use localized strings, not hardcoded RU.
  const source = readFileSync("app/views/assessment/assessment-view.tsx", "utf-8");
  assert.ok(source.includes("{t.likert1}") && source.includes("{t.likert4}") && source.includes("{t.likert7}"));
  assert.ok(!source.includes("совсем не про меня"));
});

test("autosave status translates on RU/ҚЗ toggle without touching session state", () => {
  const keys = ["ready", "saved", "offline", "scoring", "saving", "creatingSession", "sessionReady"] as const;
  for (const key of keys) {
    assert.equal(translateControllerStatus(CTRL_STRINGS.ru[key], "ru", "kk"), CTRL_STRINGS.kk[key]);
    assert.equal(translateControllerStatus(CTRL_STRINGS.kk[key], "kk", "ru"), CTRL_STRINGS.ru[key]);
    assert.equal(translateControllerStatus(CTRL_STRINGS.ru[key], "ru", "ru"), CTRL_STRINGS.ru[key]);
  }
  assert.equal(translateControllerStatus("custom-text", "ru", "kk"), "custom-text");
  assert.equal(translateControllerStatus("", "kk", "ru"), "");
});

test("display language and versioned session language stay separated", () => {
  // Server policy unchanged: only ru sessions can be created.
  assert.equal(canPublishLocale("ru"), true);
  assert.equal(canPublishLocale("kk"), false);
  // Display language still resolves kk for the in-test toggle.
  assert.equal(resolveLocaleInput("kk").locale, "kk");
  assert.equal(resolveLocaleInput("ru").locale, "ru");
  // Display overlay works in kk even though the kk session locale is unpublished:
  // ids and trait codes never change, only display texts.
  const first = T_SKILLS_PAIRWISE_BANK_V1[0]!;
  const kk = localizeAssessmentItem(first, "kk");
  assert.equal(kk.id, first.id);
});

test("pairwise -2/+2 direction survives the kk display overlay (adult bank)", () => {
  let translated = 0;
  for (const item of T_SKILLS_PAIRWISE_BANK_V1) {
    const kk = localizeAssessmentItem(item, "kk") as typeof item;
    assert.equal(kk.id, item.id);
    assert.equal(kk.leftTraitId, item.leftTraitId);
    assert.equal(kk.rightTraitId, item.rightTraitId);
    assert.ok(kk.leftText.length > 0 && kk.rightText.length > 0);
    if (kk.leftText !== item.leftText) translated += 1;
    // RU display is byte-identical to the versioned bank item.
    const ru = localizeAssessmentItem(item, "ru");
    assert.equal(ru.leftText, item.leftText);
    assert.equal(ru.rightText, item.rightText);
  }
  assert.ok(translated > 0, "kk overlay must translate at least one adult pair");
});

test("teen v3 toggle keeps the same question, sides and scoring in both languages", () => {
  const ru = teenRuntimeContent("ru", T_SKILLS_TEEN_V3_VERSION_IDS.assessment);
  const kk = teenRuntimeContent("kk", T_SKILLS_TEEN_V3_VERSION_IDS.assessment);
  assert.equal(ru.items75.length, 75);
  assert.deepEqual(
    kk.items75.map((item) => item.id),
    ru.items75.map((item) => item.id),
  );
  for (const item of ru.items75) {
    const counterpart = kk.items75.find((candidate) => candidate.id === item.id)!;
    assert.equal(counterpart.leftTraitId, item.leftTraitId);
    assert.equal(counterpart.rightTraitId, item.rightTraitId);
  }
  // Scoring from the kk display layout matches the ru layout exactly:
  // -2 credits the left trait, +2 the right one, 0 is neutral.
  const kkItems = kk.items75.map((item) => ({
    id: item.id,
    leftTraitId: item.leftTraitId as TeenTraitId,
    rightTraitId: item.rightTraitId as TeenTraitId,
  }));
  const probe = kkItems[0]!;
  for (const [answer, left, right] of [[-2, 2, -2], [-1, 1, -1], [1, -1, 1], [2, -2, 2]] as const) {
    const { totals } = scoreTeenStage1(kkItems, { [probe.id]: answer });
    assert.equal(totals[probe.leftTraitId], left);
    assert.equal(totals[probe.rightTraitId], right);
  }
  const { totals: neutral } = scoreTeenStage1(kkItems, { [probe.id]: 0 });
  assert.equal(neutral[probe.leftTraitId], 0);
  assert.equal(neutral[probe.rightTraitId], 0);
  // Answers are keyed by stable ids, so progress survives the toggle.
  const answers = Object.fromEntries(ru.items75.slice(0, 10).map((item) => [item.id, 2]));
  const answeredRu = ru.items75.filter((item) => typeof answers[item.id] === "number").length;
  const answeredKk = kk.items75.filter((item) => typeof answers[item.id] === "number").length;
  assert.equal(answeredRu, 10);
  assert.equal(answeredKk, 10);
});

test("teen interface strings cover the five-point scale in both languages", () => {
  for (const lang of ["ru", "kk"] as const) {
    assert.equal(TEEN_UI[lang].staticLabels.length, 5);
    assert.ok(TEEN_UI[lang].staticLabels.every((label) => label.length > 0));
    assert.ok(TEEN_UI[lang].whatCloser.length > 0);
    assert.ok(TEEN_UI[lang].questionOf(1, 75).length > 0);
  }
  assert.notDeepEqual(TEEN_UI.kk.staticLabels, TEEN_UI.ru.staticLabels);
});

test("save status resolves display texts at completion, not at request start", () => {
  // Regression: toggling the language while an answer is being saved must not
  // bring the status message back in the previous language.
  const source = readFileSync("hooks/use-assessment-queue.ts", "utf-8");
  assert.ok(source.includes("textsRef"));
  assert.ok(!source.includes("onStatus(savedText"));
  assert.ok(!source.includes("onStatus(offlineText"));
  assert.ok(source.includes("textsRef.current.savedText"));
  assert.ok(source.includes("textsRef.current.offlineText"));
});
