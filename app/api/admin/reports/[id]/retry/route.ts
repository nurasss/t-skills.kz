import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { retryReport } from "@/lib/admin-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await adminViewerOrResponse(request, "reports.retry", true);
  if (context instanceof NextResponse) return context;
  try { const { id } = await params; return NextResponse.json(await retryReport({ context, request, reportId: id })); }
  catch (error) { return adminErrorResponse(error, request); }
}
