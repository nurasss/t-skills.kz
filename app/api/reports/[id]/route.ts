import { NextResponse } from "next/server";

import { getReport } from "@/lib/api-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getReport(id);
  if (!report) return NextResponse.json({ error: "REPORT_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ id: report.id, session_id: report.sessionId, status: report.status, score: report.score, report: report.report });
}
