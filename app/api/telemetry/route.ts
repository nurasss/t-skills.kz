import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit, recordTelemetry } from "@/lib/durable-store";

export async function POST(request: Request) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "telemetry", limit: 120, windowMs: 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const body = (await request.json()) as { name?: string; assessment_id?: string; metadata?: Record<string, unknown> };
    if (!body.name) return NextResponse.json({ error: "TELEMETRY_NAME_REQUIRED" }, { status: 422 });
    return NextResponse.json(await recordTelemetry({ viewer, name: body.name, assessmentId: body.assessment_id, metadata: body.metadata }));
  } catch (error) {
    return errorResponse(error);
  }
}
