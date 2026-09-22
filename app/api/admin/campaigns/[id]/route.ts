import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { getCampaign, updateCampaign } from "@/lib/admin-store";
import { parseJsonBody, updateCampaignSchema } from "@/lib/request-validation";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await adminViewerOrResponse(request, "campaigns.read");
  if (context instanceof NextResponse) return context;
  try { const { id } = await params; return NextResponse.json(await getCampaign(id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return adminErrorResponse(error, request); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await adminViewerOrResponse(request, "campaigns.manage", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, updateCampaignSchema);
  if (!parsed.ok) return parsed.response;
  try { const { id } = await params; return NextResponse.json(await updateCampaign({ context, request, campaignId: id, data: parsed.data })); }
  catch (error) { return adminErrorResponse(error, request); }
}
