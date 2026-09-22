import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { assignAdminRole, listAdmins, revokeAdminRole } from "@/lib/admin-store";
import { adminRoleAssignmentSchema, parseJsonBody } from "@/lib/request-validation";

export async function GET(request: Request) {
  const context = await adminViewerOrResponse(request, "admins.read");
  if (context instanceof NextResponse) return context;
  try { return NextResponse.json(await listAdmins(request), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return adminErrorResponse(error, request); }
}

export async function POST(request: Request) {
  const context = await adminViewerOrResponse(request, "admins.manage", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, adminRoleAssignmentSchema);
  if (!parsed.ok) return parsed.response;
  try { return NextResponse.json(await assignAdminRole({ context, request, data: parsed.data }), { status: 201 }); }
  catch (error) { return adminErrorResponse(error, request); }
}

export async function DELETE(request: Request) {
  const context = await adminViewerOrResponse(request, "admins.manage", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, adminRoleAssignmentSchema);
  if (!parsed.ok) return parsed.response;
  try { return NextResponse.json(await revokeAdminRole({ context, request, data: parsed.data })); }
  catch (error) { return adminErrorResponse(error, request); }
}
