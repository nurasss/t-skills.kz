import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit, getSessionForUser, saveResponse } from "@/lib/durable-store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  try {
    const session = await getSessionForUser(id, viewer);
    if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ responses: session.responses, response_times: session.responseTimes, server_seq: session.clientSeq });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const { id } = await params;
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "responses", limit: 400, windowMs: 10 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
    if (!idempotencyKey) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 422 });
    if (idempotencyKey.length > 200 || /[\u0000-\u001f\u007f]/.test(idempotencyKey)) {
      return NextResponse.json({ error: "IDEMPOTENCY_KEY_INVALID" }, { status: 422 });
    }
    const body = (await request.json()) as { item_id?: string; response?: number; response_time_ms?: number; client_seq?: number };
    if (!body.item_id || typeof body.response !== "number") return NextResponse.json({ error: "INVALID_RESPONSE_PAYLOAD" }, { status: 422 });
    const result = await saveResponse({
      sessionId: id,
      viewer,
      itemId: body.item_id,
      response: body.response,
      responseTimeMs: body.response_time_ms,
      clientSeq: body.client_seq,
      idempotencyKey,
    });
    return NextResponse.json({ saved: result.saved, replay: result.replay, server_seq: result.serverSeq, next_item_id: result.nextItemId });
  } catch (error) {
    return errorResponse(error);
  }
}
