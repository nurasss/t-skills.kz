export const RETENTION_ACTIVE_STATES = [
  "CREATED",
  "PAYMENT_PENDING",
  "PAID",
  "CONSENTED",
  "CORE_IN_PROGRESS",
  "ADAPTIVE_SELECTING",
  "ADAPTIVE_IN_PROGRESS",
  "SCORING",
  "REPORT_GENERATING",
] as const;

export function isRetentionCandidate(state: string, activityAt: number, cutoffMs: number) {
  return !RETENTION_ACTIVE_STATES.includes(state as (typeof RETENTION_ACTIVE_STATES)[number]) && activityAt < cutoffMs;
}

export function retentionDaysFrom(value: string | undefined) {
  const parsed = Number(value ?? "365");
  return Number.isSafeInteger(parsed) ? Math.min(3650, Math.max(30, parsed)) : 365;
}
