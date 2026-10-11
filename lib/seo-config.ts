import { getRuntimeEnv, type OrbitaRuntimeEnv } from "@/db";
import { publicIndexingAllowedForEnvironment } from "@/lib/legal-policy";

export function publicIndexingEnabled() {
  return publicIndexingEnabledForEnvironment(getRuntimeEnv());
}

export function publicIndexingEnabledForEnvironment(environment: Partial<OrbitaRuntimeEnv>) {
  return publicIndexingAllowedForEnvironment(environment);
}

export function configuredAppOrigin() {
  const raw = getRuntimeEnv().APP_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}
