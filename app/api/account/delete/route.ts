import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit, deleteAccount } from "@/lib/durable-store";
import { accountDeleteSchema, parseJsonBody } from "@/lib/request-validation";

export async function POST(request: Request) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const parsed = await parseJsonBody(request, accountDeleteSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "privacy-delete", limit: 1, windowMs: 24 * 60 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    return NextResponse.json(await deleteAccount(viewer), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
