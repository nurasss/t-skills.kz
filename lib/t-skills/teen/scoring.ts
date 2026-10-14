/**
 * Teen scoring: этап 1 (парные сравнения), неоднозначность, этап 2 (коррекция).
 *
 * Допущения (зафиксированы, ждут методолога):
 * A1. Ответ a ∈ {−2..2} на паре (L,R): −2 — «точно левое», +2 — «точно правое».
 *     Левый трейт получает −a, правый +a (teen-scoring-v2/v3; v1 применял
 *     обратный знак и сохранён только для замороженных сессий).
 *     Сумма по трейтам остаётся нулевой (ипсативность).
 * A2. Разброс = стандартное отклонение 6 вкладов; неоднозначность = std / max(|sum|, 0.5).
 * A3 (v3). Итог этапа 1 — гребневая МНК-оценка по графу сравнений
 *     (L + λI)θ = суммы, масштабированная к RMS сырых сумм; ситуативная
 *     коррекция ×1. Обоснование и симуляция — TEEN_SCORING_V3_REPORT.md.
 */
import {
  TEEN_GRAPH_RIDGE,
  TEEN_STAGE2_CORRECTION_WEIGHT,
  TEEN_STAGE2_CORRECTION_WEIGHT_V3,
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

/** Этап 2: ответ v ∈ {−2,−1,+1,+2} добавляется как точечная коррекция (×2 до v3, ×1 в v3). */
export function applyTeenStage2Correction(
  totals: TeenStage1Totals,
  traitId: TeenTraitId,
  value: number,
  weight: number = TEEN_STAGE2_CORRECTION_WEIGHT,
): TeenStage1Totals {
  const allowed = new Set([-2, -1, 1, 2]);
  if (!allowed.has(value)) throw new Error(`TEEN_STAGE2_VALUE:${value}`);
  return { ...totals, [traitId]: totals[traitId] + weight * value };
}

export const TEEN_SCORING_V3 = "teen-scoring-v3" as const;

/**
 * Гребневая МНК-оценка трейтов по графу парных сравнений.
 *
 * Сумма баллов не учитывает, с каким соперником трейт сравнивался: победа над
 * сильным трейтом и над слабым весят одинаково. Решение (L + λI)θ = b, где
 * L — лапласиан графа пар, b — суммы этапа 1, учитывает соперников. Результат
 * масштабируется к RMS исходных сумм, чтобы шкала (≈ −12..12), нормализация
 * и вес ситуативных вопросов остались сопоставимыми. Детерминированно.
 */
export function estimateTeenTraitsGraph(
  items: readonly TeenPairwiseItem[],
  totals: TeenStage1Totals,
  ridge = TEEN_GRAPH_RIDGE,
): TeenStage1Totals {
  const ids = TEEN_TRAIT_IDS;
  const n = ids.length;
  const index = new Map<TeenTraitId, number>(ids.map((id, i) => [id, i]));
  const matrix = ids.map((_, row) => ids.map((__, col) => (row === col ? ridge : 0)).concat(totals[ids[row]] ?? 0));
  for (const item of items) {
    const a = index.get(item.leftTraitId)!;
    const b = index.get(item.rightTraitId)!;
    matrix[a][a] += 1;
    matrix[b][b] += 1;
    matrix[a][b] -= 1;
    matrix[b][a] -= 1;
  }
  // Symmetric positive definite (ridge > 0): Gaussian elimination without pivoting is stable.
  for (let col = 0; col < n; col += 1) {
    for (let row = col + 1; row < n; row += 1) {
      const factor = matrix[row][col] / matrix[col][col];
      if (factor === 0) continue;
      for (let k = col; k <= n; k += 1) matrix[row][k] -= factor * matrix[col][k];
    }
  }
  const theta = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    let sum = matrix[row][n];
    for (let k = row + 1; k < n; k += 1) sum -= matrix[row][k] * theta[k];
    theta[row] = sum / matrix[row][row];
  }
  const rms = (values: readonly number[]) => Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);
  const targetRms = rms(ids.map((id) => totals[id] ?? 0));
  const thetaRms = rms(theta);
  const scale = thetaRms > 1e-12 ? targetRms / thetaRms : 0;
  // Rounded so the server, the browser and stored snapshots agree exactly.
  return Object.fromEntries(ids.map((id, i) => [id, Math.round(theta[i] * scale * 1e6) / 1e6])) as TeenStage1Totals;
}

/**
 * Итоговые баллы трейтов по версии подсчёта: этап 1 + ситуативные коррекции.
 * stage2 — пары (трейт, значение −2/−1/+1/+2) в порядке выдачи вопросов.
 */
export function teenTotalsForScoringVersion(
  scoringVersion: string,
  items: readonly TeenPairwiseItem[],
  answers: Record<string, number>,
  stage2: readonly { traitId: TeenTraitId; value: number }[],
): TeenStage1Totals {
  const legacyV1 = scoringVersion === "teen-scoring-v1";
  const v3 = scoringVersion === TEEN_SCORING_V3;
  const stage1 = legacyV1 ? scoreTeenStage1V1(items, answers) : scoreTeenStage1(items, answers);
  let totals = v3 ? estimateTeenTraitsGraph(items, stage1.totals) : stage1.totals;
  for (const { traitId, value } of stage2) {
    totals = applyTeenStage2Correction(totals, traitId, value, v3 ? TEEN_STAGE2_CORRECTION_WEIGHT_V3 : TEEN_STAGE2_CORRECTION_WEIGHT);
  }
  return totals;
}

/**
 * Порядок трейтов. Без tieBreak — прежний контракт (нормализованный балл ↓,
 * затем id), чтобы отчёты v1–v4 не менялись. С tieBreak (v3): нормализованный
 * балл ↓, точный итог ↓, сырая сумма этапа 1 ↓, затем id.
 */
export function rankTeenTraitIds(totals: TeenStage1Totals, tieBreak?: TeenStage1Totals): TeenTraitId[] {
  return (Object.keys(totals) as TeenTraitId[]).sort((a, b) =>
    normalizeTeenTotal(totals[b]) - normalizeTeenTotal(totals[a])
    || (tieBreak ? totals[b] - totals[a] || (tieBreak[b] ?? 0) - (tieBreak[a] ?? 0) : 0)
    || (a < b ? -1 : 1));
}

/** Нормализация сырого балла в −1..1 (максимум этапа 1: 6 появлений × 2). */
export function normalizeTeenTotal(total: number): number {
  return Math.max(-1, Math.min(1, total / 12));
}
