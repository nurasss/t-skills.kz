import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit, deleteAccount } from "@/lib/durable-store";

export async function POST(request: Request) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  try {
    const body = (await request.json()) as { confirm?: string };
    if (body.confirm !== "DELETE") return NextResponse.json({ error: "DELETE_CONFIRMATION_REQUIRED" }, { status: 422 });
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "privacy-delete", limit: 1, windowMs: 24 * 60 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    return NextResponse.json(await deleteAccount(viewer));
  } catch (error) {
    return errorResponse(error);
  }
}
