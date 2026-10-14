import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/db";
import { errorResponse } from "@/lib/api-response";
import { constantTimeTokenEqual } from "@/lib/app-auth";
import { isLocalAuthEnvironment } from "@/lib/auth-utils";
import { parseJsonBody, retentionSchema } from "@/lib/request-validation";
import { runRetentionSweep } from "@/lib/retention";

export async function POST(request: Request) {
  const expected = getRuntimeEnv().ORBITA_INTERNAL_TOKEN;
  const presented = request.headers.get("X-Internal-Token");
  if (!expected || !constantTimeTokenEqual(expected, presented)) {
    return NextResponse.json({ error: "INTERNAL_AUTHENTICATION_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const parsed = await parseJsonBody(request, retentionSchema, 16 * 1024);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const runtimeEnv = getRuntimeEnv();
    const configuredDryRun = runtimeEnv.RETENTION_DRY_RUN?.trim().toLowerCase();
    const dryRun = body.dry_run === undefined
      ? configuredDryRun === undefined || configuredDryRun === "" || configuredDryRun === "true"
      : body.dry_run;
    const limit = body.limit;
    const stopAfterArtifacts = isLocalAuthEnvironment(runtimeEnv) && body.fault_after_artifacts === true;
    return NextResponse.json(await runRetentionSweep({ dryRun, limit, stopAfterArtifacts }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
