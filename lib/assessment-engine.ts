import { ITEM_BANK, TRAITS, type Item, type TraitCode } from "@/lib/item-bank";
import {
  getApprovedCombination,
  getApprovedTraitInterpretation,
  INTERPRETATION_LIBRARY_VERSION,
} from "@/lib/interpretation-library";
import { buildReportSourceKeys } from "@/lib/report-safety";

export const VERSION_IDS = {
  assessment: "orbita30_ru_v1",
  itemBank: "draft-pilot-v1",
  scoring: "mvp-0.4-norm-safe",
  norms: "pilot-index-unvalidated-v1",
  selector: "selector-0.3",
  report: "report-0.3",
  translation: "ru-source-v1",
} as const;

export type NormStatus = "unvalidated" | "pilot" | "normed";

export interface NormProvider {
  readonly status: NormStatus;
  readonly version: string;
  profileIndexFor(theta: number): number;
}

export interface ScoringProvider {
  readonly version: string;
  score(responses: ResponseMap, responseTimes?: Record<string, number>): ScoreProfile;
}

export const UNVALIDATED_NORM_PROVIDER: NormProvider = {
  status: "unvalidated",
  version: VERSION_IDS.norms,
  // This is a bounded pilot index only. It must never be described as a
  // population percentile until a validated norm table is installed.
  profileIndexFor(theta) {
    return pilotProfileIndexFor(theta);
  },
};

export type ResponseMap = Record<string, number>;

export type ScoreTrait = {
  code: TraitCode;
  name: string;
  definition: string;
  overuseRisk: string;
  theta: number;
  se: number;
  standardScore: number;
  profileIndex: number;
  rank: number;
  uncertaintyRange: [number, number];
  exposure: number;
  contradiction: number;
};

export type ScoreProfile = {
  versions: typeof VERSION_IDS;
  normStatus: NormStatus;
  traits: ScoreTrait[];
  domains: Array<{
    code: string;
    name: string;
    score: number;
    profileIndex: number;
  }>;
  rankClusters: number[][];
  responseQuality: {
    rqi: number;
    flags: string[];
    status: "pilot";
    metrics: {
      attentionFailures: number;
      attentionChecks: number;
      implausiblePerfectionCount: number;
      straightLineModalFrequency: number;
      tooFastShare: number;
      contradictionCount: number;
      consistencyMarkers: Record<string, number>;
      consistencyMarkerCoverage: number;
      researchOnlyItemIds: string[];
    };
  };
  answered: number;
  coreAnswered: number;
  adaptiveAnswered: number;
};

export type AdaptiveSelection = {
  selectedItemIds: string[];
  reasonCodes: Record<string, AdaptiveReasonCode[]>;
  targetCount: number;
  mode: "deterministic-fallback" | "ai-openai";
  validation: "passed";
};

export const ADAPTIVE_REASON_CODES = [
  "HIGH_UNCERTAINTY",
  "TOP5_BOUNDARY",
  "TOP10_BOUNDARY",
  "CONTRADICTION",
  "UNDERCOVERAGE",
  "PAIR_DISCRIMINATION",
  "HIGH_INFORMATION",
] as const;

export type AdaptiveReasonCode = (typeof ADAPTIVE_REASON_CODES)[number];

export type ReportJSON = {
  interpretationLibraryVersion: string;
  executiveSummary: string;
  topStrengths: Array<{
    trait: TraitCode;
    contribution: string;
    manifestations: string[];
    bestConditions: string[];
    overuseRisk: string;
    developmentActions: string[];
  }>;
  combinations: Array<{ title: string; text: string }>;
  teamwork: { gives: string; needs: string };
  thinkingStyle: string;
  executionStyle: string;
  influenceStyle: string;
  collaborationStyle: string;
  selfManagementStyle: string;
  communicationStyle: string;
  decisionStyle: string;
  stressAndBlindSpots: string;
  workEnvironments: string[];
  development30Days: string[];
  confidenceNote: string;
  sourceKeys: {
    executiveSummary: string[];
    topStrengths: Array<{ trait: TraitCode; keys: string[] }>;
    combinations: string[];
    teamwork: string[];
    thinkingStyle: string[];
    executionStyle: string[];
    influenceStyle: string[];
    collaborationStyle: string[];
    selfManagementStyle: string[];
    communicationStyle: string[];
    decisionStyle: string[];
    stressAndBlindSpots: string[];
    workEnvironments: string[];
    development30Days: string[];
    confidenceNote: string[];
  };
};

const traitCodes = TRAITS.map((trait) => trait.code) as TraitCode[];
const traitByCode = new Map(TRAITS.map((trait) => [trait.code, trait]));
const itemById = new Map<string, Item>(ITEM_BANK.map((item) => [item.id, item]));

function emptyEvidence(): Record<TraitCode, number[]> {
  return Object.fromEntries(traitCodes.map((code) => [code, []])) as unknown as Record<
    TraitCode,
    number[]
  >;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function addEvidence(target: Record<TraitCode, number[]>, code: TraitCode, value: number) {
  target[code].push(value);
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pilotProfileIndexFor(theta: number) {
  return Math.round(clamp(100 / (1 + Math.exp(-theta * 2.25)), 1, 99));
}

function standardScoreFor(theta: number) {
  return Math.round(clamp(50 + theta * 34, 1, 99));
}

function modalFrequency(values: number[]) {
  if (!values.length) return 0;
  const frequencies = new Map<number, number>();
  for (const value of values) frequencies.set(value, (frequencies.get(value) ?? 0) + 1);
  return Math.max(...frequencies.values()) / values.length;
}

function qualityAssessment(responses: ResponseMap, likertResponses: number[], responseTimes: Record<string, number>) {
  const flags: string[] = [];
  const attentionItems = ITEM_BANK.filter(
    (item) => item.type === "quality" && item.qualityKind === "attention",
  );
  const attentionFailures = attentionItems.filter((item) => {
    const answer = responses[item.id];
    return typeof item.expected === "number" && answer !== item.expected;
  }).length;
  if (attentionFailures >= 2) flags.push("ATTENTION_CHECK");

  const plausibilityItems = ITEM_BANK.filter(
    (item) => item.type === "quality" && item.qualityKind === "plausibility",
  );
  const implausibleCount = plausibilityItems.filter((item) => (responses[item.id] ?? 0) >= 6).length;
  if (implausibleCount >= 2) flags.push("IMPLAUSIBLE_PERFECTION");

  if (likertResponses.length >= 12) {
    const rounded = likertResponses.map((value) => Math.round(value));
    const dominant = modalFrequency(rounded);
    if (dominant > 0.8) flags.push("STRAIGHT_LINING");
  }

  const timedResponses = Object.entries(responseTimes)
    .filter(([itemId, value]) => ITEM_BANK.some((item) => item.id === itemId) && Number.isFinite(value) && value >= 0)
    .map(([, value]) => value);
  const tooFastShare = timedResponses.length ? timedResponses.filter((value) => value < 650).length / timedResponses.length : 0;
  if (timedResponses.length >= 20 && tooFastShare >= 0.8) {
    flags.push("TOO_FAST");
  }

  const consistencyMarkers = Object.fromEntries(
    ["Q243", "Q246", "Q249", "Q250"].map((itemId) => [itemId, Math.round(((responses[itemId] ?? 4) - 1) / 6 * 100) / 100]),
  );
  const researchOnlyItemIds = ["Q243", "Q246", "Q249", "Q250"];
  const consistencyMarkerCoverage = researchOnlyItemIds.filter((itemId) => typeof responses[itemId] === "number").length / researchOnlyItemIds.length;
  return {
    flags,
    metrics: {
      attentionFailures,
      attentionChecks: attentionItems.length,
      implausiblePerfectionCount: implausibleCount,
      straightLineModalFrequency: Math.round(modalFrequency(likertResponses.map((value) => Math.round(value))) * 100) / 100,
      tooFastShare: Math.round(tooFastShare * 100) / 100,
      contradictionCount: 0,
      consistencyMarkers,
      consistencyMarkerCoverage: Math.round(consistencyMarkerCoverage * 100) / 100,
      researchOnlyItemIds,
    },
  };
}

export function scoreAssessment(responses: ResponseMap, responseTimes: Record<string, number> = {}): ScoreProfile {
  for (const [itemId, value] of Object.entries(responses)) {
    const item = itemById.get(itemId);
    if (!item) throw new Error(`INVALID_ITEM:${itemId}`);
    if (!Number.isFinite(value) || !Number.isInteger(value)) throw new Error(`INVALID_RESPONSE:${itemId}`);
    const inRange = item.type === "forced" || item.type === "adaptive_forced"
      ? value >= -2 && value <= 2
      : value >= 1 && value <= 7;
    if (!inRange) throw new Error(`INVALID_RESPONSE:${itemId}`);
  }
  const forcedEvidence = emptyEvidence();
  const likertEvidence = emptyEvidence();
  const adaptiveEvidence = emptyEvidence();
  const adaptiveExposure = emptyEvidence();
  const likertResponses: number[] = [];

  for (const item of ITEM_BANK) {
    const raw = responses[item.id];
    if (typeof raw !== "number" || Number.isNaN(raw)) continue;

    if (item.type === "forced" || item.type === "adaptive_forced") {
      const x = clamp(Math.round(raw), -2, 2);
      const leftEvidence = -x / 2;
      const rightEvidence = x / 2;
      const evidence = item.type === "forced" ? forcedEvidence : adaptiveEvidence;
      addEvidence(evidence, item.leftTrait, leftEvidence);
      addEvidence(evidence, item.rightTrait, rightEvidence);
      if (item.type === "adaptive_forced") {
        adaptiveExposure[item.leftTrait].push(1);
        adaptiveExposure[item.rightTrait].push(1);
      }
      continue;
    }

    if (item.type === "likert") {
      const value = clamp(Math.round(raw), 1, 7);
      const scored = (value - 4) / 3;
      const evidence = item.reverse ? -scored : scored;
      addEvidence(likertEvidence, item.trait, evidence);
      likertResponses.push(value);
      continue;
    }

    if (item.type === "adaptive_likert") {
      const value = clamp(Math.round(raw), 1, 7);
      addEvidence(adaptiveEvidence, item.trait, (value - 4) / 3);
      adaptiveExposure[item.trait].push(1);
      continue;
    }
  }

  const traitScores = TRAITS.map((trait) => {
    const fcMean = mean(forcedEvidence[trait.code]);
    const lkMean = mean(likertEvidence[trait.code]);
    const adaptiveMean = mean(adaptiveEvidence[trait.code]);
    const hasAdaptive = adaptiveEvidence[trait.code].length > 0;
    const baseTheta = 0.7 * fcMean + 0.3 * lkMean;
    const finalTheta = hasAdaptive ? baseTheta * 0.85 + adaptiveMean * 0.15 : baseTheta;
    const exposure =
      forcedEvidence[trait.code].length +
      likertEvidence[trait.code].length +
      adaptiveExposure[trait.code].length;
    const contradiction = Math.abs(fcMean - lkMean);
    const se = clamp(0.48 - Math.min(exposure, 15) * 0.018, 0.2, 0.48);
    const standardScore = standardScoreFor(finalTheta);
    const interval = Math.max(3, Math.round(se * 18));

    return {
      code: trait.code,
      name: trait.name,
      definition: trait.definition,
      overuseRisk: trait.overuseRisk,
      theta: round(finalTheta),
      se: round(se),
      standardScore,
      profileIndex: UNVALIDATED_NORM_PROVIDER.profileIndexFor(finalTheta),
      rank: 0,
      uncertaintyRange: [clamp(standardScore - interval, 1, 99), clamp(standardScore + interval, 1, 99)] as [
        number,
        number,
      ],
      exposure,
      contradiction: round(contradiction),
    } satisfies ScoreTrait;
  });

  const ranked = [...traitScores].sort(
    (a, b) => b.standardScore - a.standardScore || a.code.localeCompare(b.code),
  );
  const rankByCode = new Map(ranked.map((trait, index) => [trait.code, index + 1]));
  const traits = traitScores.map((trait) => ({ ...trait, rank: rankByCode.get(trait.code) ?? 30 }));
  const orderedTraits = [...traits].sort((a, b) => a.rank - b.rank);

  const rankClusters: number[][] = [];
  for (const trait of orderedTraits) {
    const previous = traits.find((candidate) => candidate.rank === trait.rank - 1);
    if (previous && Math.abs(previous.standardScore - trait.standardScore) <= 3) {
      rankClusters[rankClusters.length - 1]?.push(trait.rank);
    } else {
      rankClusters.push([trait.rank]);
    }
  }

  const domainNames = [
    ["D1", "Осмысление и анализ"],
    ["D2", "Создание и адаптация"],
    ["D3", "Исполнение и качество"],
    ["D4", "Влияние и движение"],
    ["D5", "Связи и сотрудничество"],
    ["D6", "Самоуправление и устойчивость"],
  ] as const;
  const domains = domainNames.map(([code, name], index) => {
    const members = traits.slice(index * 5, index * 5 + 5);
    const score = Math.round(mean(members.map((trait) => trait.standardScore)));
    return { code, name, score, profileIndex: UNVALIDATED_NORM_PROVIDER.profileIndexFor((score - 50) / 34) };
  });

  const quality = qualityAssessment(responses, likertResponses, responseTimes);
  const contradictionCount = traitScores.filter((trait) => trait.contradiction >= 0.9).length;
  const flags = quality.flags;
  if (contradictionCount > 0) flags.push("CONTRADICTION");
  const rqi = round(clamp(0.98 - flags.length * 0.08, 0.45, 0.98), 2);
  const answered = Object.keys(responses).filter((id) => ITEM_BANK.some((item) => item.id === id)).length;
  const coreAnswered = Object.keys(responses).filter((id) => /^Q(?:00[1-9]|0[1-9]\d|1[0-9]\d|2[0-4]\d|250)$/.test(id)).length;

  return {
    versions: VERSION_IDS,
    normStatus: UNVALIDATED_NORM_PROVIDER.status,
    traits: orderedTraits,
    domains,
    rankClusters,
    responseQuality: {
      rqi,
      flags,
      status: "pilot",
      metrics: { ...quality.metrics, contradictionCount },
    },
    answered,
    coreAnswered,
    adaptiveAnswered: Math.max(0, answered - coreAnswered),
  };
}

/** Normalize score snapshots created before the norm-safe contract. */
export function normalizeScoreProfile(value: unknown): ScoreProfile {
  const fallback = scoreAssessment({});
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const rawVersions = raw.versions && typeof raw.versions === "object" ? raw.versions as Record<string, unknown> : {};
  const traits = Array.isArray(raw.traits) ? raw.traits.map((candidate) => {
    if (!candidate || typeof candidate !== "object") return null;
    const trait = candidate as Record<string, unknown>;
    const standardScore = Number.isFinite(trait.standardScore) ? Number(trait.standardScore) : 50;
    const legacyIndex = Number.isFinite(trait.percentile) ? Number(trait.percentile) : standardScore;
    const profileIndex = Number.isFinite(trait.profileIndex) ? Number(trait.profileIndex) : legacyIndex;
    const legacyRange = Array.isArray(trait.ci95) ? trait.ci95 : [standardScore - 5, standardScore + 5];
    const uncertaintyRange = Array.isArray(trait.uncertaintyRange) ? trait.uncertaintyRange : legacyRange;
    const currentTrait = { ...trait };
    delete currentTrait.percentile;
    delete currentTrait.ci95;
    return {
      ...currentTrait,
      profileIndex,
      uncertaintyRange: [Number(uncertaintyRange[0]) || 1, Number(uncertaintyRange[1]) || 99] as [number, number],
    } as ScoreTrait;
  }).filter((trait): trait is ScoreTrait => Boolean(trait)) : fallback.traits;
  const domains = Array.isArray(raw.domains) ? raw.domains.map((candidate) => {
    if (!candidate || typeof candidate !== "object") return null;
    const domain = candidate as Record<string, unknown>;
    const score = Number.isFinite(domain.score) ? Number(domain.score) : 50;
    const currentDomain = { ...domain };
    delete currentDomain.percentile;
    return {
      ...currentDomain,
      code: String(domain.code ?? ""),
      name: String(domain.name ?? ""),
      score,
      profileIndex: Number.isFinite(domain.profileIndex) ? Number(domain.profileIndex) : Number(domain.percentile ?? score),
    };
  }).filter((domain): domain is { code: string; name: string; score: number; profileIndex: number } => Boolean(domain)) : fallback.domains;
  const rawQuality = raw.responseQuality && typeof raw.responseQuality === "object" ? raw.responseQuality as Record<string, unknown> : {};
  return {
    ...fallback,
    ...raw,
    versions: {
      ...VERSION_IDS,
      assessment: typeof rawVersions.assessment === "string" ? rawVersions.assessment : VERSION_IDS.assessment,
      itemBank: typeof rawVersions.itemBank === "string" ? rawVersions.itemBank : VERSION_IDS.itemBank,
      scoring: typeof rawVersions.scoring === "string" ? rawVersions.scoring : VERSION_IDS.scoring,
      norms: typeof rawVersions.norms === "string" ? rawVersions.norms : VERSION_IDS.norms,
      selector: VERSION_IDS.selector,
      report: VERSION_IDS.report,
      translation: VERSION_IDS.translation,
    },
    // The current release has no validated norm table. Never trust a persisted
    // or provider-supplied status to promote this release into a normed state.
    normStatus: UNVALIDATED_NORM_PROVIDER.status,
    traits,
    domains,
    responseQuality: {
      ...fallback.responseQuality,
      ...rawQuality,
      status: "pilot",
    metrics: { ...fallback.responseQuality.metrics, ...(rawQuality.metrics && typeof rawQuality.metrics === "object" ? rawQuality.metrics : {}) },
    },
  } as ScoreProfile;
}

function priorityForTrait(trait: ScoreTrait) {
  const normalizedStandardError = clamp((trait.se - 0.2) / 0.28, 0, 1);
  const top5Boundary = clamp(1 - Math.abs(trait.rank - 5) / 8, 0, 1);
  const top10Boundary = clamp(1 - Math.abs(trait.rank - 10) / 12, 0, 1);
  const boundaryProximity = Math.max(top5Boundary, top10Boundary);
  const undercoverage = clamp(1 - trait.exposure / 15, 0, 1);
  return (
    0.45 * normalizedStandardError +
    0.25 * boundaryProximity +
    0.2 * clamp(trait.contradiction, 0, 1) +
    0.1 * undercoverage
  );
}

function targetTraitsForAdaptive(item: Item): TraitCode[] {
  if (item.type === "adaptive_likert") return [item.trait];
  if (item.type === "adaptive_forced") return [item.leftTrait, item.rightTrait];
  return [];
}

function semanticClusterForItem(item: Item) {
  const targets = targetTraitsForAdaptive(item).slice().sort().join("-");
  return item.type === "adaptive_forced" ? `pair-${targets}` : `direct-${targets}`;
}

function boundaryReasonCodes(trait: ScoreTrait): AdaptiveReasonCode[] {
  const reasons: AdaptiveReasonCode[] = [];
  if (trait.se >= 0.3) reasons.push("HIGH_UNCERTAINTY");
  if (Math.abs(trait.rank - 5) <= 3) reasons.push("TOP5_BOUNDARY");
  if (Math.abs(trait.rank - 10) <= 3) reasons.push("TOP10_BOUNDARY");
  if (trait.contradiction >= 0.25) reasons.push("CONTRADICTION");
  if (trait.exposure < 12) reasons.push("UNDERCOVERAGE");
  return reasons;
}

export function validateAdaptiveSelection(
  ids: string[],
  answeredItemIds: string[] = [],
  maxPerTrait = 3,
  semanticClusters: Record<string, string> = {},
  reasonCodes: Record<string, string[]> = {},
) {
  const adaptiveItems = new Map<string, Item>();
  for (const item of ITEM_BANK) {
    if (item.type === "adaptive_likert" || item.type === "adaptive_forced") adaptiveItems.set(item.id, item);
  }
  if (ids.length < 10 || ids.length > 15) return false;
  if (new Set(ids).size !== ids.length) return false;
  if (ids.some((id) => !adaptiveItems.has(id) || answeredItemIds.includes(id))) return false;
  const clusters = ids.map((id) => semanticClusters[id] ?? semanticClusterForItem(adaptiveItems.get(id)!)).filter(Boolean);
  if (new Set(clusters).size !== clusters.length) return false;
  if (Object.keys(reasonCodes).length) {
    if (Object.keys(reasonCodes).some((id) => !ids.includes(id))) return false;
    for (const id of ids) {
      const reasons = reasonCodes[id];
      if (!Array.isArray(reasons) || reasons.length === 0 || reasons.length > 8) return false;
      if (reasons.some((reason) => !ADAPTIVE_REASON_CODES.includes(reason as AdaptiveReasonCode))) return false;
    }
  }
  const exposures = new Map<TraitCode, number>();
  for (const id of ids) {
    for (const code of targetTraitsForAdaptive(adaptiveItems.get(id)!)) {
      exposures.set(code, (exposures.get(code) ?? 0) + 1);
    }
  }
  return [...exposures.values()].every((count) => count <= maxPerTrait);
}

export function selectAdaptiveItems(
  profile: ScoreProfile,
  answeredItemIds: string[] = [],
  requestedCount = 12,
): AdaptiveSelection {
  const targetCount = clamp(Math.round(requestedCount), 10, 15);
  const priorities = new Map(profile.traits.map((trait) => [trait.code, priorityForTrait(trait)]));
  const candidates = ITEM_BANK.filter(
    (item) =>
      (item.type === "adaptive_likert" || item.type === "adaptive_forced") &&
      !answeredItemIds.includes(item.id),
  );
  const exposure = new Map<TraitCode, number>();
  const selectedItemIds: string[] = [];

  const rankedCandidates = [...candidates].sort((a, b) => {
    const aPriority = mean(targetTraitsForAdaptive(a).map((code) => priorities.get(code) ?? 0));
    const bPriority = mean(targetTraitsForAdaptive(b).map((code) => priorities.get(code) ?? 0));
    const aInformation = a.type === "adaptive_forced" ? 0.84 : 0.71;
    const bInformation = b.type === "adaptive_forced" ? 0.84 : 0.71;
    const aBoundary = targetTraitsForAdaptive(a).some((code) => {
      const trait = profile.traits.find((candidate) => candidate.code === code);
      return Boolean(trait && (Math.abs(trait.rank - 5) <= 3 || Math.abs(trait.rank - 10) <= 3) && trait.se >= 0.3);
    }) ? 0.16 : 0;
    const bBoundary = targetTraitsForAdaptive(b).some((code) => {
      const trait = profile.traits.find((candidate) => candidate.code === code);
      return Boolean(trait && (Math.abs(trait.rank - 5) <= 3 || Math.abs(trait.rank - 10) <= 3) && trait.se >= 0.3);
    }) ? 0.16 : 0;
    return bInformation + bPriority + bBoundary - (aInformation + aPriority + aBoundary) || a.id.localeCompare(b.id);
  });

  for (const item of rankedCandidates) {
    if (selectedItemIds.length >= targetCount) break;
    const targetTraits = targetTraitsForAdaptive(item);
    if (targetTraits.some((code) => (exposure.get(code) ?? 0) >= 3)) continue;
    selectedItemIds.push(item.id);
    for (const code of targetTraits) exposure.set(code, (exposure.get(code) ?? 0) + 1);
  }

  const reasonCodes = Object.fromEntries(
    selectedItemIds.map((id) => {
      const item = ITEM_BANK.find((candidate) => candidate.id === id)!;
      const reasons = targetTraitsForAdaptive(item).flatMap((code) => {
        const trait = profile.traits.find((candidate) => candidate.code === code);
        if (!trait) return [];
        const result = boundaryReasonCodes(trait);
        if (item.type === "adaptive_forced") result.push("PAIR_DISCRIMINATION");
        result.push("HIGH_INFORMATION");
        return result;
      });
      return [id, [...new Set(reasons.length ? reasons : ["HIGH_INFORMATION"])] as AdaptiveReasonCode[]];
    }),
  );

  if (!validateAdaptiveSelection(selectedItemIds, answeredItemIds, 3, {}, reasonCodes)) {
    throw new Error("Deterministic adaptive fallback failed server validation");
  }

  return {
    selectedItemIds,
    reasonCodes,
    targetCount,
    mode: "deterministic-fallback",
    validation: "passed",
  };
}

export const MVP_SCORING_PROVIDER: ScoringProvider = {
  version: VERSION_IDS.scoring,
  score: scoreAssessment,
};

export function buildDemoResponses(): ResponseMap {
  const biases: Record<TraitCode, number> = Object.fromEntries(
    traitCodes.map((code, index) => [
      code,
      [0.86, 0.74, 0.31, 0.62, 0.76, 0.47, 0.95, 0.38, 0.6, 0.22, 0.43, 0.72, 0.52, 0.88, 0.24, 0.34, 0.58, 0.66, 0.36, 0.44, 0.82, 0.55, 0.48, 0.7, 0.4, 0.3, 0.27, 0.52, 0.64, 0.79][index],
    ]),
  ) as Record<TraitCode, number>;
  const responses: ResponseMap = {};

  for (const item of ITEM_BANK) {
    const number = Number(item.id.slice(1));
    if (item.type === "forced") {
      const difference = biases[item.rightTrait] - biases[item.leftTrait];
      const jitter = ((number * 17) % 5 - 2) * 0.08;
      responses[item.id] = clamp(Math.round((difference + jitter) * 2), -2, 2);
    } else if (item.type === "likert") {
      const jitter = ((number * 11) % 3) - 1;
      responses[item.id] = clamp(4 + Math.round(biases[item.trait] * 2 + jitter * 0.35), 1, 7);
    } else if (item.type === "quality") {
      responses[item.id] =
        item.qualityKind === "attention" ? item.expected ?? 5 : item.qualityKind === "plausibility" ? 2 : 5;
    } else if (item.type === "adaptive_likert") {
      responses[item.id] = clamp(4 + Math.round(biases[item.trait] * 2), 1, 7);
    } else if (item.type === "adaptive_forced") {
      responses[item.id] = clamp(Math.round((biases[item.rightTrait] - biases[item.leftTrait]) * 2), -2, 2);
    }
  }

  return responses;
}

export function buildReport(profile: ScoreProfile): ReportJSON {
  const top = profile.traits.slice(0, 5);
  const topStrengths = top.map((trait) => ({
    trait: trait.code,
    ...getApprovedTraitInterpretation(trait.code),
  }));

  const combination = (left: ScoreTrait | undefined, right: ScoreTrait | undefined, fallbackTitle: string) => {
    if (!left || !right) return { title: fallbackTitle, text: "Связь с контекстом нужно проверить собственными наблюдениями; этот вариант не получает отдельного психометрического толкования." };
    const approved = getApprovedCombination(left.code, right.code);
    return approved
      ? { title: approved.title, text: approved.text }
      : { title: `${left.name} + ${right.name}`, text: "Эта пара не входит в текущую библиотеку утверждённых сочетаний. Проверьте в наблюдаемой ситуации, как два режима взаимодействуют с задачей; отдельное свойство из этой комбинации не выводится." };
  };

  const confidenceNote =
    profile.responseQuality.flags.length > 0
      ? `Пилотный индикатор качества ответа ${Math.round(profile.responseQuality.rqi * 100)}%. Внутренние флаги: ${profile.responseQuality.flags.join(", ")}. Они не обнуляют профиль, но требуют осторожной интерпретации.`
      : "Диапазоны неопределённости показывают текущую точность измерения, а не неизменную характеристику личности. Пилотный индекс профиля не является процентом людей и не является диагностикой.";

  const report: ReportJSON = {
    interpretationLibraryVersion: INTERPRETATION_LIBRARY_VERSION,
    executiveSummary: `Ваш текущий профиль выделяет ${top
      .slice(0, 3)
      .map((trait) => trait.name)
      .join(", ")}. Это вероятные предпочтительные способы действия, а не оценка вашей ценности или пригодности к конкретной профессии.`,
    topStrengths,
    combinations: [
      combination(top[0], top[1], "Первая связка + контекст"),
      combination(top[2], top[3], "Вторая связка + контекст"),
      combination(top[4], top[0], "Третья связка + контекст"),
    ],
    teamwork: {
      gives: "Команде вы, вероятно, приносите ясность в сложных местах, энергию движения и собственный способ видеть задачу.",
      needs: "Полезно получать от других прямую обратную связь, проверку слепых зон и пространство для менее естественных режимов.",
    },
    thinkingStyle: `В задачах на смысл и сложность вам может быть полезно опираться на ${top.slice(0, 2).map((trait) => trait.name).join(" и ")}; проверяйте выводы наблюдаемыми сигналами.`,
    executionStyle: `В движении к результату заметны ${top.slice(2, 4).map((trait) => trait.name).join(" и ") || "последовательность и фокус"}; заранее обозначайте минимальный следующий шаг.`,
    influenceStyle: `Влияние может строиться через ясное объяснение и своевременное действие. Сверяйте темп с теми, кому нужна дополнительная синхронизация.`,
    collaborationStyle: `В совместной работе полезно прямо договариваться о ролях, темпе и формате обратной связи, не превращая различия стилей в оценку человека.`,
    selfManagementStyle: `Для устойчивости наблюдайте, какие условия возвращают ясность и рабочий ритм; сильный режим не обязан быть доступным одинаково во всех контекстах.`,
    communicationStyle: `Сообщайте наблюдение, смысл и следующий шаг отдельно. Просите собеседника уточнить, что он услышал, если цена недопонимания высока.`,
    decisionStyle: "Вам может быть легче двигаться, когда решение связано с наблюдаемыми сигналами и понятным следующим шагом. В условиях неопределённости полезно заранее обозначать, что именно будет поводом пересмотреть выбор.",
    stressAndBlindSpots: "При напряжении любой естественный режим может стать чрезмерным: усложнять, ускорять, контролировать или отстраняться. Ищите конкретный сигнал overuse и заранее договаривайтесь о компенсирующей поддержке.",
    workEnvironments: [
      "Задачи с ясной целью, но несколькими допустимыми способами решения.",
      "Среды, где можно сочетать самостоятельность, обсуждение и короткие циклы обратной связи.",
      "Команды, в которых различия в стилях действия обсуждаются без языка «хорошо» и «плохо».",
    ],
    development30Days: [
      "Выбрать одну рабочую задачу и в начале записать ожидаемый результат и первый проверяемый шаг.",
      "Раз в неделю попросить обратную связь по одному наблюдаемому поведению.",
      "Отметить ситуацию, где сильная сторона помогла, и ситуацию, где её стало слишком много.",
      "Провести короткий разбор решения: что было фактом, а что предположением.",
      "Собрать один компенсирующий партнёрский ритуал для менее естественного режима.",
    ],
    confidenceNote,
    sourceKeys: buildReportSourceKeys(profile),
  };
  return report;
}

export function getItemById(id: string) {
  return itemById.get(id);
}

export function itemCountSummary() {
  return {
    total: ITEM_BANK.length,
    forced: ITEM_BANK.filter((item) => item.type === "forced").length,
    likert: ITEM_BANK.filter((item) => item.type === "likert").length,
    quality: ITEM_BANK.filter((item) => item.type === "quality").length,
    adaptiveDirect: ITEM_BANK.filter((item) => item.type === "adaptive_likert").length,
    adaptiveForced: ITEM_BANK.filter((item) => item.type === "adaptive_forced").length,
  };
}

export function traitName(code: TraitCode) {
  return traitByCode.get(code)?.name ?? code;
}
