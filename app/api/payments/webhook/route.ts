import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { PaymentProviderError, processStripeWebhook } from "@/lib/payment-provider";
import { readRequestText, RequestBodyTooLargeError } from "@/lib/request-validation";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 512 * 1024) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413, headers: { "Cache-Control": "no-store" } });
  let payload: string;
  try {
    payload = await readRequestText(request, 512 * 1024);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await processStripeWebhook(payload, request.headers.get("stripe-signature"));
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PaymentProviderError && error.code === "STRIPE_SIGNATURE_INVALID") {
      return NextResponse.json({ error: error.code }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return errorResponse(error);
  }
}
