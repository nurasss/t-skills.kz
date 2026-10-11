import { getD1, getRuntimeEnv } from "@/db";
import type { AdminContext, AdminRole } from "@/lib/admin-rbac";
import { writeAdminAudit } from "@/lib/admin-rbac";
import { activeCampaignReservationWhere, activePromoReservationWhere, StoreError } from "@/lib/durable-store";
import {
  validatePromotionDefinition,
  type PromotionDefinition,
} from "@/lib/promotion-engine";
import { T_SKILLS_TEST_ID } from "@/lib/t-skills/versions";
import { validateCareerCatalog } from "@/lib/t-skills/career";
import { T_SKILLS_WORKING_TAXONOMY } from "@/lib/t-skills/content-v4";
import { productionCareerModel } from "@/lib/t-skills/production-career-model";
import { toPublicContentItem, validateCmsPayload } from "@/lib/cms-schemas";
import { careerRuntimeForAssessmentVersion, executableAssessmentVersionReason } from "@/lib/assessment-runtime-registry";
import { teenPublishBlockReason } from "@/lib/t-skills/teen/careers";
import { getPilotAnalytics } from "@/lib/pilot-analytics";
import { paymentStatusTransitionSqlCase, type PaymentEventStatus } from "@/lib/payment-event-policy";
import { readBoundedResponseJson } from "@/lib/provider-contract";
import { readStripeRefundSnapshot, StripeRefundLookupError } from "@/lib/stripe-refunds";

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
        SUM(CASE WHEN status IN ('PAID','PARTIALLY_REFUNDED','REFUND_PENDING','REFUND_FAILED','REFUNDED','DISPUTED','DISPUTE_CLOSED') THEN 1 ELSE 0 END) AS paid_orders,
        SUM(CASE WHEN status = 'PAYMENT_FAILED' THEN 1 ELSE 0 END) AS failed_payments,
        SUM(CASE WHEN status IN ('PARTIALLY_REFUNDED','REFUNDED') THEN 1 ELSE 0 END) AS refunds,
        COALESCE(SUM(CASE WHEN status IN ('PAID','PARTIALLY_REFUNDED','REFUND_PENDING','REFUND_FAILED','REFUNDED','DISPUTED','DISPUTE_CLOSED') THEN COALESCE(final_amount_minor, amount_minor) ELSE 0 END), 0) AS revenue,
        COALESCE(SUM(CASE WHEN status IN ('PAID','PARTIALLY_REFUNDED','REFUND_PENDING','REFUND_FAILED','REFUNDED','DISPUTED','DISPUTE_CLOSED') AND created_at >= ? THEN COALESCE(final_amount_minor, amount_minor) ELSE 0 END), 0) AS revenue_today,
        COALESCE(SUM(CASE WHEN status IN ('PAID','PARTIALLY_REFUNDED','REFUND_PENDING','REFUND_FAILED','REFUNDED','DISPUTED','DISPUTE_CLOSED') AND created_at >= ? THEN COALESCE(final_amount_minor, amount_minor) ELSE 0 END), 0) AS revenue_7_days,
        COALESCE(SUM(CASE WHEN status IN ('PAID','PARTIALLY_REFUNDED','REFUND_PENDING','REFUND_FAILED','REFUNDED','DISPUTED','DISPUTE_CLOSED') AND created_at >= ? THEN COALESCE(final_amount_minor, amount_minor) ELSE 0 END), 0) AS revenue_30_days,
        COALESCE(SUM(CASE WHEN status IN ('PAID','PARTIALLY_REFUNDED','REFUND_PENDING','REFUND_FAILED','REFUNDED','DISPUTED','DISPUTE_CLOSED') THEN COALESCE(discount_amount_minor, 0) ELSE 0 END), 0) AS discounts,
        COALESCE(AVG(CASE WHEN status IN ('PAID','PARTIALLY_REFUNDED','REFUND_PENDING','REFUND_FAILED','REFUNDED','DISPUTED','DISPUTE_CLOSED') THEN COALESCE(final_amount_minor, amount_minor) END), 0) AS average_order_value
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
        (SELECT COALESCE(SUM(MAX(
          c.seat_limit
            - (SELECT COUNT(*) FROM campaign_members cm WHERE cm.campaign_id = c.id)
            - (SELECT COUNT(*) FROM campaign_seat_reservations csr WHERE csr.campaign_id = c.id AND ${activeCampaignReservationWhere()})
        , 0)), 0) FROM campaigns c WHERE c.status = 'ACTIVE') AS remaining_campaign_accesses
      FROM promo_codes p`).bind(Date.now()).first<Record<string, unknown>>(),
    db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'REPORT_FAILED_RETRYABLE' THEN 1 ELSE 0 END) AS report_errors,
        (SELECT COUNT(*) FROM payment_events WHERE status = 'PAYMENT_FAILED' AND received_at >= ?) AS payment_errors,
        (SELECT COUNT(*) FROM audit_events WHERE action IN ('AUTH_FAILURE','ADMIN_LOGIN_FAILED') AND created_at >= ?) AS auth_failures,
        (SELECT COUNT(*) FROM promo_redemptions r JOIN orders o ON o.id = r.order_id WHERE r.status = 'RESERVED' AND r.reservation_expires_at <= ? AND o.provider_checkout_id IS NOT NULL AND o.status <> 'PAYMENT_FAILED') AS overdue_promo_reservations,
        (SELECT COUNT(*) FROM campaign_seat_reservations csr JOIN orders o ON o.id = csr.order_id WHERE csr.status = 'RESERVED' AND csr.expires_at <= ? AND o.provider_checkout_id IS NOT NULL AND o.status <> 'PAYMENT_FAILED') AS overdue_campaign_reservations,
        (SELECT COUNT(*) FROM orders WHERE status = 'REFUND_PENDING')
          + (SELECT COUNT(DISTINCT pe.order_id)
             FROM payment_events pe JOIN orders o ON o.id = pe.order_id
             WHERE pe.status = 'REFUND_PENDING' AND o.status = 'PARTIALLY_REFUNDED'
               AND NOT EXISTS (
                 SELECT 1 FROM payment_events resolved
                 WHERE resolved.order_id = pe.order_id
                   AND (resolved.received_at > pe.received_at OR (resolved.received_at = pe.received_at AND resolved.rowid > pe.rowid))
                   AND resolved.status IN ('PARTIALLY_REFUNDED','REFUND_FAILED','REFUNDED')
               )) AS pending_refunds,
        (SELECT COUNT(DISTINCT failures.order_id) FROM (
          SELECT order_id FROM payment_events WHERE status = 'REFUND_FAILED' AND received_at >= ?
          UNION ALL
          SELECT entity_id AS order_id FROM audit_events WHERE action = 'REFUND_FAILED' AND entity_type = 'order' AND created_at >= ?
        ) failures) AS failed_refunds,
        (SELECT COUNT(*) FROM purge_jobs WHERE status IN ('FAILED','FAILED_RETRYABLE')) AS purge_errors
      FROM reports`).bind(Date.now() - 7 * 86400000, Date.now() - 7 * 86400000, Date.now(), Date.now(), Date.now() - 7 * 86400000, Date.now() - 7 * 86400000).first<Record<string, unknown>>(),
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
      overduePromoReservations: numberValue(health?.overdue_promo_reservations),
      overdueCampaignReservations: numberValue(health?.overdue_campaign_reservations),
      pendingRefunds: numberValue(health?.pending_refunds),
      failedRefunds: numberValue(health?.failed_refunds),
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
  if (status && ["PAID", "PENDING", "PAYMENT_PENDING", "PAYMENT_FAILED", "REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUND_FAILED", "REFUNDED", "DISPUTED", "DISPUTE_CLOSED"].includes(status)) {
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
  const [order, events, redemption, seatReservation, entitlement] = await Promise.all([
    db.prepare(`SELECT o.id, o.user_id, u.email, u.full_name, o.test_id, o.amount_minor, o.original_amount_minor, o.discount_amount_minor, o.final_amount_minor, o.currency, o.status, o.provider, o.provider_checkout_id, o.provider_checkout_url, o.provider_payment_id, o.provider_event_id, o.promo_code_id, o.campaign_id, o.pricing_snapshot_json, o.created_at, o.updated_at FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = ? LIMIT 1`).bind(orderId).first<Record<string, unknown>>(),
    db.prepare(`SELECT id, provider, event_type, status, received_at FROM payment_events WHERE order_id = ? ORDER BY received_at ASC`).bind(orderId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, promo_code_id, user_id, campaign_id, original_amount_minor, discount_amount_minor, final_amount_minor, currency, reserved_at, reservation_expires_at, released_at, redeemed_at, status FROM promo_redemptions WHERE order_id = ? LIMIT 1`).bind(orderId).first<Record<string, unknown>>(),
    db.prepare(`SELECT id, campaign_id, user_id, order_id, checkout_session_id, status, reserved_at, expires_at, claimed_at, released_at, created_at, updated_at FROM campaign_seat_reservations WHERE order_id = ? LIMIT 1`).bind(orderId).first<Record<string, unknown>>(),
    db.prepare(`SELECT id, test_id, grant_source, grant_reference, status, created_at, revoked_at FROM entitlements WHERE order_id = ? LIMIT 1`).bind(orderId).first<Record<string, unknown>>(),
  ]);
  if (!order) throw new StoreError("ORDER_NOT_FOUND", 404);

  const timelineEvents: Array<{ title: string; timestamp: number; type: string }> = [];
  if (order.created_at) {
    timelineEvents.push({ title: "Order created", timestamp: Number(order.created_at), type: "order_created" });
  }
  if (redemption?.reserved_at) {
    timelineEvents.push({ title: "Promo reserved", timestamp: Number(redemption.reserved_at), type: "promo_reserved" });
  }
  if (seatReservation?.reserved_at) {
    timelineEvents.push({ title: "Campaign seat reserved", timestamp: Number(seatReservation.reserved_at), type: "seat_reserved" });
  }
  if (order.provider_checkout_id && order.created_at) {
    timelineEvents.push({ title: "Stripe Checkout created", timestamp: Number(order.created_at), type: "checkout_created" });
  }
  for (const event of events.results ?? []) {
    const receivedAt = Number(event.received_at);
    if (event.status === "PAID") {
      timelineEvents.push({ title: "Payment confirmed", timestamp: receivedAt, type: "payment_confirmed" });
    } else if (event.status === "PAYMENT_FAILED") {
      timelineEvents.push({ title: "Payment failed / Checkout expired", timestamp: receivedAt, type: "checkout_expired" });
    } else if (event.status === "REFUND_PENDING") {
      timelineEvents.push({ title: "Refund pending", timestamp: receivedAt, type: "refund_pending" });
    } else if (event.status === "PARTIALLY_REFUNDED") {
      timelineEvents.push({ title: "Partially refunded", timestamp: receivedAt, type: "partially_refunded" });
    } else if (event.status === "REFUND_FAILED") {
      timelineEvents.push({ title: "Refund failed", timestamp: receivedAt, type: "refund_failed" });
    } else if (event.status === "REFUNDED") {
      timelineEvents.push({ title: "Order refunded", timestamp: receivedAt, type: "order_refunded" });
    }
  }
  if (redemption?.redeemed_at && redemption.status === "REDEEMED") {
    timelineEvents.push({ title: "Promo redeemed", timestamp: Number(redemption.redeemed_at), type: "promo_redeemed" });
  }
  if (seatReservation?.claimed_at && seatReservation.status === "CLAIMED") {
    timelineEvents.push({ title: "Campaign seat claimed", timestamp: Number(seatReservation.claimed_at), type: "seat_claimed" });
  }
  if (entitlement?.created_at && entitlement.status === "ACTIVE") {
    timelineEvents.push({ title: "Entitlement issued", timestamp: Number(entitlement.created_at), type: "entitlement_issued" });
  }
  if (redemption?.released_at && redemption.status === "RELEASED") {
    timelineEvents.push({ title: "Promo released", timestamp: Number(redemption.released_at), type: "promo_released" });
  }
  if (seatReservation?.released_at && (seatReservation.status === "RELEASED" || seatReservation.status === "EXPIRED")) {
    timelineEvents.push({ title: "Campaign seat released", timestamp: Number(seatReservation.released_at), type: "seat_released" });
  }
  timelineEvents.sort((a, b) => a.timestamp - b.timestamp);

  const paymentConfirmed = (events.results ?? []).find((e) => e.status === "PAID");
  const checkoutExpired = (events.results ?? []).find((e) => e.status === "PAYMENT_FAILED");

  return {
    order: {
      ...order,
      pricingSnapshot: parseJson(order.pricing_snapshot_json as string, null),
      reserved_at: redemption?.reserved_at ?? seatReservation?.reserved_at ?? null,
      reservation_expires_at: redemption?.reservation_expires_at ?? seatReservation?.expires_at ?? null,
      redeemed_at: redemption?.status === "REDEEMED" ? redemption.redeemed_at : null,
      released_at: redemption?.released_at ?? seatReservation?.released_at ?? null,
      checkout_created_at: order.provider_checkout_id ? order.created_at : null,
      checkout_expired_at: checkoutExpired?.received_at ?? (order.status === "PAYMENT_FAILED" ? order.updated_at : null),
      payment_confirmed_at: paymentConfirmed?.received_at ?? (["PAID", "PARTIALLY_REFUNDED", "REFUND_PENDING", "REFUND_FAILED", "REFUNDED", "DISPUTED", "DISPUTE_CLOSED"].includes(String(order.status)) ? order.updated_at : null),
    },
    timeline: timelineEvents,
    paymentEvents: events.results ?? [],
    redemption: redemption ?? null,
    campaignReservation: seatReservation ?? null,
    entitlement: entitlement ?? null,
  };
}

async function stripeRefundSnapshot(apiKey: string, paymentId: string, currency: string, orderAmount: number) {
  try {
    return await readStripeRefundSnapshot({ apiKey, paymentId, currency, orderAmount });
  } catch (error) {
    if (error instanceof StripeRefundLookupError && error.reason === "AMOUNT_EXCEEDS_ORDER") {
      throw new StoreError("PAYMENT_INTEGRITY_MISMATCH", 409);
    }
    if (error instanceof StripeRefundLookupError) {
      console.error("stripe_refund_lookup_error", { error_code: error.reason });
      throw new StoreError("STRIPE_REFUND_LOOKUP_FAILED", 503);
    }
    throw error;
  }
}

export async function refundOrder(input: {
  context: AdminContext;
  request: Request;
  orderId: string;
  reason?: string;
}) {
  const db = database();
  const order = await db.prepare(
    `SELECT id, user_id, status, amount_minor, currency, provider, provider_payment_id, provider_checkout_id, campaign_id, promo_code_id
     FROM orders WHERE id = ? LIMIT 1`
  ).bind(input.orderId).first<{
    id: string;
    user_id: string;
    status: string;
    amount_minor: number;
    currency: string;
    provider: string;
    provider_payment_id: string | null;
    provider_checkout_id: string | null;
    campaign_id: string | null;
    promo_code_id: string | null;
  }>();

  if (!order) throw new StoreError("ORDER_NOT_FOUND", 404);
  if (order.status === "REFUNDED") throw new StoreError("ORDER_ALREADY_REFUNDED", 409);
  if (order.status === "REFUND_PENDING") throw new StoreError("ORDER_REFUND_IN_PROGRESS", 409);
  if (order.status !== "PAID" && order.status !== "PARTIALLY_REFUNDED" && order.status !== "REFUND_FAILED") {
    throw new StoreError("ORDER_NOT_REFUNDABLE", 400);
  }

  const stripeKey = getRuntimeEnv().STRIPE_SECRET_KEY?.trim();
  const paymentId = order.provider_payment_id?.trim() ?? "";
  if (order.provider.trim().toLowerCase() !== "stripe" || (!paymentId.startsWith("pi_") && !paymentId.startsWith("ch_"))) {
    throw new StoreError("REFUND_PROVIDER_UNSUPPORTED", 422);
  }
  if (!stripeKey) throw new StoreError("STRIPE_SECRET_KEY_MISSING", 503);

  const initialStatus = order.status;
  const providerRefunds = await stripeRefundSnapshot(stripeKey, paymentId, order.currency, order.amount_minor);
  if (providerRefunds.pending) {
    await db.prepare(`UPDATE orders SET status = 'REFUND_PENDING', updated_at = ? WHERE id = ? AND status = ?`).bind(Date.now(), input.orderId, initialStatus).run();
    await writeAdminAudit({
      context: input.context,
      request: input.request,
      action: "REFUND_PENDING",
      entityType: "order",
      entityId: input.orderId,
      metadata: { provider: order.provider, providerStatus: "PENDING_PROVIDER_REFUND" },
      reason: input.reason ?? null,
    });
    throw new StoreError("ORDER_REFUND_IN_PROGRESS", 409);
  }
  if (initialStatus === "PARTIALLY_REFUNDED" && providerRefunds.succeededAmount === 0) {
    throw new StoreError("STRIPE_REFUND_LOOKUP_FAILED", 503);
  }
  const remainingAmount = order.amount_minor - providerRefunds.succeededAmount;
  const claimedAt = Date.now();
  const claim = await db.prepare(
    `UPDATE orders SET status = 'REFUND_PENDING', updated_at = ? WHERE id = ? AND status = ?`,
  ).bind(claimedAt, input.orderId, initialStatus).run();
  if (!claim.meta.changes) {
    const current = await db.prepare(`SELECT status FROM orders WHERE id = ? LIMIT 1`).bind(input.orderId).first<{ status: string }>();
    if (current?.status === "REFUNDED") throw new StoreError("ORDER_ALREADY_REFUNDED", 409);
    if (current?.status === "REFUND_PENDING") throw new StoreError("ORDER_REFUND_IN_PROGRESS", 409);
    throw new StoreError("ORDER_NOT_REFUNDABLE", 409);
  }

  const writeRefundAudit = (action: string, afterStatus: string, metadata: Record<string, unknown> = {}) => writeAdminAudit({
    context: input.context,
    request: input.request,
    action,
    entityType: "order",
    entityId: input.orderId,
    metadata: {
      before: { status: initialStatus },
      after: { status: afterStatus },
      provider: order.provider,
      ...metadata,
    },
    reason: input.reason ?? null,
  });

  const markRefundFailed = async (providerStatus: string) => {
    const failureStatus: PaymentEventStatus = providerRefunds.succeededAmount > 0 ? "PARTIALLY_REFUNDED" : "REFUND_FAILED";
    await db.prepare(
      `UPDATE orders SET status = ${paymentStatusTransitionSqlCase(failureStatus)}, updated_at = ? WHERE id = ?`,
    ).bind(Date.now(), input.orderId).run();
    await writeRefundAudit("REFUND_FAILED", failureStatus, { providerStatus });
  };

  const finalizeRefund = async (refundAmount: number, providerRefundId: string | null, cumulativeAmount = providerRefunds.succeededAmount + refundAmount) => {
    const fullRefund = cumulativeAmount >= order.amount_minor;
    const resultingStatus: PaymentEventStatus = fullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED";
    const timestamp = Date.now();
    const statements = [
      db.prepare(`UPDATE orders SET status = ${paymentStatusTransitionSqlCase(resultingStatus)}, updated_at = ? WHERE id = ?`).bind(timestamp, input.orderId),
    ];
    if (fullRefund) {
      statements.push(
        db.prepare(`UPDATE entitlements SET status = 'REVOKED', revoked_at = ? WHERE order_id = ? AND status = 'ACTIVE'`).bind(timestamp, input.orderId),
        db.prepare(`UPDATE campaign_seat_reservations SET status = 'RELEASED', released_at = ?, updated_at = ? WHERE order_id = ? AND status IN ('RESERVED', 'CLAIMED')`).bind(timestamp, timestamp, input.orderId),
        db.prepare(`DELETE FROM campaign_members WHERE entitlement_id IN (SELECT id FROM entitlements WHERE order_id = ?)`).bind(input.orderId),
        db.prepare(`UPDATE promo_redemptions SET status = 'RELEASED', released_at = ? WHERE order_id = ? AND status = 'RESERVED'`).bind(timestamp, input.orderId),
      );
    }
    await db.batch(statements);
    await writeRefundAudit(providerRefunds.succeededAmount === order.amount_minor ? "REFUND_RECONCILED" : fullRefund ? "REFUND_PERFORMED" : "REFUND_PARTIAL", resultingStatus, {
      userId: order.user_id,
      amountMinor: refundAmount,
      cumulativeAmountMinor: cumulativeAmount,
      currency: order.currency,
      providerRefundId,
      providerPaymentId: order.provider_payment_id,
      campaignId: order.campaign_id,
      promoCodeId: order.promo_code_id,
    });
    return getOrderDetail(input.orderId);
  };

  if (remainingAmount === 0) {
    return finalizeRefund(0, providerRefunds.latestSucceededId, providerRefunds.succeededAmount);
  }

  const form = new URLSearchParams();
  form.set(paymentId.startsWith("ch_") ? "charge" : "payment_intent", paymentId);
  form.set("amount", String(remainingAmount));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `orbita-refund-${crypto.randomUUID()}`,
      },
      signal: controller.signal,
      body: form.toString(),
    });
  } catch {
    console.error("stripe_refund_network_error", { error_code: "STRIPE_REFUND_OUTCOME_UNKNOWN" });
    await writeRefundAudit("REFUND_PENDING", "REFUND_PENDING", { providerStatus: "OUTCOME_UNKNOWN" });
    throw new StoreError("STRIPE_REFUND_PENDING", 503);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    console.error("stripe_refund_error", { status: response.status });
    if (response.status < 500) {
      await markRefundFailed(`HTTP_${response.status}`);
      throw new StoreError("STRIPE_REFUND_FAILED", 502);
    }
    await writeRefundAudit("REFUND_PENDING", "REFUND_PENDING", { providerStatus: `HTTP_${response.status}` });
    throw new StoreError("STRIPE_REFUND_PENDING", 503);
  }

  let refund: { id?: unknown; status?: unknown; amount?: unknown; currency?: unknown };
  try {
    refund = await readBoundedResponseJson(response, 32 * 1024) as typeof refund;
  } catch {
    console.error("stripe_refund_response_invalid", { error_code: "STRIPE_REFUND_RESPONSE_INVALID" });
    await writeRefundAudit("REFUND_PENDING", "REFUND_PENDING", { providerStatus: "RESPONSE_INVALID" });
    throw new StoreError("STRIPE_REFUND_PENDING", 503);
  }

  const refundStatus = typeof refund.status === "string" ? refund.status.toLowerCase() : "";
  const refundAmount = typeof refund.amount === "number" ? refund.amount : NaN;
  const refundCurrency = typeof refund.currency === "string" ? refund.currency.toUpperCase() : "";
  const refundSnapshotValid =
    typeof refund.id === "string" && refund.id.startsWith("re_") &&
    Number.isSafeInteger(refundAmount) && refundAmount > 0 && refundAmount <= remainingAmount &&
    refundCurrency === order.currency.trim().toUpperCase();
  if (!refundSnapshotValid || !["pending", "requires_action", "succeeded", "failed", "canceled"].includes(refundStatus)) {
    console.error("stripe_refund_response_invalid", { error_code: "STRIPE_REFUND_RESPONSE_INVALID" });
    await writeRefundAudit("REFUND_PENDING", "REFUND_PENDING", { providerStatus: "RESPONSE_INVALID" });
    throw new StoreError("STRIPE_REFUND_PENDING", 503);
  }

  if (refundStatus === "pending" || refundStatus === "requires_action") {
    await writeRefundAudit("REFUND_PENDING", "REFUND_PENDING", {
      providerRefundId: refund.id,
      providerStatus: refundStatus,
      amountMinor: refundAmount,
    });
    return getOrderDetail(input.orderId);
  }

  if (refundStatus === "failed" || refundStatus === "canceled") {
    await markRefundFailed(refundStatus);
    throw new StoreError("STRIPE_REFUND_FAILED", 502);
  }

  return finalizeRefund(refundAmount, refund.id as string);
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

function effectivePromoStatus(row: Record<string, unknown>, capacityUsed: number, now = Date.now()) {
  const storedStatus = String(row.status ?? "DRAFT");
  if (storedStatus !== "ACTIVE") return storedStatus;
  const validUntil = row.valid_until === null || row.valid_until === undefined ? null : numberValue(row.valid_until);
  if (validUntil !== null && validUntil <= now) return "EXPIRED";
  const maxTotalUses = row.max_total_uses === null || row.max_total_uses === undefined ? null : numberValue(row.max_total_uses);
  if (maxTotalUses !== null && capacityUsed >= maxTotalUses) return "EXHAUSTED";
  return "ACTIVE";
}

function promoPayload(row: Record<string, unknown>, usage: { uses: number; reserved: number; completed: number; remaining: number | null }, status = effectivePromoStatus(row, usage.uses + usage.reserved)) {
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
    conditions.push(`p.status = 'ACTIVE' AND (p.valid_until IS NULL OR p.valid_until > ?) AND (p.max_total_uses IS NULL OR (SELECT COUNT(*) FROM promo_redemptions r2 WHERE r2.promo_code_id = p.id AND ${activePromoReservationWhere("r2")}) < p.max_total_uses)`);
    bindings.push(now, now);
  } else if (status === "EXPIRED") {
    conditions.push("p.status = 'ACTIVE' AND p.valid_until IS NOT NULL AND p.valid_until <= ?");
    bindings.push(now);
  } else if (status === "EXHAUSTED") {
    conditions.push(`p.status = 'ACTIVE' AND (p.valid_until IS NULL OR p.valid_until > ?) AND p.max_total_uses IS NOT NULL AND (SELECT COUNT(*) FROM promo_redemptions r2 WHERE r2.promo_code_id = p.id AND ${activePromoReservationWhere("r2")}) >= p.max_total_uses`);
    bindings.push(now, now);
  } else if (status && ["DISABLED", "DRAFT"].includes(status)) {
    conditions.push("p.status = ?");
    bindings.push(status);
  }
  const where = conditions.join(" AND ");
  const count = await database().prepare(`SELECT COUNT(*) AS count FROM promo_codes p WHERE ${where}`).bind(...bindings).first<{ count: number }>();
  const rows = await database().prepare(`
    SELECT p.*, COUNT(r.id) AS uses,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM assessments a WHERE a.user_id = r.user_id AND a.state = 'COMPLETE') THEN 1 ELSE 0 END) AS completed,
      (SELECT COUNT(*) FROM promo_redemptions r2 WHERE r2.promo_code_id = p.id AND ${activePromoReservationWhere("r2")}) AS reserved
    FROM promo_codes p LEFT JOIN promo_redemptions r ON r.promo_code_id = p.id AND r.status = 'REDEEMED'
    WHERE ${where} GROUP BY p.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?`).bind(Date.now(), ...bindings, limit, offset).all<Record<string, unknown>>();
  const data = (rows.results ?? []).map((row) => {
    const uses = numberValue(row.uses);
    const reserved = numberValue(row.reserved);
    const max = row.max_total_uses === null ? null : numberValue(row.max_total_uses);
    return promoPayload(row, { uses, reserved, completed: numberValue(row.completed), remaining: max === null ? null : Math.max(0, max - uses - reserved) }, effectivePromoStatus(row, uses + reserved, now));
  });
  return { data, pagination: { page, limit, total: numberValue(count?.count), hasNext: offset + data.length < numberValue(count?.count) } };
}

export async function getPromoCode(promoId: string) {
  const [row, stats] = await Promise.all([
    database().prepare(`SELECT * FROM promo_codes WHERE id = ? LIMIT 1`).bind(promoId).first<Record<string, unknown>>(),
    database().prepare(`SELECT
      (SELECT COUNT(*) FROM promo_redemptions WHERE promo_code_id = p.id AND status = 'REDEEMED') AS uses,
      (SELECT COALESCE(SUM(discount_amount_minor), 0) FROM promo_redemptions WHERE promo_code_id = p.id AND status = 'REDEEMED') AS discount_total,
      (SELECT COUNT(DISTINCT user_id) FROM promo_redemptions WHERE promo_code_id = p.id AND status = 'REDEEMED') AS users,
      (SELECT COUNT(*) FROM promo_redemptions r WHERE r.promo_code_id = p.id AND ${activePromoReservationWhere("r")}) AS reserved
      FROM promo_codes p WHERE p.id = ? LIMIT 1`).bind(Date.now(), promoId).first<Record<string, unknown>>(),
  ]);
  if (!row) throw new StoreError("PROMO_NOT_FOUND", 404);
  const uses = numberValue(stats?.uses);
  const reserved = numberValue(stats?.reserved);
  const max = row.max_total_uses === null ? null : numberValue(row.max_total_uses);
  const redemptions = await database().prepare(`
    SELECT r.id, r.user_id, u.email, r.order_id, r.campaign_id, r.original_amount_minor,
      r.discount_amount_minor, r.final_amount_minor, r.currency, r.reserved_at,
      r.reservation_expires_at, r.released_at, r.redeemed_at, r.status,
      (SELECT COUNT(*) FROM assessments a WHERE a.user_id = r.user_id AND a.state = 'COMPLETE') AS completed_assessments
    FROM promo_redemptions r JOIN users u ON u.id = r.user_id
    WHERE r.promo_code_id = ? ORDER BY r.redeemed_at DESC LIMIT 200`).bind(promoId).all<Record<string, unknown>>();
  return {
    promo: promoPayload(row, { uses, reserved, completed: redemptions.results?.reduce((sum, current) => sum + numberValue(current.completed_assessments), 0) ?? 0, remaining: max === null ? null : Math.max(0, max - uses - reserved) }, effectivePromoStatus(row, uses + reserved)),
    redemptions: redemptions.results ?? [],
    stats: { uses, reserved, discountTotal: numberValue(stats?.discount_total), users: numberValue(stats?.users) },
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
  const timestamp = Math.max(Date.now(), numberValue(current.updated_at) + 1);
  const result = await database().prepare(`UPDATE promo_codes SET code = ?, name = ?, description = ?, discount_type = ?, discount_value = ?, currency = ?, max_total_uses = ?, max_uses_per_user = ?, valid_from = ?, valid_until = ?, minimum_order_amount = ?, new_users_only = ?, allowed_test_ids_json = ?, allowed_email_domains_json = ?, allowed_user_ids_json = ?, campaign_id = ?, status = ?, updated_by = ?, updated_at = ? WHERE id = ? AND updated_at = ?`)
    .bind(normalized.code, normalized.name.trim(), normalized.description ?? "", normalized.discountType, normalized.discountValue, normalized.currency,
      normalized.maxTotalUses ?? null, normalized.maxUsesPerUser ?? null, normalized.validFrom ?? null, normalized.validUntil ?? null, normalized.minimumOrderAmount ?? null,
      normalized.newUsersOnly ? 1 : 0, JSON.stringify(normalized.allowedTestIds ?? []), JSON.stringify(normalized.allowedEmailDomains ?? []), JSON.stringify(normalized.allowedUserIds ?? []), normalized.campaignId ?? null,
      input.data.status ?? current.status, input.context.viewer.userId, timestamp, input.promoId, current.updated_at).run();
  if ((result.meta?.changes ?? 0) !== 1) throw new StoreError("RESOURCE_CHANGED", 409);
  await writeAdminAudit({
    context: input.context,
    request: input.request,
    action: input.data.status === "DISABLED" ? "PROMO_DEACTIVATED" : "PROMO_UPDATED",
    entityType: "promo_code",
    entityId: input.promoId,
    metadata: {
      code: normalized.code,
      before: { status: current.status },
      after: { status: input.data.status ?? current.status },
    },
    reason: String(input.data.reason ?? "") || null,
  });
  return getPromoCode(input.promoId);
}

export async function deletePromo(input: { context: AdminContext; request: Request; promoId: string; reason?: string }) {
  const current = await database().prepare(`SELECT * FROM promo_codes WHERE id = ? LIMIT 1`).bind(input.promoId).first<Record<string, unknown>>();
  if (!current) throw new StoreError("PROMO_NOT_FOUND", 404);
  const redemptionsCount = await database().prepare(`SELECT COUNT(*) as c FROM promo_redemptions WHERE promo_code_id = ?`).bind(input.promoId).first<{ c: number }>();
  const now = Date.now();
  if ((redemptionsCount?.c ?? 0) > 0) {
    await database().prepare(`UPDATE promo_codes SET status = 'DISABLED', updated_at = ?, updated_by = ? WHERE id = ?`).bind(now, input.context.viewer.userId, input.promoId).run();
  } else {
    await database().prepare(`DELETE FROM promo_codes WHERE id = ?`).bind(input.promoId).run();
  }
  await writeAdminAudit({
    context: input.context,
    request: input.request,
    action: "PROMO_DELETED",
    entityType: "promo_code",
    entityId: input.promoId,
    metadata: {
      before: { code: current.code, status: current.status },
      after: { status: "DELETED" },
    },
    reason: input.reason ?? null,
  });
  return { id: input.promoId, deleted: true };
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
  const now = Date.now();
  const rows = await database().prepare(`
    SELECT c.*, COUNT(DISTINCT cm.user_id) AS activated,
      COUNT(DISTINCT CASE WHEN a.state NOT IN ('CREATED','CANCELLED','INVALIDATED') THEN a.user_id END) AS started,
      COUNT(DISTINCT CASE WHEN a.state = 'COMPLETE' THEN a.user_id END) AS completed,
      COUNT(DISTINCT CASE WHEN a.state = 'COMPLETE' AND a.report_id IS NOT NULL THEN a.user_id END) AS reports,
      (SELECT COUNT(*) FROM campaign_seat_reservations csr WHERE csr.campaign_id = c.id AND ${activeCampaignReservationWhere()}) AS reserved
    FROM campaigns c LEFT JOIN campaign_members cm ON cm.campaign_id = c.id
      LEFT JOIN assessments a ON a.user_id = cm.user_id
    WHERE ${where} GROUP BY c.id ORDER BY c.created_at DESC LIMIT ? OFFSET ?`).bind(now, ...bindings, limit, offset).all<Record<string, unknown>>();
  const data = (rows.results ?? []).map((row) => ({
    ...row,
    reserved: numberValue(row.reserved),
    unused: Math.max(0, numberValue(row.seat_limit) - numberValue(row.activated) - numberValue(row.reserved)),
  }));
  return { data, pagination: { page, limit, total: numberValue(count?.count), hasNext: offset + data.length < numberValue(count?.count) } };
}

export async function getCampaign(campaignId: string) {
  const campaign = await database().prepare(`SELECT * FROM campaigns WHERE id = ? LIMIT 1`).bind(campaignId).first<Record<string, unknown>>();
  if (!campaign) throw new StoreError("CAMPAIGN_NOT_FOUND", 404);
  const [promoCodes, members, reservations] = await Promise.all([
    database().prepare(`SELECT id, code, name, status, discount_type, discount_value, max_total_uses FROM promo_codes WHERE campaign_id = ? ORDER BY created_at DESC`).bind(campaignId).all<Record<string, unknown>>(),
    database().prepare(`SELECT cm.id, cm.user_id, u.email, cm.entitlement_id, cm.created_at, (SELECT COUNT(*) FROM assessments a WHERE a.user_id = cm.user_id AND a.state NOT IN ('CREATED','CANCELLED','INVALIDATED')) AS started, (SELECT COUNT(*) FROM assessments a WHERE a.user_id = cm.user_id AND a.state = 'COMPLETE') AS completed, (SELECT COUNT(*) FROM assessments a WHERE a.user_id = cm.user_id AND a.state = 'COMPLETE' AND a.report_id IS NOT NULL) AS reports FROM campaign_members cm JOIN users u ON u.id = cm.user_id WHERE cm.campaign_id = ? ORDER BY cm.created_at DESC LIMIT 500`).bind(campaignId).all<Record<string, unknown>>(),
    database().prepare(`SELECT COUNT(*) AS reserved FROM campaign_seat_reservations csr WHERE csr.campaign_id = ? AND ${activeCampaignReservationWhere()}`).bind(campaignId, Date.now()).first<{ reserved: number }>(),
  ]);
  const activated = members.results?.length ?? 0;
  const reserved = Number(reservations?.reserved ?? 0);
  const started = members.results?.filter((row) => numberValue(row.started) > 0).length ?? 0;
  const completed = members.results?.filter((row) => numberValue(row.completed) > 0).length ?? 0;
  const reportsGenerated = members.results?.reduce((sum, row) => sum + (numberValue(row.reports) > 0 ? 1 : 0), 0) ?? 0;
  return {
    campaign,
    promoCodes: promoCodes.results ?? [],
    members: members.results ?? [],
    metrics: {
      purchasedSeats: campaign.seat_limit,
      activated,
      reserved,
      started,
      completed,
      reportsGenerated,
      unused: Math.max(0, numberValue(campaign.seat_limit) - activated - reserved),
      expired: campaign.status === "EXPIRED" ? Math.max(0, numberValue(campaign.seat_limit) - completed) : 0,
    },
  };
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
  const now = Math.max(Date.now(), numberValue(current.updated_at) + 1);
  const targetUpdatedAt = input.data.expected_updated_at !== undefined ? Number(input.data.expected_updated_at) : numberValue(current.updated_at);
  const newSeatLimit = input.data.seat_limit !== undefined ? Number(input.data.seat_limit) : numberValue(current.seat_limit);

  const result = await database().prepare(
    `UPDATE campaigns SET name = ?, client_name = ?, client_type = ?, internal_notes = ?, status = ?, seat_limit = ?, seat_usage_policy = ?, valid_from = ?, valid_until = ?, default_test_id = ?, updated_at = ? WHERE id = ? AND updated_at = ?`
  ).bind(
    input.data.name ?? current.name,
    input.data.client_name ?? current.client_name,
    input.data.client_type ?? current.client_type,
    input.data.internal_notes ?? current.internal_notes,
    input.data.status ?? current.status,
    newSeatLimit,
    input.data.seat_usage_policy ?? current.seat_usage_policy,
    input.data.valid_from !== undefined ? input.data.valid_from : current.valid_from,
    input.data.valid_until !== undefined ? input.data.valid_until : current.valid_until,
    input.data.default_test_id ?? current.default_test_id,
    now,
    input.campaignId,
    targetUpdatedAt,
  ).run();

  const affectedRows = result.meta?.changes ?? 0;
  if (affectedRows === 0) {
    throw new StoreError("CAMPAIGN_VERSION_CONFLICT", 409);
  }

  const capacityChanged = input.data.seat_limit !== undefined && Number(input.data.seat_limit) !== Number(current.seat_limit);
  const metadata: Record<string, unknown> = {
    status: input.data.status ?? current.status,
    before: { status: current.status, seatLimit: current.seat_limit, name: current.name },
    after: { status: input.data.status ?? current.status, seatLimit: newSeatLimit, name: input.data.name ?? current.name },
  };
  if (capacityChanged) {
    metadata.previousCapacity = current.seat_limit;
    metadata.newCapacity = newSeatLimit;
  }

  await writeAdminAudit({
    context: input.context,
    request: input.request,
    action: capacityChanged ? "CAMPAIGN_CAPACITY_CHANGED" : "CAMPAIGN_UPDATED",
    entityType: "campaign",
    entityId: input.campaignId,
    metadata,
    reason: String(input.data.reason ?? "") || null,
  });

  if ((input.data.status ?? current.status) === "ARCHIVED" && current.status !== "ARCHIVED") {
    await writeAdminAudit({ context: input.context, request: input.request, action: "CAMPAIGN_ARCHIVED", entityType: "campaign", entityId: input.campaignId, metadata: { previousStatus: current.status }, reason: String(input.data.reason ?? "") || null });
  }
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
  faq: ["title"],
  seo: ["title", "description"],
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

function assertCmsSchema(contentKey: string, payload: Record<string, unknown>) {
  const result = validateCmsPayload(contentKey, payload);
  if (!result.ok) throw new StoreError("CMS_SCHEMA_VALIDATION_FAILED", 422);
}

function assertRequiredContent(contentKey: string, payload: Record<string, unknown>) {
  const required = REQUIRED_CONTENT_FIELDS[contentKey] ?? [];
  for (const field of required) {
    const val = payload[field];
    if (val === undefined || val === null || (typeof val === "string" && !val.trim())) {
      throw new StoreError("CONTENT_REQUIRED_FIELD", 422);
    }
  }
}

export async function getPublishedContent(contentKey: string, locale = "ru"): Promise<Record<string, unknown> | null> {
  const row = await database().prepare(`
    SELECT pv.payload_json
    FROM content_entries e
    JOIN content_versions pv ON pv.content_key = e.content_key AND pv.locale = e.locale AND pv.version = e.published_version
    WHERE e.content_key = ? AND e.locale = ?
    LIMIT 1
  `).bind(contentKey, locale).first<{ payload_json: string }>();
  if (!row?.payload_json) return null;
  return parseJson<Record<string, unknown> | null>(row.payload_json, null);
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
  if (publicOnly) {
    const rows = await database().prepare(`
    SELECT e.content_key, e.locale, e.published_version,
      pv.payload_json AS published_payload_json, pv.published_at AS published_at
    FROM content_entries e
    LEFT JOIN content_versions pv ON pv.content_key = e.content_key AND pv.locale = e.locale AND pv.version = e.published_version
    WHERE ${where} ORDER BY e.content_key ASC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all<Record<string, unknown>>();
    return (rows.results ?? []).map((row) => toPublicContentItem({
      content_key: row.content_key,
      locale: row.locale,
      published_version: row.published_version,
      published_payload_json: row.published_payload_json,
      published_at: row.published_at,
    }));
  }
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
  return { data, pagination: { page, limit, total: numberValue(count?.count), hasNext: offset + data.length < numberValue(count?.count) } };
}

export async function upsertContentDraft(input: { context: AdminContext; request: Request; data: { content_key: string; locale: string; payload: Record<string, unknown>; expected_version?: number } }) {
  assertSafeStructuredContent(input.data.payload);
  assertCmsSchema(input.data.content_key, input.data.payload);
  const current = await database().prepare(`SELECT current_version, published_version, updated_at FROM content_entries WHERE content_key = ? AND locale = ? LIMIT 1`).bind(input.data.content_key, input.data.locale).first<{ current_version: number; published_version: number | null; updated_at: number }>();
  const expectedVersion = input.data.expected_version;
  if (expectedVersion === undefined || expectedVersion !== (current?.current_version ?? 0)) throw new StoreError("RESOURCE_CHANGED", 409);
  const nextVersion = (current?.current_version ?? 0) + 1;
  const now = Math.max(Date.now(), numberValue(current?.updated_at) + 1);
  try {
    await database().batch([
      database().prepare(`INSERT INTO content_entries (id, content_key, locale, current_version, published_version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(content_key, locale) DO UPDATE SET current_version = excluded.current_version, updated_by = excluded.updated_by, updated_at = excluded.updated_at WHERE content_entries.current_version = ?`).bind(id("content"), input.data.content_key, input.data.locale, nextVersion, current?.published_version ?? null, input.context.viewer.userId, now, expectedVersion),
      database().prepare(`INSERT INTO content_versions (id, content_key, locale, version, payload_json, status, created_by, created_at, published_by, published_at) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, NULL, NULL)`).bind(id("contentv"), input.data.content_key, input.data.locale, nextVersion, JSON.stringify(input.data.payload), input.context.viewer.userId, now),
    ]);
  } catch (error) {
    if (/unique|primary key/i.test(String(error))) throw new StoreError("RESOURCE_CHANGED", 409);
    throw error;
  }
  await writeAdminAudit({ context: input.context, request: input.request, action: "CONTENT_UPDATED", entityType: "content", entityId: `${input.data.content_key}:${input.data.locale}`, metadata: { version: nextVersion, locale: input.data.locale } });
  return { contentKey: input.data.content_key, locale: input.data.locale, version: nextVersion, status: "DRAFT", payload: input.data.payload };
}

export async function publishContent(input: { context: AdminContext; request: Request; contentKey: string; data: { locale: string; version: number; reason?: string } }) {
  const row = await database().prepare(`
    SELECT cv.payload_json, cv.status, e.current_version
    FROM content_versions cv
    JOIN content_entries e ON e.content_key = cv.content_key AND e.locale = cv.locale
    WHERE cv.content_key = ? AND cv.locale = ? AND cv.version = ?
    LIMIT 1`).bind(input.contentKey, input.data.locale, input.data.version).first<{ payload_json: string; status: string; current_version: number }>();
  if (!row) throw new StoreError("CONTENT_VERSION_NOT_FOUND", 404);
  if ((row.status !== "DRAFT" && row.status !== "REVIEW") || row.current_version !== input.data.version) {
    throw new StoreError("CONTENT_VERSION_NOT_CURRENT", 409);
  }
  const payload = parseJson<Record<string, unknown>>(row.payload_json, {});
  assertSafeStructuredContent(payload);
  assertCmsSchema(input.contentKey, payload);
  assertRequiredContent(input.contentKey, payload);
  const now = Date.now();
  await database().batch([
    database().prepare(`UPDATE content_versions SET status = 'PUBLISHED', published_by = ?, published_at = ? WHERE content_key = ? AND locale = ? AND version = ? AND status IN ('DRAFT','REVIEW') AND EXISTS (SELECT 1 FROM content_entries e WHERE e.content_key = ? AND e.locale = ? AND e.current_version = ?)`).bind(input.context.viewer.userId, now, input.contentKey, input.data.locale, input.data.version, input.contentKey, input.data.locale, input.data.version),
    database().prepare(`UPDATE content_entries SET published_version = ?, updated_by = ?, updated_at = ? WHERE content_key = ? AND locale = ? AND current_version = ? AND EXISTS (SELECT 1 FROM content_versions cv WHERE cv.content_key = ? AND cv.locale = ? AND cv.version = ? AND cv.status = 'PUBLISHED')`).bind(input.data.version, input.context.viewer.userId, now, input.contentKey, input.data.locale, input.data.version, input.contentKey, input.data.locale, input.data.version),
    database().prepare(`UPDATE content_versions SET status = 'RETIRED' WHERE content_key = ? AND locale = ? AND status = 'PUBLISHED' AND version <> ? AND EXISTS (SELECT 1 FROM content_entries e WHERE e.content_key = ? AND e.locale = ? AND e.published_version = ?)`).bind(input.contentKey, input.data.locale, input.data.version, input.contentKey, input.data.locale, input.data.version),
  ]);
  await writeAdminAudit({ context: input.context, request: input.request, action: "CONTENT_PUBLISHED", entityType: "content", entityId: `${input.contentKey}:${input.data.locale}`, metadata: { version: input.data.version }, reason: input.data.reason ?? null });
  return { contentKey: input.contentKey, locale: input.data.locale, version: input.data.version, status: "PUBLISHED", payload };
}

export async function restoreContent(input: { context: AdminContext; request: Request; contentKey: string; data: { locale: string; version: number; reason: string } }) {
  const row = await database().prepare(`SELECT payload_json FROM content_versions WHERE content_key = ? AND locale = ? AND version = ? LIMIT 1`).bind(input.contentKey, input.data.locale, input.data.version).first<{ payload_json: string }>();
  if (!row) throw new StoreError("CONTENT_VERSION_NOT_FOUND", 404);
  const payload = parseJson<Record<string, unknown>>(row.payload_json, {});
  const current = await database().prepare(`SELECT current_version FROM content_entries WHERE content_key = ? AND locale = ? LIMIT 1`).bind(input.contentKey, input.data.locale).first<{ current_version: number }>();
  return upsertContentDraft({ context: input.context, request: input.request, data: { content_key: input.contentKey, locale: input.data.locale, payload, expected_version: current?.current_version ?? 0 } }).then(async (result) => {
    await writeAdminAudit({ context: input.context, request: input.request, action: "CONTENT_RESTORED", entityType: "content", entityId: `${input.contentKey}:${input.data.locale}`, metadata: { sourceVersion: input.data.version, newVersion: result.version }, reason: input.data.reason });
    return result;
  });
}

export async function getPricing() {
  const rows = await database().prepare(`SELECT p.id, p.test_id, p.name, p.status, p.amount_minor, p.currency, p.updated_by, p.updated_at, COALESCE(json_group_array(json_object('version', v.version, 'amountMinor', v.amount_minor, 'currency', v.currency, 'status', v.status, 'createdAt', v.created_at)), '[]') AS versions_json FROM products p LEFT JOIN pricing_versions v ON v.product_id = p.id GROUP BY p.id ORDER BY p.test_id`).all<Record<string, unknown>>();
  return (rows.results ?? []).map((row) => ({ ...row, versions: parseJson(row.versions_json as string, []) }));
}

export async function updatePricing(input: { context: AdminContext; request: Request; data: Record<string, unknown> }) {
  const current = await database().prepare(`SELECT * FROM products WHERE test_id = ? LIMIT 1`).bind(input.data.test_id).first<Record<string, unknown>>();
  const now = Math.max(Date.now(), numberValue(current?.updated_at) + 1);
  const expectedUpdatedAt = numberValue(input.data.expected_updated_at);
  if (expectedUpdatedAt !== (current ? numberValue(current.updated_at) : 0)) throw new StoreError("RESOURCE_CHANGED", 409);
  const productId = String(current?.id ?? id("product"));
  const version = numberValue(await database().prepare(`SELECT COALESCE(MAX(version), 0) AS version FROM pricing_versions WHERE product_id = ?`).bind(productId).first<{ version: number }>().then((row) => row?.version)) + 1;
  try {
    await database().batch([
      database().prepare(`INSERT INTO products (id, test_id, name, status, amount_minor, currency, updated_by, updated_at) VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?) ON CONFLICT(test_id) DO UPDATE SET name = excluded.name, amount_minor = excluded.amount_minor, currency = excluded.currency, updated_by = excluded.updated_by, updated_at = excluded.updated_at WHERE products.updated_at = ?`).bind(productId, input.data.test_id, input.data.name, input.data.amount_minor, String(input.data.currency).toUpperCase(), input.context.viewer.userId, now, expectedUpdatedAt),
      database().prepare(`UPDATE pricing_versions SET status = 'ARCHIVED' WHERE product_id = ? AND status = 'CURRENT'`).bind(productId),
      database().prepare(`INSERT INTO pricing_versions (id, product_id, version, amount_minor, currency, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'CURRENT', ?, ?)`).bind(id("price"), productId, version, input.data.amount_minor, String(input.data.currency).toUpperCase(), input.context.viewer.userId, now),
    ]);
  } catch (error) {
    if (/unique|primary key/i.test(String(error))) throw new StoreError("RESOURCE_CHANGED", 409);
    throw error;
  }
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
  return (rows.results ?? []).map((row) => {
    // Pre-check the same runtime-registry contract the publish endpoint
    // enforces, so the UI can disable Publish with the block reason upfront.
    // (The career-model executability check still runs at publish time.)
    const publishBlockReason = executableAssessmentVersionReason({
      productId: String(row.product_id),
      version: String(row.version),
      scoringVersion: String(row.scoring_version),
      contentVersion: String(row.content_version),
      careerModelVersion: String(row.career_model_version),
      reportVersion: String(row.report_version),
      adaptiveVersion: row.adaptive_version === null || row.adaptive_version === undefined ? null : String(row.adaptive_version),
      itemCount: numberValue(row.item_count),
    });
    return { ...row, metadata: parseJson(row.metadata_json as string, {}), publishable: publishBlockReason === null, publishBlockReason };
  });
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
  if (version.status !== "DRAFT" && version.status !== "REVIEW") throw new StoreError("ASSESSMENT_VERSION_IMMUTABLE", 409);
  const runtimeReason = executableAssessmentVersionReason({
    productId: String(version.product_id), version: String(version.version), scoringVersion: String(version.scoring_version),
    contentVersion: String(version.content_version), careerModelVersion: String(version.career_model_version),
    reportVersion: String(version.report_version), adaptiveVersion: version.adaptive_version === null ? null : String(version.adaptive_version), itemCount: numberValue(version.item_count),
  });
  if (runtimeReason) throw new StoreError(runtimeReason, 422);
  // Версионированные каталоги Teen: публикация версии, привязанной
  // к неопубликованному каталогу (сейчас v2 — ждёт перевод KK p036),
  // отклоняется здесь, а не в рантайме.
  const teenCatalogBlock = teenPublishBlockReason(String(version.version));
  if (teenCatalogBlock) throw new StoreError(teenCatalogBlock, 422);
  const careerModel = await database().prepare(`SELECT config_json FROM career_model_versions WHERE version = ? AND status = 'PUBLISHED' LIMIT 1`).bind(String(version.career_model_version)).first<{ config_json: string }>();
  if (!careerModel || parseJson<Record<string, unknown>>(careerModel.config_json, {}).runtime !== careerRuntimeForAssessmentVersion(String(version.version))) throw new StoreError("CAREER_MODEL_NOT_EXECUTABLE", 422);
  const now = Date.now();
  await database().batch([
    database().prepare(`UPDATE assessment_versions SET status = 'PUBLISHED', published_at = ? WHERE id = ? AND status IN ('DRAFT','REVIEW')`).bind(now, input.versionId),
    database().prepare(`UPDATE assessment_versions SET status = 'RETIRED', retired_at = ? WHERE product_id = ? AND status = 'PUBLISHED' AND id <> ? AND EXISTS (SELECT 1 FROM assessment_versions target WHERE target.id = ? AND target.status = 'PUBLISHED' AND target.published_at = ?)`).bind(now, version.product_id, input.versionId, input.versionId, now),
  ]);
  const published = await database().prepare(`SELECT * FROM assessment_versions WHERE id = ? LIMIT 1`).bind(input.versionId).first<Record<string, unknown>>();
  if (!published || published.status !== "PUBLISHED") throw new StoreError("ASSESSMENT_VERSION_NOT_PUBLISHABLE", 409);
  await writeAdminAudit({ context: input.context, request: input.request, action: "ASSESSMENT_VERSION_PUBLISHED", entityType: "assessment_version", entityId: input.versionId, metadata: { version: version.version, productId: version.product_id }, reason: input.reason });
  return published;
}

export async function getAnalytics(request: Request) {
  const { url } = pageParams(request);
  const daysRaw = Number(url.searchParams.get("days") ?? "30");
  const days = Math.min(365, Math.max(1, Number.isInteger(daysRaw) ? daysRaw : 30));
  const since = Date.now() - days * 86400000;
  const db = database();
  const [events, revenue, assessment, campaigns, pilot] = await Promise.all([
    db.prepare(`SELECT name, COUNT(*) AS count FROM telemetry_events WHERE occurred_at >= ? GROUP BY name ORDER BY count DESC`).bind(since).all<Record<string, unknown>>(),
    db.prepare(`SELECT currency, COUNT(*) AS orders, COALESCE(SUM(CASE WHEN status IN ('PAID','PARTIALLY_REFUNDED','REFUND_PENDING','REFUND_FAILED','REFUNDED','DISPUTED','DISPUTE_CLOSED') THEN COALESCE(final_amount_minor, amount_minor) ELSE 0 END), 0) AS gross, COALESCE(SUM(CASE WHEN status IN ('PAID','PARTIALLY_REFUNDED','REFUND_PENDING','REFUND_FAILED','REFUNDED','DISPUTED','DISPUTE_CLOSED') THEN COALESCE(discount_amount_minor, 0) ELSE 0 END), 0) AS discounts FROM orders WHERE created_at >= ? GROUP BY currency`).bind(since).all<Record<string, unknown>>(),
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
    SELECT a.id, a.role_id, u.id AS user_id, r.name AS role
    FROM admin_role_assignments a
    JOIN users u ON u.id = a.user_id
    JOIN admin_roles r ON r.id = a.role_id
    WHERE a.user_id = ? AND r.name = ? AND a.disabled_at IS NULL
    LIMIT 1`).bind(input.data.user_id, input.data.role).first<{ id: string; role_id: string; user_id: string; role: AdminRole }>();
  if (!assignment) throw new StoreError("ADMIN_ROLE_ASSIGNMENT_NOT_FOUND", 404);
  const disabledAt = Date.now();
  const result = await database().prepare(`
    UPDATE admin_role_assignments SET disabled_at = ?
    WHERE id = ? AND disabled_at IS NULL
      AND (? <> 'SUPER_ADMIN' OR (
        SELECT COUNT(*) FROM admin_role_assignments active
        WHERE active.role_id = ? AND active.disabled_at IS NULL
      ) > 1)
  `).bind(disabledAt, assignment.id, assignment.role, assignment.role_id).run();
  if (!result.meta.changes) {
    const stillActive = await database().prepare(`SELECT id FROM admin_role_assignments WHERE id = ? AND disabled_at IS NULL LIMIT 1`).bind(assignment.id).first<{ id: string }>();
    if (stillActive && assignment.role === "SUPER_ADMIN") throw new StoreError("ADMIN_LAST_SUPER_ADMIN", 409);
    throw new StoreError("ADMIN_ROLE_ASSIGNMENT_NOT_FOUND", 404);
  }
  await writeAdminAudit({ context: input.context, request: input.request, action: "ADMIN_DISABLED", entityType: "admin_role_assignment", entityId: assignment.id, metadata: { userId: assignment.user_id, role: assignment.role }, reason: input.data.reason });
  return { id: assignment.id, userId: assignment.user_id, role: assignment.role, disabledAt };
}

export async function listInvites(request: Request) {
  const { url, limit, page, offset } = pageParams(request);
  const status = textParam(url, "status");
  const now = Date.now();
  const conditions = ["1 = 1"];
  const bindings: Array<string | number> = [];
  if (status === "Accepted") {
    conditions.push("used_at IS NOT NULL");
  } else if (status === "Expired") {
    conditions.push("used_at IS NULL AND expires_at <= ?");
    bindings.push(now);
  } else if (status === "Pending") {
    conditions.push("used_at IS NULL AND expires_at > ?");
    bindings.push(now);
  }
  const where = conditions.join(" AND ");
  const count = await database().prepare(`SELECT COUNT(*) AS count FROM auth_invites WHERE ${where}`).bind(...bindings).first<{ count: number }>();
  // NOTE: token_hash is the primary key but is never selected or returned.
  const rows = await database().prepare(`SELECT rowid AS id, email, created_by, created_at, expires_at, used_at FROM auth_invites WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset).all<Record<string, unknown>>();
  const data = (rows.results ?? []).map((row) => {
    const email = String(row.email ?? "");
    const domain = email.includes("@") ? (email.split("@").pop() ?? "").toLowerCase() : "";
    const used = row.used_at !== null && row.used_at !== undefined;
    const expired = !used && numberValue(row.expires_at) <= now;
    return {
      id: row.id,
      email,
      emailDomain: domain,
      created_at: row.created_at,
      expires_at: row.expires_at,
      used_at: row.used_at,
      // auth_invites has no revocation column, so "Revoked" never occurs; kept out honestly.
      status: used ? "Accepted" : expired ? "Expired" : "Pending",
    };
  });
  return { data, pagination: { page, limit, total: numberValue(count?.count), hasNext: offset + data.length < numberValue(count?.count) } };
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
