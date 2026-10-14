import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit, regenerateReportForUser } from "@/lib/durable-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const { id } = await params;
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "report-regenerate", limit: 5, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const report = await regenerateReportForUser(id, viewer);
    return NextResponse.json({
      id: report.id,
      status: report.status,
      score_unchanged: true,
      report: report.report,
      pdf_available: report.pdfAvailable,
    }, { status: report.status === "COMPLETE" ? 200 : 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
