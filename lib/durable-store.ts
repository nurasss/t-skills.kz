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
import { nextPaymentStatus, paymentStatusTransitionSqlCase, paymentTelemetryEvent, type PaymentEventStatus, type PaymentOperationalStatus } from "@/lib/payment-event-policy";
import { canSessionTransition, type SessionState } from "@/lib/assessment-state-machine";
import { purgeAfterFrom, retentionDaysFrom } from "@/lib/retention-policy";
import { deleteAssessmentDataStatements, deleteUserAssessmentDataStatements } from "@/lib/privacy-data-registry";
import type { Viewer } from "@/lib/server-auth";
import { hasUnlimitedAssessmentAccess } from "@/lib/runtime-config";
import { assertOnboarding } from "@/lib/t-skills/onboarding";
import { T_SKILLS_ADAPTIVE_BANK_V1 } from "@/lib/t-skills/adaptive-bank-v1";
import { applyAdaptiveAnswer, validateAdaptiveQuestion } from "@/lib/t-skills/adaptive";
import { T_SKILLS_PAIRWISE_BANK_V1, T_SKILLS_WORKING_TAXONOMY } from "@/lib/t-skills/content-v4";
import type { AdaptiveAnswer, AdaptiveQuestion, OnboardingContext, Profession } from "@/lib/t-skills/contracts";
import { T_SKILLS_PAIRWISE_ITEM_BY_ID } from "@/lib/t-skills/item-bank";
import { pairwiseScoreToProfile } from "@/lib/t-skills/profile-adapter";
import { buildTSkillsReport } from "@/lib/t-skills/report-adapter";
import { scorePairwiseV1 } from "@/lib/t-skills/scoring";
import { isTSkillsTeenVersion, teenVersionIdsForAssessment, T_SKILLS_TEEN_V4_VERSION_IDS, T_SKILLS_TEEN_VERSION_IDS, T_SKILLS_TEST_ID, T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";
import {
  selectTeenClarificationQuestions,
  teenCareerRanking,
  teenFinalTotals,
  teenOnboardingFrom,
  teenOnboardingIssue,
  teenPairwiseItemMapForAssessmentVersion,
  teenPairwiseItemsForAssessmentVersion,
  teenTopValues,
  teenTotalsToProfile,
} from "@/lib/t-skills/teen/runtime";
import { teenCatalogVersionForSession } from "@/lib/t-skills/teen/careers";
import { T_SKILLS_V5_VERSION_IDS } from "@/lib/t-skills/v5/versions";
import { calculatePromotion, normalizePromoCode, type PromotionDefinition, type PromotionDiscountType } from "@/lib/promotion-engine";
import { matchCareers, validateCareerCatalog } from "@/lib/t-skills/career";
import { productionCareerCatalog, productionCareerModel } from "@/lib/t-skills/production-career-model";
import { canonicalOrderIdempotencyPayload as canonicalOrderPayloadObject, serializeOrderIdempotencyPayload, assertSerializedOrderIdempotencyPayloadMatches } from "@/lib/order-idempotency";
import { executableAssessmentVersionReason } from "@/lib/assessment-runtime-registry";
import { paymentsFeatureEnabled } from "@/lib/feature-flags";
import { getDefaultLocale, isCheckoutEnabled } from "@/lib/system-settings";

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
  adaptiveItems: StoredAdaptiveQuestion[];
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
  status: PaymentOperationalStatus;
  provider: string;
  checkoutUrl: string | null;
  freeAccess: boolean;
  createdAt: string;
};

const PROMO_RESERVATION_MS = 32 * 60 * 1000;

async function releaseExpiredPromoReservations(database: ReturnType<typeof ensureDatabase>, timestamp: number) {
  // Stripe Checkout sessions cannot be completed after their expiry. Releasing
  // an unattached reservation keeps codes and campaign seats available after
  // an abandoned checkout. Once a provider session is attached, its signed
  // expired/failed/succeeded webhook is authoritative: async payments and
  // webhook retries can legitimately outlive the local reservation timestamp.
  await database.batch([
    database.prepare(
      `UPDATE promo_redemptions
       SET status = 'RELEASED', released_at = ?
       WHERE status = 'RESERVED' AND reservation_expires_at IS NOT NULL AND reservation_expires_at <= ?
         AND EXISTS (
           SELECT 1 FROM orders o
           WHERE o.id = promo_redemptions.order_id
             AND (
               o.status = 'PAYMENT_FAILED'
               OR (o.status = 'PAYMENT_PENDING' AND o.provider_checkout_id IS NULL)
             )
         )`,
    ).bind(timestamp, timestamp),
    database.prepare(
      `UPDATE campaign_seat_reservations
       SET status = 'EXPIRED', released_at = ?, updated_at = ?
       WHERE status = 'RESERVED' AND expires_at <= ?
         AND checkout_session_id IS NULL
         AND EXISTS (
           SELECT 1 FROM orders o
           WHERE o.id = campaign_seat_reservations.order_id
             AND (
               o.status = 'PAYMENT_FAILED'
               OR (o.status = 'PAYMENT_PENDING' AND o.provider_checkout_id IS NULL)
             )
         )`,
    ).bind(timestamp, timestamp, timestamp),
    database.prepare(
      `UPDATE orders
       SET status = 'PAYMENT_FAILED', updated_at = ?
       WHERE status = 'PAYMENT_PENDING' AND provider_checkout_id IS NULL AND (
         id IN (SELECT order_id FROM promo_redemptions WHERE status = 'RELEASED' AND released_at = ?)
         OR id IN (SELECT order_id FROM campaign_seat_reservations WHERE status = 'EXPIRED' AND released_at = ?)
       )`,
    ).bind(timestamp, timestamp, timestamp),
  ]);
}

export function activePromoReservationWhere(alias: "r" | "r2" = "r") {
  return `(${alias}.status = 'REDEEMED' OR (${alias}.status = 'RESERVED' AND (
    ${alias}.reservation_expires_at > ? OR EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = ${alias}.order_id
        AND o.provider_checkout_id IS NOT NULL
        AND o.status <> 'PAYMENT_FAILED'
    )
  )))`;
}

export function activeCampaignReservationWhere(alias: "csr" = "csr") {
  return `(${alias}.status = 'RESERVED' AND (
    ${alias}.expires_at > ? OR EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = ${alias}.order_id
        AND o.provider_checkout_id IS NOT NULL
        AND o.status <> 'PAYMENT_FAILED'
    )
  ))`;
}

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

const CONSENT_TEXT_VERSION = "privacy-2026-09";

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
  original_amount_minor: number | null;
  discount_amount_minor: number | null;
  final_amount_minor: number | null;
  promo_code_id: string | null;
  pricing_snapshot_json: string | null;
  idempotency_payload_json: string | null;
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
  promo_code_id: string | null;
  campaign_id: string | null;
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
type StoredAdaptiveQuestion = GeneratedAdaptiveQuestion | AdaptiveQuestion;

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

function isTSkillsSession(session: Pick<DurableSession, "versions">) {
  return "testId" in session
    ? (session as Pick<DurableSession, "testId" | "versions">).testId === T_SKILLS_TEST_ID || (typeof session.versions.assessment === "string" && session.versions.assessment.startsWith("t-skills"))
    : session.versions.assessment === T_SKILLS_VERSION_IDS.assessment;
}

function isTeenSession(session: Pick<DurableSession, "versions">) {
  return isTSkillsTeenVersion(session.versions.assessment);
}

function tSkillsCoreBank(session: Pick<DurableSession, "versions">) {
  if (!isTeenSession(session)) return T_SKILLS_PAIRWISE_BANK_V1;
  return teenPairwiseItemsForAssessmentVersion(session.versions.assessment);
}

function tSkillsCoreItemById(session: Pick<DurableSession, "versions">) {
  if (!isTeenSession(session)) return T_SKILLS_PAIRWISE_ITEM_BY_ID;
  return teenPairwiseItemMapForAssessmentVersion(session.versions.assessment);
}

function isSessionCoreItem(session: Pick<DurableSession, "versions">, itemId: string) {
  if (isTSkillsSession(session)) return tSkillsCoreItemById(session).has(itemId);
  return isV2Session(session) ? CORE60_BANK.some((item) => item.id === itemId) : isCoreItem(itemId);
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

function validTSkillsResponse(session: DurableSession, itemId: string, value: number) {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return false;
  if (tSkillsCoreItemById(session).has(itemId)) return value >= -2 && value <= 2;
  if (isTSkillsSession(session) && session.adaptiveItemIds.includes(itemId)) return value >= 0 && value <= 3;
  return false;
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
      format: string;
      prompt: string;
      options_json: string;
      target_traits_json: string;
      reason_code: string;
      semantic_intent: string;
      semantic_cluster: string;
      confidence: number | null;
      provider: string;
      model_id: string | null;
      provider_request_id: string | null;
      prompt_version: string;
      adaptive_version: string;
      validation_status: string;
    }>();
  const adaptiveItems = (questionResult.results ?? []).map((question) => {
    if (question.format === "career_forced_choice" || question.format === TEEN_CLARIFICATION_FORMAT) {
      return {
        id: question.question_id,
        prompt: question.prompt,
        options: parseJson(question.options_json, []) as unknown as AdaptiveQuestion["options"],
      } satisfies AdaptiveQuestion;
    }
    return {
      questionId: question.question_id as `AI-${string}` | `FB-${string}`,
      format: question.format as GeneratedAdaptiveQuestion["format"],
      targetTraits: parseJson(question.target_traits_json, []) as GeneratedAdaptiveQuestion["targetTraits"],
      reasonCode: question.reason_code as GeneratedAdaptiveQuestion["reasonCode"],
      prompt: question.prompt,
      options: parseJson(question.options_json, []) as GeneratedAdaptiveQuestion["options"],
      semanticIntent: question.semantic_intent,
      semanticCluster: question.semantic_cluster,
      confidence: question.confidence ?? 0,
      provider: question.provider as GeneratedAdaptiveQuestion["provider"],
      model: question.model_id,
      providerRequestId: question.provider_request_id,
      promptVersion: question.prompt_version as GeneratedAdaptiveQuestion["promptVersion"],
      adaptiveVersion: question.adaptive_version as GeneratedAdaptiveQuestion["adaptiveVersion"],
      validationStatus: "accepted",
    } satisfies GeneratedAdaptiveQuestion;
  });
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
  const core = isTSkillsSession(session) ? tSkillsCoreBank(session) : isV2Session(session) ? CORE60_BANK : ITEM_BANK.filter((item) => isCoreItem(item.id));
  const nextCore = core.find((item) => typeof session.responses[item.id] !== "number");
  if (nextCore) return nextCore.id;
  const nextAdaptive = session.adaptiveItemIds.find((itemId) => typeof session.responses[itemId] !== "number");
  return nextAdaptive ?? null;
}

export function nextItemIdForSession(session: DurableSession) {
  return nextItemId(session);
}

export function coreAnsweredForSession(session: DurableSession) {
  return Object.keys(session.responses).filter((itemId) => isSessionCoreItem(session, itemId)).length;
}

const TEEN_CLARIFICATION_FORMAT = "teen_situational";

function publicOrder(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    testId: row.test_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    checkoutUrl: row.provider_checkout_url,
    freeAccess: row.status === "PAID" && (row.final_amount_minor ?? row.amount_minor) === 0,
    createdAt: iso(row.created_at),
  };
}

function promotionFromRow(row: Record<string, unknown>): PromotionDefinition {
  const list = (value: unknown) => parseJson<string[]>(typeof value === "string" ? value : null, []);
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    discountType: String(row.discount_type) as PromotionDefinition["discountType"],
    discountValue: Number(row.discount_value),
    currency: String(row.currency),
    maxTotalUses: row.max_total_uses === null ? null : Number(row.max_total_uses),
    maxUsesPerUser: row.max_uses_per_user === null ? null : Number(row.max_uses_per_user),
    validFrom: row.valid_from === null ? null : Number(row.valid_from),
    validUntil: row.valid_until === null ? null : Number(row.valid_until),
    minimumOrderAmount: row.minimum_order_amount === null ? null : Number(row.minimum_order_amount),
    newUsersOnly: Number(row.new_users_only) === 1,
    allowedTestIds: list(row.allowed_test_ids_json),
    allowedEmailDomains: list(row.allowed_email_domains_json),
    allowedUserIds: list(row.allowed_user_ids_json),
    campaignId: row.campaign_id as string | null,
    status: String(row.status),
  };
}

function promotionStoreError(error: unknown): StoreError {
  const code = error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "PROMO_NOT_ACTIVE";
  const status = code === "PROMO_NOT_ACTIVE" || code === "PROMO_DISABLED" || code === "PROMO_EXPIRED" || code === "PROMO_NOT_STARTED" ? 409 : 422;
  return new StoreError(code, status);
}

export function canonicalOrderIdempotencyPayload(input: { testId: string; amountMinor: number; currency: string; provider: string; promoCode: string | null }) {
  return canonicalOrderPayloadObject(input);
}

function orderPayload(input: { testId: string; amountMinor: number; currency: string; provider: string; promoCode: string | null }) {
  return serializeOrderIdempotencyPayload(input);
}

export function assertOrderIdempotencyPayloadMatches(savedPayload: string, expectedPayload: string) {
  try {
    assertSerializedOrderIdempotencyPayloadMatches(savedPayload, expectedPayload);
  } catch {
    throw new StoreError("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD", 409);
  }
}

function assertOrderIdempotency(row: OrderRow, payload: string) {
  const saved = parseJson<Record<string, unknown>>(row.idempotency_payload_json, {});
  const savedPayload = Object.keys(saved).length
    ? JSON.stringify({ amount_minor: saved.amount_minor, currency: saved.currency, provider: saved.provider, promo_code: saved.promo_code ?? null, test_id: saved.test_id })
    : orderPayload({ testId: row.test_id, amountMinor: row.original_amount_minor ?? row.amount_minor, currency: row.currency, provider: row.provider, promoCode: null });
  assertOrderIdempotencyPayloadMatches(savedPayload, payload);
}

export async function createPendingOrder(input: {
  viewer: Viewer;
  testId: string;
  amountMinor: number;
  currency: string;
  provider: string;
  idempotencyKey: string;
  promoCode?: string;
  campaignId?: string;
}) {
  await ensureUser(input.viewer);
  // Business checkout switch (fail-closed): orders are created only when
  // both the infra flag and the admin business switch agree.
  if (!(await paymentsFeatureEnabled()) || !(await isCheckoutEnabled())) throw new StoreError("CHECKOUT_DISABLED", 503);
  const database = ensureDatabase();
  const normalizedPromoCode = input.promoCode ? normalizePromoCode(input.promoCode) : null;
  const requestTimestamp = now();
  await releaseExpiredPromoReservations(database, requestTimestamp);
  const payload = orderPayload({ testId: input.testId, amountMinor: input.amountMinor, currency: input.currency, provider: input.provider, promoCode: normalizedPromoCode });
  const existing = await database
    .prepare(
      `SELECT id, test_id, amount_minor, currency, status, provider,
              provider_checkout_url, created_at, original_amount_minor,
              discount_amount_minor, final_amount_minor, promo_code_id,
              pricing_snapshot_json, idempotency_payload_json
       FROM orders WHERE user_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(input.viewer.userId, input.idempotencyKey)
    .first<OrderRow>();
  if (existing) {
    assertOrderIdempotency(existing, payload);
    return { order: publicOrder(existing), reused: true };
  }

  let promotion: PromotionDefinition | null = null;
  let calculation = { originalAmountMinor: input.amountMinor, discountAmountMinor: 0, finalAmountMinor: input.amountMinor, freeAccess: false };
  if (normalizedPromoCode) {
    const row = await database.prepare(`SELECT * FROM promo_codes WHERE code = ? LIMIT 1`).bind(normalizedPromoCode).first<Record<string, unknown>>();
    if (!row) throw new StoreError("PROMO_NOT_FOUND", 404);
    promotion = promotionFromRow(row);
    const history = await database.prepare(`SELECT (SELECT COUNT(*) FROM orders WHERE user_id = ? AND status NOT IN ('PAYMENT_FAILED')) AS orders, (SELECT COUNT(*) FROM assessments WHERE user_id = ?) AS assessments`).bind(input.viewer.userId, input.viewer.userId).first<{ orders: number; assessments: number }>();
    try {
      calculation = calculatePromotion(promotion, {
        nowMs: now(), userId: input.viewer.userId, email: input.viewer.email, testId: input.testId,
        currency: input.currency, originalAmountMinor: input.amountMinor,
        existingUser: Number(history?.orders ?? 0) > 0 || Number(history?.assessments ?? 0) > 0,
      });
    } catch (error) {
      throw promotionStoreError(error);
    }
    const usage = await database.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS user_total FROM promo_redemptions r WHERE promo_code_id = ? AND ${activePromoReservationWhere("r")}`).bind(input.viewer.userId, promotion.id, requestTimestamp).first<{ total: number; user_total: number }>();
    if (promotion.maxTotalUses !== null && promotion.maxTotalUses !== undefined && Number(usage?.total ?? 0) >= promotion.maxTotalUses) throw new StoreError("PROMO_USAGE_LIMIT_REACHED", 409);
    if (promotion.maxUsesPerUser !== null && promotion.maxUsesPerUser !== undefined && Number(usage?.user_total ?? 0) >= promotion.maxUsesPerUser) throw new StoreError("PROMO_USER_LIMIT_REACHED", 409);
  }

  const targetCampaignId = promotion?.campaignId ?? (input.campaignId ? input.campaignId.trim() : null);
  if (targetCampaignId) {
    const campaign = await database.prepare(`
      SELECT c.id, c.status, c.seat_limit, c.valid_from, c.valid_until,
        (SELECT COUNT(*) FROM campaign_members m WHERE m.campaign_id = c.id) AS claimed,
        (SELECT COUNT(*) FROM campaign_seat_reservations csr WHERE csr.campaign_id = c.id AND csr.status = 'RESERVED' AND (csr.expires_at > ? OR EXISTS (SELECT 1 FROM orders o WHERE o.id = csr.order_id AND o.provider_checkout_id IS NOT NULL AND o.status <> 'PAYMENT_FAILED'))) AS reserved,
        EXISTS (SELECT 1 FROM campaign_members m WHERE m.campaign_id = c.id AND m.user_id = ?) AS already_used
      FROM campaigns c WHERE c.id = ? LIMIT 1
    `).bind(requestTimestamp, input.viewer.userId, targetCampaignId).first<{ id: string; status: string; seat_limit: number; valid_from: number | null; valid_until: number | null; claimed: number; reserved: number; already_used: number }>();
    if (!campaign) throw new StoreError("CAMPAIGN_NOT_FOUND", 404);
    if (campaign.status !== "ACTIVE") throw new StoreError("CAMPAIGN_NOT_ACTIVE", 409);
    if (campaign.valid_from !== null && Number(campaign.valid_from) > now()) throw new StoreError("CAMPAIGN_NOT_STARTED", 409);
    if (campaign.valid_until !== null && Number(campaign.valid_until) <= now()) throw new StoreError("CAMPAIGN_EXPIRED", 409);
    if (campaign.already_used) throw new StoreError("CAMPAIGN_USER_ALREADY_ACTIVATED", 409);
    if (Number(campaign.claimed) + Number(campaign.reserved) >= Number(campaign.seat_limit)) throw new StoreError("CAMPAIGN_FULL", 409);
  }

  const timestamp = requestTimestamp;
  const orderId = newId("ord");
  const orderStatus = calculation.freeAccess ? "PAID" : "PAYMENT_PENDING";
  const snapshot = JSON.stringify({
    currency: input.currency,
    originalAmountMinor: calculation.originalAmountMinor,
    discountAmountMinor: calculation.discountAmountMinor,
    finalAmountMinor: calculation.finalAmountMinor,
    promoCode: promotion ? { id: promotion.id, code: promotion.code, discountType: promotion.discountType, discountValue: promotion.discountValue } : null,
  });
  const statements = [
    database.prepare(
      `INSERT INTO orders
        (id, user_id, test_id, amount_minor, original_amount_minor,
         discount_amount_minor, final_amount_minor, currency, status, provider,
         promo_code_id, campaign_id, pricing_snapshot_json, idempotency_payload_json,
         provider_checkout_id, provider_checkout_url, provider_payment_id,
         provider_event_id, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)`,
    ).bind(
      orderId, input.viewer.userId, input.testId, calculation.finalAmountMinor,
      calculation.originalAmountMinor, calculation.discountAmountMinor, calculation.finalAmountMinor,
      input.currency, orderStatus, input.provider, promotion?.id ?? null, targetCampaignId,
      snapshot, payload, input.idempotencyKey, timestamp, timestamp,
    ),
  ];
  if (promotion) {
    const redemptionId = newId("promo_redemption");
    const redemptionStatus = calculation.freeAccess ? "REDEEMED" : "RESERVED";
    const reservationExpiresAt = calculation.freeAccess ? null : timestamp + PROMO_RESERVATION_MS;
    statements.push(database.prepare(
      `INSERT INTO promo_redemptions
        (id, promo_code_id, user_id, order_id, campaign_id, original_amount_minor,
         discount_amount_minor, final_amount_minor, currency, reserved_at,
         reservation_expires_at, released_at, redeemed_at, status)
       VALUES (
         CASE WHEN EXISTS (
           SELECT 1 FROM promo_codes p WHERE p.id = ? AND p.status = 'ACTIVE'
             AND (p.valid_from IS NULL OR p.valid_from <= ?)
             AND (p.valid_until IS NULL OR p.valid_until > ?)
             AND (p.max_total_uses IS NULL OR (SELECT COUNT(*) FROM promo_redemptions r WHERE r.promo_code_id = p.id AND ${activePromoReservationWhere("r")}) < p.max_total_uses)
             AND (p.max_uses_per_user IS NULL OR (SELECT COUNT(*) FROM promo_redemptions r WHERE r.promo_code_id = p.id AND r.user_id = ? AND ${activePromoReservationWhere("r")}) < p.max_uses_per_user)
         ) THEN ? ELSE NULL END, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    ).bind(promotion.id, timestamp, timestamp, timestamp, input.viewer.userId, timestamp, redemptionId, promotion.id, input.viewer.userId, orderId,
      promotion.campaignId ?? null, calculation.originalAmountMinor, calculation.discountAmountMinor, calculation.finalAmountMinor, input.currency, timestamp, reservationExpiresAt, null, timestamp, redemptionStatus));
  }

  if (targetCampaignId) {
    const seatReservationId = newId("seat_res");
    const seatReservationStatus = calculation.freeAccess ? "CLAIMED" : "RESERVED";
    const seatReservationExpiresAt = calculation.freeAccess ? timestamp + (365 * 24 * 60 * 60 * 1000) : timestamp + PROMO_RESERVATION_MS;
    statements.push(database.prepare(
      `INSERT INTO campaign_seat_reservations
        (id, campaign_id, user_id, order_id, checkout_session_id, status,
         reserved_at, expires_at, claimed_at, released_at, created_at, updated_at)
       VALUES (
         CASE WHEN (
           (SELECT COUNT(*) FROM campaign_members m WHERE m.campaign_id = ?) +
           (SELECT COUNT(*) FROM campaign_seat_reservations csr WHERE csr.campaign_id = ? AND csr.status = 'RESERVED' AND (csr.expires_at > ? OR EXISTS (SELECT 1 FROM orders o WHERE o.id = csr.order_id AND o.provider_checkout_id IS NOT NULL AND o.status <> 'PAYMENT_FAILED')))
         ) < (SELECT seat_limit FROM campaigns WHERE id = ?)
         THEN ? ELSE NULL END,
         ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?)`
    ).bind(
      targetCampaignId, targetCampaignId, timestamp, targetCampaignId,
      seatReservationId,
      targetCampaignId, input.viewer.userId, orderId,
      seatReservationStatus, timestamp, seatReservationExpiresAt,
      calculation.freeAccess ? timestamp : null,
      timestamp, timestamp,
    ));
  }

  if (calculation.freeAccess) {
    const freeEntitlementId = newId("ent");
    statements.push(database.prepare(
      `INSERT INTO entitlements
        (id, order_id, user_id, test_id, grant_source, grant_reference,
         promo_code_id, campaign_id, status, created_at, revoked_at, expires_at)
       VALUES (?, ?, ?, ?, 'promo_free', ?, ?, ?, 'ACTIVE', ?, NULL, NULL)`,
    ).bind(freeEntitlementId, orderId, input.viewer.userId, input.testId, `promo:${orderId}`, promotion?.id ?? null, targetCampaignId, timestamp));
    if (targetCampaignId) {
      statements.push(database.prepare(`
        INSERT OR IGNORE INTO campaign_members (id, campaign_id, user_id, entitlement_id, created_at)
        SELECT ?, c.id, ?, e.id, ?
        FROM campaigns c
        JOIN entitlements e ON e.id = ?
        WHERE c.id = ?
          AND c.status = 'ACTIVE'
          AND (c.valid_from IS NULL OR c.valid_from <= ?)
          AND (c.valid_until IS NULL OR c.valid_until > ?)
          AND (SELECT COUNT(*) FROM campaign_members m WHERE m.campaign_id = c.id) < c.seat_limit
          AND NOT EXISTS (SELECT 1 FROM campaign_members m WHERE m.campaign_id = c.id AND m.user_id = ?)
      `).bind(newId("member"), input.viewer.userId, timestamp, freeEntitlementId, targetCampaignId, timestamp, timestamp, input.viewer.userId));
    }
  }

  try {
    await database.batch(statements);
  } catch (err) {
    const errStr = String(err);
    const race = await database
      .prepare(
        `SELECT id, test_id, amount_minor, currency, status, provider,
                provider_checkout_url, created_at, original_amount_minor,
                discount_amount_minor, final_amount_minor, promo_code_id,
                pricing_snapshot_json, idempotency_payload_json
         FROM orders WHERE user_id = ? AND idempotency_key = ? LIMIT 1`,
      )
      .bind(input.viewer.userId, input.idempotencyKey)
      .first<OrderRow>();
    if (race) {
      assertOrderIdempotency(race, payload);
      return { order: publicOrder(race), reused: true };
    }
    if (errStr.includes("campaign_seat_reservations.id") || errStr.includes("campaign_seat_reservations")) {
      throw new StoreError("CAMPAIGN_FULL", 409);
    }
    if (targetCampaignId) {
      const cap = await database.prepare(`
        SELECT c.seat_limit,
          (SELECT COUNT(*) FROM campaign_members m WHERE m.campaign_id = c.id) AS claimed,
          (SELECT COUNT(*) FROM campaign_seat_reservations csr WHERE csr.campaign_id = c.id AND csr.status = 'RESERVED' AND (csr.expires_at > ? OR EXISTS (SELECT 1 FROM orders o WHERE o.id = csr.order_id AND o.provider_checkout_id IS NOT NULL AND o.status <> 'PAYMENT_FAILED'))) AS reserved
        FROM campaigns c WHERE c.id = ?
      `).bind(timestamp, targetCampaignId).first<{ seat_limit: number; claimed: number; reserved: number }>();
      if (cap && (Number(cap.claimed) + Number(cap.reserved)) >= Number(cap.seat_limit)) {
        throw new StoreError("CAMPAIGN_FULL", 409);
      }
    }
    if (errStr.includes("promo_redemptions.id") || errStr.includes("promo_redemptions")) {
      if (promotion) {
        const usage = await database.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS user_total FROM promo_redemptions r WHERE promo_code_id = ? AND ${activePromoReservationWhere("r")}`).bind(input.viewer.userId, promotion.id, timestamp).first<{ total: number; user_total: number }>();
        if (promotion.maxUsesPerUser !== null && promotion.maxUsesPerUser !== undefined && Number(usage?.user_total ?? 0) >= promotion.maxUsesPerUser) {
          throw new StoreError("PROMO_USER_LIMIT_REACHED", 409);
        }
      }
      throw new StoreError("PROMO_USAGE_LIMIT_REACHED", 409);
    }
    if (promotion) {
      const usage = await database.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS user_total FROM promo_redemptions r WHERE promo_code_id = ? AND ${activePromoReservationWhere("r")}`).bind(input.viewer.userId, promotion.id, timestamp).first<{ total: number; user_total: number }>();
      if (promotion.maxTotalUses !== null && promotion.maxTotalUses !== undefined && Number(usage?.total ?? 0) >= promotion.maxTotalUses) throw new StoreError("PROMO_USAGE_LIMIT_REACHED", 409);
      if (promotion.maxUsesPerUser !== null && promotion.maxUsesPerUser !== undefined && Number(usage?.user_total ?? 0) >= promotion.maxUsesPerUser) throw new StoreError("PROMO_USER_LIMIT_REACHED", 409);
    }
    console.error("order_insert_failed", { error_code: "ORDER_INSERT_FAILED", error: errStr });
    throw new StoreError("ORDER_CREATE_FAILED", 500);
  }
  await audit(input.viewer.userId, "ORDER_CREATED", "order", orderId, {
    testId: input.testId,
    amountMinor: calculation.finalAmountMinor,
    originalAmountMinor: calculation.originalAmountMinor,
    discountAmountMinor: calculation.discountAmountMinor,
    promoCode: promotion?.code ?? null,
    currency: input.currency,
  });
  return {
    order: {
      id: orderId,
      testId: input.testId,
      amountMinor: calculation.finalAmountMinor,
      currency: input.currency,
      status: orderStatus as OrderRecord["status"],
      provider: input.provider,
      checkoutUrl: null,
      freeAccess: calculation.freeAccess,
      createdAt: iso(timestamp),
    },
    reused: false,
  };
}

export type ValidatedPromoInfo = {
  valid: boolean;
  code: string;
  name: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  freeAccess: boolean;
  message: string;
};

export async function validatePromoForViewer(input: {
  viewer: Viewer;
  code: string;
  testId?: string;
}): Promise<ValidatedPromoInfo> {
  const normalizedPromoCode = normalizePromoCode(input.code);
  if (!normalizedPromoCode || normalizedPromoCode.length < 3 || normalizedPromoCode.length > 64) {
    throw new StoreError("PROMO_CODE_INVALID", 422);
  }
  await ensureUser(input.viewer);
  const database = ensureDatabase();
  const testId = input.testId ?? T_SKILLS_TEST_ID;
  const requestTimestamp = now();
  await releaseExpiredPromoReservations(database, requestTimestamp);

  const row = await database
    .prepare(`SELECT * FROM promo_codes WHERE code = ? LIMIT 1`)
    .bind(normalizedPromoCode)
    .first<Record<string, unknown>>();

  if (!row) {
    await audit(input.viewer.userId, "PROMO_VALIDATE_FAILED", "promo_code", null, { code: normalizedPromoCode, reason: "NOT_FOUND" });
    throw new StoreError("PROMO_NOT_FOUND", 404);
  }

  const promotion = promotionFromRow(row);
  const nowMs = requestTimestamp;

  const history = await database
    .prepare(
      `SELECT (SELECT COUNT(*) FROM orders WHERE user_id = ? AND status NOT IN ('PAYMENT_FAILED')) AS orders,
              (SELECT COUNT(*) FROM assessments WHERE user_id = ?) AS assessments`
    )
    .bind(input.viewer.userId, input.viewer.userId)
    .first<{ orders: number; assessments: number }>();

  const pricingRow = await database
    .prepare(`SELECT amount_minor, currency FROM products WHERE test_id = ? AND status = 'ACTIVE' LIMIT 1`)
    .bind(testId)
    .first<{ amount_minor: number; currency: string }>();

  const runtimeEnv = getRuntimeEnv();
  const configuredCurrency = (runtimeEnv.ASSESSMENT_CURRENCY ?? "KZT").trim().toUpperCase();
  const currency = pricingRow?.currency ?? (promotion.currency || configuredCurrency || "KZT");
  const baseAmount = Number(pricingRow?.amount_minor ?? runtimeEnv.ASSESSMENT_PRICE_MINOR ?? "150000");
  const amountMinor = Number.isSafeInteger(baseAmount) && baseAmount > 0 ? baseAmount : 150000;

  let calculation;
  try {
    calculation = calculatePromotion(promotion, {
      nowMs,
      userId: input.viewer.userId,
      email: input.viewer.email,
      testId,
      currency,
      originalAmountMinor: amountMinor,
      existingUser: Number(history?.orders ?? 0) > 0 || Number(history?.assessments ?? 0) > 0,
    });
  } catch (error) {
    await audit(input.viewer.userId, "PROMO_VALIDATE_FAILED", "promo_code", promotion.id, { code: normalizedPromoCode, reason: String(error) });
    throw promotionStoreError(error);
  }

  const usage = await database
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN user_id = ? THEN 1 ELSE 0 END) AS user_total
       FROM promo_redemptions r
       WHERE promo_code_id = ? AND ${activePromoReservationWhere("r")}`
    )
    .bind(input.viewer.userId, promotion.id, requestTimestamp)
    .first<{ total: number; user_total: number }>();

  if (promotion.maxTotalUses !== null && promotion.maxTotalUses !== undefined && Number(usage?.total ?? 0) >= promotion.maxTotalUses) {
    await audit(input.viewer.userId, "PROMO_VALIDATE_FAILED", "promo_code", promotion.id, { code: normalizedPromoCode, reason: "TOTAL_LIMIT_REACHED" });
    throw new StoreError("PROMO_USAGE_LIMIT_REACHED", 409);
  }
  if (promotion.maxUsesPerUser !== null && promotion.maxUsesPerUser !== undefined && Number(usage?.user_total ?? 0) >= promotion.maxUsesPerUser) {
    await audit(input.viewer.userId, "PROMO_VALIDATE_FAILED", "promo_code", promotion.id, { code: normalizedPromoCode, reason: "USER_LIMIT_REACHED" });
    throw new StoreError("PROMO_USER_LIMIT_REACHED", 409);
  }

  if (promotion.campaignId) {
    const campaign = await database
      .prepare(
        `SELECT c.id, c.status, c.seat_limit, c.valid_from, c.valid_until,
          (SELECT COUNT(*) FROM campaign_members m WHERE m.campaign_id = c.id) AS claimed,
          (SELECT COUNT(*) FROM campaign_seat_reservations csr WHERE csr.campaign_id = c.id AND csr.status = 'RESERVED' AND (csr.expires_at > ? OR EXISTS (SELECT 1 FROM orders o WHERE o.id = csr.order_id AND o.provider_checkout_id IS NOT NULL AND o.status <> 'PAYMENT_FAILED'))) AS reserved,
          EXISTS (SELECT 1 FROM campaign_members m WHERE m.campaign_id = c.id AND m.user_id = ?) AS already_used
        FROM campaigns c WHERE c.id = ? LIMIT 1`
      )
      .bind(requestTimestamp, input.viewer.userId, promotion.campaignId)
      .first<{ id: string; status: string; seat_limit: number; valid_from: number | null; valid_until: number | null; claimed: number; reserved: number; already_used: number }>();

    if (!campaign) throw new StoreError("CAMPAIGN_NOT_FOUND", 404);
    if (campaign.status !== "ACTIVE") throw new StoreError("CAMPAIGN_NOT_ACTIVE", 409);
    if (campaign.valid_from !== null && Number(campaign.valid_from) > nowMs) throw new StoreError("CAMPAIGN_NOT_STARTED", 409);
    if (campaign.valid_until !== null && Number(campaign.valid_until) <= nowMs) throw new StoreError("CAMPAIGN_EXPIRED", 409);
    if (campaign.already_used) throw new StoreError("CAMPAIGN_USER_ALREADY_ACTIVATED", 409);
    if (Number(campaign.claimed) + Number(campaign.reserved) >= Number(campaign.seat_limit)) throw new StoreError("CAMPAIGN_FULL", 409);
  }

  await audit(input.viewer.userId, "PROMO_VALIDATED", "promo_code", promotion.id, { code: normalizedPromoCode, discountType: promotion.discountType });

  let message = "Промокод действителен";
  if (calculation.freeAccess || promotion.discountType === "FREE_ACCESS" || (promotion.discountType === "PERCENT" && promotion.discountValue === 100)) {
    message = "Промокод предоставляет бесплатный доступ";
  } else if (promotion.discountType === "PERCENT") {
    message = `Скидка ${promotion.discountValue}%`;
  } else if (promotion.discountType === "FIXED_AMOUNT") {
    message = `Скидка ${new Intl.NumberFormat("ru-RU").format(promotion.discountValue / 100)} KZT`;
  }

  return {
    valid: true,
    code: promotion.code,
    name: promotion.name,
    discountType: promotion.discountType,
    discountValue: promotion.discountValue,
    freeAccess: calculation.freeAccess,
    message,
  };
}

export async function attachCheckoutSession(input: {
  viewer: Viewer;
  orderId: string;
  providerCheckoutId: string;
  checkoutUrl: string;
  expiresAt?: number;
}) {
  const database = ensureDatabase();
  const timestamp = now();
  const statements = [
    database
      .prepare(
        `UPDATE orders
         SET provider_checkout_id = ?, provider_checkout_url = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(input.providerCheckoutId, input.checkoutUrl, timestamp, input.orderId, input.viewer.userId),
    database
      .prepare(
        `UPDATE campaign_seat_reservations
         SET checkout_session_id = ?, updated_at = ?
         WHERE order_id = ?`,
      )
      .bind(input.providerCheckoutId, timestamp, input.orderId),
  ];
  if (input.expiresAt) {
    statements.push(
      database.prepare(
        `UPDATE promo_redemptions
         SET reservation_expires_at = MAX(COALESCE(reservation_expires_at, 0), ?)
         WHERE order_id = ? AND status = 'RESERVED'`,
      ).bind(input.expiresAt, input.orderId),
      database.prepare(
        `UPDATE campaign_seat_reservations
         SET expires_at = MAX(expires_at, ?), updated_at = ?
         WHERE order_id = ? AND status = 'RESERVED'`,
      ).bind(input.expiresAt, timestamp, input.orderId),
    );
  }
  const results = await database.batch(statements);
  if (!results[0]?.success) throw new StoreError("ORDER_UPDATE_FAILED", 500);
  await audit(input.viewer.userId, "CHECKOUT_SESSION_CREATED", "order", input.orderId);
}

export async function markOrderPaymentFailed(orderId: string, reason: string) {
  const database = ensureDatabase();
  const timestamp = now();
  await database.batch([
    database.prepare(
      `UPDATE orders SET status = 'PAYMENT_FAILED', updated_at = ?
       WHERE id = ? AND status = 'PAYMENT_PENDING'`,
    )
    .bind(timestamp, orderId),
    database.prepare(
      `UPDATE promo_redemptions SET status = 'RELEASED', released_at = ?
       WHERE order_id = ? AND status = 'RESERVED'`,
    ).bind(timestamp, orderId),
    database.prepare(
      `UPDATE campaign_seat_reservations SET status = 'RELEASED', released_at = ?, updated_at = ?
       WHERE order_id = ? AND status = 'RESERVED'`,
    ).bind(timestamp, timestamp, orderId),
  ]);
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
    .prepare(`SELECT id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_payment_id, promo_code_id, campaign_id FROM orders WHERE id = ? LIMIT 1`)
    .bind(input.orderId)
    .first<PaymentOrderRow>();
  if (!order) throw new StoreError("ORDER_NOT_FOUND", 404);

  let eventStatus = input.status;
  if (["REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED", "REFUND_FAILED"].includes(eventStatus)) {
    const refundAmount = input.amountMinor;
    const eventCurrency = input.currency?.trim().toUpperCase();
    const refundSnapshotValid =
      order.provider.trim().toLowerCase() === "stripe" &&
      (!input.providerPaymentId || input.providerPaymentId === order.provider_payment_id) &&
      Number.isSafeInteger(refundAmount) &&
      (refundAmount ?? 0) > 0 &&
      (refundAmount ?? 0) <= order.amount_minor &&
      Boolean(eventCurrency) &&
      eventCurrency === order.currency.trim().toUpperCase();
    if (!refundSnapshotValid) {
      await audit(null, "PAYMENT_EVENT_REJECTED", "order", input.orderId, {
        providerEventId: input.providerEventId,
        reason: "REFUND_INTEGRITY_MISMATCH",
      });
      throw new StoreError("PAYMENT_INTEGRITY_MISMATCH", 409);
    }
    // A single succeeded Refund object can be only one part of a larger
    // refund. The charge.refunded event supplies the cumulative amount.
    if (eventStatus === "REFUNDED" && refundAmount !== order.amount_minor) {
      eventStatus = "PARTIALLY_REFUNDED";
    }
  }

  if (eventStatus === "PAID" && !validatePaymentSnapshot({
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
  let orderTransitionStatus = eventStatus;
  if (eventStatus === "REFUND_FAILED" && order.status === "REFUND_PENDING") {
    const priorPartial = await database.prepare(`
      SELECT 1 AS present FROM payment_events WHERE order_id = ? AND status = 'PARTIALLY_REFUNDED'
      UNION ALL
      SELECT 1 AS present FROM audit_events WHERE entity_type = 'order' AND entity_id = ? AND action = 'REFUND_PARTIAL'
      LIMIT 1
    `).bind(input.orderId, input.orderId).first<{ present: number }>();
    if (priorPartial) orderTransitionStatus = "PARTIALLY_REFUNDED";
  }
  const nextStatus = nextPaymentStatus(order.status as PaymentOperationalStatus, orderTransitionStatus);
  const telemetryEvent = paymentTelemetryEvent(eventStatus);
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
          eventStatus,
          input.payloadHash,
          timestamp,
      ),
    database
      .prepare(
        `UPDATE orders
         SET status = ${paymentStatusTransitionSqlCase(orderTransitionStatus)},
             provider_payment_id = COALESCE(?, provider_payment_id),
             provider_event_id = ?,
             updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        input.providerPaymentId ?? null,
        input.providerEventId,
        timestamp,
        input.orderId,
      ),
  ];
  if (eventStatus === "PAID") {
    statements.push(
      database.prepare(
        `UPDATE promo_redemptions
         SET status = 'REDEEMED', redeemed_at = ?, reservation_expires_at = NULL
         WHERE order_id = ? AND status = 'RESERVED'
           AND EXISTS (SELECT 1 FROM orders o WHERE o.id = ? AND o.status <> 'REFUNDED')`,
      ).bind(timestamp, input.orderId, input.orderId),
      database.prepare(
        `UPDATE campaign_seat_reservations
         SET status = 'CLAIMED', claimed_at = ?, updated_at = ?
         WHERE order_id = ? AND status = 'RESERVED'
           AND EXISTS (SELECT 1 FROM orders o WHERE o.id = ? AND o.status <> 'REFUNDED')`,
      ).bind(timestamp, timestamp, input.orderId, input.orderId),
      database
        .prepare(
          `INSERT OR IGNORE INTO entitlements
            (id, order_id, user_id, test_id, grant_source, grant_reference, promo_code_id, campaign_id, status, created_at, revoked_at, expires_at)
           SELECT ?, id, user_id, test_id, 'stripe', 'stripe:' || id, promo_code_id, campaign_id, 'ACTIVE', ?, NULL, NULL
           FROM orders WHERE id = ? AND status <> 'REFUNDED'`,
        )
        .bind(entitlementId, timestamp, input.orderId),
      database
        .prepare(
          `INSERT OR IGNORE INTO campaign_members (id, campaign_id, user_id, entitlement_id, created_at)
           SELECT ?, c.id, o.user_id, e.id, ?
           FROM orders o
           JOIN entitlements e ON e.id = ?
           JOIN campaigns c ON c.id = o.campaign_id
           WHERE o.id = ?
             AND c.status = 'ACTIVE'
             AND o.status <> 'REFUNDED'
             AND (c.valid_from IS NULL OR c.valid_from <= ?)
             AND (c.valid_until IS NULL OR c.valid_until > ?)
             AND (
               EXISTS (SELECT 1 FROM campaign_seat_reservations csr WHERE csr.order_id = o.id AND csr.status = 'CLAIMED')
               OR (SELECT COUNT(*) FROM campaign_members m WHERE m.campaign_id = c.id) < c.seat_limit
             )
             AND NOT EXISTS (SELECT 1 FROM campaign_members m WHERE m.campaign_id = c.id AND m.user_id = o.user_id)`,
        )
        .bind(newId("member"), timestamp, entitlementId, input.orderId, timestamp, timestamp),
      database
        .prepare(
          `INSERT INTO telemetry_events (id, name, user_id, assessment_id, metadata_json, occurred_at)
           VALUES (?, ?, ?, NULL, ?, ?)`,
        )
        .bind(newId("tel"), telemetryEvent, order.user_id, JSON.stringify({ provider: "stripe", status: input.status }), timestamp),
    );
  } else {
    if (eventStatus === "PAYMENT_FAILED") {
      statements.push(
        database.prepare(
          `UPDATE promo_redemptions SET status = 'RELEASED', released_at = ?
           WHERE order_id = ? AND status = 'RESERVED'
             AND EXISTS (SELECT 1 FROM orders o WHERE o.id = ? AND o.status = 'PAYMENT_FAILED')`,
        ).bind(timestamp, input.orderId, input.orderId),
        database.prepare(
          `UPDATE campaign_seat_reservations SET status = 'RELEASED', released_at = ?, updated_at = ?
           WHERE order_id = ? AND status = 'RESERVED'
             AND EXISTS (SELECT 1 FROM orders o WHERE o.id = ? AND o.status = 'PAYMENT_FAILED')`,
        ).bind(timestamp, timestamp, input.orderId, input.orderId),
      );
    }
    if (eventStatus === "REFUNDED") {
      statements.push(
        database.prepare(
          `UPDATE entitlements SET status = 'REVOKED', revoked_at = ? WHERE order_id = ? AND status = 'ACTIVE'`,
        ).bind(timestamp, input.orderId),
        database.prepare(
          `UPDATE campaign_seat_reservations SET status = 'RELEASED', released_at = ?, updated_at = ?
           WHERE order_id = ? AND status IN ('RESERVED','CLAIMED')`,
        ).bind(timestamp, timestamp, input.orderId),
        database.prepare(
          `DELETE FROM campaign_members WHERE entitlement_id IN (SELECT id FROM entitlements WHERE order_id = ?)`,
        ).bind(input.orderId),
      );
    }
    if (telemetryEvent) {
      statements.push(
        database
          .prepare(
            `INSERT INTO telemetry_events (id, name, user_id, assessment_id, metadata_json, occurred_at)
             VALUES (?, ?, ?, NULL, ?, ?)`,
          )
            .bind(newId("tel"), telemetryEvent, order.user_id, JSON.stringify({ provider: "stripe", status: eventStatus, event_type: input.eventType }), timestamp),
      );
    }
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
  if (eventStatus === "PAID") {
    const promoRow = await database.prepare(`SELECT status, promo_code_id FROM promo_redemptions WHERE order_id = ? LIMIT 1`).bind(input.orderId).first<{ status: string; promo_code_id: string }>();
    if (promoRow && promoRow.status === "RELEASED") {
      await audit(null, "PROMO_LATE_WEBHOOK_RELEASED", "order", input.orderId, { promoCodeId: promoRow.promo_code_id, reason: "Reservation was already released before payment event" });
    }
    const campRow = await database.prepare(`SELECT status, campaign_id FROM campaign_seat_reservations WHERE order_id = ? LIMIT 1`).bind(input.orderId).first<{ status: string; campaign_id: string }>();
    if (campRow && (campRow.status === "RELEASED" || campRow.status === "EXPIRED")) {
      await audit(null, "CAMPAIGN_LATE_WEBHOOK_RELEASED", "order", input.orderId, { campaignId: campRow.campaign_id, reason: "Campaign seat reservation was already released before payment event" });
    }
  }
  await audit(null, "PAYMENT_EVENT_ACCEPTED", "order", input.orderId, {
    providerEventId: input.providerEventId,
    status: eventStatus,
    orderStatusBeforeEvent: order.status,
  });
  const persistedOrder = await database.prepare(`SELECT status FROM orders WHERE id = ? LIMIT 1`).bind(input.orderId).first<{ status: PaymentOperationalStatus }>();
  return {
    duplicate: false,
    entitlementCreated: eventStatus === "PAID" && persistedOrder?.status !== "REFUNDED",
    orderStatus: persistedOrder?.status ?? nextStatus,
  };
}

async function publishedAssessmentVersions(database: ReturnType<typeof ensureDatabase>, testId: string): Promise<AssessmentVersionIds> {
  if (testId !== T_SKILLS_TEST_ID) return V2_VERSION_IDS;
  const row = await database.prepare(
    `SELECT version, scoring_version, content_version, career_model_version,
            report_version, adaptive_version, item_count
     FROM assessment_versions
     WHERE product_id = ? AND status = 'PUBLISHED'
     ORDER BY published_at DESC LIMIT 1`,
  ).bind(testId).first<{
    version: string;
    scoring_version: string;
    content_version: string;
    career_model_version: string;
    report_version: string;
    adaptive_version: string | null;
    item_count: number;
  }>();
  if (!row) return T_SKILLS_TEEN_V4_VERSION_IDS;
  const runtimeReason = executableAssessmentVersionReason({
    productId: testId,
    version: row.version,
    scoringVersion: row.scoring_version,
    contentVersion: row.content_version,
    careerModelVersion: row.career_model_version,
    reportVersion: row.report_version,
    adaptiveVersion: row.adaptive_version,
    itemCount: Number(row.item_count),
  });
  if (runtimeReason) throw new StoreError(runtimeReason, 409);
  const teenVersions = teenVersionIdsForAssessment(row.version);
  if (teenVersions) return teenVersions;
  return {
    ...T_SKILLS_VERSION_IDS,
    assessment: row.version,
    scoring: row.scoring_version,
    itemBank: row.content_version,
    careerMatching: row.career_model_version,
    report: row.report_version,
    adaptive: row.adaptive_version ?? T_SKILLS_VERSION_IDS.adaptive,
    selector: row.adaptive_version ?? T_SKILLS_VERSION_IDS.selector,
  } as AssessmentVersionIds;
}

export async function createAssessmentForUser(input: { viewer: Viewer; testId: string; locale?: Locale }) {
  // default_locale is a fallback only: an explicit caller locale always wins.
  const locale = input.locale ?? (await getDefaultLocale()) ?? "ru";
  if (!canPublishLocale(locale)) throw new StoreError("LOCALE_NOT_PUBLISHED", 422);
  await ensureUser(input.viewer, locale);
  const database = ensureDatabase();
  const runtimeEnv = getRuntimeEnv();
  const unlimitedAssessmentAccess = hasUnlimitedAssessmentAccess(runtimeEnv, input.viewer.email);
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

  const paymentsEnabled = await paymentsFeatureEnabled();
  if ((!paymentsEnabled && (runtimeEnv.ENTITLEMENT_MODE ?? "beta-free").trim().toLowerCase() === "beta-free") || unlimitedAssessmentAccess) {
    const grantSource = unlimitedAssessmentAccess ? "admin_unlimited" : "beta_free";
    const reference = unlimitedAssessmentAccess
      ? `admin_unlimited:${input.viewer.userId}:${input.testId}:${newId("grant")}`
      : `beta_free:${input.viewer.userId}:${input.testId}`;
    await database
      .prepare(
        `INSERT OR IGNORE INTO entitlements
          (id, order_id, user_id, test_id, grant_source, grant_reference, status, created_at, revoked_at)
         VALUES (?, NULL, ?, ?, ?, ?, 'ACTIVE', ?, NULL)`,
      )
      .bind(newId("ent"), input.viewer.userId, input.testId, grantSource, reference, now())
      .run();
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
  const versions = await publishedAssessmentVersions(database, input.testId);
  const initialState: SessionState = ["beta_free", "admin_unlimited", "promo_free"].includes(entitlement.grant_source) ? "ENTITLED" : "PAID";
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

/**
 * Admin-only, privacy-minimized v5 trace. It exposes the calculation chain
 * without returning the account's name, email, phone or user id.
 */
export async function getTSkillsV5Diagnostics(assessmentId: string) {
  const database = ensureDatabase();
  const assessment = await database
    .prepare(
      `SELECT id, test_id, state, versions_json, client_seq, created_at,
              completed_at, updated_at
       FROM assessments WHERE id = ? LIMIT 1`,
    )
    .bind(assessmentId)
    .first<{
      id: string;
      test_id: string;
      state: SessionState;
      versions_json: string;
      client_seq: number;
      created_at: number;
      completed_at: number | null;
      updated_at: number;
    }>();
  if (!assessment) throw new StoreError("SESSION_NOT_FOUND", 404);
  const versions = parseJson<Record<string, string>>(assessment.versions_json, {});
  if (versions.assessment !== T_SKILLS_V5_VERSION_IDS.assessment) throw new StoreError("V5_DIAGNOSTICS_NOT_AVAILABLE", 409);

  const [onboarding, responses, traitProfile, uncertainty, clarificationQuestions, clarificationAnswers, careerResults, careerTiebreakAnswers, narratives, report] = await Promise.all([
    database.prepare(
      `SELECT age, education_level, favorite_subjects_json, extensions_json, version,
              created_at, updated_at
       FROM assessment_onboarding WHERE assessment_id = ? LIMIT 1`,
    ).bind(assessmentId).first<Record<string, unknown>>(),
    database.prepare(
      `SELECT item_id, response, response_time_ms, client_seq, response_source,
              presentation_metadata_json, created_at
       FROM assessment_responses WHERE assessment_id = ? ORDER BY client_seq ASC`,
    ).bind(assessmentId).all<Record<string, unknown>>(),
    database.prepare(
      `SELECT base_json, final_json, clarification_answers_json, scoring_version,
              uncertainty_version, clarification_version, created_at, updated_at
       FROM t_skills_trait_profiles WHERE assessment_id = ? LIMIT 1`,
    ).bind(assessmentId).first<Record<string, unknown>>(),
    database.prepare(
      `SELECT id, payload_json, uncertainty_version, created_at
       FROM t_skills_uncertainty_snapshots WHERE assessment_id = ? ORDER BY created_at ASC`,
    ).bind(assessmentId).all<Record<string, unknown>>(),
    database.prepare(
      `SELECT question_id, type, payload_json, selection_reason_json, position,
              clarification_version, created_at
       FROM t_skills_clarification_questions WHERE assessment_id = ? ORDER BY position ASC`,
    ).bind(assessmentId).all<Record<string, unknown>>(),
    database.prepare(
      `SELECT question_id, response_value, response_time_ms, client_seq,
              idempotency_key, created_at
       FROM t_skills_clarification_answers WHERE assessment_id = ? ORDER BY client_seq ASC`,
    ).bind(assessmentId).all<Record<string, unknown>>(),
    database.prepare(
      `SELECT phase, candidates_json, recommendations_json, career_catalog_version,
              career_matching_version, career_tiebreak_version, created_at
       FROM t_skills_career_results WHERE assessment_id = ? ORDER BY created_at ASC`,
    ).bind(assessmentId).all<Record<string, unknown>>(),
    database.prepare(
      `SELECT question_id, option_id, response_time_ms, client_seq,
              idempotency_key, created_at
       FROM t_skills_career_tiebreak_answers WHERE assessment_id = ? ORDER BY client_seq ASC`,
    ).bind(assessmentId).all<Record<string, unknown>>(),
    database.prepare(
      `SELECT input_json, output_json, narrative_prompt_version, report_version,
              provider, created_at
       FROM t_skills_narratives WHERE assessment_id = ? LIMIT 1`,
    ).bind(assessmentId).first<Record<string, unknown>>(),
    database.prepare(
      `SELECT id, status, provider, prompt_version, model_id, input_hash,
              output_hash, validation_result, created_at, updated_at
       FROM reports WHERE assessment_id = ? LIMIT 1`,
    ).bind(assessmentId).first<Record<string, unknown>>(),
  ]);

  const parseNested = (value: unknown, fallback: unknown) => typeof value === "string" ? parseJson(value, fallback) : fallback;
  return {
    assessment: {
      id: assessment.id,
      testId: assessment.test_id,
      state: assessment.state,
      versions,
      clientSeq: assessment.client_seq,
      createdAt: iso(assessment.created_at),
      completedAt: assessment.completed_at === null ? null : iso(assessment.completed_at),
      updatedAt: iso(assessment.updated_at),
    },
    onboarding: onboarding ? {
      age: onboarding.age,
      educationLevel: onboarding.education_level,
      favoriteSubjects: parseNested(onboarding.favorite_subjects_json, []),
      extensions: parseNested(onboarding.extensions_json, {}),
      version: onboarding.version,
      createdAt: onboarding.created_at,
      updatedAt: onboarding.updated_at,
    } : null,
    responses: responses.results ?? [],
    traitProfile: traitProfile ? {
      base: parseNested(traitProfile.base_json, []),
      final: parseNested(traitProfile.final_json, []),
      clarificationAnswers: parseNested(traitProfile.clarification_answers_json, []),
      scoringVersion: traitProfile.scoring_version,
      uncertaintyVersion: traitProfile.uncertainty_version,
      clarificationVersion: traitProfile.clarification_version,
      createdAt: traitProfile.created_at,
      updatedAt: traitProfile.updated_at,
    } : null,
    uncertainty: (uncertainty.results ?? []).map((row) => ({ ...row, payload: parseNested(row.payload_json, {}) })),
    clarificationQuestions: (clarificationQuestions.results ?? []).map((row) => ({
      ...row,
      payload: parseNested(row.payload_json, {}),
      selectionReason: parseNested(row.selection_reason_json, {}),
    })),
    clarificationAnswers: clarificationAnswers.results ?? [],
    careerResults: (careerResults.results ?? []).map((row) => ({
      ...row,
      candidates: parseNested(row.candidates_json, []),
      recommendations: parseNested(row.recommendations_json, []),
    })),
    careerTiebreakAnswers: careerTiebreakAnswers.results ?? [],
    narratives: narratives ? {
      input: parseNested(narratives.input_json, {}),
      output: parseNested(narratives.output_json, {}),
      narrativePromptVersion: narratives.narrative_prompt_version,
      reportVersion: narratives.report_version,
      provider: narratives.provider,
      createdAt: narratives.created_at,
    } : null,
    report,
  };
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
      ...deleteAssessmentDataStatements(database, sessionId),
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
  await serverTelemetry({ name: "privacy_delete", userId: viewer.userId, metadata: { status: "COMPLETE" } });
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

export async function getOnboardingForUser(sessionId: string, viewer: Viewer): Promise<OnboardingContext | null> {
  await ensureUser(viewer);
  const row = await ensureDatabase()
    .prepare(
      `SELECT age, education_level, favorite_subjects_json, extensions_json
       FROM assessment_onboarding WHERE assessment_id = ? AND user_id = ? LIMIT 1`,
    )
    .bind(sessionId, viewer.userId)
    .first<{ age: number; education_level: string; favorite_subjects_json: string; extensions_json: string }>();
  if (!row) return null;
  const extensions = parseJson<Record<string, unknown>>(row.extensions_json, {});
  return assertOnboarding({
    age: row.age,
    educationLevel: row.education_level,
    favoriteSubjects: parseJson<string[]>(row.favorite_subjects_json, []),
    ...extensions,
  });
}

export async function saveOnboardingForUser(sessionId: string, viewer: Viewer, onboarding: OnboardingContext) {
  await ensureUser(viewer);
  const normalized = assertOnboarding(onboarding);
  const database = ensureDatabase();
  const assessment = await database
    .prepare(`SELECT state, test_id, versions_json FROM assessments WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(sessionId, viewer.userId)
    .first<{ state: SessionState; test_id: string; versions_json: string }>();
  if (!assessment) throw new StoreError("SESSION_NOT_FOUND", 404);
  const versions = parseJson<Record<string, string>>(assessment.versions_json, {});
  if (assessment.test_id !== T_SKILLS_TEST_ID && versions.assessment !== T_SKILLS_VERSION_IDS.assessment) throw new StoreError("ONBOARDING_NOT_AVAILABLE", 409);
  if (isTSkillsTeenVersion(versions.assessment)) {
    const teenIssue = teenOnboardingIssue(normalized);
    if (teenIssue) throw new StoreError(teenIssue, 422);
  }
  if (!( ["PAID", "ENTITLED", "CONSENTED", "CORE_IN_PROGRESS"] as SessionState[]).includes(assessment.state)) {
    throw new StoreError("ONBOARDING_NOT_AVAILABLE", 409);
  }
  const { age, educationLevel, favoriteSubjects, ...extensions } = normalized;
  const timestamp = now();
  await database
    .prepare(
      `INSERT INTO assessment_onboarding
        (id, assessment_id, user_id, age, education_level, favorite_subjects_json,
         extensions_json, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 't-skills-onboarding-v1', ?, ?)
       ON CONFLICT(assessment_id) DO UPDATE SET
         age = excluded.age,
         education_level = excluded.education_level,
         favorite_subjects_json = excluded.favorite_subjects_json,
         extensions_json = excluded.extensions_json,
         version = excluded.version,
         updated_at = excluded.updated_at`,
    )
    .bind(newId("onboarding"), sessionId, viewer.userId, age, educationLevel, JSON.stringify(favoriteSubjects), JSON.stringify(extensions), timestamp, timestamp)
    .run();
  await audit(viewer.userId, "ONBOARDING_SAVED", "assessment", sessionId, { version: "t-skills-onboarding-v1" });
  return normalized;
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

/**
 * Пересмотр уже сохранённого ответа (передумал до «Продолжить»).
 * Разрешён только внутри своей фазы: core правится, пока идёт core,
 * adaptive — пока идёт adaptive. Повтор того же значения — безобидный replay.
 */
async function reviseResponse(args: {
  database: ReturnType<typeof ensureDatabase>;
  session: DurableSession;
  input: {
    itemId: string;
    response: number;
    responseTimeMs?: number;
    idempotencyKey: string;
  };
  idempotencyKey: string;
}) {
  const { database, session, input, idempotencyKey } = args;
  const revisingCore = isSessionCoreItem(session, input.itemId);
  const revisable = revisingCore
    ? ["CONSENTED", "CORE_IN_PROGRESS"].includes(session.state)
    : ["ADAPTIVE_IN_PROGRESS", "ADAPTIVE_FALLBACK"].includes(session.state);
  if (!revisable) throw new StoreError("ITEM_ALREADY_ANSWERED", 409);
  const row = await database
    .prepare(
      `SELECT client_seq FROM assessment_responses WHERE assessment_id = ? AND item_id = ? LIMIT 1`,
    )
    .bind(session.id, input.itemId)
    .first<{ client_seq: number }>();
  if (!row) throw new StoreError("RESPONSE_WRITE_CONFLICT", 409);
  if (session.responses[input.itemId] === input.response) {
    return { saved: true, replay: true, serverSeq: row.client_seq, nextItemId: nextItemId(session) };
  }
  const responseTimeMs = Math.min(24 * 60 * 60 * 1000, Math.max(0, Math.round(Number.isFinite(input.responseTimeMs ?? 0) ? input.responseTimeMs ?? 0 : 0)));
  const updated = await database
    .prepare(
      `UPDATE assessment_responses SET response = ?, response_time_ms = ?, idempotency_key = ?, created_at = ?
       WHERE assessment_id = ? AND item_id = ?`,
    )
    .bind(input.response, responseTimeMs, idempotencyKey, now(), session.id, input.itemId)
    .run();
  if ((updated.meta?.changes ?? 0) !== 1) throw new StoreError("RESPONSE_WRITE_CONFLICT", 409);
  const careerAnswerId = careerOptionId(args.session, input.itemId, input.response);
  if (careerAnswerId) {
    await database.prepare(
      `INSERT INTO career_adaptive_answers
        (id, assessment_id, question_id, answer_id, response_time_ms, client_seq, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(assessment_id, question_id) DO UPDATE SET
         answer_id = excluded.answer_id, response_time_ms = excluded.response_time_ms,
         client_seq = excluded.client_seq, idempotency_key = excluded.idempotency_key,
         created_at = excluded.created_at`,
    ).bind(newId("career_answer"), session.id, input.itemId, careerAnswerId, responseTimeMs, row.client_seq, idempotencyKey, now()).run();
  }
  return { saved: true, replay: false, serverSeq: row.client_seq, nextItemId: nextItemId(session) };
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
  const v2AdaptiveItem = isV2Session(session)
    ? (session.adaptiveItems as GeneratedAdaptiveQuestion[]).find((item) => item.questionId === input.itemId)
    : undefined;
  const tSkillsCoreItem = isTSkillsSession(session) ? tSkillsCoreItemById(session).get(input.itemId) : undefined;
  const coreResponseItem = v2CoreItem ?? v2AdaptiveItem;
  const responseValid = isTSkillsSession(session)
    ? validTSkillsResponse(session, input.itemId, input.response)
    : isV2Session(session)
      ? Boolean(coreResponseItem && validV2Response(coreResponseItem, input.response))
      : validResponse(input.itemId, input.response);
  if (!responseValid) {
    throw new StoreError("INVALID_RESPONSE", 422);
  }
  const allowed = isTSkillsSession(session)
    ? Boolean(tSkillsCoreItem || session.adaptiveItemIds.includes(input.itemId))
    : isV2Session(session)
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
  if (typeof session.responses[input.itemId] === "number") {
    // Пересмотр ответа до «Продолжить»: разрешён внутри своей фазы
    // (core — пока идёт core, adaptive — пока идёт adaptive), чтобы нельзя
    // было задним числом менять core после adaptive-подбора.
    return reviseResponse({ database, session, input, idempotencyKey });
  }

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
    : isTSkillsSession(session)
      ? "adaptive_fallback"
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
  const careerAnswerId = careerOptionId(session, input.itemId, input.response);
  if (phase === "adaptive" && isTSkillsSession(session) && !careerAnswerId) throw new StoreError("ADAPTIVE_RESPONSE_MAPPING_FAILED", 422);
  const responseStatements = [
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
  ];
  if (careerAnswerId) {
    responseStatements.push(database.prepare(
      `INSERT INTO career_adaptive_answers
        (id, assessment_id, question_id, answer_id, response_time_ms, client_seq, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(newId("career_answer"), input.sessionId, input.itemId, careerAnswerId,
      Math.min(24 * 60 * 60 * 1000, Math.max(0, Math.round(Number.isFinite(input.responseTimeMs ?? 0) ? input.responseTimeMs ?? 0 : 0))),
      serverSeq, idempotencyKey, timestamp));
  }
  try {
    const writeResults = await database.batch(responseStatements);
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
      // Параллельная запись: трактуем как пересмотр с теми же фазовыми guardrails.
      return reviseResponse({ database, session, input, idempotencyKey });
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

function careerOptionId(session: DurableSession, itemId: string, response: number) {
  if (!isTSkillsSession(session) || !session.adaptiveItemIds.includes(itemId)) return null;
  const matching = session.adaptiveItems.find((item) => isCareerAdaptiveQuestion(item) && item.id === itemId);
  return matching && Number.isInteger(response) ? matching.options[response]?.id ?? null : null;
}

async function hashText(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function v2Selection(session: DurableSession, fallbackMode?: boolean): AdaptiveSelection {
  const questions = session.adaptiveItems as GeneratedAdaptiveQuestion[];
  return {
    selectedItemIds: questions.map((question) => question.questionId),
    targetCount: questions.length,
    mode: fallbackMode || session.adaptiveFallbackUsed ? "approved-fallback" : "mercury",
    validation: "passed",
    reasonCodes: Object.fromEntries(questions.map((question) => [question.questionId, [question.reasonCode]])),
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

function tSkillsSelection(session: DurableSession): AdaptiveSelection {
  return {
    selectedItemIds: session.adaptiveItemIds,
    targetCount: session.adaptiveItemIds.length,
    mode: "approved-fallback",
    validation: "passed",
    reasonCodes: Object.fromEntries(session.adaptiveItemIds.map((id) => [id, ["HIGH_INFORMATION"]])),
  };
}

async function completeCoreTSkillsForUser(session: DurableSession, viewer: Viewer) {
  if (session.adaptiveItems.length && session.profile && [
    "ADAPTIVE_IN_PROGRESS",
    "ADAPTIVE_FALLBACK",
    "REPORT_GENERATING",
    "REPORT_FAILED_RETRYABLE",
    "COMPLETE",
  ].includes(session.state)) {
    return { session, selection: tSkillsSelection(session), run: null, reused: true };
  }

  const coreItemIds = new Set(T_SKILLS_PAIRWISE_BANK_V1.map((item) => item.id));
  const coreAnswered = Object.keys(session.responses).filter((itemId) => coreItemIds.has(itemId)).length;
  if (coreAnswered < T_SKILLS_PAIRWISE_BANK_V1.length) throw new StoreError("CORE_INCOMPLETE", 422);

  const answers = Object.fromEntries(
    T_SKILLS_PAIRWISE_BANK_V1.map((item) => [item.id, session.responses[item.id]]),
  ) as Record<string, -2 | -1 | 0 | 1 | 2>;
  const pairwise = scorePairwiseV1({ items: T_SKILLS_PAIRWISE_BANK_V1, traits: T_SKILLS_WORKING_TAXONOMY, answers });
  const preliminary = pairwiseScoreToProfile(pairwise, 0, { responseTimes: session.responseTimes, answers });
  const questions = T_SKILLS_ADAPTIVE_BANK_V1.map((question) => {
    const validation = validateAdaptiveQuestion(question);
    if (!validation.ok) throw new StoreError("ADAPTIVE_FALLBACK_INVALID", 500);
    return validation.value;
  });
  const database = ensureDatabase();
  const timestamp = now();
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
    question.id,
    "career_forced_choice",
    question.prompt,
    JSON.stringify(question.options),
    "[]",
    "HIGH_INFORMATION",
    question.dimension ?? "career-discrimination",
    `career-${question.id}`,
    1,
    "approved-fallback",
    null,
    null,
    T_SKILLS_VERSION_IDS.adaptivePrompt,
    T_SKILLS_VERSION_IDS.adaptive,
    "accepted",
    await hashText(JSON.stringify(question)),
    timestamp,
  )));

  try {
    await database.batch([
      ...questionStatements,
      database.prepare(
        `UPDATE assessments SET state = 'ADAPTIVE_FALLBACK', adaptive_item_ids_json = ?,
           selection_mode = 'approved-fallback', preliminary_score_json = ?,
           adaptive_generation_status = 'FALLBACK', adaptive_fallback_used = 1,
           adaptive_generation_lock = 0, adaptive_generation_attempts = adaptive_generation_attempts + 1,
           updated_at = ? WHERE id = ? AND user_id = ?`,
      ).bind(
        JSON.stringify(questions.map((question) => question.id)),
        JSON.stringify(preliminary),
        timestamp,
        session.id,
        viewer.userId,
      ),
    ]);
  } catch {
    const concurrent = await loadSession(session.id, viewer.userId);
    if (concurrent?.adaptiveItems.length) return { session: concurrent, selection: tSkillsSelection(concurrent), run: null, reused: true };
    throw new StoreError("ADAPTIVE_FALLBACK_SAVE_FAILED", 500);
  }
  await serverTelemetry({ name: "core_completed", userId: viewer.userId, assessmentId: session.id, metadata: { count: coreAnswered, status: "CORE_COMPLETE", assessment_version: T_SKILLS_VERSION_IDS.assessment } });
  await serverTelemetry({ name: "adaptive_started", userId: viewer.userId, assessmentId: session.id, metadata: { provider: "approved-fallback", fallback: true, mode: "approved-fallback", count: questions.length } });
  const updated = await loadSession(session.id, viewer.userId);
  if (!updated) throw new StoreError("SESSION_NOT_FOUND", 404);
  return { session: updated, selection: tSkillsSelection(updated), run: null, reused: false };
}

/**
 * Teen pathway: after all 75 pairs, the server picks the situational
 * questions of the most ambiguous traits (30% of 25 = 8) from the approved
 * pool. Selection is deterministic, so a retry re-derives the same set.
 */
async function completeCoreTeenForUser(session: DurableSession, viewer: Viewer) {
  if (session.adaptiveItems.length && session.profile && [
    "ADAPTIVE_IN_PROGRESS",
    "ADAPTIVE_FALLBACK",
    "REPORT_GENERATING",
    "REPORT_FAILED_RETRYABLE",
    "COMPLETE",
  ].includes(session.state)) {
    return { session, selection: tSkillsSelection(session), run: null, reused: true };
  }
  const versions = teenVersionIdsForAssessment(session.versions.assessment) ?? T_SKILLS_TEEN_VERSION_IDS;
  const coreItems = tSkillsCoreBank(session);
  const coreAnswered = coreItems.filter((item) => typeof session.responses[item.id] === "number").length;
  if (coreAnswered < coreItems.length) throw new StoreError("CORE_INCOMPLETE", 422);
  if (!canSessionTransition(session.state, "ADAPTIVE_IN_PROGRESS")) throw new StoreError("INVALID_SESSION_TRANSITION", 409);

  const questions = selectTeenClarificationQuestions(session.responses, session.versions.assessment);
  if (!questions.length) throw new StoreError("CLARIFICATION_SELECTION_FAILED", 500);
  const preliminary = teenTotalsToProfile(
    teenFinalTotals(session.responses, [], session.versions.assessment),
    0,
    { responseTimes: session.responseTimes, answers: session.responses },
    versions,
  );
  const database = ensureDatabase();
  const timestamp = now();
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
    question.id,
    TEEN_CLARIFICATION_FORMAT,
    question.prompt,
    JSON.stringify(question.options),
    JSON.stringify([question.id.replace(/^t2-/, "")]),
    "AMBIGUOUS_TRAIT",
    question.id.replace(/^t2-/, ""),
    `teen-${question.id}`,
    1,
    "approved-bank",
    null,
    null,
    versions.adaptivePrompt,
    versions.adaptive,
    "accepted",
    await hashText(JSON.stringify(question)),
    timestamp,
  )));

  try {
    await database.batch([
      ...questionStatements,
      database.prepare(
        `UPDATE assessments SET state = 'ADAPTIVE_IN_PROGRESS', adaptive_item_ids_json = ?,
           selection_mode = 'approved-fallback', preliminary_score_json = ?,
           adaptive_generation_status = 'READY', adaptive_fallback_used = 0,
           adaptive_generation_lock = 0, adaptive_generation_attempts = adaptive_generation_attempts + 1,
           updated_at = ? WHERE id = ? AND user_id = ? AND state IN ('CONSENTED', 'CORE_IN_PROGRESS')`,
      ).bind(
        JSON.stringify(questions.map((question) => question.id)),
        JSON.stringify(preliminary),
        timestamp,
        session.id,
        viewer.userId,
      ),
    ]);
  } catch {
    const concurrent = await loadSession(session.id, viewer.userId);
    if (concurrent?.adaptiveItems.length) return { session: concurrent, selection: tSkillsSelection(concurrent), run: null, reused: true };
    throw new StoreError("CLARIFICATION_SAVE_FAILED", 500);
  }
  await serverTelemetry({ name: "core_completed", userId: viewer.userId, assessmentId: session.id, metadata: { count: coreAnswered, status: "CORE_COMPLETE", assessment_version: session.versions.assessment } });
  await serverTelemetry({ name: "adaptive_started", userId: viewer.userId, assessmentId: session.id, metadata: { provider: "approved-bank", fallback: false, mode: "teen-ambiguity", count: questions.length } });
  const updated = await loadSession(session.id, viewer.userId);
  if (!updated) throw new StoreError("SESSION_NOT_FOUND", 404);
  return { session: updated, selection: tSkillsSelection(updated), run: null, reused: false };
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
  if (isTeenSession(session)) return completeCoreTeenForUser(session, viewer);
  if (isTSkillsSession(session)) return completeCoreTSkillsForUser(session, viewer);
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

function isCareerAdaptiveQuestion(item: StoredAdaptiveQuestion): item is AdaptiveQuestion {
  return "id" in item && typeof item.id === "string" && Array.isArray(item.options);
}

function careerEvidenceForSession(session: DurableSession) {
  const questions = session.adaptiveItems.filter(isCareerAdaptiveQuestion);
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const answers: AdaptiveAnswer[] = [];
  for (const questionId of session.adaptiveItemIds) {
    const response = session.responses[questionId];
    const question = questionById.get(questionId);
    const option = question && Number.isInteger(response) ? question.options[response] : undefined;
    if (!question || !option) throw new StoreError("ADAPTIVE_RESPONSE_MAPPING_FAILED", 422);
    answers.push({ questionId, optionId: option.id });
  }
  return { questions, answers };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function loadPublishedV1CareerCatalog(database: ReturnType<typeof ensureDatabase>, sessionModelVersion?: string) {
  const versionRow = await database.prepare(
    `SELECT version FROM career_catalog_versions WHERE status = 'PUBLISHED' ORDER BY published_at DESC LIMIT 1`,
  ).first<{ version: string }>();
  if (!versionRow) return { version: T_SKILLS_VERSION_IDS.careerCatalog, modelVersion: T_SKILLS_VERSION_IDS.careerMatching, catalog: productionCareerCatalog() };
  // A session keeps the career model it started with, even after a newer
  // assessment version (e.g. t-skills-teen-v2) becomes the published one.
  const modelVersion = sessionModelVersion ?? T_SKILLS_VERSION_IDS.careerMatching;
  const modelRow = await database.prepare(
    `SELECT version, status, config_json FROM career_model_versions WHERE version = ? AND status = 'PUBLISHED' LIMIT 1`,
  ).bind(modelVersion).first<{ version: string; status: string; config_json: string }>();
  const modelConfig = objectValue(parseJson(modelRow?.config_json ?? "{}", {}));
  if (!modelRow || modelConfig.runtime !== "built-in:t-skills-career-v1" || modelConfig.catalogVersion !== versionRow.version) {
    throw new StoreError("CAREER_MODEL_NOT_EXECUTABLE", 409);
  }
  const model = productionCareerModel(modelVersion);
  if (!model) throw new StoreError("CAREER_MODEL_NOT_EXECUTABLE", 409);
  const rows = await database.prepare(
    `SELECT e.slug, e.status, e.title_ru, e.description_ru, e.category,
            e.education_paths_json, e.career_tags_json, e.catalog_version
     FROM career_catalog_entries e
     WHERE e.catalog_version = ? AND e.status = 'ACTIVE'
     ORDER BY e.slug ASC`,
  ).bind(versionRow.version).all<Record<string, unknown>>();
  const traitIds = T_SKILLS_WORKING_TAXONOMY.map((trait) => trait.id);
  const raw = (rows.results ?? []).map((row) => {
    const config = model[String(row.slug)];
    return {
      id: String(row.slug),
      title: String(row.title_ru),
      description: String(row.description_ru),
      version: String(row.catalog_version),
      active: true,
      traitProfile: config?.traitProfile ?? {},
      careerDimensions: config?.careerDimensions ?? {},
      subjectTags: parseJson<string[]>(row.career_tags_json as string | null, []),
      educationPaths: parseJson<string[]>(row.education_paths_json as string | null, []),
    };
  });
  const validated = validateCareerCatalog(raw, traitIds, versionRow.version);
  if (!validated.ok) {
    console.error("career_catalog_validation_failed", { error_code: "CAREER_CATALOG_INVALID", version: versionRow.version, issue_count: validated.issues.length });
    throw new StoreError("CAREER_CATALOG_INVALID", 500);
  }
  return { version: versionRow.version, modelVersion, catalog: validated.value satisfies Profession[] };
}

async function buildTSkillsCareerPersistence(session: DurableSession, viewer: Viewer, pairwise: ReturnType<typeof scorePairwiseV1>, database: ReturnType<typeof ensureDatabase>) {
  const onboarding = await getOnboardingForUser(session.id, viewer);
  const context: OnboardingContext = onboarding ?? { age: 18, educationLevel: "unknown", favoriteSubjects: [] };
  const evidence = careerEvidenceForSession(session);
  const catalog = await loadPublishedV1CareerCatalog(database, "careerMatching" in session.versions ? session.versions.careerMatching : undefined);
  const rankingHistory: Array<ReturnType<typeof matchCareers>> = [];
  let consumedAnswers: AdaptiveAnswer[] = [];
  let candidates = matchCareers({ traits: pairwise.traitResults, onboarding: context, catalog: catalog.catalog, adaptiveQuestions: evidence.questions });
  for (const answer of evidence.answers) {
    candidates = applyAdaptiveAnswer({
      traits: pairwise.traitResults,
      onboarding: context,
      catalog: catalog.catalog,
      questions: evidence.questions,
      answers: consumedAnswers,
      answer,
    });
    consumedAnswers = [...consumedAnswers, answer];
    rankingHistory.push(candidates);
  }
  const snapshot = {
    traitProfile: pairwise.traitResults,
    candidates,
    adaptiveAnswers: consumedAnswers,
    careerPreferences: consumedAnswers,
    rankingHistory,
    adaptiveQuestionIds: session.adaptiveItemIds,
    consumedResponseItemIds: session.adaptiveItemIds,
    assessmentVersion: session.versions.assessment,
    scoringVersion: session.versions.scoring,
    adaptiveVersion: "adaptive" in session.versions ? session.versions.adaptive : session.versions.selector,
    reportVersion: session.versions.report,
    contentVersion: session.versions.itemBank,
    matchingVersion: catalog.modelVersion,
    careerCatalogVersion: catalog.version,
  };
  return {
    candidates,
    statements: [
      database.prepare(
        `INSERT INTO t_skills_career_results
          (id, assessment_id, phase, candidates_json, recommendations_json,
           career_catalog_version, career_matching_version, career_tiebreak_version, created_at)
         VALUES (?, ?, 'FINAL', ?, ?, ?, ?, ?, ?)`,
      ).bind(newId("career_result"), session.id, JSON.stringify(candidates), JSON.stringify(candidates.slice(0, 5)), catalog.version, catalog.modelVersion, "none-v1", now()),
      database.prepare(
        `INSERT INTO career_match_snapshots
          (id, assessment_id, phase, candidates_json, matching_version, career_catalog_version, created_at)
         VALUES (?, ?, 'FINAL', ?, ?, ?, ?)`,
      ).bind(newId("career_snapshot"), session.id, JSON.stringify(snapshot), catalog.modelVersion, catalog.version, now()),
    ],
  };
}

export async function buildTeenCareerPersistence(session: DurableSession, viewer: Viewer, totals: ReturnType<typeof teenFinalTotals>, database: ReturnType<typeof ensureDatabase>) {
  const versions = teenVersionIdsForAssessment(session.versions.assessment) ?? T_SKILLS_TEEN_VERSION_IDS;
  const teenOnboarding = teenOnboardingFrom(await getOnboardingForUser(session.id, viewer));
  if (!teenOnboarding) throw new StoreError("ONBOARDING_REQUIRED", 422);
  // Каталог — из сохранённых версий сессии: отсутствующее поле исторической
  // сессии подразумевает контракт (v1), явная неизвестная версия и
  // несовпадение с контрактом отклоняются до расчёта.
  let teenCatalogVersion: string;
  try {
    teenCatalogVersion = teenCatalogVersionForSession(session.versions.assessment, session.versions);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("TEEN_CAREER_CATALOG_")) {
      throw new StoreError(error.message.split(":")[0], 422, error.message);
    }
    throw error;
  }
  const candidates = teenCareerRanking(totals, teenOnboarding, teenCatalogVersion);
  const evidence = careerEvidenceForSession(session);
  const snapshot = {
    traitProfile: Object.entries(totals).map(([traitId, total]) => ({ traitId, total })),
    candidates,
    adaptiveAnswers: evidence.answers,
    careerPreferences: [],
    topValues: teenTopValues(teenOnboarding),
    valueRanking: teenOnboarding.valueRanking,
    subjects: teenOnboarding.subjects,
    adaptiveQuestionIds: session.adaptiveItemIds,
    consumedResponseItemIds: session.adaptiveItemIds,
    assessmentVersion: session.versions.assessment,
    scoringVersion: session.versions.scoring,
    adaptiveVersion: versions.adaptive,
    reportVersion: session.versions.report,
    contentVersion: session.versions.itemBank,
    matchingVersion: versions.careerMatching,
    careerCatalogVersion: teenCatalogVersion,
  };
  return {
    candidates,
    statements: [
      database.prepare(
        `INSERT INTO t_skills_career_results
           (id, assessment_id, phase, candidates_json, recommendations_json,
            career_catalog_version, career_matching_version, career_tiebreak_version, created_at)
         VALUES (?, ?, 'FINAL', ?, ?, ?, ?, ?, ?)`,
      ).bind(newId("career_result"), session.id, JSON.stringify(candidates), JSON.stringify(candidates.slice(0, 5)), teenCatalogVersion, versions.careerMatching, "none-v1", now()),
      database.prepare(
        `INSERT INTO career_match_snapshots
           (id, assessment_id, phase, candidates_json, matching_version, career_catalog_version, created_at)
         VALUES (?, ?, 'FINAL', ?, ?, ?, ?)`,
      ).bind(newId("career_snapshot"), session.id, JSON.stringify(snapshot), versions.careerMatching, teenCatalogVersion, now()),
    ],
  };
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

  const teenVersionIds = isTeenSession(session) ? teenVersionIdsForAssessment(session.versions.assessment) : null;
  const teenTotals = teenVersionIds ? teenFinalTotals(session.responses, session.adaptiveItemIds, session.versions.assessment) : null;
  const tSkillsPairwise = isTSkillsSession(session) && !teenTotals
    ? scorePairwiseV1({
        items: T_SKILLS_PAIRWISE_BANK_V1,
        traits: T_SKILLS_WORKING_TAXONOMY,
        answers: Object.fromEntries(
          T_SKILLS_PAIRWISE_BANK_V1.map((item) => [item.id, session.responses[item.id]]),
        ) as Record<string, -2 | -1 | 0 | 1 | 2>,
      })
    : null;
  const calculatedProfile = teenTotals
    ? teenTotalsToProfile(teenTotals, session.adaptiveItemIds.length, { responseTimes: session.responseTimes, answers: session.responses }, teenVersionIds!)
    : isTSkillsSession(session)
    ? pairwiseScoreToProfile(
        tSkillsPairwise!,
        session.adaptiveItemIds.length,
        { responseTimes: session.responseTimes, answers: session.responses },
      )
    : isV2Session(session)
      ? scoreCore60(session.responses, session.responseTimes, (session.adaptiveItems as GeneratedAdaptiveQuestion[]).map(generatedQuestionToResponseItem))
      : scoreAssessment(session.responses, session.responseTimes);
  const profile = isTSkillsSession(session)
    ? { ...calculatedProfile, versions: session.versions }
    : calculatedProfile;
  const reportId = newId("rep");
  const database = ensureDatabase();
  const timestamp = now();
  const careerPersistence = teenTotals
    ? await buildTeenCareerPersistence(session, viewer, teenTotals, database)
    : isTSkillsSession(session) && tSkillsPairwise
    ? await buildTSkillsCareerPersistence(session, viewer, tSkillsPairwise, database)
    : { candidates: [], statements: [] as D1PreparedStatement[] };
  try {
    await database.batch([
      ...careerPersistence.statements,
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
    const assessmentMeta = await database
      .prepare(`SELECT test_id, versions_json, adaptive_provider, adaptive_fallback_used, adaptive_item_ids_json FROM assessments WHERE id = ? AND user_id = ? LIMIT 1`)
      .bind(row.assessment_id, viewer.userId)
      .first<{ test_id: string; versions_json: string; adaptive_provider: string | null; adaptive_fallback_used: number; adaptive_item_ids_json: string }>();
    const versionSnapshot = parseJson<Record<string, string>>(assessmentMeta?.versions_json, score.versions);
    const adaptiveQuestionCount = parseJson<string[]>(assessmentMeta?.adaptive_item_ids_json, []).length || score.adaptiveAnswered;
    const isTSkillsReport = assessmentMeta?.test_id === T_SKILLS_TEST_ID || versionSnapshot.assessment.startsWith("t-skills");
    const isTeenReport = isTSkillsTeenVersion(versionSnapshot.assessment);
    const careerSnapshotRow = isTSkillsReport
      ? await database.prepare(`SELECT candidates_json, matching_version, career_catalog_version FROM career_match_snapshots WHERE assessment_id = ? ORDER BY created_at DESC LIMIT 1`).bind(row.assessment_id).first<{ candidates_json: string; matching_version: string; career_catalog_version: string }>()
      : null;
    const careerSnapshot = parseJson<Record<string, unknown>>(careerSnapshotRow?.candidates_json, {});
    const careerArray = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)) : [];
    const careerReport = isTSkillsReport ? {
      traitProfile: careerArray(careerSnapshot.traitProfile),
      clarificationAnswers: careerArray(careerSnapshot.adaptiveAnswers).filter((entry) => typeof entry.questionId === "string" && typeof entry.optionId === "string").map((entry) => ({ questionId: String(entry.questionId), optionId: String(entry.optionId) })),
      careerPreferences: careerArray(careerSnapshot.careerPreferences).filter((entry) => typeof entry.questionId === "string" && typeof entry.optionId === "string").map((entry) => ({ questionId: String(entry.questionId), optionId: String(entry.optionId) })),
      ranking: careerArray(careerSnapshot.candidates),
      versions: {
        assessment: String(careerSnapshot.assessmentVersion ?? versionSnapshot.assessment ?? ""),
        scoring: String(careerSnapshot.scoringVersion ?? versionSnapshot.scoring ?? ""),
        adaptive: String(careerSnapshot.adaptiveVersion ?? versionSnapshot.adaptive ?? ""),
        careerMatching: String(careerSnapshot.matchingVersion ?? careerSnapshotRow?.matching_version ?? versionSnapshot.careerMatching ?? ""),
        careerCatalog: String(careerSnapshot.careerCatalogVersion ?? careerSnapshotRow?.career_catalog_version ?? versionSnapshot.careerCatalog ?? ""),
        report: String(careerSnapshot.reportVersion ?? versionSnapshot.report ?? ""),
        content: String(careerSnapshot.contentVersion ?? versionSnapshot.itemBank ?? ""),
      },
      ...(isTeenReport ? {
        topValues: Array.isArray(careerSnapshot.topValues) ? careerSnapshot.topValues.map(String) : [],
        subjects: Array.isArray(careerSnapshot.subjects) ? careerSnapshot.subjects.map(String) : [],
      } : {}),
    } : undefined;
    const generated = isTSkillsReport
      ? {
          report: buildTSkillsReport(score, adaptiveQuestionCount, isTeenReport ? { coreQuestionCount: 75, versions: teenVersionIdsForAssessment(versionSnapshot.assessment) ?? T_SKILLS_TEEN_VERSION_IDS } : undefined),
          provider: "t-skills-deterministic",
          promptVersion: isTeenReport ? (teenVersionIdsForAssessment(versionSnapshot.assessment) ?? T_SKILLS_TEEN_VERSION_IDS).report : T_SKILLS_VERSION_IDS.report,
          modelId: null,
          inputHash: "t-skills-deterministic",
          outputHash: "t-skills-deterministic",
          validationResult: "passed" as const,
          fallbackReason: null,
        }
      : await generateReportContent(score);
    const report = {
      ...generated.report,
      assessmentVersion: versionSnapshot.assessment ?? score.versions.assessment,
      coreQuestionCount: isTeenReport ? 75 : isTSkillsReport ? 67 : versionSnapshot.assessment === V2_VERSION_IDS.assessment ? 60 : score.coreAnswered,
      adaptiveQuestionCount,
      adaptiveProvider: assessmentMeta?.adaptive_provider ?? (isTeenReport ? "approved-bank" : isTSkillsReport || versionSnapshot.assessment === V2_VERSION_IDS.assessment ? "approved-fallback" : "legacy-selector"),
      adaptiveFallbackUsed: assessmentMeta?.adaptive_fallback_used === 1,
      adaptiveVersion: versionSnapshot.adaptive ?? versionSnapshot.selector ?? generated.report.adaptiveVersion,
      reportVersion: versionSnapshot.report ?? score.versions.report,
      ...(careerReport ? { career: careerReport } : {}),
    } satisfies ReportJSON;
    const pdfKey = `reports/${viewer.userId}/${reportId}.pdf`;
    const pdf = await buildReportPdf(score, report);
    const bucket = getR2();
    await bucket.put(pdfKey, pdf, {
      httpMetadata: {
        contentType: "application/pdf",
        contentDisposition: `attachment; filename="t-skills-${reportId}.pdf"`,
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
      `SELECT id, test_id, amount_minor, original_amount_minor,
              discount_amount_minor, final_amount_minor, promo_code_id,
              pricing_snapshot_json, idempotency_payload_json, currency,
              status, provider, provider_checkout_url, created_at
       FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .bind(viewer.userId)
    .all<OrderRow>();
  const assessmentResult = await database
    .prepare(
      `SELECT id, test_id, state, versions_json, client_seq, adaptive_item_ids_json,
              report_id, created_at, updated_at
       FROM assessments WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`,
    )
    .bind(viewer.userId)
    .all<{
      id: string;
      test_id: string;
      state: SessionState;
      versions_json: string;
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
      versions: parseJson<Record<string, string>>(row.versions_json, {}),
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
  const [sessionResult, responseResult, reportResult, adaptiveRunResult, adaptiveQuestionResult, onboardingResult, careerQuestionResult, careerAnswerResult, careerMatchResult, tSkillsTraitProfileResult, tSkillsUncertaintyResult, tSkillsClarificationQuestionResult, tSkillsClarificationAnswerResult, tSkillsCareerResult, tSkillsCareerTiebreakResult, tSkillsNarrativeResult, consentResult] = await Promise.all([
    database
    .prepare(
      `SELECT id, test_id, state, versions_json, adaptive_item_ids_json,
              preliminary_score_json, final_score_json, report_id, client_seq,
              created_at, consented_at, completed_at, updated_at
       FROM assessments WHERE user_id = ? ORDER BY created_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
    database
    .prepare(
      `SELECT r.assessment_id, r.item_id, r.response, r.response_time_ms, r.client_seq,
              r.response_source, r.presentation_metadata_json, r.created_at
       FROM assessment_responses r
       JOIN assessments a ON a.id = r.assessment_id
       WHERE a.user_id = ? ORDER BY r.created_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
    database
    .prepare(
      `SELECT id, assessment_id, status, provider, score_json, report_json,
              prompt_version, model_id, input_hash, output_hash, validation_result,
              created_at, updated_at
       FROM reports WHERE user_id = ? ORDER BY created_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
    database
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
    .all<Record<string, unknown>>(),
    database
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
    .all<Record<string, unknown>>(),
    database
    .prepare(
      `SELECT ao.assessment_id, ao.age, ao.education_level, ao.favorite_subjects_json,
              ao.extensions_json, ao.version, ao.created_at, ao.updated_at
       FROM assessment_onboarding ao
       JOIN assessments a ON a.id = ao.assessment_id
       WHERE a.user_id = ? ORDER BY ao.created_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
    database
    .prepare(
      `SELECT cq.assessment_id, cq.question_id, cq.prompt, cq.options_json,
              cq.source, cq.provider, cq.model_id, cq.prompt_version,
              cq.adaptive_version, cq.validation_status, cq.question_hash, cq.created_at
       FROM career_adaptive_questions cq
       JOIN assessments a ON a.id = cq.assessment_id
       WHERE a.user_id = ? ORDER BY cq.created_at ASC, cq.question_id ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
    database
    .prepare(
      `SELECT ca.assessment_id, ca.question_id, ca.answer_id, ca.response_time_ms,
              ca.client_seq, ca.idempotency_key, ca.created_at
       FROM career_adaptive_answers ca
       JOIN assessments a ON a.id = ca.assessment_id
       WHERE a.user_id = ? ORDER BY ca.created_at ASC, ca.question_id ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
    database
    .prepare(
      `SELECT cm.assessment_id, cm.phase, cm.candidates_json, cm.matching_version,
              cm.career_catalog_version, cm.created_at
       FROM career_match_snapshots cm
       JOIN assessments a ON a.id = cm.assessment_id
       WHERE a.user_id = ? ORDER BY cm.created_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
    database
    .prepare(
      `SELECT tp.assessment_id, tp.base_json, tp.final_json, tp.clarification_answers_json,
              tp.scoring_version, tp.uncertainty_version, tp.clarification_version,
              tp.created_at, tp.updated_at
       FROM t_skills_trait_profiles tp
       JOIN assessments a ON a.id = tp.assessment_id
       WHERE a.user_id = ? ORDER BY tp.created_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
    database
    .prepare(
      `SELECT us.assessment_id, us.payload_json, us.uncertainty_version, us.created_at
       FROM t_skills_uncertainty_snapshots us
       JOIN assessments a ON a.id = us.assessment_id
       WHERE a.user_id = ? ORDER BY us.created_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
    database
    .prepare(
      `SELECT cq.assessment_id, cq.question_id, cq.type, cq.payload_json,
              cq.selection_reason_json, cq.position, cq.clarification_version, cq.created_at
       FROM t_skills_clarification_questions cq
       JOIN assessments a ON a.id = cq.assessment_id
       WHERE a.user_id = ? ORDER BY cq.assessment_id ASC, cq.position ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
    database
    .prepare(
      `SELECT ca.assessment_id, ca.question_id, ca.response_value, ca.response_time_ms,
              ca.client_seq, ca.idempotency_key, ca.created_at
       FROM t_skills_clarification_answers ca
       JOIN assessments a ON a.id = ca.assessment_id
       WHERE a.user_id = ? ORDER BY ca.created_at ASC, ca.question_id ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
    database
    .prepare(
      `SELECT cr.assessment_id, cr.phase, cr.candidates_json, cr.recommendations_json,
              cr.career_catalog_version, cr.career_matching_version,
              cr.career_tiebreak_version, cr.created_at
       FROM t_skills_career_results cr
       JOIN assessments a ON a.id = cr.assessment_id
       WHERE a.user_id = ? ORDER BY cr.created_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
    database
    .prepare(
      `SELECT ca.assessment_id, ca.question_id, ca.option_id, ca.response_time_ms,
              ca.client_seq, ca.idempotency_key, ca.created_at
       FROM t_skills_career_tiebreak_answers ca
       JOIN assessments a ON a.id = ca.assessment_id
       WHERE a.user_id = ? ORDER BY ca.created_at ASC, ca.question_id ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
    database
    .prepare(
      `SELECT n.assessment_id, n.input_json, n.output_json, n.narrative_prompt_version,
              n.report_version, n.provider, n.created_at
       FROM t_skills_narratives n
       JOIN assessments a ON a.id = n.assessment_id
       WHERE a.user_id = ? ORDER BY n.created_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
    database
    .prepare(
      `SELECT c.assessment_id, c.consent_type, c.text_version, c.granted,
              c.decided_at, c.revoked_at
       FROM consents c
       JOIN assessments a ON a.id = c.assessment_id
       WHERE c.user_id = ? ORDER BY c.decided_at ASC`,
    )
    .bind(viewer.userId)
    .all<Record<string, unknown>>(),
  ]);
  const payload = {
    exportedAt: new Date().toISOString(),
    user: overview.user,
    orders: overview.orders,
    assessments: sessionResult.results ?? [],
    responses: responseResult.results ?? [],
    reports: reportResult.results ?? [],
    adaptiveRuns: adaptiveRunResult.results ?? [],
    adaptiveQuestions: adaptiveQuestionResult.results ?? [],
    onboarding: onboardingResult.results ?? [],
    careerAdaptiveQuestions: careerQuestionResult.results ?? [],
    careerAdaptiveAnswers: careerAnswerResult.results ?? [],
    careerMatchSnapshots: careerMatchResult.results ?? [],
    tSkillsTraitProfiles: tSkillsTraitProfileResult.results ?? [],
    tSkillsUncertaintySnapshots: tSkillsUncertaintyResult.results ?? [],
    tSkillsClarificationQuestions: tSkillsClarificationQuestionResult.results ?? [],
    tSkillsClarificationAnswers: tSkillsClarificationAnswerResult.results ?? [],
    tSkillsCareerResults: tSkillsCareerResult.results ?? [],
    tSkillsCareerTiebreakAnswers: tSkillsCareerTiebreakResult.results ?? [],
    tSkillsNarratives: tSkillsNarrativeResult.results ?? [],
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
      httpMetadata: { contentType: "application/json", contentDisposition: `attachment; filename="t-skills-data-${requestId}.json"` },
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
      ...deleteUserAssessmentDataStatements(database, viewer.userId),
      database.prepare(`DELETE FROM campaign_members WHERE user_id = ?`).bind(viewer.userId),
      database.prepare(`DELETE FROM promo_redemptions WHERE user_id = ?`).bind(viewer.userId),
      database.prepare(`DELETE FROM assessments WHERE user_id = ?`).bind(viewer.userId),
      database.prepare(`DELETE FROM entitlements WHERE user_id = ?`).bind(viewer.userId),
      database.prepare(`DELETE FROM payment_events WHERE order_id IN (SELECT id FROM orders WHERE user_id = ?)`).bind(viewer.userId),
      database.prepare(`DELETE FROM orders WHERE user_id = ?`).bind(viewer.userId),
      database.prepare(`DELETE FROM rate_limits WHERE bucket_key LIKE '%:' || ?`).bind(viewer.userId),
      database.prepare(`DELETE FROM auth_sessions WHERE user_id = ?`).bind(viewer.userId),
      database.prepare(`DELETE FROM auth_tokens WHERE user_id = ?`).bind(viewer.userId),
      database.prepare(`DELETE FROM auth_invites WHERE created_by = ?`).bind(viewer.userId),
      database.prepare(`DELETE FROM auth_credentials WHERE user_id = ?`).bind(viewer.userId),
      database.prepare(`UPDATE users SET email = ?, full_name = NULL, role = 'user', status = 'deleted', deleted_at = ?, updated_at = ? WHERE id = ?`).bind(`${viewer.userId}@deleted.invalid`, timestamp, timestamp, viewer.userId),
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
