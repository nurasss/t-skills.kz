import type { ScoreProfile, ScoreTrait } from "@/lib/assessment-engine";
import type { PairwiseScore } from "@/lib/t-skills/scoring";
import { T_SKILLS_WORKING_TAXONOMY } from "@/lib/t-skills/content-v4";
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

/**
 * Keeps the existing dashboard/report transport compatible while preserving
 * the new pairwise score as the authoritative source. The legacy Core60
 * scorer is never used to create this profile.
 */
export function pairwiseScoreToProfile(score: PairwiseScore, adaptiveAnswered = 0): ScoreProfile {
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
    responseQuality: {
      rqi: 1,
      flags: [],
      status: "pilot",
      metrics: {
        attentionFailures: 0,
        attentionChecks: 0,
        implausiblePerfectionCount: 0,
        straightLineModalFrequency: 0,
        tooFastShare: 0,
        contradictionCount: 0,
        consistencyMarkers: {},
        consistencyMarkerCoverage: 0,
        researchOnlyItemIds: [],
      },
    },
    answered: score.traitResults.reduce((total, result) => total + result.exposure, 0) / 2 + adaptiveAnswered,
    coreAnswered: score.traitResults.reduce((total, result) => total + result.exposure, 0) / 2,
    adaptiveAnswered,
  };
}
