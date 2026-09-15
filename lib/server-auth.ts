import { getRuntimeEnv } from "@/db";

export type Viewer = {
  userId: string;
  email: string;
  displayName: string;
  fullName: string | null;
};

const USER_ID_HEADER = "oai-authenticated-user-id";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";

function decodeFullName(request: Request) {
  const value = request.headers.get(USER_FULL_NAME_HEADER);
  const encoding = request.headers.get(USER_FULL_NAME_ENCODING_HEADER);
  if (!value || encoding !== "percent-encoded-utf-8") return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function viewerFromRequest(request: Request): Viewer | null {
  const userId = request.headers.get(USER_ID_HEADER)?.trim();
  const email = request.headers.get(USER_EMAIL_HEADER)?.trim();
  if (!userId || !email) {
    const runtimeEnv = getRuntimeEnv();
    if (runtimeEnv.ORBITA_ENV !== "development") return null;
    const previewId = request.headers.get("x-orbita-preview-user")?.trim();
    if (!previewId) return null;
    return {
      userId: previewId,
      email: `${previewId}@local.invalid`,
      displayName: "Local preview",
      fullName: null,
    };
  }

  const fullName = decodeFullName(request);
  return { userId, email, displayName: fullName ?? email, fullName };
}

export function authError() {
  return { error: "AUTHENTICATION_REQUIRED", message: "Войдите через ChatGPT, чтобы продолжить." };
}

export function isAdmin(viewer: Viewer) {
  const runtimeEnv = getRuntimeEnv();
  const allowlist = (runtimeEnv.ORBITA_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowlist.includes(viewer.userId);
}
