import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit, requestDataExport } from "@/lib/durable-store";

export async function POST(request: Request) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "privacy-export", limit: 3, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const result = await requestDataExport(viewer);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
