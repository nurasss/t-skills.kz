/**
 * Этап 3b: мини-этап предпочтений «что ближе».
 *
 * Строится автоматически из топа: берём топ-5 и соседей (места 6–10),
 * генерируем 20 пар round-robin — каждая профессия топ-5 встречается
 * минимум 4 раза. Ответ двигает только выбранную профессию на
 * TEEN_PREFERENCE_BUMP (малый фиксированный шаг, порядок топа не ломает
 * кардинально, ничьи разрешает). Детерминированно.
 *
 * DECIDED-BY-AGENT: величина бампа — дефолт v1, ждёт калибровки методологом.
 */
import type { TeenCareerScore } from "@/lib/t-skills/teen/matching";

export const TEEN_STAGE3B_PAIRS = 20;
export const TEEN_STAGE3B_TOP = 5;
export const TEEN_STAGE3B_NEIGHBORS = 5;
export const TEEN_PREFERENCE_BUMP = 0.05;

export type TeenPreferencePair = {
  id: string;
  leftProfessionId: string;
  rightProfessionId: string;
};

/** 20 пар из топ-5 + 5 соседей: round-robin по кольцу из 10. */
export function buildTeenStage3bPairs(ranked: readonly TeenCareerScore[]): TeenPreferencePair[] {
  const pool = ranked.slice(0, TEEN_STAGE3B_TOP + TEEN_STAGE3B_NEIGHBORS).map((entry) => entry.professionId);
  if (pool.length < 2) return [];
  const pairs: TeenPreferencePair[] = [];
  let step = 1;
  let start = 0;
  let guard = 0;
  while (pairs.length < TEEN_STAGE3B_PAIRS && guard < TEEN_STAGE3B_PAIRS * pool.length) {
    guard += 1;
    const left = pool[start % pool.length];
    const right = pool[(start + step) % pool.length];
    start += 1;
    if (start % pool.length === 0) step += 1;
    if (left === right) continue;
    const key = [left, right].sort().join("|");
    if (pairs.some((pair) => [pair.leftProfessionId, pair.rightProfessionId].sort().join("|") === key)) continue;
    pairs.push({ id: `3b-${pairs.length + 1}`, leftProfessionId: left, rightProfessionId: right });
  }
  return pairs;
}

/** Ответ 3b: +бамп выбранной профессии. Возвращает новый массив (сортированный). */
export function applyTeenPreference(
  ranked: readonly TeenCareerScore[],
  pair: TeenPreferencePair,
  pickedProfessionId: string,
): TeenCareerScore[] {
  if (pickedProfessionId !== pair.leftProfessionId && pickedProfessionId !== pair.rightProfessionId) {
    throw new Error(`TEEN_3B_PICK:${pickedProfessionId}`);
  }
  return ranked
    .map((entry) =>
      entry.professionId === pickedProfessionId
        ? { ...entry, totalScore: entry.totalScore + TEEN_PREFERENCE_BUMP }
        : entry,
    )
    .sort((a, b) => b.totalScore - a.totalScore || (a.professionId < b.professionId ? -1 : 1));
}
