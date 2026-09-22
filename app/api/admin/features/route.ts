import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { listFeatures, updateFeature } from "@/lib/admin-store";
import { featureFlagUpdateSchema, parseJsonBody } from "@/lib/request-validation";

export async function GET(request: Request) {
  const context = await adminViewerOrResponse(request, "settings.read");
  if (context instanceof NextResponse) return context;
  try { return NextResponse.json(await listFeatures(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return adminErrorResponse(error, request); }
}

export async function PATCH(request: Request) {
  const context = await adminViewerOrResponse(request, "settings.manage", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, featureFlagUpdateSchema);
  if (!parsed.ok) return parsed.response;
  try { return NextResponse.json(await updateFeature({ context, request, key: parsed.data.key, enabled: parsed.data.enabled, reason: parsed.data.reason })); }
  catch (error) { return adminErrorResponse(error, request); }
}
