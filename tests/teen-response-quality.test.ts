import assert from "node:assert/strict";
import test from "node:test";

import { pairwiseScoreToProfile } from "@/lib/t-skills/profile-adapter";
import { scorePairwiseV1 } from "@/lib/t-skills/scoring";
import type { PairwiseAnswerMap } from "@/lib/t-skills/contracts";
import { T_SKILLS_PAIRWISE_BANK_V1, T_SKILLS_WORKING_TAXONOMY } from "@/lib/t-skills/content-v4";
import { T_SKILLS_ADAPTIVE_BANK_V1 } from "@/lib/t-skills/adaptive-bank-v1";
import { T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";

function rotatedAnswers(): PairwiseAnswerMap {
  const pattern = [-1, 1, 0, -2, 2, 0, 1, -1, 2, 0] as const;
  return Object.fromEntries(
    T_SKILLS_PAIRWISE_BANK_V1.map((item, index) => [item.id, pattern[index % pattern.length]]),
  ) as PairwiseAnswerMap;
}

function profileFor(
  answers: PairwiseAnswerMap,
  responseTimes: Record<string, number>,
) {
  const score = scorePairwiseV1({
    items: T_SKILLS_PAIRWISE_BANK_V1,
    traits: T_SKILLS_WORKING_TAXONOMY,
    answers,
  });
  return pairwiseScoreToProfile(score, T_SKILLS_ADAPTIVE_BANK_V1.length, {
    responseTimes,
    answers,
  });
}

function timesFor(value: number): Record<string, number> {
  return Object.fromEntries([
    ...T_SKILLS_PAIRWISE_BANK_V1.map((item) => [item.id, value]),
    ...T_SKILLS_ADAPTIVE_BANK_V1.map((question) => [question.id, value]),
  ]);
}

test("teen profile computes real response-quality metrics instead of a hardcoded perfect score", () => {
  const answers = rotatedAnswers();
  const profile = profileFor(answers, timesFor(2500));

  assert.equal(profile.versions.assessment, T_SKILLS_VERSION_IDS.assessment);
  assert.equal(profile.responseQuality.status, "pilot");
  assert.deepEqual(profile.responseQuality.flags, []);
  // Без флагов RQI — это 0.98, а не «всегда 1»: идеальное значение больше не хардкодится.
  assert.equal(profile.responseQuality.rqi, 0.98);
  assert.equal(profile.responseQuality.metrics.tooFastShare, 0);
  assert.equal(profile.responseQuality.metrics.straightLineModalFrequency, 0.3);
  assert.equal(profile.responseQuality.metrics.attentionChecks, 0);
  assert.equal(profile.responseQuality.metrics.consistencyMarkerCoverage, 0);
});

test("superhuman answer pace is flagged as TOO_FAST even below the old 80% threshold", () => {
  const answers = rotatedAnswers();
  // Ровно середина ядровых пар (34 из 67) быстрее 650 мс: старый порог 0.8 такое пропускал.
  const responseTimes = Object.fromEntries(
    T_SKILLS_PAIRWISE_BANK_V1.map((item, index) => [item.id, index % 2 === 0 ? 90 : 4000]),
  );
  const profile = profileFor(answers, responseTimes);

  assert.ok(profile.responseQuality.flags.includes("TOO_FAST"));
  assert.equal(profile.responseQuality.metrics.tooFastShare, 0.51);
  assert.equal(profile.responseQuality.rqi, 0.9);
});

test("a fully machine-driven run (median ~90ms) flags TOO_FAST", () => {
  const profile = profileFor(rotatedAnswers(), timesFor(90));
  assert.ok(profile.responseQuality.flags.includes("TOO_FAST"));
  assert.equal(profile.responseQuality.metrics.tooFastShare, 1);
});

test("straight-line answering on core pairs is detected", () => {
  const answers = Object.fromEntries(
    T_SKILLS_PAIRWISE_BANK_V1.map((item) => [item.id, 1]),
  ) as PairwiseAnswerMap;
  const profile = profileFor(answers, timesFor(2500));

  assert.ok(profile.responseQuality.flags.includes("STRAIGHT_LINING"));
  assert.equal(profile.responseQuality.metrics.straightLineModalFrequency, 1);
  assert.ok(profile.responseQuality.rqi < 0.98);
});

test("quality metrics are deterministic for identical inputs", () => {
  const answers = rotatedAnswers();
  const first = profileFor(answers, timesFor(90));
  const second = profileFor({ ...answers }, { ...timesFor(90) });
  assert.deepEqual(first.responseQuality, second.responseQuality);
});

test("quality input defaults keep the profile safe when timing data is absent", () => {
  const score = scorePairwiseV1({
    items: T_SKILLS_PAIRWISE_BANK_V1,
    traits: T_SKILLS_WORKING_TAXONOMY,
    answers: rotatedAnswers(),
  });
  const profile = pairwiseScoreToProfile(score, 0);
  assert.deepEqual(profile.responseQuality.flags, []);
  assert.equal(profile.responseQuality.metrics.tooFastShare, 0);
  assert.equal(profile.responseQuality.rqi, 0.98);
});
