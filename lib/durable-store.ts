import { getD1, getR2, getRuntimeEnv } from "@/db";
import {
  normalizeScoreProfile,
  scoreAssessment,
  VERSION_IDS,
  type AdaptiveSelection,
  type ReportJSON,
  type ResponseMap,
  type ScoreProfile,
} from "@/lib/assessment-engine";
import { selectAdaptiveForProfile, type AdaptiveRunRecord } from "@/lib/adaptive-provider";
import { ITEM_BANK, type Item } from "@/lib/item-bank";
import { buildReportPdf } from "@/lib/pdf-generator";
import { generateReportContent } from "@/lib/report-provider";
import { validatePaymentSnapshot } from "@/lib/payment-integrity";
import { isTelemetryEventName, sanitizeTelemetryMetadata, type TelemetryEventName } from "@/lib/analytics";
import { canPublishLocale, resolveLocale, type Locale } from "@/lib/i18n";
import { nextPaymentStatus, paymentTelemetryEvent, type PaymentEventStatus, type PaymentOperationalStatus } from "@/lib/payment-event-policy";
import { canSessionTransition, type SessionState } from "@/lib/assessment-state-machine";
import { purgeAfterFrom, retentionDaysFrom } from "@/lib/retention-policy";
import type { Viewer } from "@/lib/server-auth";

export type { SessionState } from "@/lib/assessment-state-machine";

export type DurableSession = {
  id: string;
  userId: string;
  testId: string;
  locale: Locale;
  entitlementId: string;
  state: SessionState;
  versions: typeof VERSION_IDS;
  responses: ResponseMap;
  responseTimes: Record<string, number>;
  clientSeq: number;
  adaptiveItemIds: string[];
  selectionMode?: "deterministic-fallback" | "ai-openai";
  profile?: ScoreProfile;
  reportId?: string;
  updatedAt: string;
};

export type OrderRecord = {
  id: string;
  testId: string;
  amountMinor: number;
  currency: string;
  status: "PAYMENT_PENDING" | "PAID" | "PAYMENT_FAILED" | "REFUNDED" | "DISPUTED" | "DISPUTE_CLOSED";
  provider: string;
  checkoutUrl: string | null;
  createdAt: string;
};

export type ReportRecord = {
  id: string;
  assessmentId: string;
  status: string;
  provider: string | null;
  score: ScoreProfile;
  report: ReportJSON | null;
  pdfAvailable: boolean;
  generation: {
    promptVersion: string | null;
    modelId: string | null;
    inputHash: string | null;
    outputHash: string | null;
    validationResult: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type ConsentChoices = {
  terms: boolean;
  privacy: boolean;
  research: boolean;
  marketing: boolean;
};

export type ConsentRecord = {
  consentType: keyof ConsentChoices;
  textVersion: string;
  granted: boolean;
  decidedAt: string;
  revokedAt: string | null;
};

export const CONSENT_TEXT_VERSION = "privacy-2026-09";

export class StoreError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message = code,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

type AssessmentRow = {
  id: string;
  user_id: string;
  entitlement_id: string | null;
  test_id: string;
  locale: string;
  state: SessionState;
  versions_json: string;
  adaptive_item_ids_json: string;
  selection_mode: "deterministic-fallback" | "ai-openai" | null;
  preliminary_score_json: string | null;
  final_score_json: string | null;
  report_id: string | null;
  client_seq: number;
  created_at: number;
  consented_at: number | null;
  completed_at: number | null;
  updated_at: number;
};

type ResponseRow = {
  item_id: string;
  response: number;
  response_time_ms: number;
};

type OrderRow = {
  id: string;
  test_id: string;
  amount_minor: number;
  currency: string;
  status: OrderRecord["status"];
  provider: string;
  provider_checkout_url: string | null;
  created_at: number;
};

type PaymentOrderRow = {
  id: string;
  user_id: string;
  test_id: string;
  amount_minor: number;
  currency: string;
  status: OrderRecord["status"];
  provider: string;
  provider_checkout_id: string | null;
  provider_payment_id: string | null;
};

type ReportRow = {
  id: string;
  assessment_id: string;
  status: string;
  provider: string | null;
  score_json: string;
  report_json: string | null;
  pdf_key: string | null;
  prompt_version: string | null;
  model_id: string | null;
  input_hash: string | null;
  output_hash: string | null;
  validation_result: string | null;
  created_at: number;
  updated_at: number;
};

type AdaptiveRunRow = {
  selector_version: string;
  provider: AdaptiveRunRecord["provider"];
  model_id: string | null;
  input_hash: string;
  output_hash: string;
  latency_ms: number;
  validation_result: AdaptiveRunRecord["validationResult"];
  fallback_reason: string | null;
};

const itemById = new Map<string, Item>(ITEM_BANK.map((item) => [item.id, item]));

function now() {
  return Date.now();
}

function iso(value: number) {
  return new Date(value).toISOString();
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isCoreItem(itemId: string) {
  const item = itemById.get(itemId);
  return Boolean(item && Number(item.id.slice(1)) <= 250);
}

function isAdaptiveItem(itemId: string) {
  const item = itemById.get(itemId);
  return Boolean(
    item &&
      (item.type === "adaptive_likert" || item.type === "adaptive_forced") &&
      Number(item.id.slice(1)) >= 251 &&
      Number(item.id.slice(1)) <= 300,
  );
}

function validResponse(itemId: string, value: number) {
  const item = itemById.get(itemId);
  if (!item || !Number.isFinite(value) || !Number.isInteger(value)) return false;
  if (item.type === "forced" || item.type === "adaptive_forced") {
    return value >= -2 && value <= 2;
  }
  return value >= 1 && value <= 7;
}

function responseMap(rows: ResponseRow[]) {
  return Object.fromEntries(rows.map((row) => [row.item_id, row.response])) as ResponseMap;
}

function responseTimes(rows: ResponseRow[]) {
  return Object.fromEntries(rows.map((row) => [row.item_id, row.response_time_ms])) as Record<string, number>;
}

function ensureDatabase() {
  try {
    return getD1();
  } catch {
    throw new StoreError(
      "DATABASE_UNAVAILABLE",
      503,
      "Persistent storage is not configured for this deployment.",
    );
  }
}

async function ensureUser(viewer: Viewer, requestedLocale?: Locale) {
  const database = ensureDatabase();
  const timestamp = now();
  const existing = await database
    .prepare(`SELECT deleted_at FROM users WHERE id = ? LIMIT 1`)
    .bind(viewer.userId)
    .first<{ deleted_at: number | null }>();
  if (existing?.deleted_at) throw new StoreError("ACCOUNT_DELETED", 410);
  if (existing) {
    await database
      .prepare(
        `UPDATE users SET email = ?, full_name = ?,
           locale = CASE WHEN ? IS NULL THEN CASE WHEN lower(locale) = 'kz' THEN 'kk' ELSE locale END ELSE ? END,
           updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(viewer.email, viewer.fullName, requestedLocale ?? null, requestedLocale ?? null, timestamp, viewer.userId)
      .run();
    return;
  }
  await database
    .prepare(
      `INSERT INTO users (id, email, full_name, locale, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(viewer.userId, viewer.email, viewer.fullName, requestedLocale ?? "ru", timestamp, timestamp)
    .run();
}

async function audit(
  viewerId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Record<string, string | number | boolean | null>,
) {
  try {
    const database = ensureDatabase();
    await database
      .prepare(
        `INSERT INTO audit_events (id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newId("aud"),
        viewerId,
        action,
        entityType,
        entityId,
        metadata ? JSON.stringify(metadata) : null,
        now(),
      )
      .run();
  } catch {
    console.error("audit_write_failed", { error_code: "AUDIT_WRITE_FAILED" });
  }
}

async function serverTelemetry(input: {
  name: TelemetryEventName;
  userId: string | null;
  assessmentId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const database = ensureDatabase();
    const metadata = sanitizeTelemetryMetadata(input.metadata);
    await database
      .prepare(`INSERT INTO telemetry_events (id, name, user_id, assessment_id, metadata_json, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(newId("tel"), input.name, input.userId, input.assessmentId ?? null, Object.keys(metadata).length ? JSON.stringify(metadata) : null, now())
      .run();
  } catch {
    console.error("telemetry_write_failed", { error_code: "TELEMETRY_WRITE_FAILED" });
  }
}

async function loadSession(sessionId: string, userId: string): Promise<DurableSession | null> {
  const database = ensureDatabase();
  const row = await database
    .prepare(
      `SELECT id, user_id, entitlement_id, test_id, locale, state, versions_json,
              adaptive_item_ids_json, selection_mode, preliminary_score_json,
              final_score_json, report_id, client_seq, created_at,
              consented_at, completed_at, updated_at
       FROM assessments
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
    )
    .bind(sessionId, userId)
    .first<AssessmentRow>();
  if (!row || !row.entitlement_id) return null;

  const responseResult = await database
    .prepare(
      `SELECT item_id, response, response_time_ms
       FROM assessment_responses
       WHERE assessment_id = ?
       ORDER BY client_seq ASC`,
    )
    .bind(sessionId)
    .all<ResponseRow>();
  const rows = responseResult.results ?? [];
  return {
    id: row.id,
    userId: row.user_id,
    testId: row.test_id,
    locale: resolveLocale(row.locale),
    entitlementId: row.entitlement_id,
    state: row.state,
    versions: parseJson(row.versions_json, VERSION_IDS),
    responses: responseMap(rows),
    responseTimes: responseTimes(rows),
    clientSeq: row.client_seq,
    adaptiveItemIds: parseJson<string[]>(row.adaptive_item_ids_json, []),
    selectionMode: row.selection_mode ?? undefined,
    profile: row.final_score_json ?? row.preliminary_score_json
      ? normalizeScoreProfile(parseJson<ScoreProfile | undefined>(row.final_score_json ?? row.preliminary_score_json, undefined))
      : undefined,
    reportId: row.report_id ?? undefined,
    updatedAt: iso(row.updated_at),
  };
}

async function loadAdaptiveRun(assessmentId: string): Promise<AdaptiveRunRecord | null> {
  const row = await ensureDatabase()
    .prepare(
      `SELECT selector_version, provider, model_id, input_hash, output_hash,
              latency_ms, validation_result, fallback_reason
       FROM adaptive_runs WHERE assessment_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(assessmentId)
    .first<AdaptiveRunRow>();
  if (!row) return null;
  return {
    selectorVersion: row.selector_version,
    provider: row.provider,
    modelId: row.model_id,
    inputHash: row.input_hash,
    outputHash: row.output_hash,
    latencyMs: row.latency_ms,
    validationResult: row.validation_result,
    fallbackReason: row.fallback_reason,
  };
}

function nextItemId(session: DurableSession) {
  const core = ITEM_BANK.filter((item) => isCoreItem(item.id));
  const nextCore = core.find((item) => typeof session.responses[item.id] !== "number");
  if (nextCore) return nextCore.id;
  const nextAdaptive = session.adaptiveItemIds.find((itemId) => typeof session.responses[itemId] !== "number");
  return nextAdaptive ?? null;
}

function publicOrder(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    testId: row.test_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    checkoutUrl: row.provider_checkout_url,
    createdAt: iso(row.created_at),
  };
}

export async function createPendingOrder(input: {
  viewer: Viewer;
  testId: string;
  amountMinor: number;
  currency: string;
  provider: string;
  idempotencyKey: string;
}) {
  await ensureUser(input.viewer);
  const database = ensureDatabase();
  const existing = await database
    .prepare(
      `SELECT id, test_id, amount_minor, currency, status, provider,
              provider_checkout_url, created_at
       FROM orders WHERE user_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(input.viewer.userId, input.idempotencyKey)
    .first<OrderRow>();
  if (existing) return { order: publicOrder(existing), reused: true };

  const timestamp = now();
  const orderId = newId("ord");
  try {
    await database
      .prepare(
        `INSERT INTO orders
          (id, user_id, test_id, amount_minor, currency, status, provider,
           provider_checkout_id, provider_checkout_url, provider_payment_id,
           provider_event_id, idempotency_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'PAYMENT_PENDING', ?, NULL, NULL, NULL, NULL, ?, ?, ?)`,
      )
      .bind(
        orderId,
        input.viewer.userId,
        input.testId,
        input.amountMinor,
        input.currency,
        input.provider,
        input.idempotencyKey,
        timestamp,
        timestamp,
      )
      .run();
  } catch {
    const race = await database
      .prepare(
        `SELECT id, test_id, amount_minor, currency, status, provider,
                provider_checkout_url, created_at
         FROM orders WHERE user_id = ? AND idempotency_key = ? LIMIT 1`,
      )
      .bind(input.viewer.userId, input.idempotencyKey)
      .first<OrderRow>();
    if (race) return { order: publicOrder(race), reused: true };
    console.error("order_insert_failed", { error_code: "ORDER_INSERT_FAILED" });
    throw new StoreError("ORDER_CREATE_FAILED", 500);
  }
  await audit(input.viewer.userId, "ORDER_CREATED", "order", orderId, {
    testId: input.testId,
    amountMinor: input.amountMinor,
    currency: input.currency,
  });
  return {
    order: {
      id: orderId,
      testId: input.testId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: "PAYMENT_PENDING" as const,
      provider: input.provider,
      checkoutUrl: null,
      createdAt: iso(timestamp),
    },
    reused: false,
  };
}

export async function attachCheckoutSession(input: {
  viewer: Viewer;
  orderId: string;
  providerCheckoutId: string;
  checkoutUrl: string;
}) {
  const database = ensureDatabase();
  const result = await database
    .prepare(
      `UPDATE orders
       SET provider_checkout_id = ?, provider_checkout_url = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(input.providerCheckoutId, input.checkoutUrl, now(), input.orderId, input.viewer.userId)
    .run();
  if (!result.success) throw new StoreError("ORDER_UPDATE_FAILED", 500);
  await audit(input.viewer.userId, "CHECKOUT_SESSION_CREATED", "order", input.orderId);
}

export async function markOrderPaymentFailed(orderId: string, reason: string) {
  const database = ensureDatabase();
  await database
    .prepare(
      `UPDATE orders SET status = 'PAYMENT_FAILED', updated_at = ?
       WHERE id = ? AND status = 'PAYMENT_PENDING'`,
    )
    .bind(now(), orderId)
    .run();
  await audit(null, "PAYMENT_PROVIDER_FAILED", "order", orderId, { reason });
}

export async function findOrderIdByPaymentId(providerPaymentId: string) {
  const row = await ensureDatabase()
    .prepare(`SELECT id FROM orders WHERE provider_payment_id = ? ORDER BY updated_at DESC LIMIT 1`)
    .bind(providerPaymentId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function handlePaymentEvent(input: {
  providerEventId: string;
  eventType: string;
  orderId: string;
  status: PaymentEventStatus;
  providerPaymentId?: string | null;
  providerCheckoutId?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  testId?: string | null;
  paymentStatus?: string | null;
  payloadHash: string;
}) {
  const database = ensureDatabase();
  const existing = await database
    .prepare(`SELECT id, payload_hash FROM payment_events WHERE id = ? LIMIT 1`)
    .bind(input.providerEventId)
    .first<{ id: string; payload_hash: string }>();
  if (existing) {
    if (existing.payload_hash !== input.payloadHash) throw new StoreError("PAYMENT_EVENT_REPLAY_MISMATCH", 409);
    return { duplicate: true, entitlementCreated: false };
  }

  const order = await database
    .prepare(`SELECT id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_payment_id FROM orders WHERE id = ? LIMIT 1`)
    .bind(input.orderId)
    .first<PaymentOrderRow>();
  if (!order) throw new StoreError("ORDER_NOT_FOUND", 404);

  if (input.status === "PAID" && !validatePaymentSnapshot({
    provider: order.provider,
    providerCheckoutId: order.provider_checkout_id,
    amountMinor: order.amount_minor,
    currency: order.currency,
    testId: order.test_id,
  }, {
    providerCheckoutId: input.providerCheckoutId ?? null,
    amountMinor: input.amountMinor ?? null,
    currency: input.currency ?? null,
    testId: input.testId ?? null,
    paymentStatus: input.paymentStatus ?? null,
  })) {
    await audit(null, "PAYMENT_EVENT_REJECTED", "order", input.orderId, {
      providerEventId: input.providerEventId,
      reason: "PAYMENT_INTEGRITY_MISMATCH",
    });
    throw new StoreError("PAYMENT_INTEGRITY_MISMATCH", 409);
  }

  const entitlementId = newId("ent");
  const timestamp = now();
  const nextStatus = nextPaymentStatus(order.status as PaymentOperationalStatus, input.status);
  const telemetryEvent = paymentTelemetryEvent(input.status);
  const statements = [
    database
      .prepare(
        `INSERT INTO payment_events
          (id, order_id, provider, event_type, status, payload_hash, received_at)
         VALUES (?, ?, 'stripe', ?, ?, ?, ?)`,
      )
      .bind(
        input.providerEventId,
        input.orderId,
        input.eventType,
        input.status,
        input.payloadHash,
        timestamp,
      ),
    database
      .prepare(
        `UPDATE orders
         SET status = ?,
             provider_payment_id = COALESCE(?, provider_payment_id),
             provider_event_id = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        nextStatus,
        input.providerPaymentId ?? null,
        input.providerEventId,
        timestamp,
        input.orderId,
      ),
  ];
  if (input.status === "PAID") {
    statements.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO entitlements
            (id, order_id, user_id, test_id, status, created_at, revoked_at)
           SELECT ?, id, user_id, test_id, 'ACTIVE', ?, NULL
           FROM orders WHERE id = ?`,
        )
        .bind(entitlementId, timestamp, input.orderId),
      database
        .prepare(
          `INSERT INTO telemetry_events (id, name, user_id, assessment_id, metadata_json, occurred_at)
           VALUES (?, ?, ?, NULL, ?, ?)`,
        )
        .bind(newId("tel"), telemetryEvent, order.user_id, JSON.stringify({ provider: "stripe", status: input.status }), timestamp),
    );
  } else if (telemetryEvent) {
    statements.push(
      database
        .prepare(
          `INSERT INTO telemetry_events (id, name, user_id, assessment_id, metadata_json, occurred_at)
           VALUES (?, ?, ?, NULL, ?, ?)`,
        )
        .bind(newId("tel"), telemetryEvent, order.user_id, JSON.stringify({ provider: "stripe", status: input.status, event_type: input.eventType }), timestamp),
    );
  }
  try {
    await database.batch(statements);
  } catch {
    const race = await database
      .prepare(`SELECT id, payload_hash FROM payment_events WHERE id = ? LIMIT 1`)
      .bind(input.providerEventId)
      .first<{ id: string; payload_hash: string }>();
    if (race) {
      if (race.payload_hash !== input.payloadHash) throw new StoreError("PAYMENT_EVENT_REPLAY_MISMATCH", 409);
      return { duplicate: true, entitlementCreated: false };
    }
    console.error("payment_event_write_failed", { error_code: "PAYMENT_EVENT_WRITE_FAILED" });
    throw new StoreError("PAYMENT_EVENT_WRITE_FAILED", 500);
  }
  await audit(null, "PAYMENT_EVENT_ACCEPTED", "order", input.orderId, {
    providerEventId: input.providerEventId,
    status: input.status,
    orderStatusBeforeEvent: order.status,
  });
  return { duplicate: false, entitlementCreated: input.status === "PAID", orderStatus: nextStatus };
}

export async function createAssessmentForUser(input: { viewer: Viewer; testId: string; locale?: Locale }) {
  const locale = input.locale ?? "ru";
  if (!canPublishLocale(locale)) throw new StoreError("LOCALE_NOT_PUBLISHED", 422);
  await ensureUser(input.viewer, locale);
  const database = ensureDatabase();
  const existing = await database
    .prepare(
      `SELECT a.id
       FROM assessments a
       JOIN entitlements e ON e.id = a.entitlement_id
       WHERE a.user_id = ? AND a.test_id = ? AND a.state NOT IN ('COMPLETE', 'CANCELLED', 'INVALIDATED')
       ORDER BY a.updated_at DESC LIMIT 1`,
    )
    .bind(input.viewer.userId, input.testId)
    .first<{ id: string }>();
  if (existing) {
    const resumed = await loadSession(existing.id, input.viewer.userId);
    if (resumed) return { session: resumed, reused: true };
  }

  const entitlement = await database
    .prepare(
      `SELECT id FROM entitlements
       WHERE user_id = ? AND test_id = ? AND status = 'ACTIVE'
         AND id NOT IN (SELECT entitlement_id FROM assessments WHERE entitlement_id IS NOT NULL)
       ORDER BY created_at ASC LIMIT 1`,
    )
    .bind(input.viewer.userId, input.testId)
    .first<{ id: string }>();
  if (!entitlement) throw new StoreError("PAYMENT_REQUIRED", 402);

  const timestamp = now();
  const sessionId = newId("sess");
  const versions = VERSION_IDS;
  await database
    .prepare(
      `INSERT INTO assessments
        (id, user_id, entitlement_id, test_id, locale, state, versions_json,
         adaptive_item_ids_json, selection_mode, preliminary_score_json,
         final_score_json, report_id, client_seq, created_at, consented_at,
         completed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'PAID', ?, '[]', NULL, NULL, NULL, NULL, 0, ?, NULL, NULL, ?)`,
    )
    .bind(
      sessionId,
      input.viewer.userId,
      entitlement.id,
      input.testId,
      locale,
      JSON.stringify(versions),
      timestamp,
      timestamp,
    )
    .run();
  await audit(input.viewer.userId, "ASSESSMENT_CREATED", "assessment", sessionId, { testId: input.testId });
  const session = await loadSession(sessionId, input.viewer.userId);
  if (!session) throw new StoreError("ASSESSMENT_CREATE_FAILED", 500);
  return { session, reused: false };
}

export async function getSessionForUser(sessionId: string, viewer: Viewer) {
  await ensureUser(viewer);
  return loadSession(sessionId, viewer.userId);
}

export async function deleteAssessmentForUser(sessionId: string, viewer: Viewer) {
  await ensureUser(viewer);
  const database = ensureDatabase();
  const assessment = await database
    .prepare(`SELECT id, state FROM assessments WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(sessionId, viewer.userId)
    .first<{ id: string; state: SessionState }>();
  if (!assessment) throw new StoreError("SESSION_NOT_FOUND", 404);

  const reportKeys = await database
    .prepare(`SELECT pdf_key FROM reports WHERE assessment_id = ? AND user_id = ? AND pdf_key IS NOT NULL`)
    .bind(sessionId, viewer.userId)
    .all<{ pdf_key: string }>();
  const requestId = newId("privacy");
  const timestamp = now();
  await database
    .prepare(
      `INSERT INTO privacy_requests (id, user_id, type, status, artifact_key, created_at, completed_at)
       VALUES (?, ?, 'ASSESSMENT_DELETE', 'PROCESSING', NULL, ?, NULL)`,
    )
    .bind(requestId, viewer.userId, timestamp)
    .run();

  try {
    const bucket = getR2();
    await Promise.all((reportKeys.results ?? []).map((row) => bucket.delete(row.pdf_key)));
  } catch {
    await database
      .prepare(`UPDATE privacy_requests SET status = 'FAILED_RETRYABLE' WHERE id = ? AND user_id = ?`)
      .bind(requestId, viewer.userId)
      .run();
    console.error("assessment_artifact_delete_failed", { error_code: "R2_DELETE_FAILED" });
    throw new StoreError("ASSESSMENT_DELETE_FAILED", 503);
  }

  try {
    await database.batch([
      database.prepare(`DELETE FROM assessment_responses WHERE assessment_id = ?`).bind(sessionId),
      database.prepare(`DELETE FROM adaptive_runs WHERE assessment_id = ?`).bind(sessionId),
      database.prepare(`DELETE FROM consents WHERE assessment_id = ? AND user_id = ?`).bind(sessionId, viewer.userId),
      database.prepare(`DELETE FROM reports WHERE assessment_id = ? AND user_id = ?`).bind(sessionId, viewer.userId),
      database.prepare(`DELETE FROM assessments WHERE id = ? AND user_id = ?`).bind(sessionId, viewer.userId),
      database.prepare(`UPDATE privacy_requests SET status = 'COMPLETE', completed_at = ? WHERE id = ? AND user_id = ?`).bind(timestamp, requestId, viewer.userId),
    ]);
  } catch {
    await database
      .prepare(`UPDATE privacy_requests SET status = 'FAILED_RETRYABLE' WHERE id = ? AND user_id = ?`)
      .bind(requestId, viewer.userId)
      .run();
    console.error("assessment_row_delete_failed", { error_code: "D1_DELETE_FAILED" });
    throw new StoreError("ASSESSMENT_DELETE_FAILED", 503);
  }
  await audit(viewer.userId, "ASSESSMENT_DELETED", "privacy_request", requestId, { assessmentState: assessment.state });
  await serverTelemetry({ name: "privacy_delete", userId: viewer.userId, assessmentId: sessionId, metadata: { status: "COMPLETE" } });
  return { requestId, assessmentId: sessionId, deleted: true };
}

export async function consumeRateLimit(input: {
  userId: string;
  scope: string;
  limit: number;
  windowMs: number;
}) {
  const database = ensureDatabase();
  const timestamp = now();
  const windowStartedAt = timestamp - (timestamp % input.windowMs);
  const bucketKey = `${input.scope}:${input.userId}`;
  await database
    .prepare(
      `INSERT INTO rate_limits (bucket_key, window_started_at, request_count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET
         window_started_at = CASE WHEN rate_limits.window_started_at < excluded.window_started_at
           THEN excluded.window_started_at ELSE rate_limits.window_started_at END,
         request_count = CASE WHEN rate_limits.window_started_at < excluded.window_started_at
           THEN 1 ELSE rate_limits.request_count + 1 END,
         updated_at = excluded.updated_at`,
    )
    .bind(bucketKey, windowStartedAt, timestamp)
    .run();
  const row = await database
    .prepare(`SELECT window_started_at, request_count FROM rate_limits WHERE bucket_key = ? LIMIT 1`)
    .bind(bucketKey)
    .first<{ window_started_at: number; request_count: number }>();
  if (!row) return { allowed: false, retryAfterSeconds: Math.ceil(input.windowMs / 1000) };
  if (row.request_count === 1) {
    await database
      .prepare(`DELETE FROM rate_limits WHERE updated_at < ?`)
      .bind(timestamp - 24 * 60 * 60 * 1000)
      .run()
      .catch(() => undefined);
  }
  const resetAt = row.window_started_at + input.windowMs;
  return {
    allowed: row.request_count <= input.limit,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - timestamp) / 1000)),
  };
}

export async function getConsentsForUser(sessionId: string, viewer: Viewer): Promise<ConsentRecord[]> {
  await ensureUser(viewer);
  const rows = await ensureDatabase()
    .prepare(
      `SELECT consent_type, text_version, granted, decided_at, revoked_at
       FROM consents WHERE assessment_id = ? AND user_id = ?
       ORDER BY consent_type ASC`,
    )
    .bind(sessionId, viewer.userId)
    .all<{
      consent_type: keyof ConsentChoices;
      text_version: string;
      granted: number;
      decided_at: number;
      revoked_at: number | null;
    }>();
  return (rows.results ?? []).map((row) => ({
    consentType: row.consent_type,
    textVersion: row.text_version,
    granted: row.granted === 1,
    decidedAt: iso(row.decided_at),
    revokedAt: row.revoked_at ? iso(row.revoked_at) : null,
  }));
}

export async function consentSessionForUser(
  sessionId: string,
  viewer: Viewer,
  choices: ConsentChoices = { terms: true, privacy: true, research: false, marketing: false },
) {
  await ensureUser(viewer);
  const database = ensureDatabase();
  if (!choices.terms || !choices.privacy) throw new StoreError("CONSENT_REQUIRED", 422);
  const timestamp = now();
  const assessment = await database
    .prepare(`SELECT state FROM assessments WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(sessionId, viewer.userId)
    .first<{ state: SessionState }>();
  if (!assessment) throw new StoreError("SESSION_NOT_FOUND", 404);
  if (!(["PAID", "CONSENTED"] as SessionState[]).includes(assessment.state)) {
    throw new StoreError("CONSENT_NOT_AVAILABLE", 409);
  }
  if (!canSessionTransition(assessment.state, "CONSENTED")) throw new StoreError("INVALID_SESSION_TRANSITION", 409);
  const consentEntries: Array<[keyof ConsentChoices, boolean]> = [
    ["terms", choices.terms],
    ["privacy", choices.privacy],
    ["research", choices.research],
    ["marketing", choices.marketing],
  ];
  try {
    await database.batch([
      ...consentEntries.map(([consentType, granted]) =>
        database
          .prepare(
            `INSERT INTO consents
              (id, user_id, assessment_id, consent_type, text_version, granted, decided_at, revoked_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
             ON CONFLICT(assessment_id, consent_type) DO UPDATE SET
               text_version = excluded.text_version,
               granted = excluded.granted,
               decided_at = excluded.decided_at,
               revoked_at = CASE WHEN excluded.granted = 1 THEN NULL ELSE COALESCE(consents.revoked_at, excluded.decided_at) END`,
          )
          .bind(newId("consent"), viewer.userId, sessionId, consentType, CONSENT_TEXT_VERSION, granted ? 1 : 0, timestamp),
      ),
      database
        .prepare(
          `UPDATE assessments SET state = 'CONSENTED', consented_at = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND state IN ('PAID', 'CONSENTED')`,
        )
        .bind(timestamp, timestamp, sessionId, viewer.userId),
    ]);
  } catch {
    console.error("consent_write_failed", { error_code: "CONSENT_WRITE_FAILED" });
    throw new StoreError("CONSENT_SAVE_FAILED", 500);
  }
  const session = await loadSession(sessionId, viewer.userId);
  if (!session) throw new StoreError("SESSION_NOT_FOUND", 404);
  await audit(viewer.userId, "ASSESSMENT_CONSENTED", "assessment", sessionId, {
    textVersion: CONSENT_TEXT_VERSION,
    terms: choices.terms,
    privacy: choices.privacy,
    research: choices.research,
    marketing: choices.marketing,
  });
  return session;
}

export async function saveResponse(input: {
  sessionId: string;
  viewer: Viewer;
  itemId: string;
  response: number;
  responseTimeMs?: number;
  clientSeq?: number;
  idempotencyKey?: string;
}) {
  await ensureUser(input.viewer);
  const session = await loadSession(input.sessionId, input.viewer.userId);
  if (!session) throw new StoreError("SESSION_NOT_FOUND", 404);
  if (!["CONSENTED", "CORE_IN_PROGRESS", "ADAPTIVE_IN_PROGRESS"].includes(session.state)) {
    throw new StoreError("SESSION_NOT_ACCEPTING_RESPONSES", 409);
  }
  if (!validResponse(input.itemId, input.response)) throw new StoreError("INVALID_RESPONSE", 422);
  const allowed = isCoreItem(input.itemId) || session.adaptiveItemIds.includes(input.itemId) && isAdaptiveItem(input.itemId);
  if (!allowed) throw new StoreError("ITEM_NOT_ALLOWED", 422);

  const database = ensureDatabase();
  if (input.idempotencyKey) {
    const replay = await database
      .prepare(
        `SELECT client_seq FROM assessment_responses
         WHERE assessment_id = ? AND idempotency_key = ? LIMIT 1`,
      )
      .bind(input.sessionId, input.idempotencyKey)
      .first<{ client_seq: number }>();
    if (replay) {
      return {
        saved: true,
        replay: true,
        serverSeq: replay.client_seq,
        nextItemId: nextItemId(session),
      };
    }
  }
  if (typeof session.responses[input.itemId] === "number") throw new StoreError("ITEM_ALREADY_ANSWERED", 409);

  const timestamp = now();
  const serverSeq = session.clientSeq + 1;
  const nextState = isCoreItem(input.itemId) ? "CORE_IN_PROGRESS" : "ADAPTIVE_IN_PROGRESS";
  if (!canSessionTransition(session.state, nextState)) throw new StoreError("INVALID_SESSION_TRANSITION", 409);
  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO assessment_responses
            (id, assessment_id, item_id, response, response_time_ms,
             client_seq, idempotency_key, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `${input.sessionId}:${input.itemId}`,
          input.sessionId,
          input.itemId,
          input.response,
          Math.min(24 * 60 * 60 * 1000, Math.max(0, Math.round(Number.isFinite(input.responseTimeMs ?? 0) ? input.responseTimeMs ?? 0 : 0))),
          serverSeq,
          input.idempotencyKey ?? null,
          timestamp,
        ),
      database
        .prepare(
          `UPDATE assessments SET state = ?, client_seq = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .bind(nextState, serverSeq, timestamp, input.sessionId, input.viewer.userId),
    ]);
  } catch {
    const race = await database
      .prepare(
        `SELECT client_seq, idempotency_key FROM assessment_responses
         WHERE assessment_id = ? AND item_id = ? LIMIT 1`,
      )
      .bind(input.sessionId, input.itemId)
      .first<{ client_seq: number; idempotency_key: string | null }>();
    if (race) {
      if (input.idempotencyKey && race.idempotency_key === input.idempotencyKey) {
        return {
          saved: true,
          replay: true,
          serverSeq: race.client_seq,
          nextItemId: nextItemId(session),
        };
      }
      throw new StoreError("ITEM_ALREADY_ANSWERED", 409);
    }
    console.error("response_write_failed", { error_code: "RESPONSE_WRITE_FAILED" });
    throw new StoreError("RESPONSE_SAVE_FAILED", 500);
  }
  return { saved: true, replay: false, serverSeq, nextItemId: nextItemId({ ...session, responses: { ...session.responses, [input.itemId]: input.response } }) };
}

export async function completeCoreForUser(sessionId: string, viewer: Viewer) {
  const session = await getSessionForUser(sessionId, viewer);
  if (!session) throw new StoreError("SESSION_NOT_FOUND", 404);
  if (
    session.adaptiveItemIds.length &&
    session.profile &&
    ["ADAPTIVE_IN_PROGRESS", "REPORT_GENERATING", "REPORT_FAILED_RETRYABLE", "COMPLETE"].includes(session.state)
  ) {
    const run = await loadAdaptiveRun(sessionId);
    return {
      session,
      selection: {
        selectedItemIds: session.adaptiveItemIds,
        targetCount: session.adaptiveItemIds.length,
        mode: session.selectionMode ?? (run?.provider === "openai" ? "ai-openai" : "deterministic-fallback"),
        validation: "passed" as const,
        reasonCodes: {},
      } satisfies AdaptiveSelection,
      run,
      reused: true,
    };
  }
  const coreAnswered = Object.keys(session.responses).filter(isCoreItem).length;
  if (coreAnswered < 250) throw new StoreError("CORE_INCOMPLETE", 422);
  if (!canSessionTransition(session.state, "ADAPTIVE_IN_PROGRESS")) throw new StoreError("INVALID_SESSION_TRANSITION", 409);
  const preliminary = scoreAssessment(session.responses, session.responseTimes);
  const decision = await selectAdaptiveForProfile(preliminary, Object.keys(session.responses), 12);
  const selection = decision.selection;
  const database = ensureDatabase();
  const timestamp = now();
  try {
    await database.batch([
      database
        .prepare(
          `UPDATE assessments
           SET state = 'ADAPTIVE_IN_PROGRESS', adaptive_item_ids_json = ?,
               selection_mode = ?, preliminary_score_json = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .bind(JSON.stringify(selection.selectedItemIds), selection.mode, JSON.stringify(preliminary), timestamp, sessionId, viewer.userId),
      database
        .prepare(
          `INSERT INTO adaptive_runs
            (id, assessment_id, selector_version, provider, model_id, input_hash,
             output_hash, chosen_ids_json, latency_ms, validation_result, fallback_reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId("adaptive"),
          sessionId,
          decision.run.selectorVersion,
          decision.run.provider,
          decision.run.modelId,
          decision.run.inputHash,
          decision.run.outputHash,
          JSON.stringify(selection.selectedItemIds),
          decision.run.latencyMs,
          decision.run.validationResult,
          decision.run.fallbackReason,
          timestamp,
        ),
    ]);
  } catch {
    const concurrent = await loadSession(sessionId, viewer.userId);
    if (concurrent?.adaptiveItemIds.length && concurrent.profile) {
      const run = await loadAdaptiveRun(sessionId);
      return {
        session: concurrent,
        selection: {
          selectedItemIds: concurrent.adaptiveItemIds,
          targetCount: concurrent.adaptiveItemIds.length,
          mode: concurrent.selectionMode ?? "deterministic-fallback",
          validation: "passed" as const,
          reasonCodes: {},
        } satisfies AdaptiveSelection,
        run,
        reused: true,
      };
    }
    console.error("adaptive_selection_write_failed", { error_code: "ADAPTIVE_SELECTION_WRITE_FAILED" });
    throw new StoreError("ADAPTIVE_SELECTION_SAVE_FAILED", 500);
  }
  await audit(viewer.userId, "ADAPTIVE_SELECTED", "assessment", sessionId, {
    count: selection.selectedItemIds.length,
    mode: selection.mode,
    provider: decision.run.provider,
    modelId: decision.run.modelId,
    inputHash: decision.run.inputHash,
    outputHash: decision.run.outputHash,
    validationResult: decision.run.validationResult,
  });
  await serverTelemetry({
    name: "core_completed",
    userId: viewer.userId,
    assessmentId: sessionId,
    metadata: { count: Object.keys(session.responses).filter(isCoreItem).length, status: "CORE_COMPLETE" },
  });
  await serverTelemetry({
    name: "adaptive_started",
    userId: viewer.userId,
    assessmentId: sessionId,
    metadata: { provider: decision.run.provider, fallback: decision.run.validationResult === "fallback", mode: selection.mode, latency_ms: decision.run.latencyMs, count: selection.selectedItemIds.length },
  });
  if (decision.run.validationResult === "fallback") {
    await serverTelemetry({
      name: "adaptive_fallback",
      userId: viewer.userId,
      assessmentId: sessionId,
      metadata: { provider: decision.run.provider, reason: decision.run.fallbackReason, latency_ms: decision.run.latencyMs },
    });
  }
  const updated = await loadSession(sessionId, viewer.userId);
  if (!updated) throw new StoreError("SESSION_NOT_FOUND", 404);
  return { session: updated, selection, run: decision.run, reused: false };
}

export async function completeAssessmentForUser(sessionId: string, viewer: Viewer) {
  const session = await getSessionForUser(sessionId, viewer);
  if (!session) throw new StoreError("SESSION_NOT_FOUND", 404);
  if (session.reportId && ["REPORT_GENERATING", "REPORT_FAILED_RETRYABLE", "COMPLETE"].includes(session.state)) {
    return { session, reportId: session.reportId, reused: true };
  }
  if (!session.adaptiveItemIds.length) throw new StoreError("ADAPTIVE_NOT_SELECTED", 422);
  const missing = session.adaptiveItemIds.filter((itemId) => typeof session.responses[itemId] !== "number");
  if (missing.length) throw new StoreError("ADAPTIVE_INCOMPLETE", 422);
  if (!canSessionTransition(session.state, "REPORT_GENERATING")) throw new StoreError("INVALID_SESSION_TRANSITION", 409);

  const profile = scoreAssessment(session.responses, session.responseTimes);
  const reportId = newId("rep");
  const database = ensureDatabase();
  const timestamp = now();
  try {
    await database.batch([
      database
        .prepare(
        `INSERT INTO reports
            (id, assessment_id, user_id, status, score_json, report_json,
             pdf_key, provider, prompt_version, model_id, input_hash,
             output_hash, validation_result, error_code, created_at, updated_at)
           VALUES (?, ?, ?, 'REPORT_GENERATING', ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
        )
        .bind(reportId, sessionId, viewer.userId, JSON.stringify(profile), timestamp, timestamp),
      database
        .prepare(
          `UPDATE assessments
           SET state = 'REPORT_GENERATING', final_score_json = ?, report_id = ?, updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .bind(JSON.stringify(profile), reportId, timestamp, sessionId, viewer.userId),
    ]);
  } catch {
    const existing = await database
      .prepare(`SELECT report_id FROM assessments WHERE id = ? AND user_id = ? LIMIT 1`)
      .bind(sessionId, viewer.userId)
      .first<{ report_id: string | null }>();
    if (existing?.report_id) return { session, reportId: existing.report_id, reused: true };
    console.error("report_create_failed", { error_code: "REPORT_CREATE_FAILED" });
    throw new StoreError("REPORT_CREATE_FAILED", 500);
  }
  await audit(viewer.userId, "SCORING_COMPLETED", "assessment", sessionId, { reportId });
  const updated = await loadSession(sessionId, viewer.userId);
  if (!updated) throw new StoreError("SESSION_NOT_FOUND", 404);
  return { session: updated, reportId, reused: false, profile };
}

export async function generateReportForUser(reportId: string, viewer: Viewer) {
  await ensureUser(viewer);
  const database = ensureDatabase();
  const row = await database
    .prepare(
      `SELECT id, assessment_id, status, provider, score_json, report_json,
              pdf_key, prompt_version, model_id, input_hash, output_hash,
              validation_result, created_at, updated_at
       FROM reports WHERE id = ? AND user_id = ? LIMIT 1`,
    )
    .bind(reportId, viewer.userId)
    .first<ReportRow>();
  if (!row) throw new StoreError("REPORT_NOT_FOUND", 404);
  if (row.status === "COMPLETE" && row.report_json) return getReportForUser(reportId, viewer);

  const score = normalizeScoreProfile(parseJson<ScoreProfile | null>(row.score_json, null));
  if (!score) throw new StoreError("SCORE_NOT_FOUND", 500);
  try {
    const generated = await generateReportContent(score);
    const pdfKey = `reports/${viewer.userId}/${reportId}.pdf`;
    const pdf = await buildReportPdf(score, generated.report);
    const bucket = getR2();
    await bucket.put(pdfKey, pdf, {
      httpMetadata: {
        contentType: "application/pdf",
        contentDisposition: `attachment; filename="orbita-30-${reportId}.pdf"`,
        cacheControl: "private, max-age=300",
      },
      customMetadata: { reportId, userId: viewer.userId, scoreVersion: score.versions.scoring },
    });
    const timestamp = now();
    const purgeAfter = purgeAfterFrom(timestamp, retentionDaysFrom(getRuntimeEnv().RETENTION_DAYS));
    await database
      .prepare(
      `UPDATE reports SET status = 'COMPLETE', provider = ?, report_json = ?,
                pdf_key = ?, prompt_version = ?, model_id = ?, input_hash = ?,
                output_hash = ?, validation_result = ?, error_code = NULL, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(
        generated.provider,
        JSON.stringify(generated.report),
        pdfKey,
        generated.promptVersion,
        generated.modelId,
        generated.inputHash,
        generated.outputHash,
        generated.validationResult,
        timestamp,
        reportId,
        viewer.userId,
      )
      .run();
    await database
      .prepare(
        `UPDATE assessments
         SET state = 'COMPLETE', completed_at = ?, purge_state = 'ACTIVE', purge_after = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(timestamp, purgeAfter, timestamp, row.assessment_id, viewer.userId)
      .run();
    await audit(viewer.userId, "REPORT_COMPLETED", "report", reportId, { provider: generated.provider, fallback: Boolean(generated.fallbackReason), reason: generated.fallbackReason });
    await serverTelemetry({ name: "adaptive_completed", userId: viewer.userId, assessmentId: row.assessment_id, metadata: { count: score.adaptiveAnswered, status: "COMPLETE" } });
    await serverTelemetry({ name: "report_completed", userId: viewer.userId, assessmentId: row.assessment_id, metadata: { provider: generated.provider, fallback: Boolean(generated.fallbackReason), reason: generated.fallbackReason, status: "COMPLETE" } });
    if (generated.fallbackReason) {
      await serverTelemetry({ name: "report_fallback", userId: viewer.userId, assessmentId: row.assessment_id, metadata: { provider: generated.provider, reason: generated.fallbackReason } });
    }
  } catch (error) {
    const code = error instanceof StoreError ? error.code : "REPORT_GENERATION_FAILED";
    await database
      .prepare(
        `UPDATE reports SET status = 'REPORT_FAILED_RETRYABLE', error_code = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(code, now(), reportId, viewer.userId)
      .run();
    console.error("report_generation_failed", { reportId, code, error_code: code });
    await serverTelemetry({ name: "report_failed", userId: viewer.userId, assessmentId: row.assessment_id, metadata: { reason: code, status: "REPORT_FAILED_RETRYABLE" } });
  }
  return getReportForUser(reportId, viewer);
}

export async function getReportForUser(reportId: string, viewer: Viewer): Promise<ReportRecord> {
  await ensureUser(viewer);
  const database = ensureDatabase();
  const row = await database
    .prepare(
      `SELECT id, assessment_id, status, provider, score_json, report_json,
              pdf_key, prompt_version, model_id, input_hash, output_hash,
              validation_result, created_at, updated_at
       FROM reports WHERE id = ? AND user_id = ? LIMIT 1`,
    )
    .bind(reportId, viewer.userId)
    .first<ReportRow>();
  if (!row) throw new StoreError("REPORT_NOT_FOUND", 404);
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    status: row.status,
    provider: row.provider,
    score: normalizeScoreProfile(parseJson<ScoreProfile | null>(row.score_json, null)),
    report: parseJson<ReportJSON | null>(row.report_json, null),
    pdfAvailable: Boolean(row.pdf_key),
    generation: {
      promptVersion: row.prompt_version,
      modelId: row.model_id,
      inputHash: row.input_hash,
      outputHash: row.output_hash,
      validationResult: row.validation_result,
    },
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export async function regenerateReportForUser(reportId: string, viewer: Viewer) {
  const database = ensureDatabase();
  await getReportForUser(reportId, viewer);
  await database
    .prepare(`UPDATE reports SET status = 'REPORT_GENERATING', error_code = NULL, updated_at = ? WHERE id = ? AND user_id = ?`)
    .bind(now(), reportId, viewer.userId)
    .run();
  return generateReportForUser(reportId, viewer).catch(async () => {
    console.error("report_regeneration_failed", { error_code: "REPORT_REGENERATION_FAILED" });
    return getReportForUser(reportId, viewer);
  });
}

export async function getReportPdfForUser(reportId: string, viewer: Viewer) {
  await ensureUser(viewer);
  const database = ensureDatabase();
  const row = await database
    .prepare(`SELECT pdf_key FROM reports WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(reportId, viewer.userId)
    .first<{ pdf_key: string | null }>();
  if (!row) throw new StoreError("REPORT_NOT_FOUND", 404);
  if (!row.pdf_key) throw new StoreError("PDF_NOT_READY", 409);
  let object;
  try {
    object = await getR2().get(row.pdf_key);
  } catch {
    console.error("pdf_storage_read_failed", { error_code: "PDF_STORAGE_READ_FAILED" });
    throw new StoreError("PDF_STORAGE_UNAVAILABLE", 503);
  }
  if (!object) throw new StoreError("PDF_NOT_FOUND", 404);
  return object;
}

export async function getAccountOverview(viewer: Viewer) {
  await ensureUser(viewer);
  const database = ensureDatabase();
  const userRow = await database
    .prepare(`SELECT locale FROM users WHERE id = ? LIMIT 1`)
    .bind(viewer.userId)
    .first<{ locale: string }>();
  const orderResult = await database
    .prepare(
      `SELECT id, test_id, amount_minor, currency, status, provider,
              provider_checkout_url, created_at
       FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .bind(viewer.userId)
    .all<OrderRow>();
  const assessmentResult = await database
    .prepare(
      `SELECT id, test_id, state, client_seq, adaptive_item_ids_json,
              report_id, created_at, updated_at
       FROM assessments WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`,
    )
    .bind(viewer.userId)
    .all<{
      id: string;
      test_id: string;
      state: SessionState;
      client_seq: number;
      adaptive_item_ids_json: string;
      report_id: string | null;
      created_at: number;
      updated_at: number;
    }>();
  return {
    user: {
      id: viewer.userId,
      email: viewer.email,
      displayName: viewer.displayName,
      locale: resolveLocale(userRow?.locale),
    },
    orders: (orderResult.results ?? []).map(publicOrder),
    assessments: (assessmentResult.results ?? []).map((row) => ({
      id: row.id,
      testId: row.test_id,
      state: row.state,
      clientSeq: row.client_seq,
      adaptiveCount: parseJson<string[]>(row.adaptive_item_ids_json, []).length,
      reportId: row.report_id,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    })),
  };
}

export async function recordTelemetry(input: {
  viewer: Viewer;
  name: string;
  assessmentId?: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isTelemetryEventName(input.name)) throw new StoreError("TELEMETRY_EVENT_NOT_ALLOWED", 422);
  await ensureUser(input.viewer);
  const database = ensureDatabase();
  if (input.assessmentId) {
    const assessment = await database
      .prepare(`SELECT id FROM assessments WHERE id = ? AND user_id = ? LIMIT 1`)
      .bind(input.assessmentId, input.viewer.userId)
      .first<{ id: string }>();
    if (!assessment) throw new StoreError("SESSION_NOT_FOUND", 404);
  }
  const safeMetadata = sanitizeTelemetryMetadata(input.metadata);
  const metadataJson = Object.keys(safeMetadata).length ? JSON.stringify(safeMetadata) : null;
  await database
    .prepare(
      `INSERT INTO telemetry_events (id, name, user_id, assessment_id, metadata_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId("tel"),
      input.name,
      input.viewer.userId,
      input.assessmentId ?? null,
      metadataJson,
      now(),
    )
    .run();
  return { accepted: true };
}

export async function requestDataExport(viewer: Viewer) {
  await ensureUser(viewer);
  const database = ensureDatabase();
  const requestId = newId("privacy");
  const key = `exports/${viewer.userId}/${requestId}.json`;
  const overview = await getAccountOverview(viewer);
  const sessionResult = await database
    .prepare(
      `SELECT id, test_id, state, versions_json, adaptive_item_ids_json,
              preliminary_score_json, final_score_json, report_id, client_seq,
              created_at, consented_at, completed_at, updated_at
       FROM assessments WHERE user_id = ? ORDER BY created_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>();
  const responseResult = await database
    .prepare(
      `SELECT r.assessment_id, r.item_id, r.response, r.response_time_ms, r.client_seq, r.created_at
       FROM assessment_responses r
       JOIN assessments a ON a.id = r.assessment_id
       WHERE a.user_id = ? ORDER BY r.created_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>();
  const reportResult = await database
    .prepare(
      `SELECT id, assessment_id, status, provider, score_json, report_json,
              prompt_version, model_id, input_hash, output_hash, validation_result,
              created_at, updated_at
       FROM reports WHERE user_id = ? ORDER BY created_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>();
  const adaptiveRunResult = await database
    .prepare(
      `SELECT ar.assessment_id, ar.selector_version, ar.provider, ar.model_id,
              ar.input_hash, ar.output_hash, ar.chosen_ids_json, ar.latency_ms,
              ar.validation_result, ar.fallback_reason, ar.created_at
       FROM adaptive_runs ar
       JOIN assessments a ON a.id = ar.assessment_id
       WHERE a.user_id = ? ORDER BY ar.created_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>();
  const consentResult = await database
    .prepare(
      `SELECT c.assessment_id, c.consent_type, c.text_version, c.granted,
              c.decided_at, c.revoked_at
       FROM consents c
       JOIN assessments a ON a.id = c.assessment_id
       WHERE c.user_id = ? ORDER BY c.decided_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>();
  const payload = {
    exportedAt: new Date().toISOString(),
    user: overview.user,
    orders: overview.orders,
    assessments: sessionResult.results ?? [],
    responses: responseResult.results ?? [],
    reports: reportResult.results ?? [],
    adaptiveRuns: adaptiveRunResult.results ?? [],
    consents: consentResult.results ?? [],
  };
  const bucket = getR2();
  await bucket.put(key, JSON.stringify(payload, null, 2), {
    httpMetadata: { contentType: "application/json", contentDisposition: `attachment; filename="orbita-data-${requestId}.json"` },
    customMetadata: { requestId, userId: viewer.userId },
  });
  await database
    .prepare(
      `INSERT INTO privacy_requests (id, user_id, type, status, artifact_key, created_at, completed_at)
       VALUES (?, ?, 'EXPORT', 'COMPLETE', ?, ?, ?)`,
    )
    .bind(requestId, viewer.userId, key, now(), now())
    .run();
  await serverTelemetry({ name: "privacy_export", userId: viewer.userId, metadata: { status: "COMPLETE" } });
  await audit(viewer.userId, "DATA_EXPORT_CREATED", "privacy_request", requestId);
  return { requestId, downloadPath: `/api/account/export/${requestId}` };
}

export async function getExportForUser(requestId: string, viewer: Viewer) {
  await ensureUser(viewer);
  const database = ensureDatabase();
  const row = await database
    .prepare(`SELECT artifact_key FROM privacy_requests WHERE id = ? AND user_id = ? AND type = 'EXPORT' LIMIT 1`)
    .bind(requestId, viewer.userId)
    .first<{ artifact_key: string | null }>();
  if (!row?.artifact_key) throw new StoreError("EXPORT_NOT_FOUND", 404);
  const object = await getR2().get(row.artifact_key);
  if (!object) throw new StoreError("EXPORT_NOT_FOUND", 404);
  return object;
}

export async function deleteAccount(viewer: Viewer) {
  await ensureUser(viewer);
  const database = ensureDatabase();
  const reportResult = await database
    .prepare(`SELECT pdf_key FROM reports WHERE user_id = ? AND pdf_key IS NOT NULL`)
    .bind(viewer.userId)
    .all<{ pdf_key: string }>();
  const privacyArtifactResult = await database
    .prepare(`SELECT artifact_key FROM privacy_requests WHERE user_id = ? AND artifact_key IS NOT NULL`)
    .bind(viewer.userId)
    .all<{ artifact_key: string }>();
  const requestId = newId("privacy");
  const timestamp = now();
  await database
    .prepare(
      `INSERT INTO privacy_requests (id, user_id, type, status, artifact_key, created_at, completed_at)
       VALUES (?, ?, 'DELETE', 'PROCESSING', NULL, ?, NULL)`,
    )
    .bind(requestId, viewer.userId, timestamp)
    .run();
  let bucket: R2Bucket;
  try {
    bucket = getR2();
    const keys = [
      ...(reportResult.results ?? []).map((row) => row.pdf_key),
      ...(privacyArtifactResult.results ?? []).map((row) => row.artifact_key),
    ];
    await Promise.all(keys.map((key) => bucket.delete(key)));
  } catch {
    await database
      .prepare(`UPDATE privacy_requests SET status = 'FAILED_RETRYABLE' WHERE id = ? AND user_id = ?`)
      .bind(requestId, viewer.userId)
      .run();
    console.error("account_artifact_delete_failed", { error_code: "R2_DELETE_FAILED" });
    throw new StoreError("ACCOUNT_ARTIFACT_DELETE_FAILED", 503);
  }
  await database.batch([
    database.prepare(`DELETE FROM assessment_responses WHERE assessment_id IN (SELECT id FROM assessments WHERE user_id = ?)`).bind(viewer.userId),
    database.prepare(`DELETE FROM adaptive_runs WHERE assessment_id IN (SELECT id FROM assessments WHERE user_id = ?)`).bind(viewer.userId),
    database.prepare(`DELETE FROM consents WHERE user_id = ?`).bind(viewer.userId),
    database.prepare(`DELETE FROM reports WHERE user_id = ?`).bind(viewer.userId),
    database.prepare(`DELETE FROM assessments WHERE user_id = ?`).bind(viewer.userId),
    database.prepare(`DELETE FROM entitlements WHERE user_id = ?`).bind(viewer.userId),
    database.prepare(`DELETE FROM payment_events WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)`).bind(viewer.userId),
    database.prepare(`DELETE FROM orders WHERE user_id = ?`).bind(viewer.userId),
    database.prepare(`DELETE FROM telemetry_events WHERE user_id = ?`).bind(viewer.userId),
    database.prepare(`DELETE FROM rate_limits WHERE bucket_key LIKE '%:' || ?`).bind(viewer.userId),
    database.prepare(`UPDATE users SET email = ?, full_name = NULL, deleted_at = ?, updated_at = ? WHERE id = ?`).bind(`${viewer.userId}@deleted.invalid`, timestamp, timestamp, viewer.userId),
    database.prepare(`UPDATE privacy_requests SET status = 'COMPLETE', completed_at = ? WHERE id = ? AND user_id = ?`).bind(timestamp, requestId, viewer.userId),
  ]);
  await audit(null, "ACCOUNT_DELETED", "privacy_request", requestId);
  return { requestId, deleted: true };
}
