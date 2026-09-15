"use client";

import type { PendingResponse } from "@/app/orbita-view-types";

export class ApiClientError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(input, { ...init, credentials: "include", headers });
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string } & T;
  if (!response.ok) throw new ApiClientError(payload.error ?? "REQUEST_FAILED", payload.message ?? "Запрос не выполнен.");
  return payload as T;
}

export function readPendingResponses(): PendingResponse[] {
  try {
    const raw = window.localStorage.getItem("orbita-pending-responses-v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingResponse => Boolean(item && typeof item === "object" &&
      typeof (item as PendingResponse).sessionId === "string" &&
      typeof (item as PendingResponse).itemId === "string" &&
      typeof (item as PendingResponse).response === "number" &&
      typeof (item as PendingResponse).idempotencyKey === "string"));
  } catch {
    return [];
  }
}

export function writePendingResponses(items: PendingResponse[]) {
  try {
    if (items.length) window.localStorage.setItem("orbita-pending-responses-v1", JSON.stringify(items));
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

