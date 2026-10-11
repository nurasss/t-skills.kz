"use client";

import { useEffect, useRef } from "react";

import { apiJson, readPendingResponses, writePendingResponses } from "@/app/orbita-api";
import type { PendingResponse } from "@/app/orbita-view-types";
import { removePending } from "@/lib/response-retry-queue";

export function useAssessmentQueue({ onStatus, savedText, offlineText }: { onStatus: (status: string) => void; savedText?: string; offlineText?: string }) {
  const pendingRef = useRef<PendingResponse[]>([]);
  const pendingPromisesRef = useRef(new Map<string, Promise<void>>());
  const laneTailsRef = useRef(new Map<string, Promise<void>>());
  const serverSavedRef = useRef(new Set<string>());
  // Тексты статуса читаются в момент завершения запроса, а не в момент его
  // старта: если язык переключили, пока ответ сохранялся, сообщение придёт
  // на новом языке, а не вернётся на прежний.
  const textsRef = useRef({ savedText, offlineText });
  useEffect(() => {
    textsRef.current = { savedText, offlineText };
  }, [savedText, offlineText]);

  const sendPendingResponse = async (pending: PendingResponse) => {
    try {
      await apiJson(`/api/assessments/${encodeURIComponent(pending.sessionId)}/responses`, {
        method: "POST",
        headers: { "Idempotency-Key": pending.idempotencyKey },
        body: JSON.stringify({
          item_id: pending.itemId,
          response: pending.response,
          response_time_ms: pending.responseTimeMs,
          client_seq: pending.clientSeq,
        }),
      });
      serverSavedRef.current.add(pending.itemId);
      pendingRef.current = removePending(pendingRef.current, pending.idempotencyKey);
      writePendingResponses(pendingRef.current);
      onStatus(textsRef.current.savedText ?? "ответ сохранён");
    } catch (error) {
      onStatus(textsRef.current.offlineText ?? "ожидает соединения");
      throw error;
    }
  };

  const persistPendingResponse = (pending: PendingResponse) => {
    const existing = pendingPromisesRef.current.get(pending.idempotencyKey);
    if (existing) return existing;
    // Сериализация по вопросу: передумывание A→B уходит на сервер строго по порядку.
    const lane = `${pending.sessionId}:${pending.itemId}`;
    const previous = laneTailsRef.current.get(lane) ?? Promise.resolve();
    const request = previous
      .catch(() => undefined)
      .then(() => sendPendingResponse(pending))
      .finally(() => {
        pendingPromisesRef.current.delete(pending.idempotencyKey);
        if (laneTailsRef.current.get(lane) === request) laneTailsRef.current.delete(lane);
      });
    pendingPromisesRef.current.set(pending.idempotencyKey, request);
    laneTailsRef.current.set(lane, request);
    return request;
  };

  const flushPendingResponses = async () => {
    for (const item of [...pendingRef.current]) {
      try {
        await persistPendingResponse(item);
      } catch {
        // Keep the remaining queue for the next online event or explicit retry.
      }
    }
  };

  useEffect(() => {
    pendingRef.current = readPendingResponses();
    void flushPendingResponses();
    const onOnline = () => void flushPendingResponses();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // The listener must be registered once; it reads the mutable retry queue ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { pendingRef, serverSavedRef, persistPendingResponse };
}
