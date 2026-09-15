export const OPERATIONAL_METRICS = [
  "assessment_started",
  "core_completed",
  "adaptive_started",
  "adaptive_fallback",
  "report_completed",
  "report_failed",
  "payment_confirmed",
  "payment_refunded",
  "payment_disputed",
  "retention_sweep",
  "privacy_export",
  "privacy_delete",
  "request_completed",
  "request_failed",
] as const;

export type OperationalMetric = (typeof OPERATIONAL_METRICS)[number];

export type AlertThresholds = {
  reportFailureRate: number;
  adaptiveFallbackRate: number;
  requestErrorRate: number;
  retentionFailedArtifacts: number;
};

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  reportFailureRate: 0.05,
  adaptiveFallbackRate: 0.2,
  requestErrorRate: 0.02,
  retentionFailedArtifacts: 0,
};

export type MonitoringSnapshot = {
  reportAttempts: number;
  reportFailures: number;
  adaptiveAttempts: number;
  adaptiveFallbacks: number;
  requests: number;
  requestErrors: number;
  retentionFailedArtifacts: number;
};

export function evaluateOperationalAlerts(snapshot: MonitoringSnapshot, thresholds = DEFAULT_ALERT_THRESHOLDS) {
  const alerts: string[] = [];
  const ratio = (numerator: number, denominator: number) => denominator > 0 ? numerator / denominator : 0;
  if (ratio(snapshot.reportFailures, snapshot.reportAttempts) > thresholds.reportFailureRate) alerts.push("REPORT_FAILURE_RATE");
  if (ratio(snapshot.adaptiveFallbacks, snapshot.adaptiveAttempts) > thresholds.adaptiveFallbackRate) alerts.push("ADAPTIVE_FALLBACK_RATE");
  if (ratio(snapshot.requestErrors, snapshot.requests) > thresholds.requestErrorRate) alerts.push("REQUEST_ERROR_RATE");
  if (snapshot.retentionFailedArtifacts > thresholds.retentionFailedArtifacts) alerts.push("RETENTION_ARTIFACT_FAILURE");
  return alerts;
}

export function latencyBucket(latencyMs: number) {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return "invalid";
  if (latencyMs <= 250) return "0-250ms";
  if (latencyMs <= 1000) return "251-1000ms";
  if (latencyMs <= 5000) return "1001-5000ms";
  return "5000ms+";
}
