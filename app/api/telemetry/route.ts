import { NextResponse } from "next/server";

import { errorResponse, isResponse, viewerOrResponse } from "@/lib/api-response";
import { recordTelemetry } from "@/lib/durable-store";

export async function POST(request: Request) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  try {
    const body = (await request.json()) as { name?: string; assessment_id?: string; metadata?: Record<string, string | number | boolean | null> };
    if (!body.name) return NextResponse.json({ error: "TELEMETRY_NAME_REQUIRED" }, { status: 422 });
    return NextResponse.json(await recordTelemetry({ viewer, name: body.name, assessmentId: body.assessment_id, metadata: body.metadata }));
  } catch (error) {
    return errorResponse(error);
  }
}

