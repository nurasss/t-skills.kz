import { getD1, getRuntimeEnv } from "@/db";
import { getSessionViewer } from "@/lib/app-auth";
import { isLocalAuthEnvironment } from "@/lib/auth-utils";

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
  if (!isLocalAuthEnvironment(runtimeEnv)) return null;
  if (authProvider === "app-password" || authProvider === "development" || !authProvider) {
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

/** Async RBAC-aware membership check used by server pages and legacy routes. */
export async function isAdminAsync(viewer: Viewer) {
  if (isAdmin(viewer)) return true;
  try {
    const result = await getD1().prepare(
      `SELECT 1
       FROM admin_role_assignments a
       JOIN admin_roles r ON r.id = a.role_id
       WHERE a.user_id = ? AND a.disabled_at IS NULL AND r.status = 'ACTIVE'
       LIMIT 1`,
    ).bind(viewer.userId).first<{ 1: number }>();
    return Boolean(result);
  } catch {
    return false;
  }
}
