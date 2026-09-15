import { ITEM_BANK, TRAITS, type Item, type TraitCode } from "@/lib/item-bank";

export const VERSION_IDS = {
  assessment: "orbita30_ru_v1",
  itemBank: "draft-pilot-v1",
  scoring: "mvp-0.3",
  norms: "within-sample-preview",
  selector: "selector-0.2",
  report: "report-0.2",
} as const;

export type ResponseMap = Record<string, number>;

export type ScoreTrait = {
  code: TraitCode;
  name: string;
  definition: string;
  overuseRisk: string;
  theta: number;
  se: number;
  standardScore: number;
  percentile: number;
  rank: number;
  ci95: [number, number];
  exposure: number;
  contradiction: number;
};

export type ScoreProfile = {
  versions: typeof VERSION_IDS;
  traits: ScoreTrait[];
  domains: Array<{
    code: string;
    name: string;
    score: number;
    percentile: number;
  }>;
  rankClusters: number[][];
  responseQuality: {
    rqi: number;
    flags: string[];
  };
  answered: number;
  coreAnswered: number;
  adaptiveAnswered: number;
};

export type AdaptiveSelection = {
  selectedItemIds: string[];
  reasonCodes: Record<string, string[]>;
  targetCount: number;
  mode: "deterministic-fallback" | "ai-openai";
  validation: "passed";
};

export type ReportJSON = {
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
  decisionStyle: string;
  workEnvironments: string[];
  development30Days: string[];
  confidenceNote: string;
};

const traitCodes = TRAITS.map((trait) => trait.code) as TraitCode[];
const traitByCode = new Map(TRAITS.map((trait) => [trait.code, trait]));

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

function percentileFor(theta: number) {
  return Math.round(clamp(100 / (1 + Math.exp(-theta * 2.25)), 1, 99));
}

function standardScoreFor(theta: number) {
  return Math.round(clamp(50 + theta * 34, 1, 99));
}

function qualityFlags(responses: ResponseMap, likertResponses: number[], responseTimes: Record<string, number>) {
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
    const dominant = rounded.filter((value) => value === rounded[0]).length / rounded.length;
    if (dominant > 0.8) flags.push("STRAIGHT_LINING");
  }

  const timedResponses = Object.entries(responseTimes)
    .filter(([itemId, value]) => ITEM_BANK.some((item) => item.id === itemId) && Number.isFinite(value) && value >= 0)
    .map(([, value]) => value);
  if (timedResponses.length >= 20 && timedResponses.filter((value) => value < 650).length / timedResponses.length >= 0.8) {
    flags.push("TOO_FAST");
  }

  return flags;
}

export function scoreAssessment(responses: ResponseMap, responseTimes: Record<string, number> = {}): ScoreProfile {
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
      percentile: percentileFor(finalTheta),
      rank: 0,
      ci95: [clamp(standardScore - interval, 1, 99), clamp(standardScore + interval, 1, 99)] as [
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
    return { code, name, score, percentile: percentileFor((score - 50) / 34) };
  });

  const flags = qualityFlags(responses, likertResponses, responseTimes);
  if (traitScores.some((trait) => trait.contradiction >= 0.9)) flags.push("CONTRADICTION");
  const rqi = round(clamp(0.98 - flags.length * 0.08, 0.45, 0.98), 2);
  const answered = Object.keys(responses).filter((id) => ITEM_BANK.some((item) => item.id === id)).length;
  const coreAnswered = Object.keys(responses).filter((id) => /^Q(?:00[1-9]|0[1-9]\d|1[0-9]\d|2[0-4]\d|250)$/.test(id)).length;

  return {
    versions: VERSION_IDS,
    traits: orderedTraits,
    domains,
    rankClusters,
    responseQuality: { rqi, flags },
    answered,
    coreAnswered,
    adaptiveAnswered: Math.max(0, answered - coreAnswered),
  };
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

export function validateAdaptiveSelection(
  ids: string[],
  answeredItemIds: string[] = [],
  maxPerTrait = 3,
  semanticClusters: Record<string, string> = {},
) {
  const adaptiveItems = new Map<string, Item>();
  for (const item of ITEM_BANK) {
    if (item.type === "adaptive_likert" || item.type === "adaptive_forced") adaptiveItems.set(item.id, item);
  }
  if (ids.length < 10 || ids.length > 15) return false;
  if (new Set(ids).size !== ids.length) return false;
  if (ids.some((id) => !adaptiveItems.has(id) || answeredItemIds.includes(id))) return false;
  const clusters = ids.map((id) => semanticClusters[id]).filter(Boolean);
  if (new Set(clusters).size !== clusters.length) return false;
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
    return bInformation + bPriority - (aInformation + aPriority) || a.id.localeCompare(b.id);
  });

  for (const item of rankedCandidates) {
    if (selectedItemIds.length >= targetCount) break;
    const targetTraits = targetTraitsForAdaptive(item);
    if (targetTraits.some((code) => (exposure.get(code) ?? 0) >= 3)) continue;
    selectedItemIds.push(item.id);
    for (const code of targetTraits) exposure.set(code, (exposure.get(code) ?? 0) + 1);
  }

  if (!validateAdaptiveSelection(selectedItemIds, answeredItemIds)) {
    throw new Error("Deterministic adaptive fallback failed server validation");
  }

  const reasonCodes = Object.fromEntries(
    selectedItemIds.map((id) => {
      const item = ITEM_BANK.find((candidate) => candidate.id === id)!;
      const reasons = targetTraitsForAdaptive(item).flatMap((code) => {
        const trait = profile.traits.find((candidate) => candidate.code === code);
        if (!trait) return [];
        const result: string[] = [];
        if (trait.se >= 0.3) result.push("HIGH_UNCERTAINTY");
        if (trait.rank <= 5 || (trait.rank > 5 && trait.rank <= 10)) result.push("RANK_BOUNDARY");
        if (trait.contradiction >= 0.25) result.push("CONTRADICTION");
        return result;
      });
      return [id, [...new Set(reasons.length ? reasons : ["CONTENT_BALANCE"])] as string[]];
    }),
  );

  return {
    selectedItemIds,
    reasonCodes,
    targetCount,
    mode: "deterministic-fallback",
    validation: "passed",
  };
}

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
    contribution: `Вам может быть естественно привносить в работу ${trait.definition.toLowerCase()}`,
    manifestations: [
      `Вы чаще опираетесь на «${trait.name}», когда нужно действовать в реальном контексте.`,
      `Эта сила заметнее всего там, где есть пространство для собственного способа действия.`,
    ],
    bestConditions: ["понятная цель и право выбирать способ движения", "обратная связь по результату, а не оценка личности"],
    overuseRisk: trait.overuseRisk,
    developmentActions: [
      `Перед важным решением назвать, как «${trait.name}» помогает задаче и где может замедлить её.`,
      "Попросить коллегу описать наблюдаемое поведение, а не давать общую оценку.",
    ],
  }));

  const confidenceNote =
    profile.responseQuality.flags.length > 0
      ? `Индекс качества ответа ${Math.round(profile.responseQuality.rqi * 100)}%. Внутренние флаги: ${profile.responseQuality.flags.join(", ")}. Они не обнуляют профиль, но требуют осторожной интерпретации.`
      : "Интервалы уверенности показывают диапазон измерения, а не неизменную характеристику личности. Профиль развивающий и не является диагностикой.";

  return {
    executiveSummary: `Ваш текущий профиль выделяет ${top
      .slice(0, 3)
      .map((trait) => trait.name)
      .join(", ")}. Это вероятные предпочтительные способы действия, а не оценка вашей ценности или пригодности к конкретной профессии.`,
    topStrengths,
    combinations: [
      {
        title: `${top[0]?.name ?? "Системность"} + ${top[1]?.name ?? "Действие"}`,
        text: "Сочетание масштаба и практического движения: полезно проверять большую картину небольшими шагами.",
      },
      {
        title: `${top[2]?.name ?? "Ясность"} + ${top[3]?.name ?? "Связи"}`,
        text: "Такой рисунок может помогать переводить наблюдения в понятный для других следующий шаг.",
      },
      {
        title: `${top[4]?.name ?? "Устойчивость"} + контекст`,
        text: "Пятая сильная сторона может становиться заметнее, когда задача требует одновременно результата и внимания к условиям взаимодействия.",
      },
    ],
    teamwork: {
      gives: "Команде вы, вероятно, приносите ясность в сложных местах, энергию движения и собственный способ видеть задачу.",
      needs: "Полезно получать от других прямую обратную связь, проверку слепых зон и пространство для менее естественных режимов.",
    },
    decisionStyle: "Вам может быть легче двигаться, когда решение связано с наблюдаемыми сигналами и понятным следующим шагом. В условиях неопределённости полезно заранее обозначать, что именно будет поводом пересмотреть выбор.",
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
  };
}

export function getItemById(id: string) {
  return ITEM_BANK.find((item) => item.id === id);
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
