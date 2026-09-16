import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/db";
import { aiEnabled, entitlementMode, paymentsEnabled } from "@/lib/runtime-config";

export async function GET() {
  const env = getRuntimeEnv();
  return NextResponse.json({
    status: "ok",
    environment: env.APP_ENV ?? env.ORBITA_ENV ?? "unknown",
    paymentsEnabled: paymentsEnabled(env),
    entitlementMode: entitlementMode(env),
    aiEnabled: aiEnabled(env),
    adaptiveProvider: env.ADAPTIVE_PROVIDER ?? "approved-library",
    reportProvider: env.REPORT_PROVIDER ?? "approved-library",
    normStatus: "unvalidated",
  }, { headers: { "Cache-Control": "no-store" } });
}
