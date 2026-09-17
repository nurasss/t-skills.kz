import { TRAITS, type TraitCode } from "@/lib/item-bank";
import {
  CORE60_BANK,
  CORE60_TRAIT_CODES,
  V2_DOMAINS,
  type Core60Item,
} from "@/lib/v2-item-bank";
import {
  UNVALIDATED_NORM_PROVIDER,
  V2_VERSION_IDS,
  type ResponseMap,
  type ScoreProfile,
  type ScoreTrait,
} from "@/lib/assessment-engine";

export type V2AdaptiveQuestionForScoring = {
  questionId: string;
  format: "forced_choice" | "likert";
  targetTraits: TraitCode[];
  reverse?: boolean;
};

export type AdaptiveContext = {
  assessmentVersion: typeof V2_VERSION_IDS.assessment;
  itemBankVersion: typeof V2_VERSION_IDS.itemBank;
  scoringVersion: typeof V2_VERSION_IDS.scoring;
  adaptiveVersion: typeof V2_VERSION_IDS.adaptive;
  language: "ru";
  preliminaryTraits: Array<{
    traitId: TraitCode;
    score: number;
    uncertainty: number;
    rank: number;
    exposure: number;
    contradiction: number;
  }>;
  top5Boundary: TraitCode[];
  top10Boundary: TraitCode[];
  contradictions: TraitCode[];
  underCoveredTraits: TraitCode[];
  ambiguousTraitPairs: Array<[TraitCode, TraitCode]>;
  answeredCoreItems: string[];
};

const traitByCode = new Map(TRAITS.map((trait) => [trait.code, trait]));
const itemById = new Map(CORE60_BANK.map((item) => [item.id, item]));

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const round = (value: number, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function standardScore(theta: number) {
  return Math.round(clamp(50 + theta * 34, 1, 99));
}

function coreItem(id: string) {
  return itemById.get(id as `Q${string}`);
}

function itemResponseRange(item: Core60Item | V2AdaptiveQuestionForScoring) {
  return item.format === "forced_choice" ? [-2, 2] : [1, 7];
}

function add(target: Map<TraitCode, number[]>, trait: TraitCode, value: number) {
  const values = target.get(trait) ?? [];
  values.push(value);
  target.set(trait, values);
}

function rankTraits(traits: ScoreTrait[]) {
  const ranked = [...traits].sort((a, b) => b.standardScore - a.standardScore || a.code.localeCompare(b.code));
  const rankByCode = new Map(ranked.map((trait, index) => [trait.code, index + 1]));
  return traits.map((trait) => ({ ...trait, rank: rankByCode.get(trait.code) ?? 30 })).sort((a, b) => a.rank - b.rank);
}

function clusters(traits: ScoreTrait[]) {
  const result: number[][] = [];
  for (const trait of traits) {
    const previous = traits.find((candidate) => candidate.rank === trait.rank - 1);
    if (previous && Math.abs(previous.standardScore - trait.standardScore) <= 3) result[result.length - 1]?.push(trait.rank);
    else result.push([trait.rank]);
  }
  return result;
}

function validateResponses(
  responses: ResponseMap,
  adaptiveItems: readonly V2AdaptiveQuestionForScoring[],
) {
  const adaptiveById = new Map(adaptiveItems.map((item) => [item.questionId, item]));
  for (const [id, value] of Object.entries(responses)) {
    const item = coreItem(id) ?? adaptiveById.get(id);
    if (!item) throw new Error(`INVALID_ITEM:${id}`);
    if (!Number.isInteger(value) || !Number.isFinite(value)) throw new Error(`INVALID_RESPONSE:${id}`);
    const [min, max] = itemResponseRange(item);
    if (value < min || value > max) throw new Error(`INVALID_RESPONSE:${id}`);
  }
}

/**
 * Deterministic v2 scorer. Mercury output is deliberately absent from this
 * function's inputs except for frozen, server-validated question metadata and
 * user responses. The adaptive contribution is bounded to a small correction.
 */
export function scoreCore60(
  responses: ResponseMap,
  responseTimes: Record<string, number> = {},
  adaptiveItems: readonly V2AdaptiveQuestionForScoring[] = [],
): ScoreProfile {
  validateResponses(responses, adaptiveItems);
  const primary = new Map<TraitCode, number[]>();
  const discrimination = new Map<TraitCode, number[]>();
  const adaptive = new Map<TraitCode, number[]>();
  const exposure = new Map<TraitCode, number>();
  const likertValues: number[] = [];

  for (const item of CORE60_BANK) {
    const value = responses[item.id];
    if (typeof value !== "number") continue;
    if (item.format === "likert") {
      const scored = ((value - 4) / 3) * (item.reverse ? -1 : 1);
      add(primary, item.trait, scored);
      likertValues.push(value);
      exposure.set(item.trait, (exposure.get(item.trait) ?? 0) + 1);
    } else {
      const left = -value / 2;
      const right = value / 2;
      add(discrimination, item.targetTraits[0], left);
      add(discrimination, item.targetTraits[1], right);
      for (const trait of item.targetTraits) exposure.set(trait, (exposure.get(trait) ?? 0) + 1);
    }
  }

  const adaptiveById = new Map(adaptiveItems.map((item) => [item.questionId, item]));
  for (const [id, value] of Object.entries(responses)) {
    const item = adaptiveById.get(id);
    if (!item) continue;
    if (item.format === "forced_choice") {
      add(adaptive, item.targetTraits[0], -value / 2);
      add(adaptive, item.targetTraits[1], value / 2);
      for (const trait of item.targetTraits) exposure.set(trait, (exposure.get(trait) ?? 0) + 1);
    } else {
      add(adaptive, item.targetTraits[0], ((value - 4) / 3) * (item.reverse ? -1 : 1));
      exposure.set(item.targetTraits[0], (exposure.get(item.targetTraits[0]) ?? 0) + 1);
    }
  }

  const traitScores = CORE60_TRAIT_CODES.map((code) => {
    const primaryMean = mean(primary.get(code) ?? []);
    const discriminationMean = mean(discrimination.get(code) ?? []);
    const baseTheta = 0.5 * primaryMean + 0.5 * discriminationMean;
    const adaptiveMean = mean(adaptive.get(code) ?? []);
    // Each generated answer can only provide a bounded refinement. The cap is
    // applied after aggregation so no single answer can move a trait radically.
    const boundedCorrection = clamp(adaptiveMean * 0.12, -0.12, 0.12);
    const theta = clamp(baseTheta + boundedCorrection, -1.25, 1.25);
    const itemExposure = exposure.get(code) ?? 0;
    const contradiction = Math.abs(primaryMean - discriminationMean);
    const se = clamp(0.43 - Math.min(itemExposure, 8) * 0.025 - Math.min((adaptive.get(code) ?? []).length, 5) * 0.018, 0.22, 0.43);
    const score = standardScore(theta);
    const interval = Math.max(4, Math.round(se * 18));
    return {
      code,
      name: traitByCode.get(code)?.name ?? code,
      definition: traitByCode.get(code)?.definition ?? "",
      overuseRisk: traitByCode.get(code)?.overuseRisk ?? "",
      theta: round(theta),
      se: round(se),
      standardScore: score,
      profileIndex: UNVALIDATED_NORM_PROVIDER.profileIndexFor(theta),
      rank: 0,
      uncertaintyRange: [clamp(score - interval, 1, 99), clamp(score + interval, 1, 99)] as [number, number],
      exposure: itemExposure,
      contradiction: round(contradiction),
    } satisfies ScoreTrait;
  });
  const traits = rankTraits(traitScores);
  const domains = V2_DOMAINS.map((domain) => {
    const members = traits.filter((trait) => domain.traits.includes(trait.code));
    const score = Math.round(mean(members.map((trait) => trait.standardScore)));
    return {
      code: domain.code,
      name: domain.name,
      score,
      profileIndex: UNVALIDATED_NORM_PROVIDER.profileIndexFor((score - 50) / 34),
    };
  });
  const timed = Object.values(responseTimes).filter((value) => Number.isFinite(value) && value >= 0);
  const tooFastShare = timed.length ? timed.filter((value) => value < 650).length / timed.length : 0;
  const flags: string[] = [];
  if (tooFastShare >= 0.8 && timed.length >= 20) flags.push("TOO_FAST");
  if (likertValues.length >= 12) {
    const frequencies = new Map<number, number>();
    for (const value of likertValues) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
    const modal = Math.max(...frequencies.values()) / likertValues.length;
    if (modal > 0.8) flags.push("STRAIGHT_LINING");
  }
  const contradictionCount = traits.filter((trait) => trait.contradiction >= 0.55).length;
  if (contradictionCount) flags.push("CONTRADICTION");
  const rqi = round(clamp(0.98 - flags.length * 0.08, 0.45, 0.98), 2);
  const answeredCore = Object.keys(responses).filter((id) => Boolean(coreItem(id))).length;
  const answeredAdaptive = Object.keys(responses).filter((id) => adaptiveById.has(id)).length;
  return {
    versions: V2_VERSION_IDS,
    normStatus: "unvalidated",
    traits,
    domains,
    rankClusters: clusters(traits),
    responseQuality: {
      rqi,
      flags,
      status: "pilot",
      metrics: {
        attentionFailures: 0,
        attentionChecks: 0,
        implausiblePerfectionCount: 0,
        straightLineModalFrequency: 0,
        tooFastShare: round(tooFastShare, 2),
        contradictionCount,
        consistencyMarkers: {},
        consistencyMarkerCoverage: 0,
        researchOnlyItemIds: [],
      },
    },
    answered: answeredCore + answeredAdaptive,
    coreAnswered: answeredCore,
    adaptiveAnswered: answeredAdaptive,
  } satisfies ScoreProfile;
}

function topBoundaries(profile: ScoreProfile) {
  return {
    top5: profile.traits.filter((trait) => Math.abs(trait.rank - 5) <= 1).map((trait) => trait.code),
    top10: profile.traits.filter((trait) => Math.abs(trait.rank - 10) <= 1).map((trait) => trait.code),
  };
}

export function buildAdaptiveContext(profile: ScoreProfile, answeredCoreItems: string[]): AdaptiveContext {
  const boundaries = topBoundaries(profile);
  const ambiguousTraitPairs: Array<[TraitCode, TraitCode]> = [];
  for (let index = 0; index < profile.traits.length - 1; index += 1) {
    const left = profile.traits[index];
    const right = profile.traits[index + 1];
    if (Math.abs(left.standardScore - right.standardScore) <= 4 && (left.rank <= 10 || right.rank <= 10)) {
      ambiguousTraitPairs.push([left.code, right.code]);
    }
  }
  return {
    assessmentVersion: V2_VERSION_IDS.assessment,
    itemBankVersion: V2_VERSION_IDS.itemBank,
    scoringVersion: V2_VERSION_IDS.scoring,
    adaptiveVersion: V2_VERSION_IDS.adaptive,
    language: "ru",
    preliminaryTraits: profile.traits.map((trait) => ({
      traitId: trait.code,
      score: trait.standardScore,
      uncertainty: trait.se,
      rank: trait.rank,
      exposure: trait.exposure,
      contradiction: trait.contradiction,
    })),
    top5Boundary: boundaries.top5,
    top10Boundary: boundaries.top10,
    contradictions: profile.traits.filter((trait) => trait.contradiction >= 0.55).map((trait) => trait.code),
    underCoveredTraits: profile.traits.filter((trait) => trait.exposure < 3).map((trait) => trait.code),
    ambiguousTraitPairs,
    answeredCoreItems: [...answeredCoreItems].sort(),
  };
}

export function buildV2DemoResponses(): ResponseMap {
  const biases = CORE60_TRAIT_CODES.map((code, index) => [code, [0.86, 0.74, 0.31, 0.62, 0.76, 0.47, 0.95, 0.38, 0.6, 0.22, 0.43, 0.72, 0.52, 0.88, 0.24, 0.34, 0.58, 0.66, 0.36, 0.44, 0.82, 0.55, 0.48, 0.7, 0.4, 0.3, 0.27, 0.52, 0.64, 0.79][index]] as const);
  const bias = new Map(biases);
  const responses: ResponseMap = {};
  for (const item of CORE60_BANK) {
    if (item.format === "likert") responses[item.id] = clamp(4 + Math.round((bias.get(item.trait) ?? 0) * 2), 1, 7);
    else responses[item.id] = clamp(Math.round(((bias.get(item.targetTraits[1]) ?? 0) - (bias.get(item.targetTraits[0]) ?? 0)) * 2), -2, 2);
  }
  return responses;
}

export function core60Coverage() {
  const traitCounts = new Map<TraitCode, number>();
  for (const item of CORE60_BANK) for (const trait of item.targetTraits) traitCounts.set(trait, (traitCounts.get(trait) ?? 0) + 1);
  return {
    itemCount: CORE60_BANK.length,
    uniqueIds: new Set(CORE60_BANK.map((item) => item.id)).size,
    traits: new Set(CORE60_BANK.flatMap((item) => item.targetTraits)).size,
    domains: new Set(CORE60_BANK.map((item) => item.domain)).size,
    traitCounts,
    formats: {
      likert: CORE60_BANK.filter((item) => item.format === "likert").length,
      forcedChoice: CORE60_BANK.filter((item) => item.format === "forced_choice").length,
    },
  };
}
