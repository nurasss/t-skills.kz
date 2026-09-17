import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit, getSessionForUser, saveResponse } from "@/lib/durable-store";
import { parseJsonBody, responseSaveSchema } from "@/lib/request-validation";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  try {
    const session = await getSessionForUser(id, viewer);
    if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ responses: session.responses, response_times: session.responseTimes, server_seq: session.clientSeq }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const { id } = await params;
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "responses", limit: 400, windowMs: 10 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
    if (!idempotencyKey) return NextResponse.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, { status: 422, headers: { "Cache-Control": "no-store" } });
    if (idempotencyKey.length > 200 || /[\u0000-\u001f\u007f]/.test(idempotencyKey)) {
      return NextResponse.json({ error: "IDEMPOTENCY_KEY_INVALID" }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    const parsed = await parseJsonBody(request, responseSaveSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const result = await saveResponse({
      sessionId: id,
      viewer,
      itemId: body.item_id,
      response: body.response,
      responseTimeMs: body.response_time_ms,
      clientSeq: body.client_seq,
      idempotencyKey,
    });
    return NextResponse.json({ saved: result.saved, replay: result.replay, server_seq: result.serverSeq, next_item_id: result.nextItemId }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
