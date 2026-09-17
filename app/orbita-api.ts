"use client";

import type { PendingResponse } from "@/app/orbita-view-types";
import { optionalAnalyticsAllowed } from "@/lib/client-analytics";

export class ApiClientError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

let csrfRequest: Promise<void> | null = null;
const PENDING_RESPONSE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING_RESPONSES = 100;

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function ensureCsrfToken() {
  if (readCookie("orbita_csrf")) return;
  csrfRequest ??= fetch("/api/auth/csrf", { credentials: "include", cache: "no-store" }).then(() => undefined).finally(() => { csrfRequest = null; });
  await csrfRequest;
}

export async function apiJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && typeof window !== "undefined") {
    await ensureCsrfToken();
    const token = readCookie("orbita_csrf");
    if (token) {
      try {
        headers.set("X-CSRF-Token", decodeURIComponent(token));
      } catch {
        headers.set("X-CSRF-Token", token);
      }
    }
  }
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(input, { ...init, credentials: "include", headers });
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string } & T;
  if (!response.ok) throw new ApiClientError(payload.error ?? "REQUEST_FAILED", payload.message ?? "Запрос не выполнен.");
  return payload as T;
}

export function trackOptionalAnalytics(input: {
  name: string;
  assessment_id?: string;
  metadata?: Record<string, unknown>;
}, options: Pick<RequestInit, "keepalive"> = {}) {
  if (!optionalAnalyticsAllowed()) return;
  void apiJson("/api/telemetry", {
    method: "POST",
    body: JSON.stringify(input),
    ...options,
  }).catch(() => undefined);
}

export function readPendingResponses(): PendingResponse[] {
  try {
    const raw = window.localStorage.getItem("orbita-pending-responses-v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const valid = parsed.filter((item): item is PendingResponse => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as PendingResponse;
      return typeof candidate.sessionId === "string" && candidate.sessionId.length > 0 && candidate.sessionId.length <= 128 &&
        typeof candidate.itemId === "string" && candidate.itemId.length > 0 && candidate.itemId.length <= 128 &&
        Number.isInteger(candidate.response) && candidate.response >= -2 && candidate.response <= 7 &&
        Number.isInteger(candidate.responseTimeMs) && candidate.responseTimeMs >= 0 && candidate.responseTimeMs <= 86_400_000 &&
        Number.isInteger(candidate.clientSeq) && candidate.clientSeq >= 0 && candidate.clientSeq <= 1_000_000 &&
        typeof candidate.idempotencyKey === "string" && candidate.idempotencyKey.length > 0 && candidate.idempotencyKey.length <= 200 && !/[\u0000-\u001f\u007f]/.test(candidate.idempotencyKey) &&
        Number.isSafeInteger(candidate.queuedAt) && candidate.queuedAt <= now + 5 * 60 * 1000 && now - candidate.queuedAt <= PENDING_RESPONSE_TTL_MS;
    }).slice(-MAX_PENDING_RESPONSES);
    if (valid.length !== parsed.length) writePendingResponses(valid);
    return valid;
  } catch {
    return [];
  }
}

export function writePendingResponses(items: PendingResponse[]) {
  try {
    const now = Date.now();
    const retained = items.filter((item) => Number.isSafeInteger(item.queuedAt) && item.queuedAt <= now + 5 * 60 * 1000 && now - item.queuedAt <= PENDING_RESPONSE_TTL_MS).slice(-MAX_PENDING_RESPONSES);
    if (retained.length) window.localStorage.setItem("orbita-pending-responses-v1", JSON.stringify(retained));
    else window.localStorage.removeItem("orbita-pending-responses-v1");
  } catch {
    // The server remains the source of truth even if the retry cache is unavailable.
  }
}

export function topLevelNavigate(path: string) {
  const anchor = document.createElement("a");
  anchor.href = path;
  anchor.target = "_top";
  anchor.rel = "noreferrer";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
