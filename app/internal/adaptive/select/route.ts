import { NextResponse } from "next/server";

import { scoreAssessment, selectAdaptiveItems, type ResponseMap } from "@/lib/assessment-engine";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { responses?: ResponseMap; answered_item_ids?: string[]; target_count?: number };
    const profile = scoreAssessment(body.responses ?? {});
    const selection = selectAdaptiveItems(profile, body.answered_item_ids ?? Object.keys(body.responses ?? {}), body.target_count ?? 12);
    return NextResponse.json({ ...selection, selected_item_ids: selection.selectedItemIds, reason_codes: selection.reasonCodes });
  } catch {
    return NextResponse.json({ error: "ADAPTIVE_FALLBACK_FAILED" }, { status: 422 });
  }
}
