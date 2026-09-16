import { getRuntimeEnv } from "@/db";

export type Viewer = {
  userId: string;
  email: string;
  displayName: string;
  fullName: string | null;
};

export type AuthProvider = {
  readonly id: "legacy-private" | "cloudflare-access" | "development";
  viewerFromRequest(request: Request): Viewer | null;
};

export const AUTH_SESSION_BOUNDARY = "auth-provider-v2";

const LEGACY_USER_ID = "oai-authenticated-user-id";
const LEGACY_EMAIL = "oai-authenticated-user-email";
const LEGACY_FULL_NAME = "oai-authenticated-user-full-name";
const LEGACY_FULL_NAME_ENCODING = "oai-authenticated-user-full-name-encoding";
const ACCESS_USER_ID = "x-orbita-access-sub";
const ACCESS_EMAIL = "x-orbita-access-email";
const ACCESS_NAME = "x-orbita-access-name";

function decodedLegacyName(request: Request) {
  const value = request.headers.get(LEGACY_FULL_NAME);
  if (!value || request.headers.get(LEGACY_FULL_NAME_ENCODING) !== "percent-encoded-utf-8") return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export const LegacyPrivateProvider: AuthProvider = {
  id: "legacy-private",
  viewerFromRequest(request) {
    const userId = request.headers.get(LEGACY_USER_ID)?.trim();
    const email = request.headers.get(LEGACY_EMAIL)?.trim().toLowerCase();
    if (!userId || !email) return null;
    const fullName = decodedLegacyName(request);
    return { userId, email, displayName: fullName ?? email, fullName };
  },
};

export const CloudflareAccessProvider: AuthProvider = {
  id: "cloudflare-access",
  viewerFromRequest(request) {
    // worker/index.ts strips incoming values and re-creates these from ctx.access.
    const userId = request.headers.get(ACCESS_USER_ID)?.trim();
    const email = request.headers.get(ACCESS_EMAIL)?.trim().toLowerCase();
    if (!userId || !email) return null;
    const fullName = request.headers.get(ACCESS_NAME)?.trim() || null;
    return { userId: `cf:${userId}`, email, displayName: fullName ?? email, fullName };
  },
};

export const DevelopmentProvider: AuthProvider = {
  id: "development",
  viewerFromRequest(request) {
    const previewId = request.headers.get("x-orbita-preview-user")?.trim();
    if (!previewId) return null;
    return {
      userId: previewId,
      email: `${previewId}@local.invalid`,
      displayName: "Local preview",
      fullName: null,
    };
  },
};

export function viewerFromRequest(request: Request): Viewer | null {
  const runtimeEnv = getRuntimeEnv();
  if (runtimeEnv.AUTH_PROVIDER?.trim().toLowerCase() === "cloudflare-access") {
    return CloudflareAccessProvider.viewerFromRequest(request);
  }
  const legacy = LegacyPrivateProvider.viewerFromRequest(request);
  if (legacy) return legacy;
  if (runtimeEnv.ORBITA_ENV === "development") return DevelopmentProvider.viewerFromRequest(request);
  return null;
}

export function authError() {
  return { error: "AUTHENTICATION_REQUIRED", message: "Войдите через защищённый контур, чтобы продолжить." };
}

export function isAdmin(viewer: Viewer) {
  const allowlist = (getRuntimeEnv().ORBITA_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowlist.includes(viewer.userId) || allowlist.includes(viewer.email);
}
