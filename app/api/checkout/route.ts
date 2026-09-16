import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit } from "@/lib/durable-store";
import { createCheckout } from "@/lib/payment-provider";

export async function POST(request: Request) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  let body: { test_id?: string };
  try {
    body = (await request.json()) as { test_id?: string };
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const testId = body.test_id ?? "orbita30";
  if (testId !== "orbita30") return NextResponse.json({ error: "TEST_NOT_FOUND" }, { status: 404 });
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || crypto.randomUUID();
  if (idempotencyKey.length > 200 || /[\u0000-\u001f\u007f]/.test(idempotencyKey)) {
    return NextResponse.json({ error: "IDEMPOTENCY_KEY_INVALID" }, { status: 422 });
  }
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "checkout", limit: 5, windowMs: 10 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const result = await createCheckout({ viewer, testId, request, idempotencyKey });
    return NextResponse.json({
      order_id: result.order.id,
      status: result.order.status,
      checkout_url: result.checkoutUrl,
      reused: result.reused,
    }, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
