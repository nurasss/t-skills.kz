import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit, validatePromoForViewer } from "@/lib/durable-store";
import { parseJsonBody } from "@/lib/request-validation";
import { isSupportedTestId, T_SKILLS_TEST_ID } from "@/lib/t-skills/versions";
import { maintenanceModeEnabled } from "@/lib/feature-flags";

const validatePromoSchema = z.object({
  code: z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/, "Неверный формат промокода"),
  test_id: z.string().trim().max(64).optional(),
}).strict();

export async function POST(request: Request) {
  if (await maintenanceModeEnabled()) {
    return NextResponse.json(
      { error: "MAINTENANCE_MODE" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } },
    );
  }
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;

  const parsed = await parseJsonBody(request, validatePromoSchema);
  if (!parsed.ok) return parsed.response;

  const body = parsed.data;
  const testId = body.test_id ?? T_SKILLS_TEST_ID;
  if (!isSupportedTestId(testId)) {
    return NextResponse.json(
      { error: "TEST_NOT_FOUND" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const rate = await consumeRateLimit({
      userId: viewer.userId,
      scope: "promo-validate",
      limit: 10,
      windowMs: 5 * 60 * 1000,
    });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

    const result = await validatePromoForViewer({
      viewer,
      code: body.code,
      testId,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
