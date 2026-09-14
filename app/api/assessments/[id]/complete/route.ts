import { NextResponse } from "next/server";

import { completeAssessment } from "@/lib/api-store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = completeAssessment(id);
  if (!result) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if ("error" in result) return NextResponse.json(result, { status: 422 });
  return NextResponse.json({ state: result.session.state, report_id: result.reportId, score: result.session.profile });
}
