import { getD1, getR2, getRuntimeEnv } from "@/db";
import { isRetentionCandidate, RETENTION_ACTIVE_STATES, retentionDaysFrom } from "@/lib/retention-policy";
export { isRetentionCandidate, RETENTION_ACTIVE_STATES, retentionDaysFrom } from "@/lib/retention-policy";

export type RetentionSweepResult = {
  dryRun: boolean;
  retentionDays: number;
  cutoff: string;
  candidateAssessments: number;
  purgedAssessments: number;
  artifactKeys: number;
  failedArtifacts: number;
  privacyArtifactsCleared: number;
};

type AssessmentCandidate = {
  id: string;
  state: string;
  activity_at: number;
};

type KeyRow = { assessment_id: string; pdf_key: string | null };
type PrivacyKeyRow = { id: string; artifact_key: string };

async function recordRetentionTelemetry(database: D1Database, result: RetentionSweepResult) {
  await database
    .prepare(`INSERT INTO telemetry_events (id, name, user_id, assessment_id, metadata_json, occurred_at) VALUES (?, 'retention_sweep', NULL, NULL, ?, ?)`)
    .bind(
      `tel_retention_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`,
      JSON.stringify({ status: result.dryRun ? "DRY_RUN" : result.failedArtifacts ? "FAILED" : "COMPLETE", count: result.candidateAssessments, failed_artifacts: result.failedArtifacts }),
      Date.now(),
    )
    .run()
    .catch(() => undefined);
}

export async function runRetentionSweep(options: {
  database?: D1Database;
  bucket?: R2Bucket;
  dryRun?: boolean;
  nowMs?: number;
  limit?: number;
  retentionDays?: number;
} = {}): Promise<RetentionSweepResult> {
  const runtimeEnv = getRuntimeEnv();
  const configuredDryRun = runtimeEnv.RETENTION_DRY_RUN?.trim().toLowerCase();
  const dryRun = options.dryRun ?? (configuredDryRun === undefined || configuredDryRun === "" || configuredDryRun === "true");
  const retentionDays = options.retentionDays ?? retentionDaysFrom(runtimeEnv.RETENTION_DAYS);
  const nowMs = options.nowMs ?? Date.now();
  const cutoffMs = nowMs - retentionDays * 24 * 60 * 60 * 1000;
  const limit = Math.min(500, Math.max(1, Math.round(options.limit ?? 100)));
  const database = options.database ?? getD1();

  const activePlaceholders = RETENTION_ACTIVE_STATES.map(() => "?").join(", ");
  const candidateResult = await database
    .prepare(
      `SELECT id, state, COALESCE(completed_at, updated_at, created_at) AS activity_at
       FROM assessments
       WHERE COALESCE(completed_at, updated_at, created_at) < ?
         AND state NOT IN (${activePlaceholders})
       ORDER BY COALESCE(completed_at, updated_at, created_at) ASC
       LIMIT ?`,
    )
    .bind(cutoffMs, ...RETENTION_ACTIVE_STATES, limit)
    .all<AssessmentCandidate>();
  const candidates = (candidateResult.results ?? []).filter((candidate) => isRetentionCandidate(candidate.state, candidate.activity_at, cutoffMs));
  const candidateIds = candidates.map((candidate) => candidate.id);

  const reportKeys = candidateIds.length
    ? await database
      .prepare(`SELECT assessment_id, pdf_key FROM reports WHERE assessment_id IN (${candidateIds.map(() => "?").join(", ")}) AND pdf_key IS NOT NULL`)
      .bind(...candidateIds)
      .all<KeyRow>()
    : { results: [] as KeyRow[] };
  const privacyKeys = await database
    .prepare(`SELECT id, artifact_key FROM privacy_requests WHERE created_at < ? AND artifact_key IS NOT NULL LIMIT ?`)
    .bind(cutoffMs, limit * 5)
    .all<PrivacyKeyRow>();
  const keys = [...(reportKeys.results ?? []).map((row) => row.pdf_key).filter((key): key is string => Boolean(key)), ...(privacyKeys.results ?? []).map((row) => row.artifact_key)];
  const uniqueKeys = [...new Set(keys)];

  const baseResult: RetentionSweepResult = {
    dryRun,
    retentionDays,
    cutoff: new Date(cutoffMs).toISOString(),
    candidateAssessments: candidateIds.length,
    purgedAssessments: 0,
    artifactKeys: uniqueKeys.length,
    failedArtifacts: 0,
    privacyArtifactsCleared: 0,
  };
  if (dryRun) {
    await recordRetentionTelemetry(database, baseResult);
    return baseResult;
  }

  const bucket = options.bucket ?? getR2();
  const artifactResults = await Promise.all(uniqueKeys.map(async (key) => {
    try {
      await bucket.delete(key);
      return true;
    } catch {
      console.error("retention_artifact_delete_failed", { error_code: "R2_DELETE_FAILED" });
      return false;
    }
  }));
  const failedArtifacts = artifactResults.filter((result) => !result).length;
  if (failedArtifacts > 0) {
    const result = { ...baseResult, failedArtifacts };
    await recordRetentionTelemetry(database, result);
    return result;
  }

  let purgedAssessments = 0;
  for (const candidate of candidates) {
    try {
      await database.batch([
        database.prepare(`DELETE FROM assessment_responses WHERE assessment_id = ?`).bind(candidate.id),
        database.prepare(`DELETE FROM adaptive_runs WHERE assessment_id = ?`).bind(candidate.id),
        database.prepare(`DELETE FROM consents WHERE assessment_id = ?`).bind(candidate.id),
        database.prepare(`DELETE FROM reports WHERE assessment_id = ?`).bind(candidate.id),
        database.prepare(`DELETE FROM telemetry_events WHERE assessment_id = ?`).bind(candidate.id),
        database.prepare(`DELETE FROM assessments WHERE id = ?`).bind(candidate.id),
        database.prepare(`INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, NULL, 'RETENTION_PURGE', 'assessment', ?, ?, ?)`).bind(
          `aud_retention_${candidate.id}_${Math.floor(nowMs / 1000)}`,
          candidate.id,
          JSON.stringify({ cutoff: new Date(cutoffMs).toISOString(), retentionDays, reason: "retention_policy" }),
          nowMs,
        ),
      ]);
      purgedAssessments += 1;
    } catch {
      console.error("retention_assessment_purge_failed", { error_code: "D1_DELETE_FAILED" });
    }
  }

  const privacyUpdate = await database
    .prepare(`UPDATE privacy_requests SET artifact_key = NULL WHERE created_at < ? AND artifact_key IS NOT NULL`)
    .bind(cutoffMs)
    .run();
  const result = {
    ...baseResult,
    purgedAssessments,
    privacyArtifactsCleared: privacyUpdate.meta?.changes ?? 0,
  };
  await recordRetentionTelemetry(database, result);
  return result;
}
