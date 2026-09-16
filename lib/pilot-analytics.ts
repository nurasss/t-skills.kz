export const MIN_PILOT_SAMPLE = 200;

type D1Like = Pick<D1Database, "prepare">;

type CountRow = { count: number | string };
type StatusCountRow = { status: string; count: number | string };
type StateCountRow = { state: string; count: number | string };
type ItemAggregateRow = { item_id: string; responses: number | string; mean_response: number | string | null; mean_time_ms: number | string | null };
type RunAggregateRow = { provider: string; validation_result: string; latency_ms: number | string; attempt_count: number | string | null; generated_count: number | string | null; prompt_tokens: number | string | null; output_tokens: number | string | null; fallback_reason: string | null };
type ScoreRow = { final_score_json: string | null };
type FlagRow = { final_score_json: string | null };
type AdaptiveIdsRow = { chosen_ids_json: string };
type ReasonAggregateRow = { reason_code: string; questions: number | string };
type ValidationAggregateRow = { validation_status: string; questions: number | string };

// Published standard Mercury 2.5 API rates. The metric is an estimate only;
// invoices, promotional credits and cached-input pricing are not inferred.
const MERCURY_INPUT_USD_PER_MILLION = 0.2;
const MERCURY_OUTPUT_USD_PER_MILLION = 0.75;

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
    for (const id of ids) if (typeof id === "string" && /^(?:AI-\d{2}|FB-\d{2}|Q(?:25[1-9]|2[6-9]\d|300))$/.test(id)) exposure.set(id, (exposure.get(id) ?? 0) + 1);
  }
  return [...exposure.entries()].map(([itemId, exposures]) => ({ itemId, exposures })).sort((a, b) => b.exposures - a.exposures || a.itemId.localeCompare(b.itemId));
}

export async function getPilotAnalytics(database: D1Like) {
  const [sample, states, itemAggregates, adaptiveRuns, scores, flags, adaptiveIds, reasonAggregates, validationAggregates, pdfStatuses] = await Promise.all([
    database.prepare(`SELECT COUNT(*) AS count FROM assessments WHERE state = 'COMPLETE'`).first<CountRow>(),
    database.prepare(`SELECT state, COUNT(*) AS count FROM assessments GROUP BY state ORDER BY count DESC`).all<StateCountRow>(),
    database.prepare(`SELECT item_id, COUNT(*) AS responses, AVG(response) AS mean_response, AVG(response_time_ms) AS mean_time_ms FROM assessment_responses GROUP BY item_id ORDER BY item_id`).all<ItemAggregateRow>(),
    database.prepare(`SELECT provider, validation_result, latency_ms, attempt_count, generated_count, prompt_tokens, output_tokens, fallback_reason FROM adaptive_runs LIMIT 10000`).all<RunAggregateRow>(),
    database.prepare(`SELECT final_score_json FROM assessments WHERE state = 'COMPLETE' AND final_score_json IS NOT NULL LIMIT 10000`).all<ScoreRow>(),
    database.prepare(`SELECT final_score_json FROM assessments WHERE state = 'COMPLETE' AND final_score_json IS NOT NULL LIMIT 10000`).all<FlagRow>(),
    database.prepare(`SELECT chosen_ids_json FROM adaptive_runs LIMIT 10000`).all<AdaptiveIdsRow>(),
    database.prepare(`SELECT reason_code, COUNT(*) AS questions FROM adaptive_questions GROUP BY reason_code ORDER BY questions DESC`).all<ReasonAggregateRow>(),
    database.prepare(`SELECT validation_status, COUNT(*) AS questions FROM adaptive_questions GROUP BY validation_status`).all<ValidationAggregateRow>(),
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
  const runRows = adaptiveRuns.results ?? [];
  const latencies = runRows.map((row) => count(row.latency_ms)).filter((value) => value >= 0).sort((left, right) => left - right);
  const percentile = (ratio: number) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor((latencies.length - 1) * ratio))] : null;
  const runGroups = new Map<string, { provider: string; validationResult: string; runs: number; latencies: number[]; generated: number; retries: number; promptTokens: number; outputTokens: number; fallbackReasons: number; estimatedCostUsd: number }>();
  for (const row of runRows) {
    const key = `${row.provider}:${row.validation_result}`;
    const group = runGroups.get(key) ?? { provider: row.provider, validationResult: row.validation_result, runs: 0, latencies: [], generated: 0, retries: 0, promptTokens: 0, outputTokens: 0, fallbackReasons: 0, estimatedCostUsd: 0 };
    group.runs += 1;
    group.latencies.push(count(row.latency_ms));
    group.generated += count(row.generated_count);
    group.retries += Math.max(0, count(row.attempt_count) - 1);
    group.promptTokens += count(row.prompt_tokens);
    group.outputTokens += count(row.output_tokens);
    group.estimatedCostUsd += count(row.prompt_tokens) / 1_000_000 * MERCURY_INPUT_USD_PER_MILLION + count(row.output_tokens) / 1_000_000 * MERCURY_OUTPUT_USD_PER_MILLION;
    if (row.fallback_reason) group.fallbackReasons += 1;
    runGroups.set(key, group);
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
        runs: [...runGroups.values()].map((group) => ({
          provider: group.provider,
          validationResult: group.validationResult,
          runs: group.runs,
          meanLatencyMs: group.latencies.length ? Math.round(group.latencies.reduce((sum, value) => sum + value, 0) / group.latencies.length) : null,
          generatedCountAverage: group.runs ? Math.round(group.generated / group.runs * 100) / 100 : 0,
          retryCount: group.retries,
          promptTokens: group.promptTokens,
          outputTokens: group.outputTokens,
          estimatedCostUsd: Math.round(group.estimatedCostUsd * 1_000_000) / 1_000_000,
          fallbackReasons: group.fallbackReasons,
        })),
        latencyMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99) },
        exposure: aggregateAdaptiveExposure(adaptiveIds.results ?? []),
        reasonCodeDistribution: (reasonAggregates.results ?? []).map((row) => ({ reasonCode: row.reason_code, questions: count(row.questions) })),
        validationResults: (validationAggregates.results ?? []).map((row) => ({ validationStatus: row.validation_status, questions: count(row.questions) })),
      },
      pdfStatuses: pdfStatuses.results ?? [],
    },
    psychometrics: sampleSize < MIN_PILOT_SAMPLE
      ? { status: "insufficient_data", reliability: null, factorStructure: null, dif: null, norms: null }
      : { status: "descriptive_pilot_only", reliability: "requires pre-registered analysis", factorStructure: "requires independent analysis", dif: "requires subgroup sample and review", norms: "not installed" },
    privacy: "Aggregate metrics only; raw answers, response payloads and identity fields are never returned.",
  };
}
