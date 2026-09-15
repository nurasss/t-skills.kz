import { getApprovedCombination } from "@/lib/interpretation-library";
import type { TraitCode } from "@/lib/item-bank";
import type { ReportJSON, ScoreProfile } from "@/lib/assessment-engine";

const TRAIT_FIELDS = ["contribution", "manifestations", "bestConditions", "overuseRisk", "developmentActions"] as const;
const COACHING_KEYS = new Set([
  "coaching:summary",
  "coaching:teamwork",
  "coaching:thinking",
  "coaching:execution",
  "coaching:influence",
  "coaching:collaboration",
  "coaching:self-management",
  "coaching:communication",
  "coaching:decision",
  "coaching:stress",
  "coaching:environments",
  "coaching:development-30-days",
  "coaching:uncertainty",
  "coaching:unsupported-combination",
]);

const FORBIDDEN_NARRATIVE_PATTERNS = [
  /percentile/i,
  /процентил/i,
  /\b(?:iq|клиническ|диагноз|расстройств|лечен|найм|увольн|гарантированн)/i,
  /(?:ignore|disregard|override|reveal|system prompt|developer message)/i,
  /(?:игнорируй|игнорировать|обойди|системн(?:ый|ое) промпт|инструкц(?:ию|ии) разработчика)/i,
  /<\/?script\b/i,
];
const FORBIDDEN_REPORT_KEYS = new Set([
  "score",
  "scoreJson",
  "theta",
  "rank",
  "profileIndex",
  "normStatus",
  "percentile",
  "uncertaintyRange",
  "ci95",
]);

function topTraitKeys(code: TraitCode) {
  return TRAIT_FIELDS.map((field) => `trait:${code}:${field}`);
}

function combinationKey(left: TraitCode | undefined, right: TraitCode | undefined) {
  if (!left || !right || !getApprovedCombination(left, right)) return "coaching:unsupported-combination";
  return `pair:${left}+${right}`;
}

export function buildReportSourceKeys(profile: ScoreProfile): ReportJSON["sourceKeys"] {
  const top = profile.traits.slice(0, 5);
  return {
    executiveSummary: ["coaching:summary", ...top.slice(0, 3).map((trait) => `trait:${trait.code}:definition`)],
    topStrengths: top.map((trait) => ({ trait: trait.code, keys: topTraitKeys(trait.code) })),
    combinations: [
      combinationKey(top[0]?.code, top[1]?.code),
      combinationKey(top[2]?.code, top[3]?.code),
      combinationKey(top[4]?.code, top[0]?.code),
    ],
    teamwork: ["coaching:teamwork"],
    thinkingStyle: ["coaching:thinking"],
    executionStyle: ["coaching:execution"],
    influenceStyle: ["coaching:influence"],
    collaborationStyle: ["coaching:collaboration"],
    selfManagementStyle: ["coaching:self-management"],
    communicationStyle: ["coaching:communication"],
    decisionStyle: ["coaching:decision"],
    stressAndBlindSpots: ["coaching:stress"],
    workEnvironments: ["coaching:environments"],
    development30Days: ["coaching:development-30-days"],
    confidenceNote: ["coaching:uncertainty"],
  };
}

function isAllowedSourceKey(key: unknown) {
  if (typeof key !== "string" || key.length > 120) return false;
  if (COACHING_KEYS.has(key)) return true;
  if (/^trait:[A-Z0-9_]+:(?:definition|contribution|manifestations|bestConditions|overuseRisk|developmentActions)$/.test(key)) return true;
  if (/^pair:[A-Z0-9_]+\+[A-Z0-9_]+$/.test(key)) return true;
  return false;
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function everyNarrativeString(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(everyNarrativeString);
  if (value && typeof value === "object") return Object.values(value).flatMap(everyNarrativeString);
  return [];
}

function hasForbiddenKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKeys);
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_REPORT_KEYS.has(key)) return true;
    if (hasForbiddenKeys(child)) return true;
  }
  return false;
}

export function validateReportSourceKeys(report: ReportJSON, profile: ScoreProfile) {
  const expected = buildReportSourceKeys(profile);
  if (!report.sourceKeys || typeof report.sourceKeys !== "object") return false;
  const sections = report.sourceKeys as Record<string, unknown>;
  for (const value of Object.values(sections)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (entry && typeof entry === "object" && "keys" in entry) {
          const keys = (entry as { keys?: unknown }).keys;
          if (!Array.isArray(keys) || !keys.every(isAllowedSourceKey)) return false;
        } else if (!isAllowedSourceKey(entry)) {
          return false;
        }
      }
    } else return false;
  }
  return sameJson(report.sourceKeys, expected);
}

export function validateReportSafety(report: ReportJSON, profile: ScoreProfile) {
  if (!validateReportSourceKeys(report, profile)) return false;
  if (hasForbiddenKeys(report)) return false;
  return everyNarrativeString(report).every((text) => !FORBIDDEN_NARRATIVE_PATTERNS.some((pattern) => pattern.test(text)));
}

export function validateReportShape(value: unknown): value is ReportJSON {
  return Boolean(value && typeof value === "object" && "sourceKeys" in value);
}
