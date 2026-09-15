import { NextResponse } from "next/server";

import { errorResponse, isResponse, viewerOrResponse } from "@/lib/api-response";
import { regenerateReportForUser } from "@/lib/durable-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  try {
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
