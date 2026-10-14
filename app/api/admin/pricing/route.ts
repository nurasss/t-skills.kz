import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { getPricing, updatePricing } from "@/lib/admin-store";
import { parseJsonBody, pricingUpdateSchema } from "@/lib/request-validation";

export async function GET(request: Request) {
  const context = await adminViewerOrResponse(request, "pricing.read");
  if (context instanceof NextResponse) return context;
  try { return NextResponse.json(await getPricing(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return adminErrorResponse(error, request); }
}

export async function PATCH(request: Request) {
  const context = await adminViewerOrResponse(request, "pricing.manage", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, pricingUpdateSchema);
  if (!parsed.ok) return parsed.response;
  try { return NextResponse.json(await updatePricing({ context, request, data: parsed.data })); }
  catch (error) { return adminErrorResponse(error, request); }
}
