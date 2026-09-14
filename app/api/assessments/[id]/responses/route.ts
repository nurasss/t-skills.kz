import { NextResponse } from "next/server";

import { saveSessionResponse } from "@/lib/api-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = (await request.json()) as { item_id?: string; response?: number; response_time_ms?: number; client_seq?: number };
    if (!body.item_id || typeof body.response !== "number") return NextResponse.json({ error: "INVALID_RESPONSE_PAYLOAD" }, { status: 422 });
    const result = saveSessionResponse({ sessionId: id, itemId: body.item_id, response: body.response, responseTimeMs: body.response_time_ms, clientSeq: body.client_seq, idempotencyKey: request.headers.get("Idempotency-Key") ?? undefined });
    if (!result.ok) return NextResponse.json(result, { status: result.status });
    return NextResponse.json({ saved: result.saved, replay: result.replay, server_seq: result.serverSeq, next_item_id: result.nextItemId });
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
}
