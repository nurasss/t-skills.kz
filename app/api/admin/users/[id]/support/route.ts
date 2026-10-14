import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { StoreError } from "@/lib/durable-store";
import { performUserSupportAction } from "@/lib/admin-store";
import { adminSupportActionSchema, parseJsonBody } from "@/lib/request-validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await adminViewerOrResponse(request, "users.support_actions", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, adminSupportActionSchema);
  if (!parsed.ok) return parsed.response;
  const { id } = await params;
  const requiredPermission = parsed.data.action === "REVOKE_ENTITLEMENT"
    ? "entitlements.revoke"
    : ["GRANT_ACCESS", "ALLOW_RETAKE"].includes(parsed.data.action)
      ? "entitlements.grant"
      : ["BLOCK_ACCOUNT", "UNBLOCK_ACCOUNT"].includes(parsed.data.action)
        ? "users.block"
        : null;
  if (requiredPermission && !context.permissions.has(requiredPermission)) {
    return adminErrorResponse(new StoreError("ADMIN_PERMISSION_REQUIRED", 403), request);
  }
  try {
    return NextResponse.json(await performUserSupportAction({ context, request, userId: id, data: parsed.data }));
  } catch (error) {
    return adminErrorResponse(error, request);
  }
}
