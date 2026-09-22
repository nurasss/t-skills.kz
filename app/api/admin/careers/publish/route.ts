import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { publishCareerCatalog } from "@/lib/admin-store";
import { careerCatalogPublishSchema, parseJsonBody } from "@/lib/request-validation";

export async function POST(request: Request) {
  const context = await adminViewerOrResponse(request, "careers.publish", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, careerCatalogPublishSchema);
  if (!parsed.ok) return parsed.response;
  try { return NextResponse.json(await publishCareerCatalog({ context, request, version: parsed.data.version, reason: parsed.data.reason })); }
  catch (error) { return adminErrorResponse(error, request); }
}
