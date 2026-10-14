import { errorResponse, isResponse, viewerOrResponse } from "@/lib/api-response";
import { getReportPdfForUser, recordTelemetry } from "@/lib/durable-store";
import { verifyPdfDownloadToken } from "@/lib/pdf-access";
import { resourceBelongsToViewer } from "@/lib/ownership-policy";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) {
      return new Response(JSON.stringify({ error: "PDF_LINK_REQUIRED", message: "Сначала запросите короткоживущую ссылку на PDF." }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    const grant = await verifyPdfDownloadToken(token);
    if (!grant || grant.reportId !== id || !resourceBelongsToViewer(grant.userId, viewer.userId)) {
      return new Response(JSON.stringify({ error: "PDF_LINK_INVALID", message: "Ссылка на PDF недействительна или истекла." }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    const object = await getReportPdfForUser(id, viewer);
    await recordTelemetry({ viewer, name: "pdf_downloaded" });
    return new Response(object.body, {
      status: 200,
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/pdf",
        "Content-Disposition": object.httpMetadata?.contentDisposition ?? ('attachment; filename="t-skills-' + id + '.pdf"'),
        "Cache-Control": "private, no-store",
        ETag: object.httpEtag,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
