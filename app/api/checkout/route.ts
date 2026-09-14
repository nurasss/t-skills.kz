import { NextResponse } from "next/server";

import { createOrder } from "@/lib/api-store";

export async function POST(request: Request) {
  let body: { user_id?: string; test_id?: string; amount?: number; currency?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Defaults are valid for the preview checkout.
  }
  return NextResponse.json(createOrder({ userId: body.user_id, testId: body.test_id, amount: body.amount, currency: body.currency }), { status: 201 });
}
