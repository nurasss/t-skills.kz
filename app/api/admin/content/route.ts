import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { listContent, upsertContentDraft } from "@/lib/admin-store";
import { contentUpdateSchema, parseJsonBody } from "@/lib/request-validation";

export async function GET(request: Request) {
  const context = await adminViewerOrResponse(request, "content.read");
  if (context instanceof NextResponse) return context;
  try { return NextResponse.json(await listContent(request), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return adminErrorResponse(error, request); }
}

export async function POST(request: Request) {
  const context = await adminViewerOrResponse(request, "content.edit", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, contentUpdateSchema);
  if (!parsed.ok) return parsed.response;
  try { return NextResponse.json(await upsertContentDraft({ context, request, data: parsed.data }), { status: 201 }); }
  catch (error) { return adminErrorResponse(error, request); }
}
