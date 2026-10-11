import assert from "node:assert/strict";
import test from "node:test";

import {
  isTeenStage2QuestionId,
  localizeTeenQuestion,
  selectTeenClarificationQuestions,
  teenCareerRanking,
  teenFinalTotals,
  teenOnboardingFrom,
  teenOnboardingIssue,
  teenPairwiseItemsForAssessmentVersion,
  teenRuntimeContent,
  teenStage2ValueForIndex,
  teenTotalsToProfile,
  TEEN_ONBOARDING_SUBJECTS,
  TEEN_PAIRWISE_ITEMS,
  TEEN_PAIRWISE_ITEMS_V1,
  TEEN_PAIRWISE_ITEMS_V2,
  TEEN_PAIRWISE_ITEMS_V3,
  TEEN_PAIRWISE_ITEMS_V4,
} from "@/lib/t-skills/teen/runtime";
import { TEEN_VALUES } from "@/lib/t-skills/teen/taxonomy";
import { careerRuntimeForAssessmentVersion, executableAssessmentVersionReason } from "@/lib/assessment-runtime-registry";
import { T_SKILLS_TEEN_V1_FIX_VERSION_IDS, T_SKILLS_TEEN_V1_VERSION_IDS, T_SKILLS_TEEN_V3_VERSION_IDS, T_SKILLS_TEEN_V4_VERSION_IDS, T_SKILLS_TEEN_VERSION_IDS, T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";
import { TEEN_CAREER_CATALOG_V2 } from "@/lib/t-skills/teen/careers";
import { validateOnboarding } from "@/lib/t-skills/onboarding";

function answersWith(pattern: (index: number) => number) {
  return Object.fromEntries(TEEN_PAIRWISE_ITEMS.map((item, index) => [item.id, pattern(index)]));
}

test("current pathway (v4) serves the corrected 75 pairs verbatim and an 8-of-25 situational pool", () => {
  assert.equal(TEEN_PAIRWISE_ITEMS.length, 75);
  assert.equal(new Set(TEEN_PAIRWISE_ITEMS.map((item) => item.id)).size, 75);
  assert.ok(TEEN_PAIRWISE_ITEMS.every((item) => item.version === T_SKILLS_TEEN_V4_VERSION_IDS.itemBank && item.leftText && item.rightText));
  assert.deepEqual(TEEN_PAIRWISE_ITEMS, TEEN_PAIRWISE_ITEMS_V4);
  // v4 pairs are byte-identical to the frozen v3 pairs (only the catalog changed).
  assert.deepEqual(
    TEEN_PAIRWISE_ITEMS_V4.map((item) => ({ ...item, version: "v4" })),
    TEEN_PAIRWISE_ITEMS_V3.map((item) => ({ ...item, version: "v4" })),
  );
  // Corrected short wording from the approved DOCX (no paraphrasing, A left / B right).
  assert.equal(TEEN_PAIRWISE_ITEMS[0]!.leftText, "Могу часами изучать тему, которая меня увлекла, даже если она не нужна для учёбы.");
  assert.equal(TEEN_PAIRWISE_ITEMS[0]!.rightText, "Прежде чем начать, я прикидываю, к чему это приведёт потом.");
  // Each trait still has 6 total exposures; v3 follows the documents verbatim
  // (no balancing swaps), so left/right is not 3:3 — that balance lives only in frozen v2.
  const total = new Map<string, number>();
  for (const item of TEEN_PAIRWISE_ITEMS) {
    total.set(item.leftTraitId, (total.get(item.leftTraitId) ?? 0) + 1);
    total.set(item.rightTraitId, (total.get(item.rightTraitId) ?? 0) + 1);
  }
  for (const trait of Object.keys(teenRuntimeContent("ru").traitNames)) {
    assert.equal(total.get(trait), 6, `${trait} appears six times in total`);
  }
  // RU/KK correspondence: same numbers, sides and trait IDs, only display texts differ.
  const ru = teenRuntimeContent("ru", T_SKILLS_TEEN_V4_VERSION_IDS.assessment);
  const kk = teenRuntimeContent("kk", T_SKILLS_TEEN_V4_VERSION_IDS.assessment);
  assert.equal(ru.items75.length, 75);
  assert.equal(kk.items75.length, 75);
  for (const item of ru.items75) {
    const kkItem = kk.items75.find((candidate) => candidate.id === item.id)!;
    assert.ok(kkItem);
    assert.equal(kkItem.leftTraitId, item.leftTraitId);
    assert.equal(kkItem.rightTraitId, item.rightTraitId);
    assert.notEqual(kk.items75Texts[kkItem.id].left, ru.items75Texts[item.id].left);
  }
  // Frozen v2 bank stays balanced 3:3 and untouched.
  assert.equal(TEEN_PAIRWISE_ITEMS_V2.length, 75);
  assert.ok(TEEN_PAIRWISE_ITEMS_V2.every((item) => item.version === T_SKILLS_TEEN_VERSION_IDS.itemBank));
  const left = new Map<string, number>();
  const right = new Map<string, number>();
  for (const item of TEEN_PAIRWISE_ITEMS_V2) {
    left.set(item.leftTraitId, (left.get(item.leftTraitId) ?? 0) + 1);
    right.set(item.rightTraitId, (right.get(item.rightTraitId) ?? 0) + 1);
  }
  for (const trait of Object.keys(teenRuntimeContent("ru", T_SKILLS_TEEN_VERSION_IDS.assessment).traitNames)) {
    assert.equal(left.get(trait), 3, `${trait} appears on the left exactly three times in frozen v2`);
    assert.equal(right.get(trait), 3, `${trait} appears on the right exactly three times in frozen v2`);
  }
  assert.equal(TEEN_PAIRWISE_ITEMS_V3.length, 75);
  assert.ok(TEEN_PAIRWISE_ITEMS_V3.every((item) => item.version === T_SKILLS_TEEN_V3_VERSION_IDS.itemBank));
  assert.equal(TEEN_PAIRWISE_ITEMS_V1.length, 75);
  assert.ok(TEEN_PAIRWISE_ITEMS_V1.every((item) => item.version === T_SKILLS_TEEN_V1_VERSION_IDS.itemBank));
  assert.equal(teenRuntimeContent("ru").stage2.length, 25);
  assert.equal(teenRuntimeContent("ru").status, "PUBLISHED");
  assert.equal(teenRuntimeContent("kk").status, "PUBLISHED");
  assert.equal(TEEN_ONBOARDING_SUBJECTS.length, 13);
  assert.ok(!(TEEN_ONBOARDING_SUBJECTS as readonly string[]).includes("pedagogy"));
});

test("v2 pair layout preserves every v1 pair while balancing left/right placement", () => {
  assert.deepEqual(teenPairwiseItemsForAssessmentVersion(T_SKILLS_TEEN_V1_VERSION_IDS.assessment), TEEN_PAIRWISE_ITEMS_V1);
  assert.deepEqual(teenPairwiseItemsForAssessmentVersion(T_SKILLS_TEEN_VERSION_IDS.assessment), TEEN_PAIRWISE_ITEMS_V2);
  assert.deepEqual(teenPairwiseItemsForAssessmentVersion(T_SKILLS_TEEN_V3_VERSION_IDS.assessment), TEEN_PAIRWISE_ITEMS_V3);
  assert.deepEqual(teenPairwiseItemsForAssessmentVersion(T_SKILLS_TEEN_V4_VERSION_IDS.assessment), TEEN_PAIRWISE_ITEMS_V4);
  const oldById = new Map(TEEN_PAIRWISE_ITEMS_V1.map((item) => [item.id, item]));
  for (const item of TEEN_PAIRWISE_ITEMS_V2) {
    const old = oldById.get(item.id);
    assert.ok(old);
    assert.deepEqual(
      new Set([item.leftTraitId, item.rightTraitId]),
      new Set([old.leftTraitId, old.rightTraitId]),
    );
  }
  // v3 keeps the same pair IDs/traits as v1 source and follows the documents
  // verbatim (no balancing swaps): v3 layout equals v1 layout for every id.
  // v4 reuses the v3 pairs byte-for-byte; only the profession catalog differs.
  for (const item of [...TEEN_PAIRWISE_ITEMS_V3, ...TEEN_PAIRWISE_ITEMS_V4]) {
    const old = oldById.get(item.id)!;
    assert.ok(old);
    assert.equal(item.leftTraitId, old.leftTraitId, `${item.id} left trait follows the document`);
    assert.equal(item.rightTraitId, old.rightTraitId, `${item.id} right trait follows the document`);
  }
});

test("v4, v3 and v2 score the UI's selected side while v1 sessions retain their frozen scorer", () => {
  const itemV4 = TEEN_PAIRWISE_ITEMS_V4[0]!;
  const itemV3 = TEEN_PAIRWISE_ITEMS_V3.find((item) => item.id === itemV4.id)!;
  const itemV2 = TEEN_PAIRWISE_ITEMS_V2.find((item) => item.id === itemV4.id)!;
  const itemV1 = TEEN_PAIRWISE_ITEMS_V1.find((item) => item.id === itemV4.id)!;
  assert.equal(itemV4.leftTraitId, "curiosity");
  assert.equal(itemV4.rightTraitId, "strategic-thinking");
  assert.equal(itemV3.leftTraitId, "curiosity");
  assert.equal(itemV3.rightTraitId, "strategic-thinking");
  assert.equal(itemV2.leftTraitId, "curiosity");
  assert.equal(itemV2.rightTraitId, "strategic-thinking");
  const v4Answers = { [itemV4.id]: -2 };
  const v3Answers = { [itemV3.id]: -2 };
  const v2Answers = { [itemV2.id]: -2 };
  const v1Answers = { [itemV1.id]: -2 };

  const v4Totals = teenFinalTotals(v4Answers, [], T_SKILLS_TEEN_V4_VERSION_IDS.assessment);
  const v3Totals = teenFinalTotals(v3Answers, [], T_SKILLS_TEEN_V3_VERSION_IDS.assessment);
  const v2Totals = teenFinalTotals(v2Answers, [], T_SKILLS_TEEN_VERSION_IDS.assessment);
  const v1Totals = teenFinalTotals(v1Answers, [], T_SKILLS_TEEN_V1_VERSION_IDS.assessment);
  const v1FixTotals = teenFinalTotals(v1Answers, [], T_SKILLS_TEEN_V1_FIX_VERSION_IDS.assessment);
  assert.equal(v4Totals.curiosity, 2, "the UI's -2/left choice raises the left trait in v4 (no inversion)");
  assert.equal(v4Totals["strategic-thinking"], -2);
  assert.equal(v3Totals.curiosity, 2, "the UI's -2/left choice raises the left trait in v3 (no inversion)");
  assert.equal(v3Totals["strategic-thinking"], -2);
  assert.equal(v2Totals.curiosity, 2, "the UI's -2/left choice raises the left trait in v2");
  assert.equal(v2Totals["strategic-thinking"], -2);
  assert.equal(v1Totals.curiosity, -2, "frozen v1 behavior stays byte-for-byte compatible");
  assert.equal(v1Totals["strategic-thinking"], 2);
  assert.equal(v1FixTotals.curiosity, 2, "unfinished v1 attempts keep their item layout but use the corrected scorer");
  assert.equal(v1FixTotals["strategic-thinking"], -2);
  assert.equal(teenTotalsToProfile(v1Totals, 0, {}, T_SKILLS_TEEN_V1_VERSION_IDS).versions.assessment, T_SKILLS_TEEN_V1_VERSION_IDS.assessment);
  assert.equal(teenTotalsToProfile(v1FixTotals, 0, {}, T_SKILLS_TEEN_V1_FIX_VERSION_IDS).versions.assessment, T_SKILLS_TEEN_V1_FIX_VERSION_IDS.assessment);
});

test("exactly 8 situational questions are selected deterministically from ambiguous traits", () => {
  const responses = answersWith((index) => [2, -1, 0, 1, -2][index % 5]);
  const first = selectTeenClarificationQuestions(responses);
  const second = selectTeenClarificationQuestions({ ...responses });
  assert.equal(first.length, 8);
  assert.deepEqual(first.map((question) => question.id), second.map((question) => question.id));
  assert.equal(new Set(first.map((question) => question.id)).size, 8);
  for (const question of first) {
    assert.ok(isTeenStage2QuestionId(question.id));
    assert.equal(question.options.length, 4);
    assert.deepEqual(question.options.map((option) => option.id), ["A", "B", "C", "D"]);
  }
});

test("situational answers map A–D to −2/−1/+1/+2 and add a ×2 correction to their trait", () => {
  const responses: Record<string, number> = answersWith(() => 0);
  const [question] = selectTeenClarificationQuestions(responses);
  const traitId = question.id.replace(/^t2-/, "") as keyof ReturnType<typeof teenFinalTotals>;
  assert.deepEqual([0, 1, 2, 3].map((index) => teenStage2ValueForIndex(question.id, index)), [-2, -1, 1, 2]);
  assert.equal(teenStage2ValueForIndex(question.id, 4), null);
  const base = teenFinalTotals(responses, []);
  const corrected = teenFinalTotals({ ...responses, [question.id]: 3 }, [question.id]);
  assert.equal(corrected[traitId], base[traitId] + 4);
  assert.throws(() => teenFinalTotals(responses, [question.id]), /TEEN_CLARIFICATION_ANSWER/);
});

test("profile ranks all 25 traits under the current pathway version", () => {
  const totals = teenFinalTotals(answersWith((index) => (index % 2 ? 2 : -2)), []);
  const profile = teenTotalsToProfile(totals, 8);
  assert.equal(profile.traits.length, 25);
  assert.deepEqual(profile.traits.map((trait) => trait.rank), Array.from({ length: 25 }, (_, index) => index + 1));
  assert.equal(profile.versions.assessment, T_SKILLS_TEEN_V4_VERSION_IDS.assessment);
  assert.equal(profile.coreAnswered, 75);
  assert.equal(profile.adaptiveAnswered, 8);
  assert.ok(profile.traits.every((trait) => trait.se === 1 && trait.uncertaintyRange[0] === 1 && trait.uncertaintyRange[1] === 99), "teen uncertainty stays maximally broad until calibration");
  for (let index = 1; index < profile.traits.length; index += 1) {
    assert.ok(profile.traits[index - 1].theta >= profile.traits[index].theta);
  }
});

test("onboarding requires a full value ranking and 2–3 listed subjects", () => {
  const ranking = [...TEEN_VALUES];
  assert.equal(teenOnboardingIssue({ favoriteSubjects: ["math", "physics"], valueRanking: ranking }), null);
  assert.equal(teenOnboardingIssue({ favoriteSubjects: ["math"], valueRanking: ranking }), "SUBJECTS_INVALID");
  assert.equal(teenOnboardingIssue({ favoriteSubjects: ["math", "physics", "history", "english"], valueRanking: ranking }), "SUBJECTS_INVALID");
  assert.equal(teenOnboardingIssue({ favoriteSubjects: ["math", "pedagogy"], valueRanking: ranking }), "SUBJECTS_INVALID");
  assert.equal(teenOnboardingIssue({ favoriteSubjects: ["math", "physics"], valueRanking: ranking.slice(0, 7) }), "VALUE_RANKING_INVALID");
  assert.equal(teenOnboardingIssue({ favoriteSubjects: ["math", "physics"] }), "VALUE_RANKING_INVALID");
  const validated = validateOnboarding({ age: 16, educationLevel: "school", favoriteSubjects: ["math", "physics"], valueRanking: ranking });
  assert.ok(validated.ok);
  assert.deepEqual(validated.ok ? validated.value.valueRanking : null, ranking);
  assert.deepEqual(teenOnboardingFrom({ favoriteSubjects: ["math", "physics"], valueRanking: ranking }), { valueRanking: ranking, subjects: ["math", "physics"] });
});

test("career ranking covers the catalog and applies value and subject bonuses", () => {
  const totals = teenFinalTotals(answersWith(() => 0), []);
  // Combat default stays on the 170 catalog even though default content is v4/111.
  const neutral = teenCareerRanking(totals, { valueRanking: [...TEEN_VALUES], subjects: [] });
  assert.equal(neutral.length, 170);
  const v2neutral = teenCareerRanking(totals, { valueRanking: [...TEEN_VALUES], subjects: [] }, TEEN_CAREER_CATALOG_V2);
  assert.equal(v2neutral.length, 111);
  assert.equal(v2neutral.length, teenRuntimeContent("ru").professions.length);
  assert.deepEqual(neutral.map((entry) => entry.rank), neutral.map((_, index) => index + 1));
  const withSubjects = teenCareerRanking(totals, { valueRanking: [...TEEN_VALUES], subjects: ["math", "physics"] });
  const mathProfession = withSubjects.find((entry) => entry.subjectBonus > 0);
  assert.ok(mathProfession, "at least one profession has a math/physics subject bonus");
  assert.ok(withSubjects.every((entry) => entry.valueBonus >= 0 && entry.subjectBonus >= 0));
});

test("kk display localisation changes texts but keeps ids for scoring", () => {
  const item = TEEN_PAIRWISE_ITEMS[0];
  const kk = localizeTeenQuestion(item, "kk");
  assert.equal(kk.id, item.id);
  assert.notEqual(kk.leftText, item.leftText);
  // v3 corrected wording spot-checks (verbatim from the approved DOCX, both languages).
  assert.equal(item.leftText, "Могу часами изучать тему, которая меня увлекла, даже если она не нужна для учёбы.");
  assert.equal(kk.leftText, "Мені қызықтырған тақырыпты, сабаққа қажет болмаса да, сағаттап зерттей беремін.");
  assert.equal(kk.leftTraitId, item.leftTraitId);
  assert.equal(kk.rightTraitId, item.rightTraitId);
  assert.equal(kk.version, item.version);
  const last = TEEN_PAIRWISE_ITEMS_V3[74]!;
  assert.equal(last.id, "t75-75");
  assert.equal(last.leftText, "В переписке я легко подбираю тон, чтобы меня поняли правильно.");
  const lastKk = localizeTeenQuestion(last, "kk");
  assert.equal(lastKk.leftText, "Хат алмасқанда мені дұрыс түсінулері үшін қажетті үнді оңай табамын.");
  const [question] = selectTeenClarificationQuestions(answersWith(() => 1));
  const kkQuestion = localizeTeenQuestion(question, "kk");
  assert.equal(kkQuestion.id, question.id);
  assert.notEqual(kkQuestion.prompt, question.prompt);
  assert.equal(localizeTeenQuestion(item, "ru"), item);
});

test("v3 keeps the five-point scale and the UI left/right sign without inversion", () => {
  const item = TEEN_PAIRWISE_ITEMS_V3[0]!;
  for (const answer of [-2, -1, 1, 2]) {
    const totals = teenFinalTotals({ [item.id]: answer }, [], T_SKILLS_TEEN_V3_VERSION_IDS.assessment);
    // leftContribution = -answer, rightContribution = +answer (see scoring.ts).
    assert.equal(totals.curiosity, -answer);
    assert.equal(totals["strategic-thinking"], answer);
  }
  const neutral = teenFinalTotals({ [item.id]: 0 }, [], T_SKILLS_TEEN_V3_VERSION_IDS.assessment);
  assert.equal(neutral.curiosity, 0);
  assert.equal(neutral["strategic-thinking"], 0);
  // Positive selects right, negative selects left.
  const right = teenFinalTotals({ [item.id]: 2 }, [], T_SKILLS_TEEN_V3_VERSION_IDS.assessment);
  assert.equal(right.curiosity, -2);
  assert.equal(right["strategic-thinking"], 2);
});

test("v3 bundles parse and frozen v1 banks stay byte-for-byte", async () => {
  const { readFileSync } = await import("node:fs");
  const { parseTeenContentBundle } = await import("@/lib/t-skills/teen/content");
  const v3ru = parseTeenContentBundle(JSON.parse(readFileSync("lib/t-skills/teen/content.v2.json", "utf-8")));
  const v3kk = parseTeenContentBundle(JSON.parse(readFileSync("lib/t-skills/teen/content.v2.kk.json", "utf-8")));
  assert.equal(v3ru.items75.length, 75);
  assert.equal(v3kk.items75.length, 75);
  assert.equal(v3ru.stage2.length, 25);
  assert.equal(v3ru.professions.length, 170);
  assert.equal(v3ru.status, "PUBLISHED");
  assert.equal(v3kk.status, "PUBLISHED");
  assert.equal(v3ru.items75Texts["t75-1"].left, "Могу часами изучать тему, которая меня увлекла, даже если она не нужна для учёбы.");
  assert.equal(v3kk.items75Texts["t75-1"].left, "Мені қызықтырған тақырыпты, сабаққа қажет болмаса да, сағаттап зерттей беремін.");
  // Frozen v1 still carries the old long wording (never overwritten).
  const v1ru = parseTeenContentBundle(JSON.parse(readFileSync("lib/t-skills/teen/content.v1.json", "utf-8")));
  assert.equal(v1ru.items75Texts["t75-1"].left, "Могу часами погружаться в интересную тему просто ради любопытства, даже если она не пригодится на учебе прямо сейчас.");
});

test("v3 replaces all 75 pairs in both languages with identical layouts", async () => {
  const { readFileSync } = await import("node:fs");
  const { parseTeenContentBundle } = await import("@/lib/t-skills/teen/content");
  const v1ru = parseTeenContentBundle(JSON.parse(readFileSync("lib/t-skills/teen/content.v1.json", "utf-8")));
  const v1kk = parseTeenContentBundle(JSON.parse(readFileSync("lib/t-skills/teen/content.v1.kk.json", "utf-8")));
  const v3ru = parseTeenContentBundle(JSON.parse(readFileSync("lib/t-skills/teen/content.v2.json", "utf-8")));
  const v3kk = parseTeenContentBundle(JSON.parse(readFileSync("lib/t-skills/teen/content.v2.kk.json", "utf-8")));
  const v1ruById = new Map(v1ru.items75.map((item) => [item.id, item]));
  const v1kkById = new Map(v1kk.items75.map((item) => [item.id, item]));
  assert.equal(v3ru.items75.length, 75);
  for (const item of v3ru.items75) {
    const old = v1ruById.get(item.id)!;
    const kkItem = v3kk.items75.find((candidate) => candidate.id === item.id)!;
    const oldKk = v1kkById.get(item.id)!;
    // Same numbers, sides and trait ids in both languages and vs the old bank.
    assert.equal(kkItem.leftTraitId, item.leftTraitId);
    assert.equal(kkItem.rightTraitId, item.rightTraitId);
    assert.equal(kkItem.leftTraitId, oldKk.leftTraitId);
    assert.equal(kkItem.rightTraitId, oldKk.rightTraitId);
    assert.equal(item.leftTraitId, old.leftTraitId);
    assert.equal(item.rightTraitId, old.rightTraitId);
    // Every pair was actually replaced (no paraphrase passthrough, no gaps).
    assert.notEqual(v3ru.items75Texts[item.id].left, v1ru.items75Texts[item.id].left);
    assert.notEqual(v3ru.items75Texts[item.id].right, v1ru.items75Texts[item.id].right);
    assert.notEqual(v3kk.items75Texts[item.id].left, v1kk.items75Texts[item.id].left);
    assert.notEqual(v3kk.items75Texts[item.id].right, v1kk.items75Texts[item.id].right);
    assert.notEqual(v3kk.items75Texts[item.id].left, v3ru.items75Texts[item.id].left);
    assert.ok(v3ru.items75Texts[item.id].left.length > 0 && v3ru.items75Texts[item.id].right.length > 0);
    assert.ok(v3kk.items75Texts[item.id].left.length > 0 && v3kk.items75Texts[item.id].right.length > 0);
  }
});

test("runtime registry executes the current and the legacy published versions", () => {
  assert.equal(executableAssessmentVersionReason({
    productId: "t-skills",
    version: T_SKILLS_TEEN_V4_VERSION_IDS.assessment,
    scoringVersion: T_SKILLS_TEEN_V4_VERSION_IDS.scoring,
    contentVersion: T_SKILLS_TEEN_V4_VERSION_IDS.itemBank,
    careerModelVersion: T_SKILLS_TEEN_V4_VERSION_IDS.careerMatching,
    reportVersion: T_SKILLS_TEEN_V4_VERSION_IDS.report,
    adaptiveVersion: T_SKILLS_TEEN_V4_VERSION_IDS.adaptive,
    itemCount: 100,
  }), null);
  assert.equal(executableAssessmentVersionReason({
    productId: "t-skills",
    version: T_SKILLS_TEEN_V3_VERSION_IDS.assessment,
    scoringVersion: T_SKILLS_TEEN_V3_VERSION_IDS.scoring,
    contentVersion: T_SKILLS_TEEN_V3_VERSION_IDS.itemBank,
    careerModelVersion: T_SKILLS_TEEN_V3_VERSION_IDS.careerMatching,
    reportVersion: T_SKILLS_TEEN_V3_VERSION_IDS.report,
    adaptiveVersion: T_SKILLS_TEEN_V3_VERSION_IDS.adaptive,
    itemCount: 100,
  }), null);
  assert.equal(executableAssessmentVersionReason({
    productId: "t-skills",
    version: T_SKILLS_TEEN_VERSION_IDS.assessment,
    scoringVersion: T_SKILLS_TEEN_VERSION_IDS.scoring,
    contentVersion: T_SKILLS_TEEN_VERSION_IDS.itemBank,
    careerModelVersion: T_SKILLS_TEEN_VERSION_IDS.careerMatching,
    reportVersion: T_SKILLS_TEEN_VERSION_IDS.report,
    adaptiveVersion: T_SKILLS_TEEN_VERSION_IDS.adaptive,
    itemCount: 100,
  }), null);
  assert.equal(executableAssessmentVersionReason({
    productId: "t-skills",
    version: T_SKILLS_TEEN_V1_FIX_VERSION_IDS.assessment,
    scoringVersion: T_SKILLS_TEEN_V1_FIX_VERSION_IDS.scoring,
    contentVersion: T_SKILLS_TEEN_V1_FIX_VERSION_IDS.itemBank,
    careerModelVersion: T_SKILLS_TEEN_V1_FIX_VERSION_IDS.careerMatching,
    reportVersion: T_SKILLS_TEEN_V1_FIX_VERSION_IDS.report,
    adaptiveVersion: T_SKILLS_TEEN_V1_FIX_VERSION_IDS.adaptive,
    itemCount: 100,
  }), "ASSESSMENT_RUNTIME_VERSION_INTERNAL_ONLY");
  assert.equal(executableAssessmentVersionReason({
    productId: "t-skills",
    version: T_SKILLS_TEEN_V1_VERSION_IDS.assessment,
    scoringVersion: T_SKILLS_TEEN_V1_VERSION_IDS.scoring,
    contentVersion: T_SKILLS_TEEN_V1_VERSION_IDS.itemBank,
    careerModelVersion: T_SKILLS_TEEN_V1_VERSION_IDS.careerMatching,
    reportVersion: T_SKILLS_TEEN_V1_VERSION_IDS.report,
    adaptiveVersion: T_SKILLS_TEEN_V1_VERSION_IDS.adaptive,
    itemCount: 100,
  }), null);
  assert.equal(executableAssessmentVersionReason({
    productId: "t-skills",
    version: T_SKILLS_TEEN_V4_VERSION_IDS.assessment,
    scoringVersion: T_SKILLS_VERSION_IDS.scoring,
    contentVersion: T_SKILLS_TEEN_V4_VERSION_IDS.itemBank,
    careerModelVersion: T_SKILLS_TEEN_V4_VERSION_IDS.careerMatching,
    reportVersion: T_SKILLS_TEEN_V4_VERSION_IDS.report,
    adaptiveVersion: T_SKILLS_TEEN_V4_VERSION_IDS.adaptive,
    itemCount: 100,
  }), "ASSESSMENT_RUNTIME_SCORER_UNREGISTERED");
  assert.equal(careerRuntimeForAssessmentVersion(T_SKILLS_TEEN_V4_VERSION_IDS.assessment), "built-in:t-skills-teen-career-v1");
  assert.equal(careerRuntimeForAssessmentVersion(T_SKILLS_TEEN_V3_VERSION_IDS.assessment), "built-in:t-skills-teen-career-v1");
  assert.equal(careerRuntimeForAssessmentVersion(T_SKILLS_TEEN_VERSION_IDS.assessment), "built-in:t-skills-teen-career-v1");
  assert.equal(careerRuntimeForAssessmentVersion(T_SKILLS_VERSION_IDS.assessment), "built-in:t-skills-career-v1");
});
