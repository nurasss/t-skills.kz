import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { createCampaign, listCampaigns } from "@/lib/admin-store";
import { createCampaignSchema, parseJsonBody } from "@/lib/request-validation";

export async function GET(request: Request) {
  const context = await adminViewerOrResponse(request, "campaigns.read");
  if (context instanceof NextResponse) return context;
  try { return NextResponse.json(await listCampaigns(request), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return adminErrorResponse(error, request); }
}

export async function POST(request: Request) {
  const context = await adminViewerOrResponse(request, "campaigns.manage", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, createCampaignSchema);
  if (!parsed.ok) return parsed.response;
  try { return NextResponse.json(await createCampaign({ context, request, data: parsed.data }), { status: 201 }); }
  catch (error) { return adminErrorResponse(error, request); }
}
