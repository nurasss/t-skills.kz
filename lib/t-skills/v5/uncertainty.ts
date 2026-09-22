import type { BaseTraitScore, ProfessionV5, TraitUncertainty } from "@/lib/t-skills/v5/contracts";
import { T_SKILLS_V5_VERSION_IDS } from "@/lib/t-skills/v5/versions";

export const V5_UNCERTAINTY_CONFIG = {
  version: T_SKILLS_V5_VERSION_IDS.uncertainty,
  varianceWeight: 0.4,
  rankSensitivityWeight: 0.25,
  careerImpactWeight: 0.2,
  neighborClosenessWeight: 0.15,
  varianceScale: 4,
  boundaryRank: 5,
} as const;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizedDifference(left: number, right: number) {
  return clamp(1 - Math.abs(left - right) / 4);
}

function careerImpact(traitId: string, catalog: readonly ProfessionV5[]) {
  const active = catalog.filter((profession) => profession.active);
  if (!active.length) return 0;
  const values = active.map((profession) => Math.abs(profession.traitWeights[traitId] ?? 0));
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function rankSensitivity(rank: number) {
  return clamp(1 - Math.abs(rank - V5_UNCERTAINTY_CONFIG.boundaryRank) / 5);
}

export function analyzeTraitUncertainty(input: {
  base: readonly BaseTraitScore[];
  catalog?: readonly ProfessionV5[];
  config?: typeof V5_UNCERTAINTY_CONFIG;
}): TraitUncertainty[] {
  const config = input.config ?? V5_UNCERTAINTY_CONFIG;
  const ranked = [...input.base].sort((left, right) => (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER));
  return ranked.map((trait, index) => {
    const rank = trait.rank ?? index + 1;
    const neighborScores = [ranked[index - 1]?.meanScore, ranked[index + 1]?.meanScore].filter((value): value is number => typeof value === "number");
    const neighborCloseness = neighborScores.length ? neighborScores.reduce((sum, value) => sum + normalizedDifference(trait.meanScore, value), 0) / neighborScores.length : 0;
    const varianceScore = clamp(trait.variance / config.varianceScale);
    const rankScore = rankSensitivity(rank);
    const careerScore = careerImpact(trait.traitId, input.catalog ?? []);
    const uncertaintyScore = clamp(
      config.varianceWeight * varianceScore +
      config.rankSensitivityWeight * rankScore +
      config.careerImpactWeight * careerScore +
      config.neighborClosenessWeight * neighborCloseness,
    );
    return {
      traitId: trait.traitId,
      varianceScore,
      rankSensitivity: rankScore,
      careerImpact: careerScore,
      neighborCloseness,
      uncertaintyScore,
      version: config.version,
    } satisfies TraitUncertainty;
  }).sort((left, right) => right.uncertaintyScore - left.uncertaintyScore || right.varianceScore - left.varianceScore || left.traitId.localeCompare(right.traitId));
}

export function selectUncertainTraits(input: {
  uncertainty: readonly TraitUncertainty[];
  count?: number;
  minimumScore?: number;
}) {
  const count = Math.max(0, Math.min(25, Math.trunc(input.count ?? 7)));
  const minimumScore = input.minimumScore ?? 0;
  return [...input.uncertainty]
    .filter((trait) => trait.uncertaintyScore >= minimumScore)
    .sort((left, right) => right.uncertaintyScore - left.uncertaintyScore || left.traitId.localeCompare(right.traitId))
    .slice(0, count);
}
