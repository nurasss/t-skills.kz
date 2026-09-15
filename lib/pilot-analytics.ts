export const MIN_PILOT_SAMPLE = 200;

type D1Like = Pick<D1Database, "prepare">;

type CountRow = { count: number | string };
type StatusCountRow = { status: string; count: number | string };
type StateCountRow = { state: string; count: number | string };
type ItemAggregateRow = { item_id: string; responses: number | string; mean_response: number | string | null; mean_time_ms: number | string | null };
type RunAggregateRow = { provider: string; validation_result: string; runs: number | string; mean_latency_ms: number | string | null };
type ScoreRow = { final_score_json: string | null };
type FlagRow = { final_score_json: string | null };
type AdaptiveIdsRow = { chosen_ids_json: string };

function count(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeJson(value: string | null | undefined) {
  if (!value) return null;
  try { return JSON.parse(value) as Record<string, unknown>; } catch { return null; }
}

export function bucketStandardScore(value: number) {
  if (value < 35) return "1-34";
  if (value < 50) return "35-49";
  if (value < 65) return "50-64";
  if (value < 80) return "65-79";
  return "80-99";
}

export function aggregatePilotScores(rows: Array<{ score: number }>) {
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const key = bucketStandardScore(row.score);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([bucket, sample]) => ({ bucket, sample }));
}

export function aggregateAdaptiveExposure(rows: AdaptiveIdsRow[]) {
  const exposure = new Map<string, number>();
  for (const row of rows) {
    let ids: unknown = [];
    try { ids = JSON.parse(row.chosen_ids_json) as unknown; } catch { ids = []; }
    if (!Array.isArray(ids)) continue;
    for (const id of ids) if (typeof id === "string" && /^Q(?:25[1-9]|2[6-9]\d|300)$/.test(id)) exposure.set(id, (exposure.get(id) ?? 0) + 1);
  }
  return [...exposure.entries()].map(([itemId, exposures]) => ({ itemId, exposures })).sort((a, b) => b.exposures - a.exposures || a.itemId.localeCompare(b.itemId));
}

export async function getPilotAnalytics(database: D1Like) {
  const [sample, states, itemAggregates, adaptiveRuns, scores, flags, adaptiveIds, pdfStatuses] = await Promise.all([
    database.prepare(`SELECT COUNT(*) AS count FROM assessments WHERE state = 'COMPLETE'`).first<CountRow>(),
    database.prepare(`SELECT state, COUNT(*) AS count FROM assessments GROUP BY state ORDER BY count DESC`).all<StateCountRow>(),
    database.prepare(`SELECT item_id, COUNT(*) AS responses, AVG(response) AS mean_response, AVG(response_time_ms) AS mean_time_ms FROM assessment_responses GROUP BY item_id ORDER BY item_id`).all<ItemAggregateRow>(),
    database.prepare(`SELECT provider, validation_result, COUNT(*) AS runs, AVG(latency_ms) AS mean_latency_ms FROM adaptive_runs GROUP BY provider, validation_result`).all<RunAggregateRow>(),
    database.prepare(`SELECT final_score_json FROM assessments WHERE state = 'COMPLETE' AND final_score_json IS NOT NULL LIMIT 10000`).all<ScoreRow>(),
    database.prepare(`SELECT final_score_json FROM assessments WHERE state = 'COMPLETE' AND final_score_json IS NOT NULL LIMIT 10000`).all<FlagRow>(),
    database.prepare(`SELECT chosen_ids_json FROM adaptive_runs LIMIT 10000`).all<AdaptiveIdsRow>(),
    database.prepare(`SELECT status, COUNT(*) AS count FROM reports GROUP BY status`).all<StatusCountRow>(),
  ]);
  const sampleSize = count(sample?.count);
  const scoreRows = (scores.results ?? []).flatMap((row) => {
    const score = safeJson(row.final_score_json);
    const traits = Array.isArray(score?.traits) ? score.traits : [];
    return traits.flatMap((trait) => {
      if (!trait || typeof trait !== "object") return [];
      const standardScore = Number((trait as Record<string, unknown>).standardScore);
      return Number.isFinite(standardScore) ? [{ score: standardScore }] : [];
    });
  });
  const qualityFlags = new Map<string, number>();
  for (const row of flags.results ?? []) {
    const score = safeJson(row.final_score_json);
    const quality = score?.responseQuality;
    const rowFlags: unknown[] = quality && typeof quality === "object" && Array.isArray((quality as Record<string, unknown>).flags)
      ? (quality as Record<string, unknown>).flags as unknown[]
      : [];
    for (const flag of rowFlags) if (typeof flag === "string") qualityFlags.set(flag, (qualityFlags.get(flag) ?? 0) + 1);
  }
  return {
    sampleSize,
    minimumSampleForPsychometrics: MIN_PILOT_SAMPLE,
    insufficientData: sampleSize < MIN_PILOT_SAMPLE,
    descriptive: {
      completionByState: states.results ?? [],
      itemAggregates: (itemAggregates.results ?? []).map((row) => ({ itemId: row.item_id, responses: count(row.responses), meanResponse: row.mean_response === null ? null : count(row.mean_response), meanTimeMs: row.mean_time_ms === null ? null : count(row.mean_time_ms) })),
      scoreBuckets: aggregatePilotScores(scoreRows),
      qualityFlags: [...qualityFlags.entries()].map(([flag, occurrences]) => ({ flag, occurrences })),
      adaptive: {
        runs: (adaptiveRuns.results ?? []).map((row) => ({ provider: row.provider, validationResult: row.validation_result, runs: count(row.runs), meanLatencyMs: row.mean_latency_ms === null ? null : count(row.mean_latency_ms) })),
        exposure: aggregateAdaptiveExposure(adaptiveIds.results ?? []),
      },
      pdfStatuses: pdfStatuses.results ?? [],
    },
    psychometrics: sampleSize < MIN_PILOT_SAMPLE
      ? { status: "insufficient_data", reliability: null, factorStructure: null, dif: null, norms: null }
      : { status: "descriptive_pilot_only", reliability: "requires pre-registered analysis", factorStructure: "requires independent analysis", dif: "requires subgroup sample and review", norms: "not installed" },
    privacy: "Aggregate metrics only; raw answers, response payloads and identity fields are never returned.",
  };
}
