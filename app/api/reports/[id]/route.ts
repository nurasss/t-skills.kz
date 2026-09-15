import { NextResponse } from "next/server";

import { errorResponse, isResponse, viewerOrResponse } from "@/lib/api-response";
import { getReportForUser } from "@/lib/durable-store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  try {
    const report = await getReportForUser(id, viewer);
    return NextResponse.json({
      id: report.id,
      assessment_id: report.assessmentId,
      status: report.status,
      provider: report.provider,
      score: report.score,
      report: report.report,
      pdf_available: report.pdfAvailable,
      generation: report.generation,
      updated_at: report.updatedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
