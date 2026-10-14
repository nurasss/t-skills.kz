import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { deletePromo, getPromoCode, updatePromo } from "@/lib/admin-store";
import { parseJsonBody, updatePromoSchema } from "@/lib/request-validation";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await adminViewerOrResponse(request, "promos.read");
  if (context instanceof NextResponse) return context;
  try { const { id } = await params; return NextResponse.json(await getPromoCode(id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return adminErrorResponse(error, request); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await adminViewerOrResponse(request, "promos.update", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, updatePromoSchema);
  if (!parsed.ok) return parsed.response;
  try { const { id } = await params; return NextResponse.json(await updatePromo({ context, request, promoId: id, data: parsed.data })); }
  catch (error) { return adminErrorResponse(error, request); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await adminViewerOrResponse(request, "promos.update", true);
  if (context instanceof NextResponse) return context;
  try { const { id } = await params; return NextResponse.json(await deletePromo({ context, request, promoId: id })); }
  catch (error) { return adminErrorResponse(error, request); }
}
