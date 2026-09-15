import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { PaymentProviderError, processStripeWebhook } from "@/lib/payment-provider";

export async function POST(request: Request) {
  const payload = await request.text();
  try {
    const result = await processStripeWebhook(payload, request.headers.get("stripe-signature"));
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof PaymentProviderError && error.code === "STRIPE_SIGNATURE_INVALID") {
      return NextResponse.json({ error: error.code }, { status: 400 });
    }
    return errorResponse(error);
  }
}
