import type { AdaptiveReasonCode } from "@/lib/assessment-engine";

/**
 * Parse and strictly constrain the provider response contract for the adaptive
 * selector. This module intentionally has no Cloudflare/runtime dependencies
 * so the same boundary can be tested in a plain Node process.
 */
export function selectionFromPayload(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("ADAPTIVE_OUTPUT_INVALID");
  const payload = value as Record<string, unknown>;
  if (Object.keys(payload).some((key) => !["selected_item_ids", "reason_codes", "target_count"].includes(key))) {
    throw new Error("ADAPTIVE_SCHEMA_INVALID");
  }
  const selected = payload.selected_item_ids;
  const targetCount = payload.target_count;
  if (!Array.isArray(selected) || !selected.every((id) => typeof id === "string")) throw new Error("ADAPTIVE_OUTPUT_INVALID");
  if (!Number.isInteger(targetCount)) throw new Error("ADAPTIVE_OUTPUT_INVALID");
  const reasonCodes: Record<string, AdaptiveReasonCode[]> = {};
  if (Array.isArray(payload.reason_codes)) {
    for (const entry of payload.reason_codes) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as Record<string, unknown>;
      if (typeof item.item_id === "string" && Array.isArray(item.reasons) && item.reasons.every((reason) => typeof reason === "string")) {
        reasonCodes[item.item_id] = item.reasons.slice(0, 8) as AdaptiveReasonCode[];
      }
    }
  } else if (payload.reason_codes && typeof payload.reason_codes === "object") {
    for (const [id, reasons] of Object.entries(payload.reason_codes as Record<string, unknown>)) {
      if (Array.isArray(reasons)) reasonCodes[id] = reasons.slice(0, 8) as AdaptiveReasonCode[];
    }
  }
  return { selectedItemIds: selected, targetCount, reasonCodes };
}
