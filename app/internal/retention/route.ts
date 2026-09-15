import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/db";
import { errorResponse } from "@/lib/api-response";
import { runRetentionSweep } from "@/lib/retention";

export async function POST(request: Request) {
  const expected = getRuntimeEnv().ORBITA_INTERNAL_TOKEN;
  const presented = request.headers.get("X-Internal-Token");
  if (!expected || !presented || expected.length !== presented.length || !constantTimeEqual(expected, presented)) {
    return NextResponse.json({ error: "INTERNAL_AUTHENTICATION_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const body = await request.json().catch(() => ({})) as { dry_run?: unknown; limit?: unknown };
    const configuredDryRun = getRuntimeEnv().RETENTION_DRY_RUN?.trim().toLowerCase();
    const dryRun = body.dry_run === undefined
      ? configuredDryRun === undefined || configuredDryRun === "" || configuredDryRun === "true"
      : body.dry_run === true || body.dry_run === "true";
    const limit = typeof body.limit === "number" && Number.isFinite(body.limit) ? body.limit : undefined;
    return NextResponse.json(await runRetentionSweep({ dryRun, limit }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

function constantTimeEqual(left: string, right: string) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
