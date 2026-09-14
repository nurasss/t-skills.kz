import { NextResponse } from "next/server";

import { regenerateReport } from "@/lib/api-store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = regenerateReport(id);
  if (!report) return NextResponse.json({ error: "REPORT_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ id: report.id, status: report.status, score_unchanged: true, report: report.report });
}
