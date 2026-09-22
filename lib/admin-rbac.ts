import { NextResponse } from "next/server";

import { getD1, getRuntimeEnv } from "@/db";
import { isResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { StoreError } from "@/lib/durable-store";
import { requestIdFrom } from "@/lib/security-headers";
import { isAdmin, type Viewer } from "@/lib/server-auth";

export const ADMIN_PERMISSIONS = [
  "dashboard.read",
  "users.read",
  "users.block",
  "users.support_actions",
  "orders.read",
  "orders.refund",
  "entitlements.read",
  "entitlements.grant",
  "entitlements.revoke",
  "promos.read",
  "promos.create",
  "promos.update",
  "promos.disable",
  "campaigns.read",
  "campaigns.manage",
  "content.read",
  "content.edit",
  "content.publish",
  "pricing.read",
  "pricing.manage",
  "careers.read",
  "careers.edit",
  "careers.publish",
  "assessment.read",
  "assessment.create_version",
  "assessment.publish",
  "assessment.sensitive.read",
  "reports.retry",
  "analytics.read",
  "admins.read",
  "admins.manage",
  "settings.read",
  "settings.manage",
  "audit.read",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ADMIN_ROLES = [
  "SUPER_ADMIN",
  "OWNER",
  "CONTENT_MANAGER",
  "SUPPORT",
  "FINANCE",
  "ANALYST",
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

const ALL_PERMISSIONS = new Set<AdminPermission>(ADMIN_PERMISSIONS);
const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  SUPER_ADMIN: [...ADMIN_PERMISSIONS],
  OWNER: [...ADMIN_PERMISSIONS],
  CONTENT_MANAGER: [
    "dashboard.read", "content.read", "content.edit", "content.publish",
    "pricing.read", "careers.read", "careers.edit", "careers.publish", "assessment.read",
    "analytics.read", "audit.read",
  ],
  SUPPORT: [
    "dashboard.read", "users.read", "users.support_actions", "entitlements.read",
    "entitlements.grant", "entitlements.revoke", "orders.read", "assessment.read",
  ],
  FINANCE: [
    "dashboard.read", "orders.read", "orders.refund", "promos.read", "promos.create",
    "promos.update", "promos.disable", "campaigns.read", "campaigns.manage",
    "entitlements.read", "pricing.read", "pricing.manage", "analytics.read", "audit.read",
  ],
  ANALYST: ["dashboard.read", "analytics.read", "campaigns.read", "orders.read", "assessment.read"],
};

export type AdminContext = {
  viewer: Viewer;
  roles: AdminRole[];
  permissions: Set<AdminPermission>;
};

function normalizedRole(value: unknown): AdminRole | null {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value)
    ? value as AdminRole
    : null;
}

function jsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function getAdminContext(viewer: Viewer): Promise<AdminContext | null> {
  // Compatibility path for the existing users.role=admin and explicit
  // allowlist. It maps to the strongest role until assignments are migrated.
  if (isAdmin(viewer)) {
    return { viewer, roles: ["SUPER_ADMIN"], permissions: new Set(ALL_PERMISSIONS) };
  }
  try {
    const result = await getD1().prepare(
      `SELECT r.name
       FROM admin_role_assignments a
       JOIN admin_roles r ON r.id = a.role_id
       WHERE a.user_id = ? AND a.disabled_at IS NULL AND r.status = 'ACTIVE'
       ORDER BY r.name ASC`,
    ).bind(viewer.userId).all<{ name: string }>();
    const roles = (result.results ?? []).map((row) => normalizedRole(row.name)).filter((role): role is AdminRole => Boolean(role));
    if (!roles.length) return null;
    const permissions = new Set<AdminPermission>();
    for (const role of roles) for (const permission of ROLE_PERMISSIONS[role]) permissions.add(permission);
    return { viewer, roles, permissions };
  } catch {
    // A missing migration must never grant admin access through a failed
    // lookup. The legacy compatibility path above remains available.
    return null;
  }
}

export async function isAdminAsync(viewer: Viewer) {
  return Boolean(await getAdminContext(viewer));
}

export async function requireAdminPermission(viewer: Viewer, permission: AdminPermission) {
  const context = await getAdminContext(viewer);
  if (!context) throw new StoreError("ADMIN_REQUIRED", 403);
  if (!context.permissions.has(permission)) throw new StoreError("ADMIN_PERMISSION_REQUIRED", 403);
  return context;
}

export async function adminViewerOrResponse(request: Request, permission: AdminPermission, mutation = false) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return adminErrorResponse(new StoreError("AUTHENTICATION_REQUIRED", 401), request);
  if (mutation) {
    const originError = sameOriginOrResponse(request, { requireCsrf: true });
    if (originError) return adminErrorResponse(new StoreError("CSRF_ORIGIN_INVALID", 403), request);
  }
  try {
    return await requireAdminPermission(viewer, permission);
  } catch (error) {
    return adminErrorResponse(error, request);
  }
}

export function adminContextOrResponse(value: AdminContext | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

function publicErrorMessage(code: string) {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "Войдите через защищённый контур, чтобы продолжить.",
    CSRF_ORIGIN_INVALID: "Запрос должен быть отправлен с этого сайта.",
    RATE_LIMITED: "Слишком много запросов. Попробуйте ещё раз позже.",
    ADMIN_REQUIRED: "Недостаточно прав для административного раздела.",
    ADMIN_PERMISSION_REQUIRED: "У этой роли нет разрешения на действие.",
    RESOURCE_CHANGED: "Запись была изменена другим администратором.",
    INVALID_REQUEST: "Проверьте заполненные поля.",
  };
  return messages[code] ?? "Не удалось выполнить административное действие.";
}

export function adminErrorResponse(error: unknown, request: Request) {
  const requestId = requestIdFrom(request);
  if (error instanceof StoreError) {
    return NextResponse.json({ error: { code: error.code, message: publicErrorMessage(error.code), requestId } }, {
      status: error.status,
      headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
    });
  }
  const code = error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "INTERNAL_SERVER_ERROR";
  console.error("admin_api_request_failed", { error_code: code, request_id: requestId });
  return NextResponse.json({ error: { code: "INTERNAL_SERVER_ERROR", message: publicErrorMessage("INTERNAL_SERVER_ERROR"), requestId } }, {
    status: 500,
    headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
  });
}

export function adminRateLimitResponse(request: Request, retryAfterSeconds: number) {
  const requestId = requestIdFrom(request);
  return NextResponse.json({
    error: { code: "RATE_LIMITED", message: publicErrorMessage("RATE_LIMITED"), requestId },
  }, {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store", "X-Request-ID": requestId },
  });
}

function safeIp(request: Request) {
  const cloudflare = request.headers.get("CF-Connecting-IP")?.trim();
  if (cloudflare) return cloudflare;
  if (getRuntimeEnv().TRUST_PROXY?.trim().toLowerCase() === "true") {
    const forwarded = request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return "unknown";
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function writeAdminAudit(input: {
  context: AdminContext;
  action: string;
  entityType: string;
  entityId?: string | null;
  request?: Request;
  metadata?: Record<string, unknown>;
  reason?: string | null;
}) {
  const requestId = input.request ? requestIdFrom(input.request) : null;
  const secret = getRuntimeEnv().AUTH_RATE_LIMIT_SECRET?.trim() ?? "local-admin-audit-salt";
  const ipHash = input.request ? await digest(`${secret}:${safeIp(input.request)}`) : null;
  const metadata = jsonObject(input.metadata);
  const sanitized = Object.fromEntries(Object.entries(metadata).filter(([key, value]) => {
    if (/password|token|secret|answer|payload|card/i.test(key)) return false;
    return ["string", "number", "boolean"].includes(typeof value) || value === null;
  }));
  await getD1().prepare(
    `INSERT INTO audit_events
       (id, actor_user_id, actor_role, action, entity_type, entity_id, metadata_json, reason, request_id, ip_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `aud_${crypto.randomUUID()}`,
    input.context.viewer.userId,
    input.context.roles.join(","),
    input.action,
    input.entityType,
    input.entityId ?? null,
    Object.keys(sanitized).length ? JSON.stringify(sanitized) : null,
    input.reason ?? null,
    requestId,
    ipHash,
    Date.now(),
  ).run();
  return requestId;
}

export function rolePermissions(role: AdminRole) {
  return [...ROLE_PERMISSIONS[role]];
}
