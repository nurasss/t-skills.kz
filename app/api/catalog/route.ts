import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/db";
import { getPublicTestConfig } from "@/lib/payment-provider";

export async function GET() {
  const supportContact = getRuntimeEnv().SUPPORT_CONTACT?.trim() || null;
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    supportContact,
    test: getPublicTestConfig(),
  }, { headers: { "Cache-Control": "public, max-age=60" } });
}
