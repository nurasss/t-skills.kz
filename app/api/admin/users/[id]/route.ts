import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { getUserDetail } from "@/lib/admin-store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await adminViewerOrResponse(request, "users.read");
  if (context instanceof NextResponse) return context;
  try {
    const { id } = await params;
    return NextResponse.json(await getUserDetail(id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminErrorResponse(error, request);
  }
}
