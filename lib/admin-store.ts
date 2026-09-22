import { getD1 } from "@/db";
import type { AdminContext, AdminRole } from "@/lib/admin-rbac";
import { writeAdminAudit } from "@/lib/admin-rbac";
import { StoreError } from "@/lib/durable-store";
import {
  validatePromotionDefinition,
  type PromotionDefinition,
} from "@/lib/promotion-engine";
import { T_SKILLS_TEST_ID } from "@/lib/t-skills/versions";
import { validateCareerCatalog } from "@/lib/t-skills/career";
import { T_SKILLS_WORKING_TAXONOMY } from "@/lib/t-skills/content-v4";
import { productionCareerModel } from "@/lib/t-skills/production-career-model";
import { executableAssessmentVersionReason } from "@/lib/assessment-runtime-registry";
import { getPilotAnalytics } from "@/lib/pilot-analytics";

function database() {
  return getD1();
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function promotionStoreError(error: unknown): StoreError {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "PROMO_NOT_ACTIVE";
  const status = ["PROMO_NOT_ACTIVE", "PROMO_DISABLED", "PROMO_EXPIRED", "PROMO_NOT_STARTED"].includes(code) ? 409 : 422;
  return new StoreError(code, status);
}

function pageParams(request: Request) {
  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "25");
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const limit = Math.min(100, Math.max(1, Number.isInteger(limitRaw) ? limitRaw : 25));
  const page = Math.max(1, Number.isInteger(pageRaw) ? pageRaw : 1);
  return { url, limit, page, offset: (page - 1) * limit };
}

function textParam(url: URL, name: string) {
  const value = url.searchParams.get(name)?.trim();
  return value || null;
}

function inListJson(value: string | null | undefined) {
  return parseJson<string[]>(value, []);
}


export async function getAdminOverview() {
  const db = database();
  const [users, sales, userFunnel, funnel, promotions, health, latestVersions] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL`).first<{ count: number }>(),
    db.prepare(`
      SELECT
        COUNT(*) AS orders,
        SUM(CASE WHEN status IN ('PAID','REFUNDED','DISPUTED','DISPUTE_CLOSED') THEN 1 ELSE 0 END) AS paid_orders,
        SUM(CASE WHEN status = 'PAYMENT_FAILED' THEN 1 ELSE 0 END) AS failed_payments,
        SUM(CASE WHEN status = 'REFUNDED' THEN 1 ELSE 0 END) AS refunds,
        COALESCE(SUM(CASE WHEN status IN ('PAID','REFUNDED','DISPUTED','DISPUTE_CLOSED') THEN COALESCE(final_amount_minor, amount_minor) ELSE 0 END), 0) AS revenue,
        COALESCE(SUM(CASE WHEN status IN ('PAID','REFUNDED','DISPUTED','DISPUTE_CLOSED') AND created_at >= ? THEN COALESCE(final_amount_minor, amount_minor) ELSE 0 END), 0) AS revenue_today,
        COALESCE(SUM(CASE WHEN status IN ('PAID','REFUNDED','DISPUTED','DISPUTE_CLOSED') AND created_at >= ? THEN COALESCE(final_amount_minor, amount_minor) ELSE 0 END), 0) AS revenue_7_days,
        COALESCE(SUM(CASE WHEN status IN ('PAID','REFUNDED','DISPUTED','DISPUTE_CLOSED') AND created_at >= ? THEN COALESCE(final_amount_minor, amount_minor) ELSE 0 END), 0) AS revenue_30_days,
        COALESCE(SUM(CASE WHEN status IN ('PAID','REFUNDED','DISPUTED','DISPUTE_CLOSED') THEN COALESCE(discount_amount_minor, 0) ELSE 0 END), 0) AS discounts,
        COALESCE(AVG(CASE WHEN status IN ('PAID','REFUNDED','DISPUTED','DISPUTE_CLOSED') THEN COALESCE(final_amount_minor, amount_minor) END), 0) AS average_order_value
      FROM orders`).bind(Date.now(), Date.now() - 7 * 86400000, Date.now() - 30 * 86400000).first<Record<string, unknown>>(),
    db.prepare(`
      SELECT
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_7,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_30,
        SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS registered
      FROM users`).bind(Date.now() - 7 * 86400000, Date.now() - 30 * 86400000).first<Record<string, unknown>>(),
    db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS registered,
        (SELECT COUNT(DISTINCT user_id) FROM entitlements WHERE status = 'ACTIVE') AS entitled,
        (SELECT COUNT(DISTINCT user_id) FROM assessments WHERE state NOT IN ('CREATED','CANCELLED','INVALIDATED')) AS started,
        (SELECT COUNT(DISTINCT user_id) FROM assessments WHERE state IN ('ADAPTIVE_IN_PROGRESS','ADAPTIVE_FALLBACK','REPORT_GENERATING','REPORT_FAILED_RETRYABLE','COMPLETE')) AS core_completed,
        (SELECT COUNT(DISTINCT user_id) FROM assessments WHERE state IN ('REPORT_GENERATING','REPORT_FAILED_RETRYABLE','COMPLETE')) AS clarification_completed,
        (SELECT COUNT(*) FROM reports WHERE status = 'COMPLETE') AS report_generated`).first<Record<string, unknown>>(),
    db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'DISABLED' THEN 1 ELSE 0 END) AS disabled,
        COALESCE(SUM((SELECT COUNT(*) FROM promo_redemptions r WHERE r.promo_code_id = p.id AND r.status = 'REDEEMED')), 0) AS redemptions,
        COALESCE(SUM((SELECT COALESCE(SUM(discount_amount_minor), 0) FROM promo_redemptions r WHERE r.promo_code_id = p.id AND r.status = 'REDEEMED')), 0) AS discount_total,
        (SELECT COALESCE(SUM(MAX(c.seat_limit - (SELECT COUNT(*) FROM campaign_members cm WHERE cm.campaign_id = c.id), 0)), 0) FROM campaigns c WHERE c.status = 'ACTIVE') AS remaining_campaign_accesses
      FROM promo_codes p`).first<Record<string, unknown>>(),
    db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'REPORT_FAILED_RETRYABLE' THEN 1 ELSE 0 END) AS report_errors,
        (SELECT COUNT(*) FROM payment_events WHERE status = 'PAYMENT_FAILED' AND received_at >= ?) AS payment_errors,
        (SELECT COUNT(*) FROM audit_events WHERE action IN ('AUTH_FAILURE','ADMIN_LOGIN_FAILED') AND created_at >= ?) AS auth_failures,
        (SELECT COUNT(*) FROM purge_jobs WHERE status IN ('FAILED','FAILED_RETRYABLE')) AS purge_errors
      FROM reports`).bind(Date.now() - 7 * 86400000, Date.now() - 7 * 86400000).first<Record<string, unknown>>(),
    db.prepare(`SELECT product_id, version, status, scoring_version, content_version, career_model_version, report_version, published_at FROM assessment_versions ORDER BY product_id, created_at DESC`).all<Record<string, unknown>>(),
  ]);
  const salesRow = sales ?? {};
  const funnelRow = funnel ?? {};
  return {
    generatedAt: new Date().toISOString(),
    sales: {
      revenueToday: numberValue(salesRow.revenue_today),
      revenue7Days: numberValue(salesRow.revenue_7_days),
      revenue30Days: numberValue(salesRow.revenue_30_days),
      paidOrders: numberValue(salesRow.paid_orders),
      failedPayments: numberValue(salesRow.failed_payments),
      refunds: numberValue(salesRow.refunds),
      discounts: numberValue(salesRow.discounts),
      averageOrderValue: Math.round(numberValue(salesRow.average_order_value)),
      currency: "KZT",
    },
    users: {
      registered: numberValue(users?.count),
      new7Days: numberValue(userFunnel?.new_7),
      new30Days: numberValue(userFunnel?.new_30),
      withEntitlement: numberValue(funnelRow.entitled),
    },
    funnel: {
      registered: numberValue(funnelRow.registered),
      entitled: numberValue(funnelRow.entitled),
      started: numberValue(funnelRow.started),
      coreCompleted: numberValue(funnelRow.core_completed),
      clarificationCompleted: numberValue(funnelRow.clarification_completed),
      reportGenerated: numberValue(funnelRow.report_generated),
    },
    promotions: {
      active: numberValue(promotions?.active),
      redemptions: numberValue(promotions?.redemptions),
      disabled: numberValue(promotions?.disabled),
      discountTotal: numberValue(promotions?.discount_total),
      remainingCampaignAccesses: numberValue(promotions?.remaining_campaign_accesses),
    },
    systemHealth: {
      reportGenerationErrors: numberValue(health?.report_errors),
      paymentWebhookErrors: numberValue(health?.payment_errors),
      purgeJobErrors: numberValue(health?.purge_errors),
      authFailures: numberValue(health?.auth_failures),
    },
    assessmentVersions: latestVersions.results ?? [],
  };
}

export async function listUsers(request: Request) {
  const { url, limit, page, offset } = pageParams(request);
  const search = textParam(url, "search");
  const status = textParam(url, "status");
  const conditions = [status === "deleted" ? "u.deleted_at IS NOT NULL" : "u.deleted_at IS NULL"];
  const bindings: Array<string | number> = [];
  if (search) {
    conditions.push("(lower(u.email) LIKE lower(?) OR u.id LIKE ? OR lower(COALESCE(u.full_name, '')) LIKE lower(?))");
    bindings.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status && ["active", "blocked", "deleted"].includes(status)) {
    if (status !== "deleted") { conditions.push("u.status = ?"); bindings.push(status); }
  }
  const where = conditions.join(" AND ");
  const count = await database().prepare(`SELECT COUNT(*) AS count FROM users u WHERE ${where}`).bind(...bindings).first<{ count: number }>();
  const rows = await database().prepare(`
    SELECT u.id, u.email, u.full_name, u.status, u.locale, u.created_at,
      (SELECT COUNT(*) FROM entitlements e WHERE e.user_id = u.id AND e.status = 'ACTIVE') AS entitlements,
      (SELECT COUNT(*) FROM assessments a WHERE a.user_id = u.id) AS assessments,
      (SELECT MAX(COALESCE(a.updated_at, u.updated_at)) FROM assessments a WHERE a.user_id = u.id) AS last_activity
    FROM users u WHERE ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all<Record<string, unknown>>();
  return { data: rows.results ?? [], pagination: { page, limit, total: numberValue(count?.count), hasNext: offset + (rows.results?.length ?? 0) < numberValue(count?.count) } };
}

export async function getUserDetail(userId: string) {
  const db = database();
  const [user, entitlements, orders, assessments, privacy] = await Promise.all([
    db.prepare(`SELECT id, email, full_name, role, status, locale, created_at, updated_at FROM users WHERE id = ? LIMIT 1`).bind(userId).first<Record<string, unknown>>(),
    db.prepare(`SELECT id, test_id, grant_source, grant_reference, promo_code_id, campaign_id, status, created_at, revoked_at, expires_at FROM entitlements WHERE user_id = ? ORDER BY created_at DESC`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, test_id, original_amount_minor, discount_amount_minor, final_amount_minor, amount_minor, currency, status, provider, promo_code_id, campaign_id, created_at, updated_at FROM orders WHERE user_id = ? ORDER BY created_at DESC`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, test_id, state, versions_json, created_at, completed_at, report_id, updated_at FROM assessments WHERE user_id = ? ORDER BY created_at DESC`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, type, status, created_at, completed_at FROM privacy_requests WHERE user_id = ? ORDER BY created_at DESC`).bind(userId).all<Record<string, unknown>>(),
  ]);
  if (!user) throw new StoreError("USER_NOT_FOUND", 404);
  return { user, entitlements: entitlements.results ?? [], orders: orders.results ?? [], assessments: (assessments.results ?? []).map((row) => ({ ...row, versions: parseJson(row.versions_json as string, {}) })), privacy: privacy.results ?? [] };
}

export async function listOrders(request: Request) {
  const { url, limit, page, offset } = pageParams(request);
  const search = textParam(url, "search");
  const status = textParam(url, "status");
  const conditions = ["1 = 1"];
  const bindings: Array<string | number> = [];
  if (search) {
    conditions.push("(o.id LIKE ? OR o.user_id LIKE ? OR lower(u.email) LIKE lower(?))");
    bindings.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status && ["PAID", "PENDING", "PAYMENT_PENDING", "PAYMENT_FAILED", "REFUNDED", "DISPUTED"].includes(status)) {
    conditions.push("o.status = ?");
    bindings.push(status === "PENDING" ? "PAYMENT_PENDING" : status);
  }
  const where = conditions.join(" AND ");
  const count = await database().prepare(`SELECT COUNT(*) AS count FROM orders o JOIN users u ON u.id = o.user_id WHERE ${where}`).bind(...bindings).first<{ count: number }>();
  const rows = await database().prepare(`
    SELECT o.id, o.user_id, u.email, u.full_name, o.test_id,
      COALESCE(o.original_amount_minor, o.amount_minor) AS original_amount_minor,
      COALESCE(o.discount_amount_minor, 0) AS discount_amount_minor,
      COALESCE(o.final_amount_minor, o.amount_minor) AS final_amount_minor,
      o.amount_minor, o.currency, o.status, o.provider, o.promo_code_id, o.campaign_id,
      o.created_at, o.updated_at
    FROM orders o JOIN users u ON u.id = o.user_id WHERE ${where}
    ORDER BY o.created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all<Record<string, unknown>>();
  return { data: rows.results ?? [], pagination: { page, limit, total: numberValue(count?.count), hasNext: offset + (rows.results?.length ?? 0) < numberValue(count?.count) } };
}

export async function getOrderDetail(orderId: string) {
  const db = database();
  const [order, events, redemption, entitlement] = await Promise.all([
    db.prepare(`SELECT o.id, o.user_id, u.email, u.full_name, o.test_id, o.amount_minor, o.original_amount_minor, o.discount_amount_minor, o.final_amount_minor, o.currency, o.status, o.provider, o.provider_checkout_id, o.provider_payment_id, o.provider_event_id, o.promo_code_id, o.campaign_id, o.pricing_snapshot_json, o.created_at, o.updated_at FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ? LIMIT 1`).bind(orderId).first<Record<string, unknown>>(),
    db.prepare(`SELECT id, provider, event_type, status, received_at FROM payment_events WHERE order_id = ? ORDER BY received_at ASC`).bind(orderId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, promo_code_id, user_id, campaign_id, original_amount_minor, discount_amount_minor, final_amount_minor, currency, redeemed_at, status FROM promo_redemptions WHERE order_id = ? LIMIT 1`).bind(orderId).first<Record<string, unknown>>(),
    db.prepare(`SELECT id, test_id, grant_source, grant_reference, status, created_at, revoked_at FROM entitlements WHERE order_id = ? LIMIT 1`).bind(orderId).first<Record<string, unknown>>(),
  ]);
  if (!order) throw new StoreError("ORDER_NOT_FOUND", 404);
  return { order: { ...order, pricingSnapshot: parseJson(order.pricing_snapshot_json as string, null) }, timeline: events.results ?? [], redemption: redemption ?? null, entitlement: entitlement ?? null };
}

export async function listEntitlements(request: Request) {
  const { url, limit, page, offset } = pageParams(request);
  const search = textParam(url, "search");
  const status = textParam(url, "status");
  const conditions = ["1 = 1"];
  const bindings: Array<string | number> = [];
  if (search) {
    conditions.push("(e.id LIKE ? OR e.user_id LIKE ? OR lower(u.email) LIKE lower(?))");
    bindings.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status) { conditions.push("e.status = ?"); bindings.push(status); }
  const where = conditions.join(" AND ");
  const count = await database().prepare(`SELECT COUNT(*) AS count FROM entitlements e JOIN users u ON u.id = e.user_id WHERE ${where}`).bind(...bindings).first<{ count: number }>();
  const rows = await database().prepare(`SELECT e.id, e.user_id, u.email, e.test_id, e.grant_source, e.grant_reference, e.promo_code_id, e.campaign_id, e.status, e.created_at, e.revoked_at, e.expires_at FROM entitlements e JOIN users u ON u.id = e.user_id WHERE ${where} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all<Record<string, unknown>>();
  return { data: rows.results ?? [], pagination: { page, limit, total: numberValue(count?.count), hasNext: offset + (rows.results?.length ?? 0) < numberValue(count?.count) } };
}

function effectivePromoStatus(row: Record<string, unknown>, uses: number, now = Date.now()) {
  const storedStatus = String(row.status ?? "DRAFT");
  if (storedStatus !== "ACTIVE") return storedStatus;
  const validUntil = row.valid_until === null || row.valid_until === undefined ? null : numberValue(row.valid_until);
  if (validUntil !== null && validUntil <= now) return "EXPIRED";
  const maxTotalUses = row.max_total_uses === null || row.max_total_uses === undefined ? null : numberValue(row.max_total_uses);
  if (maxTotalUses !== null && uses >= maxTotalUses) return "EXHAUSTED";
  return "ACTIVE";
}

function promoPayload(row: Record<string, unknown>, usage: { uses: number; completed: number; remaining: number | null }, status = effectivePromoStatus(row, usage.uses)) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    discountType: row.discount_type,
    discountValue: row.discount_value,
    currency: row.currency,
    maxTotalUses: row.max_total_uses,
    maxUsesPerUser: row.max_uses_per_user,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    minimumOrderAmount: row.minimum_order_amount,
    newUsersOnly: numberValue(row.new_users_only) === 1,
    allowedTestIds: inListJson(row.allowed_test_ids_json as string | null),
    campaignId: row.campaign_id,
    status,
    usage,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export async function listPromoCodes(request: Request) {
  const { url, limit, page, offset } = pageParams(request);
  const search = textParam(url, "search");
  const status = textParam(url, "status");
  const conditions = ["1 = 1"];
  const bindings: Array<string | number> = [];
  if (search) { conditions.push("(upper(p.code) LIKE upper(?) OR lower(p.name) LIKE lower(?))"); bindings.push(`%${search}%`, `%${search}%`); }
  const now = Date.now();
  if (status === "ACTIVE") {
    conditions.push("p.status = 'ACTIVE' AND (p.valid_until IS NULL OR p.valid_until > ?) AND (p.max_total_uses IS NULL OR (SELECT COUNT(*) FROM promo_redemptions r2 WHERE r2.promo_code_id = p.id AND (r2.status = 'REDEEMED' OR (r2.status = 'RESERVED' AND r2.reservation_expires_at > ?))) < p.max_total_uses)");
    bindings.push(now, now);
  } else if (status === "EXPIRED") {
    conditions.push("p.status = 'ACTIVE' AND p.valid_until IS NOT NULL AND p.valid_until <= ?");
    bindings.push(now);
  } else if (status === "EXHAUSTED") {
    conditions.push("p.status = 'ACTIVE' AND (p.valid_until IS NULL OR p.valid_until > ?) AND p.max_total_uses IS NOT NULL AND (SELECT COUNT(*) FROM promo_redemptions r2 WHERE r2.promo_code_id = p.id AND (r2.status = 'REDEEMED' OR (r2.status = 'RESERVED' AND r2.reservation_expires_at > ?))) >= p.max_total_uses");
    bindings.push(now, now);
  } else if (status && ["DISABLED", "DRAFT"].includes(status)) {
    conditions.push("p.status = ?");
    bindings.push(status);
  }
  const where = conditions.join(" AND ");
  const count = await database().prepare(`SELECT COUNT(*) AS count FROM promo_codes p WHERE ${where}`).bind(...bindings).first<{ count: number }>();
  const rows = await database().prepare(`
    SELECT p.*, COUNT(r.id) AS uses,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM assessments a WHERE a.user_id = r.user_id AND a.state = 'COMPLETE') THEN 1 ELSE 0 END) AS completed
    FROM promo_codes p LEFT JOIN promo_redemptions r ON r.promo_code_id = p.id AND r.status = 'REDEEMED'
    WHERE ${where} GROUP BY p.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all<Record<string, unknown>>();
  const data = (rows.results ?? []).map((row) => {
    const uses = numberValue(row.uses);
    const max = row.max_total_uses === null ? null : numberValue(row.max_total_uses);
    return promoPayload(row, { uses, completed: numberValue(row.completed), remaining: max === null ? null : Math.max(0, max - uses) }, effectivePromoStatus(row, uses, now));
  });
  return { data, pagination: { page, limit, total: numberValue(count?.count), hasNext: offset + data.length < numberValue(count?.count) } };
}

export async function getPromoCode(promoId: string) {
  const [row, stats] = await Promise.all([
    database().prepare(`SELECT * FROM promo_codes WHERE id = ? LIMIT 1`).bind(promoId).first<Record<string, unknown>>(),
    database().prepare(`SELECT COUNT(*) AS uses, COALESCE(SUM(discount_amount_minor), 0) AS discount_total, COUNT(DISTINCT user_id) AS users FROM promo_redemptions WHERE promo_code_id = ? AND status = 'REDEEMED'`).bind(promoId).first<Record<string, unknown>>(),
  ]);
  if (!row) throw new StoreError("PROMO_NOT_FOUND", 404);
  const uses = numberValue(stats?.uses);
  const max = row.max_total_uses === null ? null : numberValue(row.max_total_uses);
  const redemptions = await database().prepare(`
    SELECT r.id, r.user_id, u.email, r.order_id, r.campaign_id, r.original_amount_minor,
      r.discount_amount_minor, r.final_amount_minor, r.currency, r.reserved_at,
      r.reservation_expires_at, r.released_at, r.redeemed_at, r.status,
      (SELECT COUNT(*) FROM assessments a WHERE a.user_id = r.user_id AND a.state = 'COMPLETE') AS completed_assessments
    FROM promo_redemptions r JOIN users u ON u.id = r.user_id
    WHERE r.promo_code_id = ? ORDER BY r.redeemed_at DESC LIMIT 200`).bind(promoId).all<Record<string, unknown>>();
  return {
    promo: promoPayload(row, { uses, completed: redemptions.results?.reduce((sum, current) => sum + numberValue(current.completed_assessments), 0) ?? 0, remaining: max === null ? null : Math.max(0, max - uses) }, effectivePromoStatus(row, uses)),
    redemptions: redemptions.results ?? [],
    stats: { uses, discountTotal: numberValue(stats?.discount_total), users: numberValue(stats?.users) },
  };
}

export async function createPromo(input: { context: AdminContext; request: Request; data: Record<string, unknown> }) {
  const data = input.data;
  const promoId = id("promo");
  let normalized: ReturnType<typeof validatePromotionDefinition>;
  try {
    normalized = validatePromotionDefinition({
      id: promoId, code: String(data.code), name: String(data.name), description: String(data.description ?? ""),
      discountType: data.discount_type as PromotionDefinition["discountType"], discountValue: Number(data.discount_value),
      currency: String(data.currency), maxTotalUses: data.max_total_uses as number | null | undefined,
      maxUsesPerUser: data.max_uses_per_user as number | null | undefined, validFrom: data.valid_from as number | null | undefined,
      validUntil: data.valid_until as number | null | undefined, minimumOrderAmount: data.minimum_order_amount as number | null | undefined,
      newUsersOnly: data.new_users_only === true, allowedTestIds: data.allowed_test_ids as string[] | undefined,
      allowedEmailDomains: data.allowed_email_domains as string[] | undefined, allowedUserIds: data.allowed_user_ids as string[] | undefined,
      campaignId: data.campaign_id as string | null | undefined,
    });
  } catch (error) {
    throw promotionStoreError(error);
  }
  const timestamp = Date.now();
  try {
    await database().prepare(`INSERT INTO promo_codes
      (id, code, name, description, discount_type, discount_value, currency, max_total_uses,
       max_uses_per_user, valid_from, valid_until, minimum_order_amount, new_users_only,
       allowed_test_ids_json, allowed_email_domains_json, allowed_user_ids_json, campaign_id,
       status, created_by, created_at, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`)
      .bind(promoId, normalized.code, normalized.name.trim(), normalized.description ?? "", normalized.discountType, normalized.discountValue,
        normalized.currency, normalized.maxTotalUses ?? null, normalized.maxUsesPerUser ?? null, normalized.validFrom ?? null, normalized.validUntil ?? null,
        normalized.minimumOrderAmount ?? null, normalized.newUsersOnly ? 1 : 0, JSON.stringify(normalized.allowedTestIds ?? []),
        JSON.stringify(normalized.allowedEmailDomains ?? []), JSON.stringify(normalized.allowedUserIds ?? []), normalized.campaignId ?? null,
        input.context.viewer.userId, timestamp, input.context.viewer.userId, timestamp).run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) throw new StoreError("PROMO_CODE_EXISTS", 409);
    throw error;
  }
  await writeAdminAudit({ context: input.context, request: input.request, action: "PROMO_CREATED", entityType: "promo_code", entityId: promoId, metadata: { code: normalized.code, discountType: normalized.discountType }, reason: String(data.reason ?? "") || null });
  return getPromoCode(promoId);
}

export async function updatePromo(input: { context: AdminContext; request: Request; promoId: string; data: Record<string, unknown> }) {
  const current = await database().prepare(`SELECT * FROM promo_codes WHERE id = ? LIMIT 1`).bind(input.promoId).first<Record<string, unknown>>();
  if (!current) throw new StoreError("PROMO_NOT_FOUND", 404);
  if (current.status === "DISABLED" && input.data.status !== "ACTIVE") throw new StoreError("PROMO_IMMUTABLE_DISABLED", 409);
  if (input.data.expected_updated_at !== undefined && numberValue(input.data.expected_updated_at) !== numberValue(current.updated_at)) throw new StoreError("RESOURCE_CHANGED", 409);
  const merged = {
    id: input.promoId, code: String(input.data.code ?? current.code), name: String(input.data.name ?? current.name), description: String(input.data.description ?? current.description ?? ""),
    discountType: (input.data.discount_type ?? current.discount_type) as PromotionDefinition["discountType"], discountValue: Number(input.data.discount_value ?? current.discount_value),
    currency: String(input.data.currency ?? current.currency), maxTotalUses: (input.data.max_total_uses ?? current.max_total_uses) as number | null,
    maxUsesPerUser: (input.data.max_uses_per_user ?? current.max_uses_per_user) as number | null, validFrom: (input.data.valid_from ?? current.valid_from) as number | null,
    validUntil: (input.data.valid_until ?? current.valid_until) as number | null, minimumOrderAmount: (input.data.minimum_order_amount ?? current.minimum_order_amount) as number | null,
    newUsersOnly: input.data.new_users_only === undefined ? numberValue(current.new_users_only) === 1 : input.data.new_users_only === true,
    allowedTestIds: (input.data.allowed_test_ids ?? inListJson(current.allowed_test_ids_json as string)) as string[],
    allowedEmailDomains: (input.data.allowed_email_domains ?? inListJson(current.allowed_email_domains_json as string)) as string[],
    allowedUserIds: (input.data.allowed_user_ids ?? inListJson(current.allowed_user_ids_json as string)) as string[],
    campaignId: (input.data.campaign_id ?? current.campaign_id) as string | null,
  };
  let normalized: ReturnType<typeof validatePromotionDefinition>;
  try {
    normalized = validatePromotionDefinition(merged);
  } catch (error) {
    throw promotionStoreError(error);
  }
  const timestamp = Date.now();
  const result = await database().prepare(`UPDATE promo_codes SET code = ?, name = ?, description = ?, discount_type = ?, discount_value = ?, currency = ?, max_total_uses = ?, max_uses_per_user = ?, valid_from = ?, valid_until = ?, minimum_order_amount = ?, new_users_only = ?, allowed_test_ids_json = ?, allowed_email_domains_json = ?, allowed_user_ids_json = ?, campaign_id = ?, status = ?, updated_by = ?, updated_at = ? WHERE id = ? AND updated_at = ?`)
    .bind(normalized.code, normalized.name.trim(), normalized.description ?? "", normalized.discountType, normalized.discountValue, normalized.currency,
      normalized.maxTotalUses ?? null, normalized.maxUsesPerUser ?? null, normalized.validFrom ?? null, normalized.validUntil ?? null, normalized.minimumOrderAmount ?? null,
      normalized.newUsersOnly ? 1 : 0, JSON.stringify(normalized.allowedTestIds ?? []), JSON.stringify(normalized.allowedEmailDomains ?? []), JSON.stringify(normalized.allowedUserIds ?? []), normalized.campaignId ?? null,
      input.data.status ?? current.status, input.context.viewer.userId, timestamp, input.promoId, current.updated_at).run();
  if ((result.meta?.changes ?? 0) !== 1) throw new StoreError("RESOURCE_CHANGED", 409);
  await writeAdminAudit({ context: input.context, request: input.request, action: input.data.status === "DISABLED" ? "PROMO_DISABLED" : "PROMO_UPDATED", entityType: "promo_code", entityId: input.promoId, metadata: { code: normalized.code }, reason: String(input.data.reason ?? "") || null });
  return getPromoCode(input.promoId);
}

export async function listCampaigns(request: Request) {
  const { url, limit, page, offset } = pageParams(request);
  const search = textParam(url, "search");
  const status = textParam(url, "status");
  const conditions = ["1 = 1"];
  const bindings: Array<string | number> = [];
  if (search) { conditions.push("(lower(c.name) LIKE lower(?) OR lower(c.client_name) LIKE lower(?))"); bindings.push(`%${search}%`, `%${search}%`); }
  if (status) { conditions.push("c.status = ?"); bindings.push(status); }
  const where = conditions.join(" AND ");
  const count = await database().prepare(`SELECT COUNT(*) AS count FROM campaigns c WHERE ${where}`).bind(...bindings).first<{ count: number }>();
  const rows = await database().prepare(`
    SELECT c.*, COUNT(DISTINCT cm.user_id) AS activated,
      COUNT(DISTINCT CASE WHEN a.state NOT IN ('CREATED','CANCELLED','INVALIDATED') THEN a.user_id END) AS started,
      COUNT(DISTINCT CASE WHEN a.state = 'COMPLETE' THEN a.user_id END) AS completed,
      COUNT(DISTINCT CASE WHEN a.state = 'COMPLETE' AND a.report_id IS NOT NULL THEN a.user_id END) AS reports
    FROM campaigns c LEFT JOIN campaign_members cm ON cm.campaign_id = c.id
      LEFT JOIN assessments a ON a.user_id = cm.user_id
    WHERE ${where} GROUP BY c.id ORDER BY c.created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all<Record<string, unknown>>();
  const data = (rows.results ?? []).map((row) => ({ ...row, unused: Math.max(0, numberValue(row.seat_limit) - numberValue(row.activated)) }));
  return { data, pagination: { page, limit, total: numberValue(count?.count), hasNext: offset + data.length < numberValue(count?.count) } };
}

export async function getCampaign(campaignId: string) {
  const campaign = await database().prepare(`SELECT * FROM campaigns WHERE id = ? LIMIT 1`).bind(campaignId).first<Record<string, unknown>>();
  if (!campaign) throw new StoreError("CAMPAIGN_NOT_FOUND", 404);
  const [promoCodes, members] = await Promise.all([
    database().prepare(`SELECT id, code, name, status, discount_type, discount_value, max_total_uses FROM promo_codes WHERE campaign_id = ? ORDER BY created_at DESC`).bind(campaignId).all<Record<string, unknown>>(),
    database().prepare(`SELECT cm.id, cm.user_id, u.email, cm.entitlement_id, cm.created_at, (SELECT COUNT(*) FROM assessments a WHERE a.user_id = cm.user_id AND a.state NOT IN ('CREATED','CANCELLED','INVALIDATED')) AS started, (SELECT COUNT(*) FROM assessments a WHERE a.user_id = cm.user_id AND a.state = 'COMPLETE') AS completed, (SELECT COUNT(*) FROM assessments a WHERE a.user_id = cm.user_id AND a.state = 'COMPLETE' AND a.report_id IS NOT NULL) AS reports FROM campaign_members cm JOIN users u ON u.id = cm.user_id WHERE cm.campaign_id = ? ORDER BY cm.created_at DESC LIMIT 500`).bind(campaignId).all<Record<string, unknown>>(),
  ]);
  const activated = members.results?.length ?? 0;
  const started = members.results?.filter((row) => numberValue(row.started) > 0).length ?? 0;
  const completed = members.results?.filter((row) => numberValue(row.completed) > 0).length ?? 0;
  const reportsGenerated = members.results?.reduce((sum, row) => sum + (numberValue(row.reports) > 0 ? 1 : 0), 0) ?? 0;
  return { campaign, promoCodes: promoCodes.results ?? [], members: members.results ?? [], metrics: { purchasedSeats: campaign.seat_limit, activated, started, completed, reportsGenerated, unused: Math.max(0, numberValue(campaign.seat_limit) - activated), expired: campaign.status === "EXPIRED" ? Math.max(0, numberValue(campaign.seat_limit) - completed) : 0 } };
}

export async function createCampaign(input: { context: AdminContext; request: Request; data: Record<string, unknown> }) {
  const campaignId = id("camp");
  const now = Date.now();
  await database().prepare(`INSERT INTO campaigns (id, name, client_name, client_type, internal_notes, status, seat_limit, seat_usage_policy, valid_from, valid_until, default_test_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(campaignId, input.data.name, input.data.client_name, input.data.client_type, input.data.internal_notes ?? "", input.data.seat_limit, input.data.seat_usage_policy ?? "ONE_PER_USER", input.data.valid_from ?? null, input.data.valid_until ?? null, input.data.default_test_id ?? T_SKILLS_TEST_ID, input.context.viewer.userId, now, now).run();
  await writeAdminAudit({ context: input.context, request: input.request, action: "CAMPAIGN_CREATED", entityType: "campaign", entityId: campaignId, metadata: { clientType: input.data.client_type, seatLimit: input.data.seat_limit } });
  return getCampaign(campaignId);
}

export async function updateCampaign(input: { context: AdminContext; request: Request; campaignId: string; data: Record<string, unknown> }) {
  const current = await database().prepare(`SELECT * FROM campaigns WHERE id = ? LIMIT 1`).bind(input.campaignId).first<Record<string, unknown>>();
  if (!current) throw new StoreError("CAMPAIGN_NOT_FOUND", 404);
  if (input.data.expected_updated_at !== undefined && numberValue(input.data.expected_updated_at) !== numberValue(current.updated_at)) throw new StoreError("RESOURCE_CHANGED", 409);
  const now = Date.now();
  await database().prepare(`UPDATE campaigns SET name = ?, client_name = ?, client_type = ?, internal_notes = ?, status = ?, seat_limit = ?, seat_usage_policy = ?, valid_from = ?, valid_until = ?, default_test_id = ?, updated_at = ? WHERE id = ? AND updated_at = ?`)
    .bind(input.data.name ?? current.name, input.data.client_name ?? current.client_name, input.data.client_type ?? current.client_type, input.data.internal_notes ?? current.internal_notes,
      input.data.status ?? current.status, input.data.seat_limit ?? current.seat_limit, input.data.seat_usage_policy ?? current.seat_usage_policy, input.data.valid_from ?? current.valid_from,
      input.data.valid_until ?? current.valid_until, input.data.default_test_id ?? current.default_test_id, now, input.campaignId, current.updated_at).run();
  await writeAdminAudit({ context: input.context, request: input.request, action: "CAMPAIGN_UPDATED", entityType: "campaign", entityId: input.campaignId, metadata: { status: input.data.status ?? current.status }, reason: String(input.data.reason ?? "") || null });
  return getCampaign(input.campaignId);
}

async function grantEntitlement(input: { context: AdminContext; request: Request; userId: string; data: Record<string, unknown>; source: "admin_manual" | "admin_retake" | "promo_free" | "campaign" }) {
  const user = await database().prepare(`SELECT id FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`).bind(input.userId).first<{ id: string }>();
  if (!user) throw new StoreError("USER_NOT_FOUND", 404);
  const reference = `${input.source}:${crypto.randomUUID()}`;
  const entitlementId = id("ent");
  const createdAt = Date.now();
  const campaignId = (input.data.campaign_id as string | null | undefined) ?? null;
  if (campaignId) {
    const campaign = await database().prepare(`SELECT id, seat_limit, status, valid_from, valid_until, (SELECT COUNT(*) FROM campaign_members WHERE campaign_id = ?) AS used FROM campaigns WHERE id = ? LIMIT 1`).bind(campaignId, campaignId).first<{ id: string; seat_limit: number; status: string; valid_from: number | null; valid_until: number | null; used: number }>();
    if (!campaign) throw new StoreError("CAMPAIGN_NOT_FOUND", 404);
    if (campaign.status !== "ACTIVE") throw new StoreError("CAMPAIGN_NOT_ACTIVE", 409);
    if (campaign.valid_from !== null && numberValue(campaign.valid_from) > createdAt) throw new StoreError("CAMPAIGN_NOT_STARTED", 409);
    if (campaign.valid_until !== null && numberValue(campaign.valid_until) <= createdAt) throw new StoreError("CAMPAIGN_EXPIRED", 409);
    if (numberValue(campaign.used) >= numberValue(campaign.seat_limit)) throw new StoreError("CAMPAIGN_SEAT_LIMIT_REACHED", 409);
    const member = await database().prepare(`SELECT id FROM campaign_members WHERE campaign_id = ? AND user_id = ? LIMIT 1`).bind(campaignId, input.userId).first<{ id: string }>();
    if (member) throw new StoreError("CAMPAIGN_USER_ALREADY_ACTIVATED", 409);

    // Seat reservation and entitlement creation are one D1 batch. The
    // guarded INSERTs make a last-seat race fail atomically instead of
    // leaving an entitlement without a campaign member (or vice versa).
    try {
      await database().batch([
        database().prepare(`
          INSERT INTO entitlements
            (id, order_id, user_id, test_id, grant_source, grant_reference, promo_code_id, campaign_id, status, created_at, revoked_at, expires_at)
          SELECT ?, NULL, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, NULL, ?
          FROM campaigns c
          WHERE c.id = ? AND c.status = 'ACTIVE'
            AND (c.valid_from IS NULL OR c.valid_from <= ?)
            AND (c.valid_until IS NULL OR c.valid_until > ?)
            AND (SELECT COUNT(*) FROM campaign_members m WHERE m.campaign_id = c.id) < c.seat_limit
            AND NOT EXISTS (SELECT 1 FROM campaign_members m WHERE m.campaign_id = c.id AND m.user_id = ?)
        `).bind(entitlementId, input.userId, input.data.test_id, input.source, reference, input.data.promo_code_id ?? null, campaignId, createdAt, input.data.expires_at ?? null, campaignId, createdAt, createdAt, input.userId),
        database().prepare(`
          INSERT INTO campaign_members (id, campaign_id, user_id, entitlement_id, created_at)
          SELECT ?, ?, ?, ?, ?
          WHERE EXISTS (SELECT 1 FROM entitlements WHERE id = ? AND campaign_id = ? AND status = 'ACTIVE')
        `).bind(id("member"), campaignId, input.userId, entitlementId, createdAt, entitlementId, campaignId),
      ]);
    } catch {
      const retry = await database().prepare(`SELECT c.status, c.seat_limit, c.valid_from, c.valid_until, (SELECT COUNT(*) FROM campaign_members WHERE campaign_id = c.id) AS used, EXISTS (SELECT 1 FROM campaign_members WHERE campaign_id = c.id AND user_id = ?) AS already_used FROM campaigns c WHERE c.id = ? LIMIT 1`).bind(input.userId, campaignId).first<{ status: string; seat_limit: number; valid_from: number | null; valid_until: number | null; used: number; already_used: number }>();
      if (retry?.already_used) throw new StoreError("CAMPAIGN_USER_ALREADY_ACTIVATED", 409);
      if (retry && numberValue(retry.used) >= numberValue(retry.seat_limit)) throw new StoreError("CAMPAIGN_SEAT_LIMIT_REACHED", 409);
      throw new StoreError("ENTITLEMENT_GRANT_FAILED", 500);
    }
  } else {
    const result = await database().prepare(`INSERT INTO entitlements (id, order_id, user_id, test_id, grant_source, grant_reference, promo_code_id, campaign_id, status, created_at, revoked_at, expires_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, NULL, ?)`)
      .bind(entitlementId, input.userId, input.data.test_id, input.source, reference, input.data.promo_code_id ?? null, campaignId, createdAt, input.data.expires_at ?? null).run();
    if ((result.meta?.changes ?? 0) !== 1) throw new StoreError("ENTITLEMENT_GRANT_FAILED", 500);
  }
  await writeAdminAudit({ context: input.context, request: input.request, action: "ENTITLEMENT_GRANTED", entityType: "entitlement", entityId: entitlementId, metadata: { source: input.source, testId: input.data.test_id, targetUserId: input.userId, campaignId }, reason: String(input.data.reason ?? "") || null });
  return database().prepare(`SELECT id, user_id, test_id, grant_source, grant_reference, promo_code_id, campaign_id, status, created_at, revoked_at, expires_at FROM entitlements WHERE id = ?`).bind(entitlementId).first<Record<string, unknown>>();
}

export async function performUserSupportAction(input: { context: AdminContext; request: Request; userId: string; data: Record<string, unknown> }) {
  const action = String(input.data.action);
  const reason = String(input.data.reason ?? "").trim();
  if (["REVOKE_ENTITLEMENT", "BLOCK_ACCOUNT", "INVALIDATE_UNFINISHED"].includes(action) && !reason) throw new StoreError("REASON_REQUIRED", 422);
  if (action === "GRANT_ACCESS") return grantEntitlement({ context: input.context, request: input.request, userId: input.userId, data: (input.data.grant ?? {}) as Record<string, unknown>, source: "admin_manual" });
  if (action === "ALLOW_RETAKE") return grantEntitlement({ context: input.context, request: input.request, userId: input.userId, data: { ...(input.data.grant as Record<string, unknown> | undefined ?? {}), reason }, source: "admin_retake" });
  if (action === "REVOKE_ENTITLEMENT") {
    const entitlementId = String(input.data.entitlement_id ?? "");
    const result = await database().prepare(`UPDATE entitlements SET status = 'REVOKED', revoked_at = ? WHERE id = ? AND user_id = ? AND status = 'ACTIVE'`).bind(Date.now(), entitlementId, input.userId).run();
    if ((result.meta?.changes ?? 0) !== 1) throw new StoreError("ENTITLEMENT_NOT_FOUND", 404);
    await writeAdminAudit({ context: input.context, request: input.request, action: "ENTITLEMENT_REVOKED", entityType: "entitlement", entityId: entitlementId, metadata: { targetUserId: input.userId }, reason });
    return { id: entitlementId, status: "REVOKED" };
  }
  if (action === "BLOCK_ACCOUNT" || action === "UNBLOCK_ACCOUNT") {
    const status = action === "BLOCK_ACCOUNT" ? "blocked" : "active";
    const result = await database().prepare(`UPDATE users SET status = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`).bind(status, Date.now(), input.userId).run();
    if ((result.meta?.changes ?? 0) !== 1) throw new StoreError("USER_NOT_FOUND", 404);
    await writeAdminAudit({ context: input.context, request: input.request, action: action === "BLOCK_ACCOUNT" ? "USER_BLOCKED" : "USER_UNBLOCKED", entityType: "user", entityId: input.userId, metadata: {}, reason: reason || null });
    return { userId: input.userId, status };
  }
  if (action === "FORCE_LOGOUT") {
    await database().prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).bind(Date.now(), input.userId).run();
    await writeAdminAudit({ context: input.context, request: input.request, action: "USER_FORCE_LOGOUT", entityType: "user", entityId: input.userId, metadata: {}, reason: reason || null });
    return { userId: input.userId, loggedOut: true };
  }
  if (action === "INVALIDATE_UNFINISHED") {
    const result = await database().prepare(`UPDATE assessments SET state = 'INVALIDATED', updated_at = ? WHERE user_id = ? AND state NOT IN ('COMPLETE','CANCELLED','INVALIDATED')`).bind(Date.now(), input.userId).run();
    await writeAdminAudit({ context: input.context, request: input.request, action: "ASSESSMENT_INVALIDATED", entityType: "user", entityId: input.userId, metadata: { count: result.meta?.changes ?? 0 }, reason });
    return { userId: input.userId, invalidated: result.meta?.changes ?? 0 };
  }
  if (action === "RESEND_REPORT") {
    await writeAdminAudit({ context: input.context, request: input.request, action: "REPORT_EMAIL_RESEND_REQUESTED", entityType: "user", entityId: input.userId, metadata: {}, reason: reason || null });
    return { userId: input.userId, queued: false, message: "Report resend requires configured transactional email job." };
  }
  throw new StoreError("SUPPORT_ACTION_INVALID", 422);
}

export async function listReports(request: Request) {
  const { url, limit, page, offset } = pageParams(request);
  const status = textParam(url, "status");
  const conditions = ["1 = 1"];
  const bindings: Array<string | number> = [];
  if (status) { conditions.push("r.status = ?"); bindings.push(status); }
  const where = conditions.join(" AND ");
  const count = await database().prepare(`SELECT COUNT(*) AS count FROM reports r WHERE ${where}`).bind(...bindings).first<{ count: number }>();
  const rows = await database().prepare(`SELECT r.id, r.assessment_id, r.user_id, r.status, r.provider, r.prompt_version, r.model_id, r.validation_result, r.error_code, r.created_at, r.updated_at, a.versions_json FROM reports r JOIN assessments a ON a.id = r.assessment_id WHERE ${where} ORDER BY r.updated_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all<Record<string, unknown>>();
  return { data: (rows.results ?? []).map((row) => ({ ...row, versions: parseJson(row.versions_json as string, {}) })), pagination: { page, limit, total: numberValue(count?.count), hasNext: offset + (rows.results?.length ?? 0) < numberValue(count?.count) } };
}

export async function retryReport(input: { context: AdminContext; request: Request; reportId: string }) {
  const report = await database().prepare(`SELECT id, status FROM reports WHERE id = ? LIMIT 1`).bind(input.reportId).first<{ id: string; status: string }>();
  if (!report) throw new StoreError("REPORT_NOT_FOUND", 404);
  if (report.status !== "REPORT_FAILED_RETRYABLE") throw new StoreError("REPORT_NOT_RETRYABLE", 409);
  await database().prepare(`UPDATE reports SET status = 'REPORT_GENERATING', error_code = NULL, updated_at = ? WHERE id = ? AND status = 'REPORT_FAILED_RETRYABLE'`).bind(Date.now(), input.reportId).run();
  await writeAdminAudit({ context: input.context, request: input.request, action: "REPORT_RETRY_REQUESTED", entityType: "report", entityId: input.reportId, metadata: {} });
  return { id: input.reportId, status: "REPORT_GENERATING" };
}

const REQUIRED_CONTENT_FIELDS: Record<string, string[]> = {
  homepage: ["heroPre", "heroLede", "cta"],
  "homepage.hero": ["title", "subtitle", "cta"],
  pricing: ["visiblePrice", "explanatoryCopy"],
};

function assertSafeStructuredContent(payload: unknown) {
  const visit = (value: unknown, path: string, depth: number): void => {
    if (depth > 6) throw new StoreError("CONTENT_PAYLOAD_INVALID", 422);
    if (typeof value === "string") {
      if (/<\s*(script|iframe|object|embed)\b/i.test(value) || /javascript\s*:/i.test(value)) throw new StoreError("CONTENT_UNSAFE_MARKUP", 422);
      if (value.length > 20_000) throw new StoreError("CONTENT_FIELD_TOO_LONG", 422);
      return;
    }
    if (Array.isArray(value)) { value.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1)); return; }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (/html|script|iframe|javascript|raw/i.test(key)) throw new StoreError("CONTENT_UNSAFE_FIELD", 422);
        visit(child, `${path}.${key}`, depth + 1);
      }
    }
  };
  visit(payload, "$", 0);
}

function assertRequiredContent(contentKey: string, payload: Record<string, unknown>) {
  const required = REQUIRED_CONTENT_FIELDS[contentKey] ?? [];
  for (const field of required) if (typeof payload[field] !== "string" || !String(payload[field]).trim()) throw new StoreError("CONTENT_REQUIRED_FIELD", 422);
}

export async function listContent(request: Request, publicOnly = false) {
  const { url, limit, page, offset } = pageParams(request);
  const locale = textParam(url, "locale") ?? "ru";
  const contentKey = textParam(url, "content_key");
  const conditions = ["e.locale = ?"];
  const bindings: Array<string | number> = [locale];
  if (contentKey) { conditions.push("e.content_key = ?"); bindings.push(contentKey); }
  if (publicOnly) conditions.push("e.published_version IS NOT NULL");
  const where = conditions.join(" AND ");
  const count = await database().prepare(`SELECT COUNT(*) AS count FROM content_entries e WHERE ${where}`).bind(...bindings).first<{ count: number }>();
  const rows = await database().prepare(`
    SELECT e.content_key, e.locale, e.current_version, e.published_version, e.updated_at,
      cv.payload_json AS draft_payload_json, pv.payload_json AS published_payload_json,
      cv.status AS draft_status, pv.status AS published_status
    FROM content_entries e
    LEFT JOIN content_versions cv ON cv.content_key = e.content_key AND cv.locale = e.locale AND cv.version = e.current_version
    LEFT JOIN content_versions pv ON pv.content_key = e.content_key AND pv.locale = e.locale AND pv.version = e.published_version
    WHERE ${where} ORDER BY e.content_key ASC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all<Record<string, unknown>>();
  const data = (rows.results ?? []).map((row) => ({
    contentKey: row.content_key, locale: row.locale, currentVersion: row.current_version, publishedVersion: row.published_version, updatedAt: row.updated_at,
    draft: parseJson(row.draft_payload_json as string, null), published: parseJson(row.published_payload_json as string, null), draftStatus: row.draft_status, publishedStatus: row.published_status,
  }));
  return publicOnly ? data : { data, pagination: { page, limit, total: numberValue(count?.count), hasNext: offset + data.length < numberValue(count?.count) } };
}

export async function upsertContentDraft(input: { context: AdminContext; request: Request; data: { content_key: string; locale: string; payload: Record<string, unknown>; expected_version?: number } }) {
  assertSafeStructuredContent(input.data.payload);
  const current = await database().prepare(`SELECT current_version, published_version, updated_at FROM content_entries WHERE content_key = ? AND locale = ? LIMIT 1`).bind(input.data.content_key, input.data.locale).first<{ current_version: number; published_version: number | null; updated_at: number }>();
  if (input.data.expected_version !== undefined && current && input.data.expected_version !== current.current_version) throw new StoreError("RESOURCE_CHANGED", 409);
  const nextVersion = (current?.current_version ?? 0) + 1;
  const now = Date.now();
  await database().batch([
    database().prepare(`INSERT INTO content_entries (id, content_key, locale, current_version, published_version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(content_key, locale) DO UPDATE SET current_version = excluded.current_version, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(id("content"), input.data.content_key, input.data.locale, nextVersion, current?.published_version ?? null, input.context.viewer.userId, now),
    database().prepare(`INSERT INTO content_versions (id, content_key, locale, version, payload_json, status, created_by, created_at, published_by, published_at) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, NULL, NULL)`).bind(id("contentv"), input.data.content_key, input.data.locale, nextVersion, JSON.stringify(input.data.payload), input.context.viewer.userId, now),
  ]);
  await writeAdminAudit({ context: input.context, request: input.request, action: "CONTENT_UPDATED", entityType: "content", entityId: `${input.data.content_key}:${input.data.locale}`, metadata: { version: nextVersion, locale: input.data.locale } });
  return { contentKey: input.data.content_key, locale: input.data.locale, version: nextVersion, status: "DRAFT", payload: input.data.payload };
}

export async function publishContent(input: { context: AdminContext; request: Request; contentKey: string; data: { locale: string; version: number; reason?: string } }) {
  const row = await database().prepare(`SELECT payload_json, status FROM content_versions WHERE content_key = ? AND locale = ? AND version = ? LIMIT 1`).bind(input.contentKey, input.data.locale, input.data.version).first<{ payload_json: string; status: string }>();
  if (!row) throw new StoreError("CONTENT_VERSION_NOT_FOUND", 404);
  const payload = parseJson<Record<string, unknown>>(row.payload_json, {});
  assertRequiredContent(input.contentKey, payload);
  const now = Date.now();
  await database().batch([
    database().prepare(`UPDATE content_versions SET status = 'PUBLISHED', published_by = ?, published_at = ? WHERE content_key = ? AND locale = ? AND version = ?`).bind(input.context.viewer.userId, now, input.contentKey, input.data.locale, input.data.version),
    database().prepare(`UPDATE content_entries SET published_version = ?, updated_by = ?, updated_at = ? WHERE content_key = ? AND locale = ?`).bind(input.data.version, input.context.viewer.userId, now, input.contentKey, input.data.locale),
  ]);
  await writeAdminAudit({ context: input.context, request: input.request, action: "CONTENT_PUBLISHED", entityType: "content", entityId: `${input.contentKey}:${input.data.locale}`, metadata: { version: input.data.version }, reason: input.data.reason ?? null });
  return { contentKey: input.contentKey, locale: input.data.locale, version: input.data.version, status: "PUBLISHED", payload };
}

export async function restoreContent(input: { context: AdminContext; request: Request; contentKey: string; data: { locale: string; version: number; reason: string } }) {
  const row = await database().prepare(`SELECT payload_json FROM content_versions WHERE content_key = ? AND locale = ? AND version = ? LIMIT 1`).bind(input.contentKey, input.data.locale, input.data.version).first<{ payload_json: string }>();
  if (!row) throw new StoreError("CONTENT_VERSION_NOT_FOUND", 404);
  const payload = parseJson<Record<string, unknown>>(row.payload_json, {});
  return upsertContentDraft({ context: input.context, request: input.request, data: { content_key: input.contentKey, locale: input.data.locale, payload } }).then(async (result) => {
    await writeAdminAudit({ context: input.context, request: input.request, action: "CONTENT_RESTORED", entityType: "content", entityId: `${input.contentKey}:${input.data.locale}`, metadata: { sourceVersion: input.data.version, newVersion: result.version }, reason: input.data.reason });
    return result;
  });
}

export async function getPricing() {
  const rows = await database().prepare(`SELECT p.id, p.test_id, p.name, p.status, p.amount_minor, p.currency, p.updated_by, p.updated_at, COALESCE(json_group_array(json_object('version', v.version, 'amountMinor', v.amount_minor, 'currency', v.currency, 'status', v.status, 'createdAt', v.created_at)), '[]') AS versions_json FROM products p LEFT JOIN pricing_versions v ON v.product_id = p.id GROUP BY p.id ORDER BY p.test_id`).all<Record<string, unknown>>();
  return (rows.results ?? []).map((row) => ({ ...row, versions: parseJson(row.versions_json as string, []) }));
}

export async function updatePricing(input: { context: AdminContext; request: Request; data: Record<string, unknown> }) {
  const now = Date.now();
  const current = await database().prepare(`SELECT * FROM products WHERE test_id = ? LIMIT 1`).bind(input.data.test_id).first<Record<string, unknown>>();
  if (current && input.data.expected_updated_at !== undefined && numberValue(input.data.expected_updated_at) !== numberValue(current.updated_at)) throw new StoreError("RESOURCE_CHANGED", 409);
  const productId = String(current?.id ?? id("product"));
  const version = numberValue(await database().prepare(`SELECT COALESCE(MAX(version), 0) AS version FROM pricing_versions WHERE product_id = ?`).bind(productId).first<{ version: number }>().then((row) => row?.version)) + 1;
  await database().batch([
    database().prepare(`INSERT INTO products (id, test_id, name, status, amount_minor, currency, updated_by, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?) ON CONFLICT(test_id) DO UPDATE SET name = excluded.name, amount_minor = excluded.amount_minor, currency = excluded.currency, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(productId, input.data.test_id, input.data.name, input.data.amount_minor, String(input.data.currency).toUpperCase(), input.context.viewer.userId, now),
    database().prepare(`UPDATE pricing_versions SET status = 'ARCHIVED' WHERE product_id = ? AND status = 'CURRENT'`).bind(productId),
    database().prepare(`INSERT INTO pricing_versions (id, product_id, version, amount_minor, currency, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'CURRENT', ?, ?)`).bind(id("price"), productId, version, input.data.amount_minor, String(input.data.currency).toUpperCase(), input.context.viewer.userId, now),
  ]);
  await writeAdminAudit({ context: input.context, request: input.request, action: "PRICE_CHANGED", entityType: "product", entityId: productId, metadata: { testId: input.data.test_id, amountMinor: input.data.amount_minor, currency: String(input.data.currency).toUpperCase() }, reason: String(input.data.reason) });
  return getPricing();
}

export async function listCareerCatalog(request: Request) {
  const { url, limit, page, offset } = pageParams(request);
  const version = textParam(url, "version");
  const search = textParam(url, "search");
  const conditions = ["1 = 1"];
  const bindings: Array<string | number> = [];
  if (version) { conditions.push("e.catalog_version = ?"); bindings.push(version); }
  if (search) { conditions.push("(lower(e.slug) LIKE lower(?) OR lower(e.title_ru) LIKE lower(?) OR lower(e.title_kk) LIKE lower(?))"); bindings.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const where = conditions.join(" AND ");
  const count = await database().prepare(`SELECT COUNT(*) AS count FROM career_catalog_entries e WHERE ${where}`).bind(...bindings).first<{ count: number }>();
  const rows = await database().prepare(`SELECT e.* FROM career_catalog_entries e WHERE ${where} ORDER BY e.catalog_version DESC, e.slug ASC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all<Record<string, unknown>>();
  const data = (rows.results ?? []).map((row) => ({ ...row, educationPaths: inListJson(row.education_paths_json as string), careerTags: inListJson(row.career_tags_json as string) }));
  return { data, pagination: { page, limit, total: numberValue(count?.count), hasNext: offset + data.length < numberValue(count?.count) } };
}

export async function upsertCareerEntry(input: { context: AdminContext; request: Request; data: Record<string, unknown> }) {
  const now = Date.now();
  const version = String(input.data.catalog_version);
  const existingVersion = await database().prepare(`SELECT status FROM career_catalog_versions WHERE version = ? LIMIT 1`).bind(version).first<{ status: string }>();
  if (existingVersion?.status === "PUBLISHED") throw new StoreError("PUBLISHED_CAREER_CATALOG_IMMUTABLE", 409);
  await database().prepare(`INSERT INTO career_catalog_versions (id, version, status, created_by, created_at, published_at) VALUES (?, ?, 'DRAFT', ?, ?, NULL) ON CONFLICT(version) DO NOTHING`).bind(id("career_catalog"), version, input.context.viewer.userId, now).run();
  const entryId = id("career");
  await database().prepare(`INSERT INTO career_catalog_entries (id, catalog_version, slug, status, title_ru, title_kk, description_ru, description_kk, category, education_paths_json, work_environment, career_tags_json, matching_config_json, source_version, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?) ON CONFLICT(catalog_version, slug) DO UPDATE SET status = excluded.status, title_ru = excluded.title_ru, title_kk = excluded.title_kk, description_ru = excluded.description_ru, description_kk = excluded.description_kk, category = excluded.category, education_paths_json = excluded.education_paths_json, work_environment = excluded.work_environment, career_tags_json = excluded.career_tags_json, source_version = excluded.source_version, updated_at = excluded.updated_at`)
    .bind(entryId, version, input.data.slug, input.data.status ?? "ACTIVE", input.data.title_ru, input.data.title_kk, input.data.description_ru, input.data.description_kk, input.data.category, JSON.stringify(input.data.education_paths ?? []), input.data.work_environment ?? "", JSON.stringify(input.data.career_tags ?? []), input.data.source_version, input.context.viewer.userId, now, now).run();
  await writeAdminAudit({ context: input.context, request: input.request, action: "CAREER_ENTRY_UPDATED", entityType: "career_catalog_entry", entityId: `${version}:${input.data.slug}`, metadata: { catalogVersion: version } });
  return listCareerCatalog(new Request(`${new URL(input.request.url).origin}/api/admin/careers?version=${encodeURIComponent(version)}&search=${encodeURIComponent(String(input.data.slug))}&limit=1`));
}

export async function publishCareerCatalog(input: { context: AdminContext; request: Request; version: string; reason: string }) {
  const version = await database().prepare(`SELECT id, status FROM career_catalog_versions WHERE version = ? LIMIT 1`).bind(input.version).first<{ id: string; status: string }>();
  if (!version) throw new StoreError("CAREER_CATALOG_NOT_FOUND", 404);
  if (version.status === "PUBLISHED") return { version: input.version, status: "PUBLISHED" };
  const entries = await database().prepare(`SELECT slug, title_ru, description_ru, status, career_tags_json, education_paths_json, catalog_version FROM career_catalog_entries WHERE catalog_version = ? AND status = 'ACTIVE' ORDER BY slug ASC`).bind(input.version).all<Record<string, unknown>>();
  if ((entries.results?.length ?? 0) < 5) throw new StoreError("CAREER_CATALOG_TOO_SMALL", 422);
  const modelVersion = (await database().prepare(`SELECT career_model_version FROM assessment_versions WHERE product_id = ? AND status = 'PUBLISHED' ORDER BY published_at DESC LIMIT 1`).bind(T_SKILLS_TEST_ID).first<{ career_model_version: string }>())?.career_model_version;
  const model = modelVersion ? productionCareerModel(modelVersion) : null;
  if (!model) throw new StoreError("CAREER_MODEL_NOT_EXECUTABLE", 422);
  const catalogInput = (entries.results ?? []).map((row) => {
    const config = model[String(row.slug)];
    return {
      id: String(row.slug), title: String(row.title_ru), description: String(row.description_ru),
      version: String(row.catalog_version), active: true,
      traitProfile: config?.traitProfile ?? {},
      careerDimensions: config?.careerDimensions ?? {},
      subjectTags: inListJson(row.career_tags_json as string),
      educationPaths: inListJson(row.education_paths_json as string),
    };
  });
  const validated = validateCareerCatalog(catalogInput, T_SKILLS_WORKING_TAXONOMY.map((trait) => trait.id), input.version);
  if (!validated.ok) throw new StoreError("CAREER_CATALOG_INVALID", 422);
  const now = Date.now();
  await database().batch([
    database().prepare(`UPDATE career_catalog_versions SET status = 'ARCHIVED' WHERE status = 'PUBLISHED' AND version <> ?`).bind(input.version),
    database().prepare(`UPDATE career_catalog_versions SET status = 'PUBLISHED', published_at = ? WHERE version = ?`).bind(now, input.version),
  ]);
  await writeAdminAudit({ context: input.context, request: input.request, action: "CAREER_CATALOG_PUBLISHED", entityType: "career_catalog", entityId: input.version, metadata: {}, reason: input.reason });
  return { version: input.version, status: "PUBLISHED" };
}

export async function listAssessmentVersions() {
  const rows = await database().prepare(`SELECT v.*, (SELECT COUNT(*) FROM assessments a WHERE json_extract(a.versions_json, '$.assessment') = v.version AND a.state = 'COMPLETE') AS completed_assessments FROM assessment_versions v ORDER BY v.product_id, v.created_at DESC`).all<Record<string, unknown>>();
  return (rows.results ?? []).map((row) => ({ ...row, metadata: parseJson(row.metadata_json as string, {}) }));
}

export async function createAssessmentVersion(input: { context: AdminContext; request: Request; data: Record<string, unknown> }) {
  const versionId = id("assessment_version");
  const now = Date.now();
  try {
    await database().prepare(`INSERT INTO assessment_versions (id, product_id, version, status, published_at, retired_at, scoring_version, content_version, career_model_version, report_version, adaptive_version, item_count, metadata_json, created_by, created_at) VALUES (?, ?, ?, 'DRAFT', NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(versionId, input.data.product_id, input.data.version, input.data.scoring_version, input.data.content_version, input.data.career_model_version, input.data.report_version, input.data.adaptive_version ?? null, input.data.item_count, JSON.stringify(input.data.metadata ?? {}), input.context.viewer.userId, now).run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) throw new StoreError("ASSESSMENT_VERSION_EXISTS", 409);
    throw error;
  }
  await writeAdminAudit({ context: input.context, request: input.request, action: "ASSESSMENT_VERSION_CREATED", entityType: "assessment_version", entityId: versionId, metadata: { productId: input.data.product_id, version: input.data.version } });
  return listAssessmentVersions();
}

export async function publishAssessmentVersion(input: { context: AdminContext; request: Request; versionId: string; reason: string }) {
  const version = await database().prepare(`SELECT * FROM assessment_versions WHERE id = ? LIMIT 1`).bind(input.versionId).first<Record<string, unknown>>();
  if (!version) throw new StoreError("ASSESSMENT_VERSION_NOT_FOUND", 404);
  if (version.status === "PUBLISHED") return version;
  if (version.status === "ARCHIVED") throw new StoreError("ASSESSMENT_VERSION_IMMUTABLE", 409);
  const runtimeReason = executableAssessmentVersionReason({
    productId: String(version.product_id), version: String(version.version), scoringVersion: String(version.scoring_version),
    contentVersion: String(version.content_version), careerModelVersion: String(version.career_model_version),
    reportVersion: String(version.report_version), adaptiveVersion: version.adaptive_version === null ? null : String(version.adaptive_version), itemCount: numberValue(version.item_count),
  });
  if (runtimeReason) throw new StoreError(runtimeReason, 422);
  const careerModel = await database().prepare(`SELECT config_json FROM career_model_versions WHERE version = ? AND status = 'PUBLISHED' LIMIT 1`).bind(String(version.career_model_version)).first<{ config_json: string }>();
  if (!careerModel || parseJson<Record<string, unknown>>(careerModel.config_json, {}).runtime !== "built-in:t-skills-career-v1") throw new StoreError("CAREER_MODEL_NOT_EXECUTABLE", 422);
  const now = Date.now();
  await database().batch([
    database().prepare(`UPDATE assessment_versions SET status = 'RETIRED', retired_at = ? WHERE product_id = ? AND status = 'PUBLISHED'`).bind(now, version.product_id),
    database().prepare(`UPDATE assessment_versions SET status = 'PUBLISHED', published_at = ? WHERE id = ? AND status IN ('DRAFT','REVIEW')`).bind(now, input.versionId),
  ]);
  await writeAdminAudit({ context: input.context, request: input.request, action: "ASSESSMENT_VERSION_PUBLISHED", entityType: "assessment_version", entityId: input.versionId, metadata: { version: version.version, productId: version.product_id }, reason: input.reason });
  return database().prepare(`SELECT * FROM assessment_versions WHERE id = ?`).bind(input.versionId).first<Record<string, unknown>>();
}

export async function getAnalytics(request: Request) {
  const { url } = pageParams(request);
  const daysRaw = Number(url.searchParams.get("days") ?? "30");
  const days = Math.min(365, Math.max(1, Number.isInteger(daysRaw) ? daysRaw : 30));
  const since = Date.now() - days * 86400000;
  const db = database();
  const [events, revenue, assessment, campaigns, pilot] = await Promise.all([
    db.prepare(`SELECT name, COUNT(*) AS count FROM telemetry_events WHERE occurred_at >= ? GROUP BY name ORDER BY count DESC`).bind(since).all<Record<string, unknown>>(),
    db.prepare(`SELECT currency, COUNT(*) AS orders, COALESCE(SUM(CASE WHEN status IN ('PAID','REFUNDED','DISPUTED','DISPUTE_CLOSED') THEN COALESCE(final_amount_minor, amount_minor) ELSE 0 END), 0) AS gross, COALESCE(SUM(CASE WHEN status IN ('PAID','REFUNDED','DISPUTED','DISPUTE_CLOSED') THEN COALESCE(discount_amount_minor, 0) ELSE 0 END), 0) AS discounts FROM orders WHERE created_at >= ? GROUP BY currency`).bind(since).all<Record<string, unknown>>(),
    db.prepare(`SELECT state, COUNT(*) AS count, AVG(CASE WHEN completed_at IS NOT NULL THEN completed_at - created_at END) AS duration FROM assessments WHERE created_at >= ? GROUP BY state`).bind(since).all<Record<string, unknown>>(),
    db.prepare(`SELECT c.id, c.name, c.seat_limit, COUNT(cm.id) AS activated FROM campaigns c LEFT JOIN campaign_members cm ON cm.campaign_id = c.id WHERE c.created_at >= ? GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100`).bind(since).all<Record<string, unknown>>(),
    getPilotAnalytics(db),
  ]);
  return { days, since: new Date(since).toISOString(), funnel: events.results ?? [], revenue: revenue.results ?? [], assessment: assessment.results ?? [], campaigns: campaigns.results ?? [], pilot };
}

export async function listRoles() {
  const rows = await database().prepare(`SELECT id, name, description, status, created_at, updated_at FROM admin_roles WHERE status = 'ACTIVE' ORDER BY name`).all<Record<string, unknown>>();
  return rows.results ?? [];
}

export async function listAdmins(request: Request) {
  const { limit, page, offset } = pageParams(request);
  const count = await database().prepare(`SELECT COUNT(DISTINCT a.user_id) AS count FROM admin_role_assignments a WHERE a.disabled_at IS NULL`).first<{ count: number }>();
  const rows = await database().prepare(`SELECT u.id, u.email, u.full_name, u.status, u.created_at, GROUP_CONCAT(r.name) AS roles FROM users u JOIN admin_role_assignments a ON a.user_id = u.id AND a.disabled_at IS NULL JOIN admin_roles r ON r.id = a.role_id WHERE u.deleted_at IS NULL GROUP BY u.id ORDER BY u.created_at ASC LIMIT ? OFFSET ?`).bind(limit, offset).all<Record<string, unknown>>();
  return { data: rows.results ?? [], pagination: { page, limit, total: numberValue(count?.count), hasNext: offset + (rows.results?.length ?? 0) < numberValue(count?.count) } };
}

export async function assignAdminRole(input: { context: AdminContext; request: Request; data: { user_id: string; role: AdminRole; reason: string } }) {
  const user = await database().prepare(`SELECT id, email FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`).bind(input.data.user_id).first<{ id: string; email: string }>();
  if (!user) throw new StoreError("USER_NOT_FOUND", 404);
  const role = await database().prepare(`SELECT id FROM admin_roles WHERE name = ? AND status = 'ACTIVE' LIMIT 1`).bind(input.data.role).first<{ id: string }>();
  if (!role) throw new StoreError("ADMIN_ROLE_NOT_FOUND", 404);
  const existing = await database().prepare(`SELECT id FROM admin_role_assignments WHERE user_id = ? AND role_id = ? AND disabled_at IS NULL LIMIT 1`).bind(user.id, role.id).first<{ id: string }>();
  if (existing) throw new StoreError("ADMIN_ROLE_ALREADY_ASSIGNED", 409);
  const assignmentId = id("admin_assignment");
  try {
    await database().prepare(`INSERT INTO admin_role_assignments (id, user_id, role_id, assigned_by, created_at, disabled_at) VALUES (?, ?, ?, ?, ?, NULL)`).bind(assignmentId, user.id, role.id, input.context.viewer.userId, Date.now()).run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) throw new StoreError("ADMIN_ROLE_ALREADY_ASSIGNED", 409);
    throw error;
  }
  await writeAdminAudit({ context: input.context, request: input.request, action: "ADMIN_ROLE_CHANGED", entityType: "user", entityId: user.id, metadata: { role: input.data.role }, reason: input.data.reason });
  return { id: assignmentId, userId: user.id, role: input.data.role };
}

export async function revokeAdminRole(input: { context: AdminContext; request: Request; data: { user_id: string; role: AdminRole; reason: string } }) {
  const assignment = await database().prepare(`
    SELECT a.id, u.id AS user_id, r.name AS role
    FROM admin_role_assignments a
    JOIN users u ON u.id = a.user_id
    JOIN admin_roles r ON r.id = a.role_id
    WHERE a.user_id = ? AND r.name = ? AND a.disabled_at IS NULL
    LIMIT 1`).bind(input.data.user_id, input.data.role).first<{ id: string; user_id: string; role: AdminRole }>();
  if (!assignment) throw new StoreError("ADMIN_ROLE_ASSIGNMENT_NOT_FOUND", 404);
  const disabledAt = Date.now();
  const result = await database().prepare(`UPDATE admin_role_assignments SET disabled_at = ? WHERE id = ? AND disabled_at IS NULL`).bind(disabledAt, assignment.id).run();
  if (!result.meta.changes) throw new StoreError("ADMIN_ROLE_ASSIGNMENT_NOT_FOUND", 404);
  await writeAdminAudit({ context: input.context, request: input.request, action: "ADMIN_DISABLED", entityType: "admin_role_assignment", entityId: assignment.id, metadata: { userId: assignment.user_id, role: assignment.role }, reason: input.data.reason });
  return { id: assignment.id, userId: assignment.user_id, role: assignment.role, disabledAt };
}

export async function listAudit(request: Request) {
  const { url, limit, page, offset } = pageParams(request);
  const action = textParam(url, "action");
  const entityType = textParam(url, "entity_type");
  const conditions = ["1 = 1"];
  const bindings: Array<string | number> = [];
  if (action) { conditions.push("a.action = ?"); bindings.push(action); }
  if (entityType) { conditions.push("a.entity_type = ?"); bindings.push(entityType); }
  const where = conditions.join(" AND ");
  const count = await database().prepare(`SELECT COUNT(*) AS count FROM audit_events a WHERE ${where}`).bind(...bindings).first<{ count: number }>();
  const rows = await database().prepare(`SELECT a.id, a.actor_user_id, a.actor_role, a.action, a.entity_type, a.entity_id, a.metadata_json, a.reason, a.request_id, a.created_at FROM audit_events a WHERE ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all<Record<string, unknown>>();
  const data = (rows.results ?? []).map((row) => ({ ...row, metadata: parseJson(row.metadata_json as string, {}) }));
  return { data, pagination: { page, limit, total: numberValue(count?.count), hasNext: offset + data.length < numberValue(count?.count) } };
}

const ALLOWED_FEATURES = ["teen_enabled", "payments_enabled", "maintenance_mode"] as const;
const ALLOWED_SETTINGS = ["support_contact", "public_product_availability", "default_locale", "checkout_enabled", "maintenance_message"] as const;
const FEATURE_DESCRIPTIONS: Record<(typeof ALLOWED_FEATURES)[number], { danger: number; description: string }> = {
  teen_enabled: { danger: 0, description: "Allow public teen flow only when approved RU and KK bundles are published." },
  payments_enabled: { danger: 1, description: "Enable payment provider checkout." },
  maintenance_mode: { danger: 1, description: "Show maintenance mode to public users." },
};

export async function listFeatures() {
  const rows = await database().prepare(`SELECT key, enabled, danger, description, updated_by, updated_at FROM feature_flags WHERE key IN ('teen_enabled','payments_enabled','maintenance_mode') ORDER BY key`).all<Record<string, unknown>>();
  const saved = new Map((rows.results ?? []).map((row) => [String(row.key), row]));
  return ALLOWED_FEATURES.map((key) => {
    const row = saved.get(key);
    return row ?? { key, enabled: 0, ...FEATURE_DESCRIPTIONS[key], updated_by: null, updated_at: null };
  });
}

export async function updateFeature(input: { context: AdminContext; request: Request; key: string; enabled: boolean; reason: string }) {
  if (!(ALLOWED_FEATURES as readonly string[]).includes(input.key)) throw new StoreError("FEATURE_NOT_ALLOWED", 422);
  const danger = ["payments_enabled", "maintenance_mode"].includes(input.key);
  if (danger && !input.context.permissions.has("settings.manage")) throw new StoreError("ADMIN_PERMISSION_REQUIRED", 403);
  await database().prepare(`INSERT INTO feature_flags (key, enabled, danger, description, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET enabled = excluded.enabled, danger = excluded.danger, description = excluded.description, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(input.key, input.enabled ? 1 : 0, danger ? 1 : 0, FEATURE_DESCRIPTIONS[input.key as (typeof ALLOWED_FEATURES)[number]].description, input.context.viewer.userId, Date.now()).run();
  await writeAdminAudit({ context: input.context, request: input.request, action: "FEATURE_FLAG_CHANGED", entityType: "feature_flag", entityId: input.key, metadata: { enabled: input.enabled }, reason: input.reason });
  return listFeatures();
}

export async function listSettings() {
  const rows = await database().prepare(`SELECT key, value_json, description, updated_by, updated_at FROM system_settings WHERE key IN ('support_contact','public_product_availability','default_locale','checkout_enabled','maintenance_message') ORDER BY key`).all<Record<string, unknown>>();
  return (rows.results ?? []).map((row) => ({ ...row, value: parseJson(row.value_json as string, null) }));
}

export async function updateSetting(input: { context: AdminContext; request: Request; key: string; value: string; reason: string }) {
  if (!(ALLOWED_SETTINGS as readonly string[]).includes(input.key)) throw new StoreError("SETTING_NOT_ALLOWED", 422);
  if (input.key === "default_locale" && !["ru", "kk"].includes(input.value)) throw new StoreError("SETTING_VALUE_INVALID", 422);
  await database().prepare(`INSERT INTO system_settings (key, value_json, description, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`).bind(input.key, JSON.stringify(input.value), "Allowlisted business setting", input.context.viewer.userId, Date.now()).run();
  await writeAdminAudit({ context: input.context, request: input.request, action: "SYSTEM_SETTING_CHANGED", entityType: "system_setting", entityId: input.key, metadata: { key: input.key }, reason: input.reason });
  return listSettings();
}
