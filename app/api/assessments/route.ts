import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit, createAssessmentForUser, getAccountOverview, nextItemIdForSession } from "@/lib/durable-store";
import { canPublishLocale, resolveLocaleInput } from "@/lib/i18n";

export async function GET(request: Request) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  try {
    return NextResponse.json(await getAccountOverview(viewer));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  let body: { test_id?: string; locale?: string } = {};
  try {
    body = (await request.json()) as { test_id?: string };
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const testId = body.test_id ?? "orbita30";
  if (testId !== "orbita30") return NextResponse.json({ error: "TEST_NOT_FOUND" }, { status: 404 });
  const locale = resolveLocaleInput(body.locale).locale;
  if (!canPublishLocale(locale)) return NextResponse.json({ error: "LOCALE_NOT_PUBLISHED", locale }, { status: 422 });
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "assessment-create", limit: 5, windowMs: 10 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const result = await createAssessmentForUser({ viewer, testId, locale });
    return NextResponse.json({
      id: result.session.id,
      state: result.session.state,
      versions: result.session.versions,
      locale: result.session.locale,
      next_item_id: nextItemIdForSession(result.session),
      reused: result.reused,
    }, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
