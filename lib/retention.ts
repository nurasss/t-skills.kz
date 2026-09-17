import { getD1, getR2, getRuntimeEnv } from "@/db";
import { RETENTION_ACTIVE_STATES, retentionDaysFrom } from "@/lib/retention-policy";
const RETENTION_JOB_VERSION = "purge-job-v1";

type PurgeJobStatus =
  | "PURGE_PENDING"
  | "ARTIFACTS_DELETED"
  | "DB_PURGED"
  | "PURGE_COMPLETE";

export type RetentionSweepResult = {
  dryRun: boolean;
  retentionDays: number;
  cutoff: string;
  candidateAssessments: number;
  resumedJobs: number;
  completedJobs: number;
  purgedAssessments: number;
  artifactKeys: number;
  failedArtifacts: number;
  privacyArtifactsCleared: number;
};

type AssessmentCandidate = {
  id: string;
  state: string;
  purge_after: number;
};

type PurgeJobRow = {
  id: string;
  target_id: string;
  status: PurgeJobStatus;
  counts_json: string;
};

type KeyRow = { pdf_key: string | null };
type PrivacyKeyRow = { id: string; artifact_key: string };

function placeholders(count: number) {
  return new Array(count).fill("?").join(", ");
}

async function recordRetentionTelemetry(database: D1Database, result: RetentionSweepResult) {
  await database
    .prepare("INSERT INTO telemetry_events (id, name, user_id, assessment_id, metadata_json, occurred_at) VALUES (?, 'retention_sweep', NULL, NULL, ?, ?)")
    .bind(
      "tel_retention_" + Date.now() + "_" + crypto.randomUUID().slice(0, 8),
      JSON.stringify({
        status: result.dryRun ? "DRY_RUN" : result.failedArtifacts ? "FAILED" : "COMPLETE",
        count: result.candidateAssessments,
        completed_jobs: result.completedJobs,
        failed_artifacts: result.failedArtifacts,
      }),
      Date.now(),
    )
    .run()
    .catch(() => undefined);
}

async function reportKeysFor(database: D1Database, targetId: string) {
  const result = await database
    .prepare("SELECT pdf_key FROM reports WHERE assessment_id = ? AND pdf_key IS NOT NULL")
    .bind(targetId)
    .all<KeyRow>();
  return (result.results ?? []).map((row) => row.pdf_key).filter((key): key is string => Boolean(key));
}

async function deletionCounts(database: D1Database, targetId: string) {
  const row = await database
    .prepare(
      "SELECT " +
      "(SELECT COUNT(*) FROM assessment_responses WHERE assessment_id = ?) AS responses, " +
      "(SELECT COUNT(*) FROM adaptive_questions WHERE assessment_id = ?) AS adaptive_questions, " +
      "(SELECT COUNT(*) FROM adaptive_runs WHERE assessment_id = ?) AS adaptive_runs, " +
      "(SELECT COUNT(*) FROM consents WHERE assessment_id = ?) AS consents, " +
      "(SELECT COUNT(*) FROM reports WHERE assessment_id = ?) AS reports, " +
      "(SELECT COUNT(*) FROM telemetry_events WHERE assessment_id = ?) AS telemetry",
    )
    .bind(targetId, targetId, targetId, targetId, targetId, targetId)
    .first<{ responses: number; adaptive_questions: number; adaptive_runs: number; consents: number; reports: number; telemetry: number }>();
  return row ?? { responses: 0, adaptive_questions: 0, adaptive_runs: 0, consents: 0, reports: 0, telemetry: 0 };
}

async function setJobFailure(database: D1Database, jobId: string, errorClass: string, counts: Record<string, number>, nowMs: number) {
  await database
    .prepare("UPDATE purge_jobs SET counts_json = ?, error_class = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(counts), errorClass, nowMs, jobId)
    .run();
}

export async function runRetentionSweep(options: {
  database?: D1Database;
  bucket?: R2Bucket;
  dryRun?: boolean;
  nowMs?: number;
  limit?: number;
  retentionDays?: number;
  stopAfterArtifacts?: boolean;
} = {}): Promise<RetentionSweepResult> {
  const runtimeEnv = getRuntimeEnv();
  const configuredDryRun = runtimeEnv.RETENTION_DRY_RUN?.trim().toLowerCase();
  const dryRun = options.dryRun ?? (configuredDryRun === undefined || configuredDryRun === "" || configuredDryRun === "true");
  const retentionDays = options.retentionDays ?? retentionDaysFrom(runtimeEnv.RETENTION_DAYS);
  const nowMs = options.nowMs ?? Date.now();
  const cutoffMs = nowMs;
  const limit = Math.min(500, Math.max(1, Math.round(options.limit ?? 100)));
  const database = options.database ?? getD1();
  const activePlaceholders = placeholders(RETENTION_ACTIVE_STATES.length);

  const candidateResult = await database
    .prepare(
      "SELECT id, state, purge_after FROM assessments " +
      "WHERE purge_state = 'ACTIVE' AND purge_after IS NOT NULL AND purge_after < ? " +
      "AND state NOT IN (" + activePlaceholders + ") " +
      "ORDER BY purge_after ASC LIMIT ?",
    )
    .bind(cutoffMs, ...RETENTION_ACTIVE_STATES, limit)
    .all<AssessmentCandidate>();
  const candidates = candidateResult.results ?? [];
  const candidateIds = candidates.map((candidate) => candidate.id);

  const privacyKeysResult = await database
    .prepare("SELECT id, artifact_key FROM privacy_requests WHERE created_at < ? AND artifact_key IS NOT NULL LIMIT ?")
    .bind(nowMs - retentionDays * 24 * 60 * 60 * 1000, limit * 5)
    .all<PrivacyKeyRow>();
  const privacyKeys = privacyKeysResult.results ?? [];
  const candidateReportKeys = (
    await Promise.all(candidateIds.map((targetId) => reportKeysFor(database, targetId)))
  ).flat();

  const existingJobsResult = await database
    .prepare("SELECT id, target_id, status, counts_json FROM purge_jobs WHERE status != 'PURGE_COMPLETE' ORDER BY started_at ASC LIMIT ?")
    .bind(limit)
    .all<PurgeJobRow>();
  const existingJobs = existingJobsResult.results ?? [];
  const baseResult: RetentionSweepResult = {
    dryRun,
    retentionDays,
    cutoff: new Date(cutoffMs).toISOString(),
    candidateAssessments: candidateIds.length,
    resumedJobs: existingJobs.length,
    completedJobs: 0,
    purgedAssessments: 0,
    artifactKeys: new Set([...candidateReportKeys, ...privacyKeys.map((row) => row.artifact_key)]).size,
    failedArtifacts: 0,
    privacyArtifactsCleared: 0,
  };
  if (dryRun) {
    await recordRetentionTelemetry(database, baseResult);
    return baseResult;
  }

  for (const candidate of candidates) {
    const purgeId = "purge_" + candidate.id;
    await database.batch([
      database
        .prepare(
          "INSERT INTO purge_jobs (id, target_id, status, job_version, counts_json, error_class, started_at, updated_at, completed_at) " +
          "VALUES (?, ?, 'PURGE_PENDING', ?, '{}', NULL, ?, ?, NULL) ON CONFLICT(target_id) DO NOTHING",
        )
        .bind(purgeId, candidate.id, RETENTION_JOB_VERSION, nowMs, nowMs),
      database
        .prepare("UPDATE assessments SET purge_state = 'PURGE_PENDING', updated_at = ? WHERE id = ? AND purge_state = 'ACTIVE'")
        .bind(nowMs, candidate.id),
    ]);
  }

  const jobsResult = await database
    .prepare("SELECT id, target_id, status, counts_json FROM purge_jobs WHERE status != 'PURGE_COMPLETE' ORDER BY started_at ASC LIMIT ?")
    .bind(limit)
    .all<PurgeJobRow>();
  const jobs = jobsResult.results ?? [];
  const bucket = options.bucket ?? getR2();
  let purgedAssessments = 0;
  let completedJobs = 0;
  let failedArtifacts = 0;

  for (const originalJob of jobs) {
    let status = originalJob.status;
    let counts = JSON.parse(originalJob.counts_json || "{}") as Record<string, number>;
    if (status === "PURGE_PENDING") {
      const keys = await reportKeysFor(database, originalJob.target_id);
      let deletedArtifacts = 0;
      for (const key of keys) {
        try {
          await bucket.delete(key);
          deletedArtifacts += 1;
        } catch {
          failedArtifacts += 1;
        }
      }
      counts = { ...counts, artifact_keys: keys.length, deleted_artifacts: deletedArtifacts };
      if (deletedArtifacts !== keys.length) {
        await setJobFailure(database, originalJob.id, "R2_DELETE_FAILED", counts, nowMs);
        continue;
      }
      await database.batch([
        database
          .prepare("UPDATE purge_jobs SET status = 'ARTIFACTS_DELETED', counts_json = ?, error_class = NULL, updated_at = ? WHERE id = ? AND status = 'PURGE_PENDING'")
          .bind(JSON.stringify(counts), nowMs, originalJob.id),
        database
          .prepare("UPDATE assessments SET purge_state = 'ARTIFACTS_DELETED', updated_at = ? WHERE id = ?")
          .bind(nowMs, originalJob.target_id),
      ]);
      status = "ARTIFACTS_DELETED";
      if (options.stopAfterArtifacts) continue;
    }

    if (status === "ARTIFACTS_DELETED") {
      const rowCounts = await deletionCounts(database, originalJob.target_id);
      counts = { ...counts, ...rowCounts };
      try {
        await database.batch([
          database.prepare("DELETE FROM assessment_responses WHERE assessment_id = ?").bind(originalJob.target_id),
          database.prepare("DELETE FROM adaptive_questions WHERE assessment_id = ?").bind(originalJob.target_id),
          database.prepare("DELETE FROM adaptive_runs WHERE assessment_id = ?").bind(originalJob.target_id),
          database.prepare("DELETE FROM consents WHERE assessment_id = ?").bind(originalJob.target_id),
          database.prepare("DELETE FROM reports WHERE assessment_id = ?").bind(originalJob.target_id),
          database.prepare("DELETE FROM telemetry_events WHERE assessment_id = ?").bind(originalJob.target_id),
          database.prepare("DELETE FROM assessments WHERE id = ? AND purge_state = 'ARTIFACTS_DELETED'").bind(originalJob.target_id),
          database
            .prepare("UPDATE purge_jobs SET status = 'DB_PURGED', counts_json = ?, error_class = NULL, updated_at = ? WHERE id = ? AND status = 'ARTIFACTS_DELETED'")
            .bind(JSON.stringify(counts), nowMs, originalJob.id),
          database
            .prepare("INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at) VALUES (?, NULL, 'RETENTION_PURGE', 'assessment', ?, ?, ?)")
            .bind(
              "aud_" + originalJob.id + "_" + Math.floor(nowMs / 1000),
              originalJob.target_id,
              JSON.stringify({
                purge_id: originalJob.id,
                target_id: originalJob.target_id,
                job_version: RETENTION_JOB_VERSION,
                status: "DB_PURGED",
                counts,
                error_class: null,
              }),
              nowMs,
            ),
        ]);
        purgedAssessments += 1;
        status = "DB_PURGED";
      } catch {
        await setJobFailure(database, originalJob.id, "D1_DELETE_FAILED", counts, nowMs);
        continue;
      }
    }

    if (status === "DB_PURGED") {
      await database
        .prepare("UPDATE purge_jobs SET status = 'PURGE_COMPLETE', completed_at = ?, updated_at = ?, error_class = NULL WHERE id = ? AND status = 'DB_PURGED'")
        .bind(nowMs, nowMs, originalJob.id)
        .run();
      completedJobs += 1;
    }
  }

  let privacyArtifactsCleared = 0;
  for (const row of privacyKeys) {
    try {
      await bucket.delete(row.artifact_key);
      const update = await database
        .prepare("UPDATE privacy_requests SET artifact_key = NULL WHERE id = ? AND artifact_key = ?")
        .bind(row.id, row.artifact_key)
        .run();
      privacyArtifactsCleared += update.meta?.changes ?? 0;
    } catch {
      failedArtifacts += 1;
    }
  }

  const result = {
    ...baseResult,
    resumedJobs: existingJobs.length,
    completedJobs,
    purgedAssessments,
    failedArtifacts,
    privacyArtifactsCleared,
  };
  await recordRetentionTelemetry(database, result);
  return result;
}
