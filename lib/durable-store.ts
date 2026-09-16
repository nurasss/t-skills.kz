import { getD1, getR2, getRuntimeEnv } from "@/db";
import {
  normalizeScoreProfile,
  scoreAssessment,
  VERSION_IDS,
  V2_VERSION_IDS,
  type AdaptiveSelection,
  type AssessmentVersionIds,
  type ReportJSON,
  type ResponseMap,
  type ScoreProfile,
} from "@/lib/assessment-engine";
import { selectAdaptiveForProfile, type AdaptiveRunRecord } from "@/lib/adaptive-provider";
import {
  buildAdaptiveContext,
  scoreCore60,
  type AdaptiveContext,
} from "@/lib/orbita-v2-engine";
import {
  createAdaptiveQuestionProvider,
  generatedQuestionToResponseItem,
  type AdaptiveProviderRun,
  type GeneratedAdaptiveQuestion,
} from "@/lib/mercury-adaptive-provider";
import { ITEM_BANK, type Item } from "@/lib/item-bank";
import { CORE60_BANK } from "@/lib/v2-item-bank";
import { buildReportPdf } from "@/lib/pdf-generator";
import { generateReportContent } from "@/lib/report-provider";
import { validatePaymentSnapshot } from "@/lib/payment-integrity";
import { isTelemetryEventName, sanitizeTelemetryMetadata, type TelemetryEventName } from "@/lib/analytics";
import { canPublishLocale, resolveLocale, type Locale } from "@/lib/i18n";
import { nextPaymentStatus, paymentTelemetryEvent, type PaymentEventStatus, type PaymentOperationalStatus } from "@/lib/payment-event-policy";
import { canSessionTransition, type SessionState } from "@/lib/assessment-state-machine";
import { purgeAfterFrom, retentionDaysFrom } from "@/lib/retention-policy";
import type { Viewer } from "@/lib/server-auth";
import { isBetaFreeMode } from "@/lib/runtime-config";

export type { SessionState } from "@/lib/assessment-state-machine";

export type DurableSession = {
  id: string;
  userId: string;
  testId: string;
  locale: Locale;
  entitlementId: string;
  state: SessionState;
  versions: AssessmentVersionIds;
  responses: ResponseMap;
  responseTimes: Record<string, number>;
  clientSeq: number;
  adaptiveItemIds: string[];
  adaptiveItems: GeneratedAdaptiveQuestion[];
  selectionMode?: "deterministic-fallback" | "ai-openai" | "mercury" | "approved-fallback";
  adaptiveGenerationStatus?: string;
  adaptiveFallbackUsed?: boolean;
  adaptiveGenerationAttempts: number;
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
  selection_mode: "deterministic-fallback" | "ai-openai" | "mercury" | "approved-fallback" | null;
  adaptive_generation_status: string;
  adaptive_provider: string | null;
  adaptive_model: string | null;
  adaptive_prompt_version: string | null;
  adaptive_generated_at: number | null;
  adaptive_fallback_used: number;
  adaptive_generation_lock: number;
  adaptive_generation_attempts: number;
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
  response_source?: string;
  presentation_metadata_json?: string;
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
  prompt_version: string | null;
  adaptive_version: string | null;
  provider_request_id: string | null;
  attempt_count: number | null;
  prompt_tokens: number | null;
  output_tokens: number | null;
  generated_count: number | null;
};

const itemById = new Map<string, Item>(ITEM_BANK.map((item) => [item.id, item]));
const MAX_ADAPTIVE_GENERATION_ATTEMPTS = 3;

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

function isV2Session(session: Pick<DurableSession, "versions">) {
  return session.versions.assessment === V2_VERSION_IDS.assessment;
}

function isSessionCoreItem(session: Pick<DurableSession, "versions">, itemId: string) {
  return isV2Session(session)
    ? CORE60_BANK.some((item) => item.id === itemId)
    : isCoreItem(itemId);
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

function validV2Response(item: Core60ItemOrAdaptive, value: number) {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return false;
  return item.format === "forced_choice" ? value >= -2 && value <= 2 : value >= 1 && value <= 7;
}

type Core60ItemOrAdaptive = (typeof CORE60_BANK)[number] | GeneratedAdaptiveQuestion;

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
              adaptive_item_ids_json, selection_mode, adaptive_generation_status,
              adaptive_provider, adaptive_model, adaptive_prompt_version,
              adaptive_generated_at, adaptive_fallback_used, adaptive_generation_lock,
              adaptive_generation_attempts,
              preliminary_score_json,
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
  const questionResult = await database
    .prepare(
      `SELECT question_id, format, prompt, options_json, target_traits_json,
              reason_code, semantic_intent, semantic_cluster, confidence,
              provider, model_id, provider_request_id, prompt_version,
              adaptive_version, validation_status
       FROM adaptive_questions
       WHERE assessment_id = ? ORDER BY question_id ASC`,
    )
    .bind(sessionId)
    .all<{
      question_id: string;
      format: "forced_choice" | "likert";
      prompt: string;
      options_json: string;
      target_traits_json: string;
      reason_code: GeneratedAdaptiveQuestion["reasonCode"];
      semantic_intent: string;
      semantic_cluster: string;
      confidence: number | null;
      provider: GeneratedAdaptiveQuestion["provider"];
      model_id: string | null;
      provider_request_id: string | null;
      prompt_version: GeneratedAdaptiveQuestion["promptVersion"];
      adaptive_version: GeneratedAdaptiveQuestion["adaptiveVersion"];
      validation_status: "accepted";
    }>();
  const adaptiveItems = (questionResult.results ?? []).map((question) => ({
    questionId: question.question_id as `AI-${string}` | `FB-${string}`,
    format: question.format,
    targetTraits: parseJson(question.target_traits_json, []) as GeneratedAdaptiveQuestion["targetTraits"],
    reasonCode: question.reason_code,
    prompt: question.prompt,
    options: parseJson(question.options_json, []) as GeneratedAdaptiveQuestion["options"],
    semanticIntent: question.semantic_intent,
    semanticCluster: question.semantic_cluster,
    confidence: question.confidence ?? 0,
    provider: question.provider,
    model: question.model_id,
    providerRequestId: question.provider_request_id,
    promptVersion: question.prompt_version,
    adaptiveVersion: question.adaptive_version,
    validationStatus: question.validation_status,
  })) satisfies GeneratedAdaptiveQuestion[];
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
    adaptiveItems,
    selectionMode: row.selection_mode ?? undefined,
    adaptiveGenerationStatus: row.adaptive_generation_status,
    adaptiveFallbackUsed: row.adaptive_fallback_used === 1,
    adaptiveGenerationAttempts: row.adaptive_generation_attempts ?? 0,
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
              latency_ms, validation_result, fallback_reason, prompt_version,
              adaptive_version, provider_request_id, attempt_count, prompt_tokens,
              output_tokens, generated_count
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
    promptVersion: row.prompt_version ?? undefined,
    adaptiveVersion: row.adaptive_version ?? undefined,
    providerRequestId: row.provider_request_id,
    attemptCount: row.attempt_count ?? undefined,
    promptTokens: row.prompt_tokens,
    outputTokens: row.output_tokens,
    generatedCount: row.generated_count ?? undefined,
  };
}

function nextItemId(session: DurableSession) {
  const core = isV2Session(session) ? CORE60_BANK : ITEM_BANK.filter((item) => isCoreItem(item.id));
  const nextCore = core.find((item) => typeof session.responses[item.id] !== "number");
  if (nextCore) return nextCore.id;
  const nextAdaptive = session.adaptiveItemIds.find((itemId) => typeof session.responses[itemId] !== "number");
  return nextAdaptive ?? null;
}

export function nextItemIdForSession(session: DurableSession) {
  return nextItemId(session);
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
            (id, order_id, user_id, test_id, grant_source, grant_reference, status, created_at, revoked_at)
           SELECT ?, id, user_id, test_id, 'stripe', 'stripe:' || id, 'ACTIVE', ?, NULL
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
  if (isBetaFreeMode(getRuntimeEnv())) {
    const reference = `beta_free:${input.viewer.userId}:${input.testId}`;
    await database
      .prepare(
        `INSERT OR IGNORE INTO entitlements
          (id, order_id, user_id, test_id, grant_source, grant_reference, status, created_at, revoked_at)
         VALUES (?, NULL, ?, ?, 'beta_free', ?, 'ACTIVE', ?, NULL)`,
      )
      .bind(newId("ent"), input.viewer.userId, input.testId, reference, now())
      .run();
  }
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
      `SELECT id, grant_source FROM entitlements
       WHERE user_id = ? AND test_id = ? AND status = 'ACTIVE'
         AND id NOT IN (SELECT entitlement_id FROM assessments WHERE entitlement_id IS NOT NULL)
       ORDER BY created_at ASC LIMIT 1`,
    )
    .bind(input.viewer.userId, input.testId)
    .first<{ id: string; grant_source: string }>();
  if (!entitlement) throw new StoreError("PAYMENT_REQUIRED", 402);

  const timestamp = now();
  const sessionId = newId("sess");
  const versions = V2_VERSION_IDS;
  const initialState: SessionState = entitlement.grant_source === "beta_free" ? "ENTITLED" : "PAID";
  try {
    await database
      .prepare(
        `INSERT INTO assessments
          (id, user_id, entitlement_id, test_id, locale, state, versions_json,
           adaptive_item_ids_json, selection_mode, preliminary_score_json,
           final_score_json, report_id, client_seq, created_at, consented_at,
           completed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '[]', NULL, NULL, NULL, NULL, 0, ?, NULL, NULL, ?)`,
      )
      .bind(
        sessionId,
        input.viewer.userId,
        entitlement.id,
        input.testId,
        locale,
        initialState,
        JSON.stringify(versions),
        timestamp,
        timestamp,
      )
      .run();
  } catch {
    const concurrent = await database
      .prepare(
        `SELECT id FROM assessments
         WHERE entitlement_id = ? AND user_id = ? AND test_id = ?
         ORDER BY created_at ASC LIMIT 1`,
      )
      .bind(entitlement.id, input.viewer.userId, input.testId)
      .first<{ id: string }>();
    if (concurrent) {
      const resumed = await loadSession(concurrent.id, input.viewer.userId);
      if (resumed) return { session: resumed, reused: true };
    }
    console.error("assessment_create_failed", { error_code: "ASSESSMENT_CREATE_FAILED" });
    throw new StoreError("ASSESSMENT_CREATE_FAILED", 500);
  }
  await audit(input.viewer.userId, "ASSESSMENT_CREATED", "assessment", sessionId, {
    testId: input.testId,
    grantSource: entitlement.grant_source,
  });
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
      database.prepare(`DELETE FROM adaptive_questions WHERE assessment_id = ?`).bind(sessionId),
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
  if (!(["PAID", "ENTITLED", "CONSENTED"] as SessionState[]).includes(assessment.state)) {
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
              (id, user_id, assessment_id, consent_type, text_version, privacy_notice_version, purpose, granted, decided_at, revoked_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
             ON CONFLICT(assessment_id, consent_type) DO UPDATE SET
               text_version = excluded.text_version,
               privacy_notice_version = excluded.privacy_notice_version,
               purpose = excluded.purpose,
               granted = excluded.granted,
               decided_at = excluded.decided_at,
               revoked_at = CASE WHEN excluded.granted = 1 THEN NULL ELSE COALESCE(consents.revoked_at, excluded.decided_at) END`,
          )
          .bind(newId("consent"), viewer.userId, sessionId, consentType, CONSENT_TEXT_VERSION, CONSENT_TEXT_VERSION, "developmental-assessment", granted ? 1 : 0, timestamp),
      ),
      database
        .prepare(
          `UPDATE assessments SET state = 'CONSENTED', consented_at = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND state IN ('PAID', 'ENTITLED', 'CONSENTED')`,
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
  idempotencyKey: string;
}) {
  await ensureUser(input.viewer);
  const session = await loadSession(input.sessionId, input.viewer.userId);
  if (!session) throw new StoreError("SESSION_NOT_FOUND", 404);
  const idempotencyKey = input.idempotencyKey.trim();
  if (!idempotencyKey) throw new StoreError("IDEMPOTENCY_KEY_REQUIRED", 422);
  if (idempotencyKey.length > 200 || /[\u0000-\u001f\u007f]/.test(idempotencyKey)) {
    throw new StoreError("IDEMPOTENCY_KEY_INVALID", 422);
  }
  if (!["CONSENTED", "CORE_IN_PROGRESS", "ADAPTIVE_IN_PROGRESS", "ADAPTIVE_FALLBACK"].includes(session.state)) {
    throw new StoreError("SESSION_NOT_ACCEPTING_RESPONSES", 409);
  }
  const v2CoreItem = isV2Session(session) ? CORE60_BANK.find((item) => item.id === input.itemId) : undefined;
  const v2AdaptiveItem = isV2Session(session) ? session.adaptiveItems.find((item) => item.questionId === input.itemId) : undefined;
  const coreResponseItem = v2CoreItem ?? v2AdaptiveItem;
  if (isV2Session(session) ? !coreResponseItem || !validV2Response(coreResponseItem, input.response) : !validResponse(input.itemId, input.response)) {
    throw new StoreError("INVALID_RESPONSE", 422);
  }
  const allowed = isV2Session(session)
    ? Boolean(v2CoreItem || v2AdaptiveItem)
    : isCoreItem(input.itemId) || session.adaptiveItemIds.includes(input.itemId) && isAdaptiveItem(input.itemId);
  if (!allowed) throw new StoreError("ITEM_NOT_ALLOWED", 422);

  const database = ensureDatabase();
  const replay = await database
    .prepare(
      `SELECT client_seq FROM assessment_responses
       WHERE assessment_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(input.sessionId, idempotencyKey)
    .first<{ client_seq: number }>();
  if (replay) {
    return {
      saved: true,
      replay: true,
      serverSeq: replay.client_seq,
      nextItemId: nextItemId(session),
    };
  }
  if (typeof session.responses[input.itemId] === "number") throw new StoreError("ITEM_ALREADY_ANSWERED", 409);

  const timestamp = now();
  const serverSeq = session.clientSeq + 1;
  const itemIsCore = isSessionCoreItem(session, input.itemId);
  const nextState: SessionState = itemIsCore ? "CORE_IN_PROGRESS" : "ADAPTIVE_IN_PROGRESS";
  if (!canSessionTransition(session.state, nextState)) throw new StoreError("INVALID_SESSION_TRANSITION", 409);
  const itemNumber = Number(input.itemId.replace(/[^0-9]/g, ""));
  const phase = itemIsCore ? "core" : "adaptive";
  const position = phase === "core" ? itemNumber : session.adaptiveItemIds.indexOf(input.itemId) + 1;
  const responseSource = phase === "core"
    ? "core"
    : isV2Session(session)
      ? v2AdaptiveItem?.provider === "approved-fallback" ? "adaptive_fallback" : "adaptive_ai"
      : "adaptive_legacy";
  const presentationMetadata = JSON.stringify({
    phase,
    position,
    block: phase === "core" && !isV2Session(session) ? Math.ceil(position / 50) : null,
    locale: session.locale,
    itemBankVersion: session.versions.itemBank,
    translationVersion: session.versions.translation,
    responseSource,
  });
  try {
    const writeResults = await database.batch([
      database
        .prepare(
          `INSERT INTO assessment_responses
            (id, assessment_id, item_id, response, response_time_ms,
            client_seq, idempotency_key, response_source, presentation_metadata_json, created_at)
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           FROM assessments
           WHERE id = ? AND user_id = ? AND client_seq = ?
             AND state IN ('CONSENTED', 'CORE_IN_PROGRESS', 'ADAPTIVE_IN_PROGRESS', 'ADAPTIVE_FALLBACK')`,
        )
        .bind(
          `${input.sessionId}:${input.itemId}`,
          input.sessionId,
          input.itemId,
          input.response,
          Math.min(24 * 60 * 60 * 1000, Math.max(0, Math.round(Number.isFinite(input.responseTimeMs ?? 0) ? input.responseTimeMs ?? 0 : 0))),
          serverSeq,
          idempotencyKey,
          responseSource,
          presentationMetadata,
          timestamp,
          input.sessionId,
          input.viewer.userId,
          session.clientSeq,
        ),
      database
        .prepare(
          `UPDATE assessments SET state = ?, client_seq = ?, updated_at = ?
           WHERE id = ? AND user_id = ? AND client_seq = ?`,
        )
        .bind(nextState, serverSeq, timestamp, input.sessionId, input.viewer.userId, session.clientSeq),
    ]);
    if ((writeResults[0]?.meta?.changes ?? 0) !== 1 || (writeResults[1]?.meta?.changes ?? 0) !== 1) {
      throw new StoreError("RESPONSE_WRITE_CONFLICT", 409);
    }
  } catch {
    const race = await database
      .prepare(
        `SELECT client_seq, idempotency_key FROM assessment_responses
         WHERE assessment_id = ? AND item_id = ? LIMIT 1`,
      )
      .bind(input.sessionId, input.itemId)
      .first<{ client_seq: number; idempotency_key: string | null }>();
    if (race) {
      if (race.idempotency_key === idempotencyKey) {
        return {
          saved: true,
          replay: true,
          serverSeq: race.client_seq,
          nextItemId: nextItemId(session),
        };
      }
      throw new StoreError("ITEM_ALREADY_ANSWERED", 409);
    }
    const current = await loadSession(input.sessionId, input.viewer.userId);
    if (current && typeof current.responses[input.itemId] !== "number") {
      throw new StoreError("RESPONSE_WRITE_CONFLICT", 409);
    }
    console.error("response_write_failed", { error_code: "RESPONSE_WRITE_FAILED" });
    throw new StoreError("RESPONSE_SAVE_FAILED", 500);
  }
  return { saved: true, replay: false, serverSeq, nextItemId: nextItemId({ ...session, responses: { ...session.responses, [input.itemId]: input.response } }) };
}

async function hashText(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function v2Selection(session: DurableSession, fallbackMode?: boolean): AdaptiveSelection {
  return {
    selectedItemIds: session.adaptiveItems.map((question) => question.questionId),
    targetCount: session.adaptiveItems.length,
    mode: fallbackMode || session.adaptiveFallbackUsed ? "approved-fallback" : "mercury",
    validation: "passed",
    reasonCodes: Object.fromEntries(session.adaptiveItems.map((question) => [question.questionId, [question.reasonCode]])),
  };
}

function v2RunToPublic(run: AdaptiveProviderRun) {
  return {
    selectorVersion: run.adaptiveVersion,
    provider: run.provider,
    modelId: run.modelId,
    inputHash: run.inputHash,
    outputHash: run.outputHash,
    latencyMs: run.latencyMs,
    validationResult: run.validationResult,
    fallbackReason: run.fallbackReason,
    promptVersion: run.promptVersion,
    adaptiveVersion: run.adaptiveVersion,
    providerRequestId: run.providerRequestId,
    attemptCount: run.attemptCount,
    promptTokens: run.promptTokens,
    outputTokens: run.outputTokens,
  };
}

async function completeCoreV2ForUser(session: DurableSession, viewer: Viewer) {
  const coreAnswered = Object.keys(session.responses).filter((itemId) => CORE60_BANK.some((item) => item.id === itemId)).length;
  if (session.adaptiveItems.length && session.profile && [
    "ADAPTIVE_IN_PROGRESS",
    "ADAPTIVE_FALLBACK",
    "REPORT_GENERATING",
    "REPORT_FAILED_RETRYABLE",
    "COMPLETE",
  ].includes(session.state)) {
    return {
      session,
      selection: v2Selection(session),
      run: await loadAdaptiveRun(session.id),
      reused: true,
    };
  }
  if (coreAnswered < CORE60_BANK.length) throw new StoreError("CORE_INCOMPLETE", 422);
  if (!session.adaptiveItems.length && session.adaptiveGenerationAttempts >= MAX_ADAPTIVE_GENERATION_ATTEMPTS) {
    throw new StoreError("ADAPTIVE_RETRY_LIMIT", 429);
  }
  const preliminary = scoreCore60(session.responses, session.responseTimes);
  const database = ensureDatabase();
  const timestamp = now();
  const lock = await database
    .prepare(
      `UPDATE assessments
       SET state = 'ADAPTIVE_GENERATING', adaptive_generation_status = 'GENERATING',
           adaptive_generation_lock = 1, adaptive_generation_attempts = adaptive_generation_attempts + 1,
           preliminary_score_json = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND adaptive_generation_lock = 0
         AND adaptive_generation_attempts < ?
         AND state IN ('CORE_IN_PROGRESS', 'CORE_COMPLETE', 'ADAPTIVE_PROVIDER_FAILED', 'ADAPTIVE_FALLBACK')`,
    )
    .bind(JSON.stringify(preliminary), timestamp, session.id, viewer.userId, MAX_ADAPTIVE_GENERATION_ATTEMPTS)
    .run();
  if ((lock.meta?.changes ?? 0) !== 1) {
    const concurrent = await loadSession(session.id, viewer.userId);
    if (concurrent?.adaptiveItems.length) {
      return { session: concurrent, selection: v2Selection(concurrent), run: await loadAdaptiveRun(session.id), reused: true };
    }
    if (concurrent?.state === "ADAPTIVE_GENERATING" && concurrent.adaptiveGenerationAttempts < MAX_ADAPTIVE_GENERATION_ATTEMPTS && Date.parse(concurrent.updatedAt) < timestamp - 120_000) {
      await database
        .prepare(`UPDATE assessments SET state = 'CORE_IN_PROGRESS', adaptive_generation_status = 'NOT_STARTED', adaptive_generation_lock = 0, updated_at = ? WHERE id = ? AND user_id = ? AND adaptive_generation_lock = 1`)
        .bind(timestamp, session.id, viewer.userId)
        .run();
      const refreshed = await loadSession(session.id, viewer.userId);
      if (refreshed) return completeCoreV2ForUser(refreshed, viewer);
    }
    throw new StoreError("ADAPTIVE_GENERATION_IN_PROGRESS", 409);
  }

  const context: AdaptiveContext = buildAdaptiveContext(
    preliminary,
    Object.keys(session.responses).filter((itemId) => CORE60_BANK.some((item) => item.id === itemId)),
  );
  const provider = createAdaptiveQuestionProvider(getRuntimeEnv());
  let generated;
  try {
    generated = await provider.generateQuestions(context);
  } catch (error) {
    console.error("adaptive_generation_failed", { error_code: "ADAPTIVE_PROVIDER_FAILED" });
    await database
      .prepare(`UPDATE assessments SET state = 'ADAPTIVE_PROVIDER_FAILED', adaptive_generation_status = 'FAILED', adaptive_generation_lock = 0, updated_at = ? WHERE id = ? AND user_id = ?`)
      .bind(now(), session.id, viewer.userId)
      .run();
    throw new StoreError("ADAPTIVE_PROVIDER_FAILED", 503, error instanceof Error ? error.message : "Adaptive provider failed");
  }

  const questions = generated.questions;
  const run = generated.run;
  const fallbackUsed = generated.fallbackUsed;
  const selectionMode = fallbackUsed ? "approved-fallback" : "mercury";
  const nextState: SessionState = fallbackUsed ? "ADAPTIVE_FALLBACK" : "ADAPTIVE_IN_PROGRESS";
  try {
    const questionStatements = await Promise.all(questions.map(async (question) => database.prepare(
      `INSERT INTO adaptive_questions
        (id, assessment_id, question_id, format, prompt, options_json,
         target_traits_json, reason_code, semantic_intent, semantic_cluster,
         confidence, provider, model_id, provider_request_id, prompt_version,
         adaptive_version, validation_status, question_hash, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newId("aq"),
      session.id,
      question.questionId,
      question.format,
      question.prompt,
      JSON.stringify(question.options),
      JSON.stringify(question.targetTraits),
      question.reasonCode,
      question.semanticIntent,
      question.semanticCluster,
      question.confidence,
      question.provider,
      question.model,
      question.providerRequestId ?? run.providerRequestId,
      question.promptVersion,
      question.adaptiveVersion,
      question.validationStatus,
      await hashText(JSON.stringify({ questionId: question.questionId, prompt: question.prompt, options: question.options, targetTraits: question.targetTraits, semanticIntent: question.semanticIntent })),
      timestamp,
    )));
    await database.batch([
      ...questionStatements,
      database
        .prepare(
          `INSERT INTO adaptive_runs
            (id, assessment_id, selector_version, provider, model_id, input_hash,
             output_hash, chosen_ids_json, latency_ms, validation_result,
             fallback_reason, prompt_version, adaptive_version, provider_request_id,
             attempt_count, prompt_tokens, output_tokens, generated_count, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId("adaptive"), session.id, run.adaptiveVersion, run.provider, run.modelId,
          run.inputHash, run.outputHash, JSON.stringify(questions.map((question) => question.questionId)),
          run.latencyMs, run.validationResult, run.fallbackReason, run.promptVersion,
          run.adaptiveVersion, run.providerRequestId, run.attemptCount, run.promptTokens,
          run.outputTokens, questions.length, timestamp,
        ),
      database
        .prepare(
          `UPDATE assessments SET state = ?, adaptive_item_ids_json = ?, selection_mode = ?,
             adaptive_generation_status = ?, adaptive_provider = ?, adaptive_model = ?,
             adaptive_prompt_version = ?, adaptive_generated_at = ?, adaptive_fallback_used = ?,
             adaptive_generation_lock = 0, updated_at = ?
           WHERE id = ? AND user_id = ?`,
        )
        .bind(
          nextState,
          JSON.stringify(questions.map((question) => question.questionId)),
          selectionMode,
          fallbackUsed ? "FALLBACK" : "COMPLETE",
          run.provider,
          run.modelId,
          run.promptVersion,
          timestamp,
          fallbackUsed ? 1 : 0,
          timestamp,
          session.id,
          viewer.userId,
        ),
    ]);
  } catch {
    await database
      .prepare(`UPDATE assessments SET state = 'ADAPTIVE_PROVIDER_FAILED', adaptive_generation_status = 'FAILED', adaptive_generation_lock = 0, updated_at = ? WHERE id = ? AND user_id = ?`)
      .bind(now(), session.id, viewer.userId)
      .run();
    console.error("adaptive_generation_persistence_failed", { error_code: "ADAPTIVE_GENERATION_SAVE_FAILED" });
    throw new StoreError("ADAPTIVE_GENERATION_SAVE_FAILED", 500);
  }
  await audit(viewer.userId, "ADAPTIVE_GENERATED", "assessment", session.id, {
    count: questions.length,
    provider: run.provider,
    fallback: fallbackUsed,
    latencyMs: run.latencyMs,
  });
  await serverTelemetry({ name: "core_completed", userId: viewer.userId, assessmentId: session.id, metadata: { count: coreAnswered, status: "CORE_COMPLETE" } });
  await serverTelemetry({ name: "adaptive_started", userId: viewer.userId, assessmentId: session.id, metadata: { provider: run.provider, fallback: fallbackUsed, mode: selectionMode, latency_ms: run.latencyMs, count: questions.length } });
  if (run.attemptCount > 1) await serverTelemetry({ name: "adaptive_retry", userId: viewer.userId, assessmentId: session.id, metadata: { provider: run.provider, attempt_count: run.attemptCount, latency_ms: run.latencyMs } });
  if (fallbackUsed && run.fallbackReason?.startsWith("ADAPTIVE_GENERATED_")) await serverTelemetry({ name: "adaptive_validation_rejected", userId: viewer.userId, assessmentId: session.id, metadata: { provider: run.provider, reason: run.fallbackReason, count: questions.length } });
  if (fallbackUsed) await serverTelemetry({ name: "adaptive_fallback", userId: viewer.userId, assessmentId: session.id, metadata: { provider: run.provider, reason: run.fallbackReason, latency_ms: run.latencyMs } });
  const updated = await loadSession(session.id, viewer.userId);
  if (!updated) throw new StoreError("SESSION_NOT_FOUND", 404);
  return { session: updated, selection: v2Selection(updated, fallbackUsed), run: v2RunToPublic(run), reused: false };
}

export async function completeCoreForUser(sessionId: string, viewer: Viewer) {
  const session = await getSessionForUser(sessionId, viewer);
  if (!session) throw new StoreError("SESSION_NOT_FOUND", 404);
  if (isV2Session(session)) return completeCoreV2ForUser(session, viewer);
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

  const profile = isV2Session(session)
    ? scoreCore60(session.responses, session.responseTimes, session.adaptiveItems.map(generatedQuestionToResponseItem))
    : scoreAssessment(session.responses, session.responseTimes);
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
    const assessmentMeta = await database
      .prepare(`SELECT versions_json, adaptive_provider, adaptive_fallback_used, adaptive_item_ids_json FROM assessments WHERE id = ? AND user_id = ? LIMIT 1`)
      .bind(row.assessment_id, viewer.userId)
      .first<{ versions_json: string; adaptive_provider: string | null; adaptive_fallback_used: number; adaptive_item_ids_json: string }>();
    const versionSnapshot = parseJson<Record<string, string>>(assessmentMeta?.versions_json, score.versions);
    const report = {
      ...generated.report,
      assessmentVersion: versionSnapshot.assessment ?? score.versions.assessment,
      coreQuestionCount: versionSnapshot.assessment === V2_VERSION_IDS.assessment ? 60 : score.coreAnswered,
      adaptiveQuestionCount: parseJson<string[]>(assessmentMeta?.adaptive_item_ids_json, []).length || score.adaptiveAnswered,
      adaptiveProvider: assessmentMeta?.adaptive_provider ?? (versionSnapshot.assessment === V2_VERSION_IDS.assessment ? "approved-fallback" : "legacy-selector"),
      adaptiveFallbackUsed: assessmentMeta?.adaptive_fallback_used === 1,
      adaptiveVersion: versionSnapshot.adaptive ?? versionSnapshot.selector ?? generated.report.adaptiveVersion,
      reportVersion: versionSnapshot.report ?? score.versions.report,
    } satisfies ReportJSON;
    const pdfKey = `reports/${viewer.userId}/${reportId}.pdf`;
    const pdf = await buildReportPdf(score, report);
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
        JSON.stringify(report),
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
      `SELECT r.assessment_id, r.item_id, r.response, r.response_time_ms, r.client_seq,
              r.response_source, r.presentation_metadata_json, r.created_at
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
              ar.validation_result, ar.fallback_reason, ar.prompt_version,
              ar.adaptive_version, ar.provider_request_id, ar.attempt_count,
              ar.prompt_tokens, ar.output_tokens, ar.generated_count, ar.created_at
       FROM adaptive_runs ar
       JOIN assessments a ON a.id = ar.assessment_id
       WHERE a.user_id = ? ORDER BY ar.created_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>();
  const adaptiveQuestionResult = await database
    .prepare(
      `SELECT aq.assessment_id, aq.question_id, aq.format, aq.prompt, aq.options_json,
              aq.target_traits_json, aq.reason_code, aq.semantic_intent, aq.semantic_cluster,
              aq.confidence, aq.provider, aq.model_id, aq.provider_request_id,
              aq.prompt_version, aq.adaptive_version, aq.validation_status,
              aq.question_hash, aq.generated_at
       FROM adaptive_questions aq
       JOIN assessments a ON a.id = aq.assessment_id
       WHERE a.user_id = ? ORDER BY aq.generated_at ASC, aq.question_id ASC`,
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
    adaptiveQuestions: adaptiveQuestionResult.results ?? [],
    consents: consentResult.results ?? [],
  };
  const bucket = getR2();
  await database
    .prepare(
      `INSERT INTO privacy_requests (id, user_id, type, status, artifact_key, created_at, completed_at)
       VALUES (?, ?, 'EXPORT', 'PROCESSING', ?, ?, NULL)`,
    )
    .bind(requestId, viewer.userId, key, now())
    .run();
  try {
    await bucket.put(key, JSON.stringify(payload, null, 2), {
      httpMetadata: { contentType: "application/json", contentDisposition: `attachment; filename="orbita-data-${requestId}.json"` },
      customMetadata: { requestId, userId: viewer.userId },
    });
    await database
      .prepare(`UPDATE privacy_requests SET status = 'COMPLETE', completed_at = ? WHERE id = ? AND user_id = ? AND status = 'PROCESSING'`)
      .bind(now(), requestId, viewer.userId)
      .run();
  } catch {
    await database
      .prepare(`UPDATE privacy_requests SET status = 'FAILED_RETRYABLE' WHERE id = ? AND user_id = ? AND status = 'PROCESSING'`)
      .bind(requestId, viewer.userId)
      .run()
      .catch(() => undefined);
    console.error("account_export_failed", { error_code: "EXPORT_CREATE_FAILED" });
    throw new StoreError("EXPORT_CREATE_FAILED", 503);
  }
  await serverTelemetry({ name: "privacy_export", userId: viewer.userId, metadata: { status: "COMPLETE" } });
  await audit(viewer.userId, "DATA_EXPORT_CREATED", "privacy_request", requestId);
  return { requestId, downloadPath: `/api/account/export/${requestId}` };
}

export async function getExportForUser(requestId: string, viewer: Viewer) {
  await ensureUser(viewer);
  const database = ensureDatabase();
  const row = await database
    .prepare(`SELECT artifact_key FROM privacy_requests WHERE id = ? AND user_id = ? AND type = 'EXPORT' AND status = 'COMPLETE' LIMIT 1`)
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
  try {
    await database.batch([
      database.prepare(`DELETE FROM assessment_responses WHERE assessment_id IN (SELECT id FROM assessments WHERE user_id = ?)`).bind(viewer.userId),
      database.prepare(`DELETE FROM adaptive_questions WHERE assessment_id IN (SELECT id FROM assessments WHERE user_id = ?)`).bind(viewer.userId),
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
  } catch {
    await database
      .prepare(`UPDATE privacy_requests SET status = 'FAILED_RETRYABLE' WHERE id = ? AND user_id = ? AND status = 'PROCESSING'`)
      .bind(requestId, viewer.userId)
      .run()
      .catch(() => undefined);
    console.error("account_row_delete_failed", { error_code: "D1_DELETE_FAILED" });
    throw new StoreError("ACCOUNT_DELETE_FAILED", 503);
  }
  await audit(null, "ACCOUNT_DELETED", "privacy_request", requestId);
  return { requestId, deleted: true };
}
