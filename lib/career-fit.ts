/**
 * Career fit levels v1: human-facing categories for the internal career match index.
 *
 * The matching pipeline (`matchCareers` / `matchCareersV5`) produces a composite
 * `totalScore` in the 0..1 range. That number is an internal ranking index, not a
 * probability, percentile, or success forecast — so the consumer UI must never
 * render it as a bare `%`. This module is the single versioned source of the
 * presentation thresholds; UI and PDF renderers import from here instead of
 * scattering magic numbers.
 */

export const CAREER_FIT_MODEL_VERSION = "career-fit-levels-v1";

export type CareerFitLevel = "strong" | "good" | "moderate" | "additional";

export type CareerFitInfo = {
  level: CareerFitLevel;
  labelRu: string;
  labelKk: string;
};

export type CareerFitThreshold = CareerFitInfo & {
  /** Inclusive lower bound of the totalScore range for this level. */
  min: number;
};

export const CAREER_FIT_LEVELS: readonly CareerFitThreshold[] = [
  { level: "strong", min: 0.8, labelRu: "Сильное соответствие", labelKk: "Жоғары сәйкестік" },
  { level: "good", min: 0.65, labelRu: "Хорошее соответствие", labelKk: "Жақсы сәйкестік" },
  { level: "moderate", min: 0.5, labelRu: "Умеренное соответствие", labelKk: "Орташа сәйкестік" },
  { level: "additional", min: Number.NEGATIVE_INFINITY, labelRu: "Дополнительное направление", labelKk: "Қосымша бағыт" },
];

/**
 * Map an internal career match index (0..1) to a human-facing fit category.
 * Non-finite values (NaN) fall back to the lowest category; out-of-range
 * finite values are clamped (+Infinity → strong, -Infinity → additional).
 */
export function careerFitLevel(score: number): CareerFitInfo {
  if (typeof score !== "number" || Number.isNaN(score)) {
    const fallback = CAREER_FIT_LEVELS[CAREER_FIT_LEVELS.length - 1]!;
    return { level: fallback.level, labelRu: fallback.labelRu, labelKk: fallback.labelKk };
  }
  const clamped = Math.min(1, Math.max(0, score));
  for (const threshold of CAREER_FIT_LEVELS) {
    if (clamped >= threshold.min) {
      return { level: threshold.level, labelRu: threshold.labelRu, labelKk: threshold.labelKk };
    }
  }
  const fallback = CAREER_FIT_LEVELS[CAREER_FIT_LEVELS.length - 1]!;
  return { level: fallback.level, labelRu: fallback.labelRu, labelKk: fallback.labelKk };
}
