import { NextResponse } from "next/server";

import { errorResponse, isResponse, viewerOrResponse } from "@/lib/api-response";
import { createPdfDownloadToken } from "@/lib/pdf-access";
import { getReportForUser, StoreError } from "@/lib/durable-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  try {
    const report = await getReportForUser(id, viewer);
    if (!report.pdfAvailable) throw new StoreError("PDF_NOT_READY", 409);
    const grant = await createPdfDownloadToken(report.id, viewer.userId);
    return NextResponse.json({
      download_path: `/api/reports/${encodeURIComponent(report.id)}/download?token=${encodeURIComponent(grant.token)}`,
      expires_at: new Date(grant.expiresAt * 1000).toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PDF_SIGNING_SECRET_MISSING") {
      return NextResponse.json({ error: "PDF_SIGNING_SECRET_MISSING", message: "Сервис защищённой выдачи PDF ещё не настроен." }, { status: 503 });
    }
    return errorResponse(error);
  }
}
