import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { StoreError } from "@/lib/durable-store";
import { listContent, upsertContentDraft } from "@/lib/admin-store";
import { contentUpdateSchema, parseJsonBody } from "@/lib/request-validation";

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await adminViewerOrResponse(request, "content.read");
  if (context instanceof NextResponse) return context;
  try {
    const { key } = await params;
    const url = new URL(request.url);
    url.searchParams.set("content_key", key);
    return NextResponse.json(await listContent(new Request(url)), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error, request); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await adminViewerOrResponse(request, "content.edit", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, contentUpdateSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const { key } = await params;
    if (parsed.data.content_key !== key) throw new StoreError("CONTENT_KEY_MISMATCH", 422);
    return NextResponse.json(await upsertContentDraft({ context, request, data: parsed.data }));
  } catch (error) { return adminErrorResponse(error, request); }
}
