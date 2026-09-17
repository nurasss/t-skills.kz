import { errorResponse, isResponse, viewerOrResponse } from "@/lib/api-response";
import { getExportForUser } from "@/lib/durable-store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  try {
    const object = await getExportForUser(id, viewer);
    return new Response(object.body, {
      status: 200,
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "application/json",
        "Content-Disposition": object.httpMetadata?.contentDisposition ?? ('attachment; filename="t-skills-data-' + id + '.json"'),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
