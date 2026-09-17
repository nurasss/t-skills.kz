import { getRuntimeEnv } from "@/db";
import { getSessionViewer } from "@/lib/app-auth";

export type Viewer = {
  userId: string;
  email: string;
  displayName: string;
  fullName: string | null;
  role?: "user" | "admin";
};

type AuthProvider = {
  readonly id: "app-password" | "development";
  viewerFromRequest(request: Request): Viewer | null;
};

const DevelopmentProvider: AuthProvider = {
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

function viewerFromRequest(request: Request): Viewer | null {
  const runtimeEnv = getRuntimeEnv();
  const authProvider = runtimeEnv.AUTH_PROVIDER?.trim().toLowerCase();
  if (authProvider === "app-password") {
    if (runtimeEnv.ORBITA_ENV === "development") return DevelopmentProvider.viewerFromRequest(request);
    return null;
  }
  if (authProvider === "development" || (!authProvider && runtimeEnv.ORBITA_ENV === "development")) {
    return DevelopmentProvider.viewerFromRequest(request);
  }
  return null;
}

export async function viewerFromRequestAsync(request: Request): Promise<Viewer | null> {
  const sessionViewer = await getSessionViewer(request);
  if (sessionViewer) return sessionViewer;
  return viewerFromRequest(request);
}

export function authError() {
  return { error: "AUTHENTICATION_REQUIRED", message: "Войдите через защищённый контур, чтобы продолжить." };
}

export function isAdmin(viewer: Viewer) {
  if (viewer.role === "admin") return true;
  const allowlist = (getRuntimeEnv().ORBITA_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowlist.includes(viewer.userId) || allowlist.map((value) => value.toLowerCase()).includes(viewer.email.toLowerCase());
}
