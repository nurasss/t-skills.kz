import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { completeCoreForUser, consumeRateLimit } from "@/lib/durable-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const { id } = await params;
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "complete-core", limit: 5, windowMs: 10 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const result = await completeCoreForUser(id, viewer);
    return NextResponse.json({ state: result.session.state, preliminary_score: result.session.profile, adaptive: result.selection, adaptive_items: result.session.adaptiveItems, adaptive_run: result.run ?? null, reused: result.reused });
  } catch (error) {
    return errorResponse(error);
  }
}
