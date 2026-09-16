export const TELEMETRY_EVENT_NAMES = [
  "test_view",
  "catalog_viewed",
  "checkout_started",
  "checkout_redirected",
  "payment_confirmed",
  "payment_refunded",
  "payment_disputed",
  "payment_dispute_closed",
  "assessment_started",
  "resume",
  "answer_saved",
  "block_completed",
  "core_completed",
  "adaptive_started",
  "adaptive_fallback",
  "adaptive_retry",
  "adaptive_validation_rejected",
  "adaptive_selected",
  "adaptive_completed",
  "assessment_abandoned",
  "report_viewed",
  "report_completed",
  "report_failed",
  "report_fallback",
  "pdf_downloaded",
  "privacy_export",
  "privacy_delete",
  "retention_sweep",
  "support_opened",
] as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENT_NAMES)[number];

const SAFE_METADATA_KEYS = new Set([
  "provider",
  "fallback",
  "mode",
  "reason",
  "status",
  "block",
  "count",
  "latency_ms",
  "attempt_count",
  "generated_count",
  "prompt_tokens",
  "output_tokens",
  "validation_status",
  "rqi_bucket",
  "pdf_available",
  "test_id",
  "event_type",
]);

export function isTelemetryEventName(value: string): value is TelemetryEventName {
  return (TELEMETRY_EVENT_NAMES as readonly string[]).includes(value);
}

/** Allowlisted aggregate metadata only; raw answers and arbitrary payloads are discarded. */
export function sanitizeTelemetryMetadata(input: Record<string, unknown> | undefined) {
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      output[key] = Math.max(-1_000_000, Math.min(1_000_000, value));
    } else if (typeof value === "boolean" || value === null) {
      output[key] = value;
    } else if (typeof value === "string" && value.length <= 80 && /^[a-zA-Z0-9_.:-]+$/.test(value)) {
      output[key] = value;
    }
    if (Object.keys(output).length >= 12) break;
  }
  return output;
}
