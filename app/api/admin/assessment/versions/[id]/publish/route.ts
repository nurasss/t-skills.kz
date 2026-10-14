import { NextResponse } from "next/server";
import { z } from "zod";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { publishAssessmentVersion } from "@/lib/admin-store";
import { parseJsonBody } from "@/lib/request-validation";

const publishSchema = z.object({ reason: z.string().trim().min(1).max(2_000) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await adminViewerOrResponse(request, "assessment.publish", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, publishSchema);
  if (!parsed.ok) return parsed.response;
  try { const { id } = await params; return NextResponse.json(await publishAssessmentVersion({ context, request, versionId: id, reason: parsed.data.reason })); }
  catch (error) { return adminErrorResponse(error, request); }
}
