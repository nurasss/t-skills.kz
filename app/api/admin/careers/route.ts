import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { listCareerCatalog, upsertCareerEntry } from "@/lib/admin-store";
import { careerEntrySchema, parseJsonBody } from "@/lib/request-validation";

export async function GET(request: Request) {
  const context = await adminViewerOrResponse(request, "careers.read");
  if (context instanceof NextResponse) return context;
  try { return NextResponse.json(await listCareerCatalog(request), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return adminErrorResponse(error, request); }
}

export async function POST(request: Request) {
  const context = await adminViewerOrResponse(request, "careers.edit", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, careerEntrySchema);
  if (!parsed.ok) return parsed.response;
  try { return NextResponse.json(await upsertCareerEntry({ context, request, data: parsed.data }), { status: 201 }); }
  catch (error) { return adminErrorResponse(error, request); }
}
