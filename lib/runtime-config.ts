import type { OrbitaRuntimeEnv } from "@/db";

function enabled(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === "") return fallback;
  return value.trim().toLowerCase() === "true";
}

export function paymentsEnabled(env: OrbitaRuntimeEnv) {
  // Feature flags are fail-closed: an incomplete deployment must not
  // accidentally expose checkout or paid access.
  return enabled(env.PAYMENTS_ENABLED, false);
}

export function aiEnabled(env: OrbitaRuntimeEnv) {
  // AI is an optional external integration and must be explicitly enabled.
  return enabled(env.AI_ENABLED, false);
}

export function entitlementMode(env: OrbitaRuntimeEnv) {
  return (env.ENTITLEMENT_MODE ?? (paymentsEnabled(env) ? "payment" : "beta-free")).trim().toLowerCase();
}

export function isBetaFreeMode(env: OrbitaRuntimeEnv) {
  return !paymentsEnabled(env) && entitlementMode(env) === "beta-free";
}

/**
 * Explicit, tightly scoped pilot override. Keep this separate from the admin
 * allowlist so administrative visibility does not accidentally grant unlimited
 * assessment creation to every admin account.
 */
export function hasUnlimitedAssessmentAccess(env: OrbitaRuntimeEnv, email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;
  return (env.TSKILLS_UNLIMITED_ASSESSMENT_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(normalizedEmail);
}
