import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { getAdminOverview } from "@/lib/admin-store";

export async function GET(request: Request) {
  const context = await adminViewerOrResponse(request, "dashboard.read");
  if (context instanceof NextResponse) return context;
  try {
    return NextResponse.json(await getAdminOverview(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminErrorResponse(error, request);
  }
}
