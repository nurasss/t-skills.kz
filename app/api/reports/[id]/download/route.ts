import { errorResponse, isResponse, viewerOrResponse } from "@/lib/api-response";
import { getReportPdfForUser, recordTelemetry } from "@/lib/durable-store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  try {
    const object = await getReportPdfForUser(id, viewer);
    await recordTelemetry({ viewer, name: "pdf_downloaded" });
    return new Response(object.body, {
      status: 200,
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/pdf",
        "Content-Disposition": object.httpMetadata?.contentDisposition ?? ('attachment; filename="orbita-30-' + id + '.pdf"'),
        "Cache-Control": "private, max-age=300",
        ETag: object.httpEtag,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
