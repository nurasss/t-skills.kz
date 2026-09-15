import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/db";
import { errorResponse, sameOriginOrResponse } from "@/lib/api-response";
import { selectAdaptiveForProfile } from "@/lib/adaptive-provider";
import { scoreAssessment, type ResponseMap } from "@/lib/assessment-engine";

export async function POST(request: Request) {
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const internalToken = getRuntimeEnv().ORBITA_INTERNAL_TOKEN;
  if (!internalToken || request.headers.get("X-Internal-Token") !== internalToken) {
    return NextResponse.json({ error: "INTERNAL_AUTHENTICATION_REQUIRED" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { responses?: ResponseMap; answered_item_ids?: string[]; target_count?: number };
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
