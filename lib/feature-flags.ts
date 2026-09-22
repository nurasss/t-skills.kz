import { getD1, getRuntimeEnv } from "@/db";

export type PublicFeatureFlag = "teen_enabled" | "payments_enabled" | "maintenance_mode";

function envFlag(name: string) {
  const value = getRuntimeEnv()[name as keyof ReturnType<typeof getRuntimeEnv>];
  return value === "1" || value === "true";
}

/**
 * Public feature reads fail closed when there is no explicit fallback. The
 * environment fallback keeps local previews backwards-compatible until the
 * flag has been created by an owner in the control plane; once a D1 row exists
 * it is authoritative.
 */
export async function isFeatureEnabled(key: PublicFeatureFlag, fallbackEnvKey?: string) {
  try {
    const row = await getD1().prepare("SELECT enabled FROM feature_flags WHERE key = ? LIMIT 1").bind(key).first<{ enabled: number | boolean }>();
    if (row && row.enabled !== null && row.enabled !== undefined) return Number(row.enabled) === 1;
  } catch {
    // Local builds and storage-independent previews may not have D1 yet.
  }
  return fallbackEnvKey ? envFlag(fallbackEnvKey) : false;
}

export function paymentsFeatureEnabled() {
  return isFeatureEnabled("payments_enabled", "PAYMENTS_ENABLED");
}

export function maintenanceModeEnabled() {
  return isFeatureEnabled("maintenance_mode");
}
