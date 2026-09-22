import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit } from "@/lib/durable-store";
import { createCheckout } from "@/lib/payment-provider";
import { assessmentCreateSchema, parseJsonBody } from "@/lib/request-validation";
import { isSupportedTestId, T_SKILLS_TEST_ID } from "@/lib/t-skills/versions";
import { maintenanceModeEnabled } from "@/lib/feature-flags";

export async function POST(request: Request) {
  if (await maintenanceModeEnabled()) return NextResponse.json({ error: "MAINTENANCE_MODE" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } });
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const parsed = await parseJsonBody(request, assessmentCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const testId = body.test_id ?? T_SKILLS_TEST_ID;
  // Keep explicit orbita30 checkout compatibility for historical orders; the
  // public catalog and the default path remain T-Skills.
  if (!isSupportedTestId(testId)) return NextResponse.json({ error: "TEST_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || crypto.randomUUID();
  if (idempotencyKey.length > 200 || /[\u0000-\u001f\u007f]/.test(idempotencyKey)) {
    return NextResponse.json({ error: "IDEMPOTENCY_KEY_INVALID" }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "checkout", limit: 5, windowMs: 10 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const result = await createCheckout({ viewer, testId, request, idempotencyKey, promoCode: body.promo_code });
    return NextResponse.json({
      order_id: result.order.id,
      status: result.order.status,
      checkout_url: result.checkoutUrl,
      free_access: result.order.freeAccess,
      reused: result.reused,
    }, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
