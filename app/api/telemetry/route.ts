import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit, recordTelemetry } from "@/lib/durable-store";
import { parseJsonBody, telemetrySchema } from "@/lib/request-validation";

export async function POST(request: Request) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "telemetry", limit: 120, windowMs: 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const parsed = await parseJsonBody(request, telemetrySchema, 16 * 1024);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    return NextResponse.json(await recordTelemetry({ viewer, name: body.name, assessmentId: body.assessment_id, metadata: body.metadata }));
  } catch (error) {
    return errorResponse(error);
  }
}
