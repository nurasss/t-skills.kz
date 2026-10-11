import assert from "node:assert/strict";
import test from "node:test";

import {
  CAREER_FIT_LEVELS,
  CAREER_FIT_MODEL_VERSION,
  careerFitLevel,
} from "@/lib/career-fit";

test("fit model is versioned and exposes four ordered thresholds", () => {
  assert.equal(CAREER_FIT_MODEL_VERSION, "career-fit-levels-v1");
  assert.equal(CAREER_FIT_LEVELS.length, 4);
  assert.deepEqual(
    CAREER_FIT_LEVELS.map((entry) => entry.level),
    ["strong", "good", "moderate", "additional"],
  );
  assert.deepEqual(
    CAREER_FIT_LEVELS.map((entry) => entry.min),
    [0.8, 0.65, 0.5, Number.NEGATIVE_INFINITY],
  );
});

test("boundary scores map to the higher fit category", () => {
  assert.equal(careerFitLevel(0.8).level, "strong");
  assert.equal(careerFitLevel(0.65).level, "good");
  assert.equal(careerFitLevel(0.5).level, "moderate");
  assert.equal(careerFitLevel(0.49).level, "additional");
  assert.equal(careerFitLevel(0.7999).level, "good");
  assert.equal(careerFitLevel(0.6499).level, "moderate");
  assert.equal(careerFitLevel(1).level, "strong");
  assert.equal(careerFitLevel(0).level, "additional");
});

test("invalid and out-of-range scores are clamped to a category", () => {
  assert.equal(careerFitLevel(Number.NaN).level, "additional");
  assert.equal(careerFitLevel(Number.POSITIVE_INFINITY).level, "strong");
  assert.equal(careerFitLevel(Number.NEGATIVE_INFINITY).level, "additional");
  assert.equal(careerFitLevel(2).level, "strong");
  assert.equal(careerFitLevel(-0.5).level, "additional");
});

test("every level has non-empty RU and KK labels", () => {
  for (const entry of CAREER_FIT_LEVELS) {
    assert.equal(typeof entry.labelRu, "string");
    assert.equal(typeof entry.labelKk, "string");
    assert.ok(entry.labelRu.trim().length > 0, entry.level);
    assert.ok(entry.labelKk.trim().length > 0, entry.level);
  }
  assert.deepEqual(careerFitLevel(0.9), {
    level: "strong",
    labelRu: "Сильное соответствие",
    labelKk: "Жоғары сәйкестік",
  });
  assert.deepEqual(careerFitLevel(0.7), {
    level: "good",
    labelRu: "Хорошее соответствие",
    labelKk: "Жақсы сәйкестік",
  });
  assert.deepEqual(careerFitLevel(0.55), {
    level: "moderate",
    labelRu: "Умеренное соответствие",
    labelKk: "Орташа сәйкестік",
  });
  assert.deepEqual(careerFitLevel(0.2), {
    level: "additional",
    labelRu: "Дополнительное направление",
    labelKk: "Қосымша бағыт",
  });
});
