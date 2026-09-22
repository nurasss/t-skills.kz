import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { performUserSupportAction } from "@/lib/admin-store";
import { grantEntitlementSchema, parseJsonBody } from "@/lib/request-validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await adminViewerOrResponse(request, "entitlements.grant", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, grantEntitlementSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const { id } = await params;
    return NextResponse.json(await performUserSupportAction({ context, request, userId: id, data: { action: "GRANT_ACCESS", grant: parsed.data, reason: parsed.data.reason } }), { status: 201 });
  } catch (error) { return adminErrorResponse(error, request); }
}
