import { NextResponse } from "next/server";

import { errorResponse, isResponse, viewerOrResponse } from "@/lib/api-response";
import { completeAssessmentForUser, generateReportForUser } from "@/lib/durable-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  try {
    const result = await completeAssessmentForUser(id, viewer);
    const report = await generateReportForUser(result.reportId, viewer);
    return NextResponse.json({
      state: report.status === "COMPLETE" ? "COMPLETE" : "REPORT_FAILED_RETRYABLE",
      report_id: result.reportId,
      report_status: report.status,
      score: report.score,
      report: report.report,
      pdf_available: report.pdfAvailable,
    }, { status: report.status === "COMPLETE" ? 200 : 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
