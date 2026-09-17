import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/db";
import { errorResponse, sameOriginOrResponse } from "@/lib/api-response";
import { selectAdaptiveForProfile } from "@/lib/adaptive-provider";
import { constantTimeTokenEqual } from "@/lib/app-auth";
import { scoreAssessment } from "@/lib/assessment-engine";
import { internalAdaptiveSchema, parseJsonBody } from "@/lib/request-validation";

export async function POST(request: Request) {
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const internalToken = getRuntimeEnv().ORBITA_INTERNAL_TOKEN;
  if (!internalToken || !constantTimeTokenEqual(internalToken, request.headers.get("X-Internal-Token"))) {
    return NextResponse.json({ error: "INTERNAL_AUTHENTICATION_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const parsed = await parseJsonBody(request, internalAdaptiveSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const profile = scoreAssessment(body.responses ?? {});
    const decision = await selectAdaptiveForProfile(profile, body.answered_item_ids ?? Object.keys(body.responses ?? {}), body.target_count ?? 12);
    return NextResponse.json({
      ...decision.selection,
      selected_item_ids: decision.selection.selectedItemIds,
      reason_codes: decision.selection.reasonCodes,
      run: decision.run,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
