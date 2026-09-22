import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { restoreContent } from "@/lib/admin-store";
import { contentRestoreSchema, parseJsonBody } from "@/lib/request-validation";

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await adminViewerOrResponse(request, "content.edit", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, contentRestoreSchema);
  if (!parsed.ok) return parsed.response;
  try { const { key } = await params; return NextResponse.json(await restoreContent({ context, request, contentKey: key, data: parsed.data })); }
  catch (error) { return adminErrorResponse(error, request); }
}
