import {
  buildReport,
  scoreAssessment,
  selectAdaptiveItems,
  type ReportJSON,
  type ResponseMap,
  type ScoreProfile,
} from "@/lib/assessment-engine";
import { ITEM_BANK } from "@/lib/item-bank";

export type SessionState =
  | "CREATED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "CONSENTED"
  | "CORE_IN_PROGRESS"
  | "CORE_COMPLETE"
  | "ADAPTIVE_SELECTING"
  | "ADAPTIVE_IN_PROGRESS"
  | "SCORING"
  | "REPORT_GENERATING"
  | "COMPLETE"
  | "PAYMENT_FAILED"
  | "EXPIRED"
  | "CANCELLED"
  | "INVALIDATED"
  | "REPORT_FAILED_RETRYABLE";

type Order = {
  id: string;
  userId: string;
  testId: string;
  amount: number;
  currency: string;
  status: "PAYMENT_PENDING" | "PAID" | "PAYMENT_FAILED";
  providerEventId?: string;
};

export type Session = {
  id: string;
  userId: string;
  testId: string;
  state: SessionState;
  versions: {
    assessment: string;
    itemBank: string;
    scoring: string;
    norms: string;
  };
  responses: ResponseMap;
  responseTimes: Record<string, number>;
  clientSeq: number;
  idempotencyKeys: Record<string, { response: number; serverSeq: number }>;
  adaptiveItemIds: string[];
  selectionMode?: "deterministic-fallback";
  profile?: ScoreProfile;
  report?: ReportJSON;
  updatedAt: string;
};

const orders = new Map<string, Order>();
const sessions = new Map<string, Session>();
const reports = new Map<string, { id: string; sessionId: string; status: string; report?: ReportJSON; score?: ScoreProfile }>();
const providerEvents = new Set<string>();

function id(prefix: string) {
  return prefix + "_" + crypto.randomUUID().replaceAll("-", "").slice(0, 18);
}

function now() {
  return new Date().toISOString();
}

export function createOrder(input: { userId?: string; testId?: string; amount?: number; currency?: string }) {
  const order: Order = {
    id: id("ord"),
    userId: input.userId ?? "preview-user",
    testId: input.testId ?? "orbita30",
    amount: input.amount ?? 0,
    currency: input.currency ?? "KZT",
    status: "PAYMENT_PENDING",
  };
  orders.set(order.id, order);
  return { ...order, checkoutStatus: "hosted_checkout_required" };
}

export function receivePaymentEvent(input: { providerEventId: string; orderId: string; status: "PAID" | "PAYMENT_FAILED" }) {
  const order = orders.get(input.orderId);
  if (!order) return { ok: false as const, error: "ORDER_NOT_FOUND" };
  if (providerEvents.has(input.providerEventId)) {
    return { ok: true as const, duplicate: true, order: { ...order } };
  }
  providerEvents.add(input.providerEventId);
  order.status = input.status;
  order.providerEventId = input.providerEventId;
  return { ok: true as const, duplicate: false, order: { ...order }, entitlementCreated: input.status === "PAID" };
}

export function createAssessment(input: { userId?: string; testId?: string }) {
  const session: Session = {
    id: id("sess"),
    userId: input.userId ?? "preview-user",
    testId: input.testId ?? "orbita30",
    state: "PAID",
    versions: {
      assessment: "orbita30_ru_v1",
      itemBank: "draft-pilot-v1",
      scoring: "mvp-0.3",
      norms: "within-sample-preview",
    },
    responses: {},
    responseTimes: {},
    clientSeq: 0,
    idempotencyKeys: {},
    adaptiveItemIds: [],
    updatedAt: now(),
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(sessionId: string) {
  return sessions.get(sessionId);
}

export function consentSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  session.state = "CONSENTED";
  session.updatedAt = now();
  return session;
}

function isCoreItem(itemId: string) {
  return Number(itemId.slice(1)) <= 250 && ITEM_BANK.some((item) => item.id === itemId);
}

function isAllowedAdaptive(session: Session, itemId: string) {
  return session.adaptiveItemIds.includes(itemId) && Number(itemId.slice(1)) >= 251 && Number(itemId.slice(1)) <= 300;
}

function validResponse(itemId: string, value: number) {
  const item = ITEM_BANK.find((candidate) => candidate.id === itemId);
  if (!item || !Number.isFinite(value)) return false;
  if (item.type === "forced" || item.type === "adaptive_forced") return value >= -2 && value <= 2 && Number.isInteger(value);
  return value >= 1 && value <= 7 && Number.isInteger(value);
}

export function saveSessionResponse(input: { sessionId: string; itemId: string; response: number; responseTimeMs?: number; clientSeq?: number; idempotencyKey?: string }) {
  const session = sessions.get(input.sessionId);
  if (!session) return { ok: false as const, status: 404, error: "SESSION_NOT_FOUND" };
  const key = input.idempotencyKey;
  if (key && session.idempotencyKeys[key]) {
    const stored = session.idempotencyKeys[key];
    return { ok: true as const, replay: true, saved: true, serverSeq: stored.serverSeq, nextItemId: nextItemId(session, input.itemId) };
  }
  const allowed = isCoreItem(input.itemId) || isAllowedAdaptive(session, input.itemId);
  if (!allowed) return { ok: false as const, status: 422, error: "ITEM_NOT_ALLOWED" };
  if (!validResponse(input.itemId, input.response)) return { ok: false as const, status: 422, error: "INVALID_RESPONSE" };
  if (typeof session.responses[input.itemId] === "number") return { ok: false as const, status: 409, error: "ITEM_ALREADY_ANSWERED" };
  session.responses[input.itemId] = input.response;
  session.responseTimes[input.itemId] = Math.max(0, Math.round(input.responseTimeMs ?? 0));
  session.clientSeq = Math.max(session.clientSeq + 1, input.clientSeq ?? 0);
  session.state = isCoreItem(input.itemId) ? "CORE_IN_PROGRESS" : "ADAPTIVE_IN_PROGRESS";
  session.updatedAt = now();
  if (key) session.idempotencyKeys[key] = { response: input.response, serverSeq: session.clientSeq };
  return { ok: true as const, replay: false, saved: true, serverSeq: session.clientSeq, nextItemId: nextItemId(session, input.itemId) };
}

function nextItemId(session: Session, currentItemId: string) {
  const all: string[] = ITEM_BANK.map((item) => item.id);
  const currentIndex = all.indexOf(currentItemId);
  for (const candidate of all.slice(currentIndex + 1)) {
    if (isCoreItem(candidate) && typeof session.responses[candidate] !== "number") return candidate;
  }
  for (const candidate of session.adaptiveItemIds) {
    if (typeof session.responses[candidate] !== "number") return candidate;
  }
  return null;
}

export function completeCore(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  const coreAnswered = Object.keys(session.responses).filter((itemId) => isCoreItem(itemId)).length;
  if (coreAnswered < 250) return { error: "CORE_INCOMPLETE", answered: coreAnswered } as const;
  session.state = "ADAPTIVE_SELECTING";
  const preliminary = scoreAssessment(session.responses);
  const selection = selectAdaptiveItems(preliminary, Object.keys(session.responses), 12);
  session.profile = preliminary;
  session.adaptiveItemIds = selection.selectedItemIds;
  session.selectionMode = selection.mode;
  session.state = "ADAPTIVE_IN_PROGRESS";
  session.updatedAt = now();
  return { session, selection };
}

export function completeAssessment(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  if (!session.adaptiveItemIds.length) return { error: "ADAPTIVE_NOT_SELECTED" } as const;
  const missing = session.adaptiveItemIds.filter((itemId) => typeof session.responses[itemId] !== "number");
  if (missing.length) return { error: "ADAPTIVE_INCOMPLETE", missing } as const;
  session.state = "SCORING";
  const finalProfile = scoreAssessment(session.responses);
  session.profile = finalProfile;
  session.state = "REPORT_GENERATING";
  session.report = buildReport(finalProfile);
  const reportId = id("rep");
  reports.set(reportId, { id: reportId, sessionId: session.id, status: "COMPLETE", report: session.report, score: finalProfile });
  session.state = "COMPLETE";
  session.updatedAt = now();
  return { session, reportId };
}

export function getReport(reportId: string) {
  return reports.get(reportId);
}

export function regenerateReport(reportId: string) {
  const record = reports.get(reportId);
  if (!record?.score) return undefined;
  record.report = buildReport(record.score);
  record.status = "COMPLETE";
  return record;
}
