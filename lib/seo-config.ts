import { getRuntimeEnv } from "@/db";

export function publicIndexingEnabled() {
  return getRuntimeEnv().PUBLIC_INDEXING_ENABLED?.trim().toLowerCase() === "true";
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
