import { NextResponse } from "next/server";

import { receivePaymentEvent } from "@/lib/api-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { provider_event_id?: string; order_id?: string; status?: "PAID" | "PAYMENT_FAILED" };
    if (!body.provider_event_id || !body.order_id || !body.status) return NextResponse.json({ error: "INVALID_WEBHOOK" }, { status: 422 });
    const result = receivePaymentEvent({ providerEventId: body.provider_event_id, orderId: body.order_id, status: body.status });
    return NextResponse.json(result, { status: result.ok ? 200 : 404 });
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
}
