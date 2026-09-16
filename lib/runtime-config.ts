import type { OrbitaRuntimeEnv } from "@/db";

function enabled(value: string | undefined, fallback: boolean) {
  if (value === undefined || value.trim() === "") return fallback;
  return value.trim().toLowerCase() === "true";
}

export function paymentsEnabled(env: OrbitaRuntimeEnv) {
  return enabled(env.PAYMENTS_ENABLED, true);
}

export function aiEnabled(env: OrbitaRuntimeEnv) {
  return enabled(env.AI_ENABLED, true);
}

export function entitlementMode(env: OrbitaRuntimeEnv) {
  return (env.ENTITLEMENT_MODE ?? (paymentsEnabled(env) ? "payment" : "beta-free")).trim().toLowerCase();
}

export function isBetaFreeMode(env: OrbitaRuntimeEnv) {
  return !paymentsEnabled(env) && entitlementMode(env) === "beta-free";
}
