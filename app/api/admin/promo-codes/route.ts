import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { createPromo, listPromoCodes } from "@/lib/admin-store";
import { createPromoSchema, parseJsonBody } from "@/lib/request-validation";

export async function GET(request: Request) {
  const context = await adminViewerOrResponse(request, "promos.read");
  if (context instanceof NextResponse) return context;
  try { return NextResponse.json(await listPromoCodes(request), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return adminErrorResponse(error, request); }
}

export async function POST(request: Request) {
  const context = await adminViewerOrResponse(request, "promos.create", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, createPromoSchema);
  if (!parsed.ok) return parsed.response;
  try { return NextResponse.json(await createPromo({ context, request, data: parsed.data }), { status: 201 }); }
  catch (error) { return adminErrorResponse(error, request); }
}
