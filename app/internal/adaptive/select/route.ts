import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/db";
import { errorResponse } from "@/lib/api-response";
import { scoreAssessment, selectAdaptiveItems, type ResponseMap } from "@/lib/assessment-engine";

export async function POST(request: Request) {
  const internalToken = getRuntimeEnv().ORBITA_INTERNAL_TOKEN;
  if (!internalToken || request.headers.get("X-Internal-Token") !== internalToken) {
    return NextResponse.json({ error: "INTERNAL_AUTHENTICATION_REQUIRED" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { responses?: ResponseMap; answered_item_ids?: string[]; target_count?: number };
    const profile = scoreAssessment(body.responses ?? {});
    const selection = selectAdaptiveItems(profile, body.answered_item_ids ?? Object.keys(body.responses ?? {}), body.target_count ?? 12);
    return NextResponse.json({ ...selection, selected_item_ids: selection.selectedItemIds, reason_codes: selection.reasonCodes });
  } catch (error) {
    return errorResponse(error);
  }
}
