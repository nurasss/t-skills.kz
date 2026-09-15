import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { completeAssessmentForUser, consumeRateLimit, generateReportForUser, getReportForUser } from "@/lib/durable-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const { id } = await params;
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "complete", limit: 5, windowMs: 10 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const result = await completeAssessmentForUser(id, viewer);
    const existing = result.reused ? await getReportForUser(result.reportId, viewer) : null;
    const report = existing && existing.status === "REPORT_GENERATING" && Date.now() - Date.parse(existing.updatedAt) < 60_000
      ? existing
      : await generateReportForUser(result.reportId, viewer);
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
