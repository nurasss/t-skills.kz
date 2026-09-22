import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { getPromoCode } from "@/lib/admin-store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await adminViewerOrResponse(request, "promos.read");
  if (context instanceof NextResponse) return context;
  try { const { id } = await params; const result = await getPromoCode(id); return NextResponse.json({ data: result.redemptions, stats: result.stats }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return adminErrorResponse(error, request); }
}
