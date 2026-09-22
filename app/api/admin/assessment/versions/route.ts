import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { createAssessmentVersion, listAssessmentVersions } from "@/lib/admin-store";
import { assessmentVersionCreateSchema, parseJsonBody } from "@/lib/request-validation";

export async function GET(request: Request) {
  const context = await adminViewerOrResponse(request, "assessment.read");
  if (context instanceof NextResponse) return context;
  try { return NextResponse.json(await listAssessmentVersions(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return adminErrorResponse(error, request); }
}

export async function POST(request: Request) {
  const context = await adminViewerOrResponse(request, "assessment.create_version", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, assessmentVersionCreateSchema);
  if (!parsed.ok) return parsed.response;
  try { return NextResponse.json(await createAssessmentVersion({ context, request, data: parsed.data }), { status: 201 }); }
  catch (error) { return adminErrorResponse(error, request); }
}
