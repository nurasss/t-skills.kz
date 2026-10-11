import type { ScoreProfile, ScoreTrait } from "@/lib/assessment-engine";
import type { PairwiseScore } from "@/lib/t-skills/scoring";
import { T_SKILLS_PAIRWISE_BANK_V1, T_SKILLS_WORKING_TAXONOMY } from "@/lib/t-skills/content-v4";
import { T_SKILLS_ADAPTIVE_BANK_V1 } from "@/lib/t-skills/adaptive-bank-v1";
import { T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function standardScore(normalizedScore: number) {
  return Math.round(clamp(50 + normalizedScore * 34, 1, 99));
}

function profileIndex(normalizedScore: number) {
  return Math.round(clamp(50 + normalizedScore * 49, 1, 99));
}

/** Скорость: ответ быстрее 650 мс нечитаем для пары утверждений. */
const TOO_FAST_MS = 650;
/** Минимум замеров, чтобы говорить о системной спешке. */
const TOO_FAST_MIN_SAMPLES = 20;
/**
 * Доля сверхбыстрых ответов, при которой ставится TOO_FAST. Порог 0.5
 * (= медиана < 650 мс) вместо прежних 0.8: машинный прогон с медианой
 * ~100 мс обязан попадать в флаги, человеческий — нет.
 */
const TOO_FAST_SHARE_LIMIT = 0.5;
const STRAIGHT_LINE_MIN_ANSWERS = 12;
const STRAIGHT_LINE_DOMINANT_SHARE = 0.8;

export type TeenQualityInput = {
  /** Миллисекунды на каждый отвечённый элемент (ядро TS### и адаптив TS-A##). */
  responseTimes?: Record<string, number>;
  /** Сырые ответы сессии; для выравнивания в линию учитываются только ядровые пары. */
  answers?: Record<string, number>;
};

const CORE_ITEM_IDS = new Set(T_SKILLS_PAIRWISE_BANK_V1.map((item) => item.id));
const SCORED_ITEM_IDS = new Set([...CORE_ITEM_IDS, ...T_SKILLS_ADAPTIVE_BANK_V1.map((question) => question.id)]);

function modalShare(values: number[]) {
  if (!values.length) return 0;
  const frequencies = new Map<number, number>();
  for (const value of values) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  return Math.max(...frequencies.values()) / values.length;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Реальные метрики качества для teen-парного банка: скорость и выравнивание
 * в одну линию. Attention/consistency-элементов в банке нет — метрики честно
 * нулевые, а не «всегда идеальные».
 */
export function teenResponseQuality(
  input: TeenQualityInput,
  itemSets?: { coreIds: ReadonlySet<string>; scoredIds: ReadonlySet<string> },
) {
  const coreIdSet = itemSets?.coreIds ?? CORE_ITEM_IDS;
  const scoredIdSet = itemSets?.scoredIds ?? SCORED_ITEM_IDS;
  const flags: string[] = [];

  const timedResponses = Object.entries(input.responseTimes ?? {})
    .filter(([itemId, value]) => scoredIdSet.has(itemId) && Number.isFinite(value) && value >= 0)
    .map(([, value]) => value);
  const tooFastShare = timedResponses.length
    ? timedResponses.filter((value) => value < TOO_FAST_MS).length / timedResponses.length
    : 0;
  if (timedResponses.length >= TOO_FAST_MIN_SAMPLES && tooFastShare >= TOO_FAST_SHARE_LIMIT) {
    flags.push("TOO_FAST");
  }

  const coreAnswers = Object.entries(input.answers ?? {})
    .filter(([itemId, value]) => coreIdSet.has(itemId) && Number.isFinite(value))
    .map(([, value]) => Math.round(value));
  const straightLineModalFrequency = modalShare(coreAnswers);
  if (coreAnswers.length >= STRAIGHT_LINE_MIN_ANSWERS && straightLineModalFrequency > STRAIGHT_LINE_DOMINANT_SHARE) {
    flags.push("STRAIGHT_LINING");
  }

  const rqi = round2(clamp(0.98 - flags.length * 0.08, 0.45, 0.98));
  return {
    rqi,
    flags,
    status: "pilot" as const,
    metrics: {
      attentionFailures: 0,
      attentionChecks: 0,
      implausiblePerfectionCount: 0,
      straightLineModalFrequency: round2(straightLineModalFrequency),
      tooFastShare: round2(tooFastShare),
      contradictionCount: 0,
      consistencyMarkers: {} as Record<string, number>,
      consistencyMarkerCoverage: 0,
      researchOnlyItemIds: [] as string[],
    },
  };
}

/**
 * Keeps the existing dashboard/report transport compatible while preserving
 * the new pairwise score as the authoritative source. The legacy Core60
 * scorer is never used to create this profile.
 */
export function pairwiseScoreToProfile(
  score: PairwiseScore,
  adaptiveAnswered = 0,
  quality: TeenQualityInput = {},
): ScoreProfile {
  const traits: ScoreTrait[] = score.traitResults.map((result) => {
    const definition = T_SKILLS_WORKING_TAXONOMY.find((trait) => trait.id === result.traitId);
    const normalized = clamp(result.normalizedScore, -1, 1);
    const standard = standardScore(normalized);
    const interval = Math.max(4, Math.round((0.42 - Math.min(result.exposure, 6) * 0.025) * 18));
    return {
      code: result.traitId as ScoreTrait["code"],
      name: definition?.name ?? result.traitId,
      definition: definition?.shortDescription ?? "Рабочий срез качества в новой парной шкале T-Skills.",
      overuseRisk: "Интерпретируйте этот результат вместе с конкретными ситуациями и собственными наблюдениями.",
      theta: normalized,
      se: 0.42,
      standardScore: standard,
      profileIndex: profileIndex(normalized),
      rank: result.rank,
      uncertaintyRange: [clamp(standard - interval, 1, 99), clamp(standard + interval, 1, 99)],
      exposure: result.exposure,
      contradiction: 0,
    };
  });

  return {
    versions: {
      ...T_SKILLS_VERSION_IDS,
      assessment: T_SKILLS_VERSION_IDS.assessment,
    },
    normStatus: "unvalidated",
    traits,
    domains: [],
    rankClusters: traits.map((trait) => [trait.rank]),
    responseQuality: teenResponseQuality(quality),
    answered: score.traitResults.reduce((total, result) => total + result.exposure, 0) / 2 + adaptiveAnswered,
    coreAnswered: score.traitResults.reduce((total, result) => total + result.exposure, 0) / 2,
    adaptiveAnswered,
  };
}
