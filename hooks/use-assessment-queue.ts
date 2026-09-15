"use client";

import { useEffect, useRef } from "react";

import { apiJson, readPendingResponses, writePendingResponses } from "@/app/orbita-api";
import type { PendingResponse } from "@/app/orbita-view-types";
import { removePending } from "@/lib/response-retry-queue";

export function useAssessmentQueue({ onStatus }: { onStatus: (status: string) => void }) {
  const pendingRef = useRef<PendingResponse[]>([]);
  const pendingPromisesRef = useRef(new Map<string, Promise<void>>());
  const serverSavedRef = useRef(new Set<string>());

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
      onStatus("ответ сохранён");
    } catch (error) {
      onStatus("ожидает соединения");
      throw error;
    }
  };

  const persistPendingResponse = (pending: PendingResponse) => {
    const existing = pendingPromisesRef.current.get(pending.idempotencyKey);
    if (existing) return existing;
    const request = sendPendingResponse(pending).finally(() => {
      pendingPromisesRef.current.delete(pending.idempotencyKey);
    });
    pendingPromisesRef.current.set(pending.idempotencyKey, request);
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
