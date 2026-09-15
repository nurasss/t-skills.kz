import { NextResponse } from "next/server";

import { errorResponse, isResponse, viewerOrResponse } from "@/lib/api-response";
import { createCheckout } from "@/lib/payment-provider";

export async function POST(request: Request) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  let body: { test_id?: string };
  try {
    body = (await request.json()) as { test_id?: string };
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const testId = body.test_id ?? "orbita30";
  if (testId !== "orbita30") return NextResponse.json({ error: "TEST_NOT_FOUND" }, { status: 404 });
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() || crypto.randomUUID();
  if (idempotencyKey.length > 200) return NextResponse.json({ error: "IDEMPOTENCY_KEY_TOO_LONG" }, { status: 422 });
  try {
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
