import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit } from "@/lib/durable-store";
import { createPdfDownloadToken } from "@/lib/pdf-access";
import { getReportForUser, StoreError } from "@/lib/durable-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const { id } = await params;
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "pdf-link", limit: 30, windowMs: 5 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const report = await getReportForUser(id, viewer);
    if (!report.pdfAvailable) throw new StoreError("PDF_NOT_READY", 409);
    const grant = await createPdfDownloadToken(report.id, viewer.userId);
    return NextResponse.json({
      download_path: `/api/reports/${encodeURIComponent(report.id)}/download?token=${encodeURIComponent(grant.token)}`,
      expires_at: new Date(grant.expiresAt * 1000).toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "PDF_SIGNING_SECRET_MISSING") {
      return NextResponse.json({ error: "PDF_SIGNING_SECRET_MISSING", message: "Сервис защищённой выдачи PDF ещё не настроен." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return errorResponse(error);
  }
}
