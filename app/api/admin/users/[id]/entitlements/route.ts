import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { performUserSupportAction } from "@/lib/admin-store";
import { adminSupportActionSchema, parseJsonBody } from "@/lib/request-validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await adminViewerOrResponse(request, "entitlements.grant", true);
  if (context instanceof NextResponse) return context;
  const body = await request.clone().json().catch(() => null) as Record<string, unknown> | null;
  const parsed = await parseJsonBody(request, adminSupportActionSchema);
  if (!parsed.ok) {
    if (!body?.grant || typeof body.grant !== "object") return parsed.response;
    const fallback = await import("@/lib/request-validation").then(({ grantEntitlementSchema }) => grantEntitlementSchema.safeParse(body.grant));
    if (!fallback.success) return parsed.response;
    const { id } = await params;
    try {
      return NextResponse.json(await performUserSupportAction({ context, request, userId: id, data: { action: "GRANT_ACCESS", grant: fallback.data } }), { status: 201 });
    } catch (error) {
      return adminErrorResponse(error, request);
    }
  }
  const { id } = await params;
  try {
    return NextResponse.json(await performUserSupportAction({ context, request, userId: id, data: parsed.data }), { status: 201 });
  } catch (error) {
    return adminErrorResponse(error, request);
  }
}
