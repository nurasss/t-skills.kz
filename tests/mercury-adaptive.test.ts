import assert from "node:assert/strict";
import test from "node:test";

import { buildAdaptiveContext, buildV2DemoResponses, scoreCore60 } from "@/lib/orbita-v2-engine";
import {
  adaptiveCountForContext,
  MercuryAdaptiveProvider,
  validateGeneratedAdaptiveQuestions,
} from "@/lib/mercury-adaptive-provider";

const context = buildAdaptiveContext(scoreCore60(buildV2DemoResponses()), Object.keys(buildV2DemoResponses()));

function validQuestions(count: number) {
  const pairs = [
    ["T01", "T02"], ["T03", "T04"], ["T05", "T06"], ["T07", "T08"], ["T09", "T10"],
    ["T11", "T12"], ["T13", "T14"], ["T15", "T16"], ["T17", "T18"], ["T19", "T20"],
    ["T21", "T22"], ["T23", "T24"], ["T25", "T26"], ["T27", "T28"], ["T29", "T30"],
  ] as const;
  return Array.from({ length: count }, (_, index) => ({
    questionId: `AI-${String(index + 1).padStart(2, "0")}`,
    format: "forced_choice",
    targetTraits: pairs[index % pairs.length],
    reasonCode: "PAIR_DISCRIMINATION",
    prompt: `В рабочем эпизоде ${index + 1} что обычно запускает ваше первое действие?`,
    options: [
      { id: "A", text: `Сначала заметить сигнал в эпизоде ${index + 1}.` },
      { id: "B", text: `Сначала выбрать направление в эпизоде ${index + 1}.` },
    ],
    semanticIntent: `discriminate ${pairs[index % pairs.length][0]} vs ${pairs[index % pairs.length][1]} in episode ${index + 1}`,
    semanticCluster: `test-cluster-${index + 1}`,
    confidence: 0.9,
  }));
}

test("Mercury validator accepts bounded 10 and 15 item sets", () => {
  assert.equal(validateGeneratedAdaptiveQuestions(validQuestions(10), context, 10).length, 10);
  assert.equal(validateGeneratedAdaptiveQuestions(validQuestions(15), context, 15).length, 15);
});

test("Mercury validator rejects count, trait, reason, format, duplicate, and safety violations", () => {
  assert.throws(() => validateGeneratedAdaptiveQuestions(validQuestions(9), context, 10), /COUNT_INVALID/);
  assert.throws(() => validateGeneratedAdaptiveQuestions(validQuestions(16), context, 16), /COUNT_INVALID/);
  const unknownTrait = validQuestions(10);
  unknownTrait[0].targetTraits = ["T99", "T02"] as never;
  assert.throws(() => validateGeneratedAdaptiveQuestions(unknownTrait, context, 10), /TRAIT_INVALID/);
  const unknownReason = validQuestions(10);
  unknownReason[0].reasonCode = "MADE_UP";
  assert.throws(() => validateGeneratedAdaptiveQuestions(unknownReason, context, 10), /REASON_INVALID/);
  const invalidFormat = validQuestions(10);
  invalidFormat[0].format = "free_text";
  assert.throws(() => validateGeneratedAdaptiveQuestions(invalidFormat, context, 10), /FORMAT_INVALID/);
  const duplicate = validQuestions(10);
  duplicate[1].prompt = duplicate[0].prompt;
  duplicate[1].options = duplicate[0].options;
  assert.throws(() => validateGeneratedAdaptiveQuestions(duplicate, context, 10), /DUPLICATE|SEMANTIC_DUPLICATE/);
  const unsafe = validQuestions(10);
  unsafe[0].prompt = "Какое медицинское решение вы принимаете в этой ситуации?";
  assert.throws(() => validateGeneratedAdaptiveQuestions(unsafe, context, 10), /SAFETY_INVALID/);
});

test("provider uses deterministic approved fallback when secret is unavailable", async () => {
  const result = await new MercuryAdaptiveProvider({ AI_ENABLED: "true", ADAPTIVE_PROVIDER: "mercury" }).generateQuestions(context);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.run.provider, "approved-fallback");
  assert.equal(result.run.fallbackReason, "secret_missing");
  assert.ok(result.questions.length >= 10 && result.questions.length <= 15);
  assert.ok(result.questions.every((question) => question.questionId.startsWith("FB-")));
  assert.equal(result.questions.length, adaptiveCountForContext(context));
});

test("provider retries malformed/failed responses twice and then falls back without raw payload logging", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: "not-json" } }] }), { status: 500, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await new MercuryAdaptiveProvider({ AI_ENABLED: "true", ADAPTIVE_PROVIDER: "mercury", INCEPTION_API_KEY: "test-key", MERCURY_MAX_RETRIES: "2" }).generateQuestions(context);
    assert.equal(calls, 2);
    assert.equal(result.fallbackUsed, true);
    assert.equal(result.run.attemptCount, 2);
    assert.equal(result.run.fallbackReason, "MERCURY_HTTP_500");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
