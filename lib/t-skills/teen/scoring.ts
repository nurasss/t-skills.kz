/**
 * Teen scoring v1: этап 1 (парные сравнения), неоднозначность, этап 2 (коррекция ×2).
 *
 * Допущения (зафиксированы, ждут методолога):
 * A1. Ответ a ∈ {−2..2} на паре (L,R) даёт +a левому и −a правому трейту.
 *     Это сохраняет нулевую сумму (ипсативность) после этапа 1.
 * A2. Разброс = стандартное отклонение 6 вкладов; неоднозначность = std / max(|sum|, 0.5).
 */
import {
  TEEN_STAGE2_CORRECTION_WEIGHT,
  TEEN_STAGE2_FRACTION,
  TEEN_STAGE2_MAX,
  TEEN_STAGE2_MIN,
  TEEN_TRAIT_IDS,
  type TeenPairwiseItem,
  type TeenStage1Totals,
  type TeenTraitId,
} from "@/lib/t-skills/teen/taxonomy";

export type TeenContributions = Record<TeenTraitId, number[]>;

export function emptyTotals(): TeenStage1Totals {
  return Object.fromEntries(TEEN_TRAIT_IDS.map((id) => [id, 0])) as TeenStage1Totals;
}

function scoreTeenStage1WithConvention(
  items: readonly TeenPairwiseItem[],
  answers: Record<string, number>,
  legacyV1: boolean,
): { totals: TeenStage1Totals; contributions: TeenContributions } {
  const totals = emptyTotals();
  const contributions = Object.fromEntries(TEEN_TRAIT_IDS.map((id) => [id, [] as number[]])) as TeenContributions;
  for (const item of items) {
    const answer = answers[item.id];
    if (typeof answer !== "number" || !Number.isFinite(answer)) continue;
    const a = Math.max(-2, Math.min(2, Math.round(answer)));
    // UI contract: -2 means "strongly left", +2 means "strongly right".
    // V1 accidentally applied the sign in the opposite direction; preserve
    // that behavior only when replaying a frozen v1 session.
    const leftContribution = legacyV1 ? a : -a;
    const rightContribution = -leftContribution;
    totals[item.leftTraitId] += leftContribution;
    totals[item.rightTraitId] += rightContribution;
    contributions[item.leftTraitId].push(leftContribution);
    contributions[item.rightTraitId].push(rightContribution);
  }
  return { totals, contributions };
}

/** Current scorer follows the assessment UI's left/right response labels. */
export function scoreTeenStage1(
  items: readonly TeenPairwiseItem[],
  answers: Record<string, number>,
) {
  return scoreTeenStage1WithConvention(items, answers, false);
}

/** Historical scorer retained only for already-created t-skills-teen-v1 sessions. */
export function scoreTeenStage1V1(
  items: readonly TeenPairwiseItem[],
  answers: Record<string, number>,
) {
  return scoreTeenStage1WithConvention(items, answers, true);
}

function std(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
}

/** Неоднозначность трейта: разброс вкладов / насколько итог далёк от нуля. */
export function teenAmbiguity(contributions: readonly number[], total: number): number {
  return std(contributions) / Math.max(Math.abs(total), 0.5);
}

/**
 * Отбор этапа 2: топ-30% по неоднозначности, не меньше 5 и не больше 15.
 * Тай-брейк — идентификатором (детерминированно).
 */
export function selectTeenStage2(
  totals: TeenStage1Totals,
  contributions: TeenContributions,
): TeenTraitId[] {
  const ranked = TEEN_TRAIT_IDS.map((id) => ({ id, ambiguity: teenAmbiguity(contributions[id] ?? [], totals[id] ?? 0) }))
    .sort((a, b) => b.ambiguity - a.ambiguity || (a.id < b.id ? -1 : 1));
  const count = Math.min(
    TEEN_STAGE2_MAX,
    Math.max(TEEN_STAGE2_MIN, Math.round(TEEN_TRAIT_IDS.length * TEEN_STAGE2_FRACTION)),
  );
  return ranked.slice(0, count).map((entry) => entry.id);
}

/** Этап 2: ответ v ∈ {−2,−1,+1,+2} добавляется как точечная коррекция ×2. */
export function applyTeenStage2Correction(
  totals: TeenStage1Totals,
  traitId: TeenTraitId,
  value: number,
): TeenStage1Totals {
  const allowed = new Set([-2, -1, 1, 2]);
  if (!allowed.has(value)) throw new Error(`TEEN_STAGE2_VALUE:${value}`);
  return { ...totals, [traitId]: totals[traitId] + TEEN_STAGE2_CORRECTION_WEIGHT * value };
}

/** Нормализация сырого балла в −1..1 (максимум этапа 1: 6 появлений × 2). */
export function normalizeTeenTotal(total: number): number {
  return Math.max(-1, Math.min(1, total / 12));
}
