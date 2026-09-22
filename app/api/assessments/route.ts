import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit, createAssessmentForUser, getAccountOverview, nextItemIdForSession } from "@/lib/durable-store";
import { canPublishLocale, resolveLocaleInput } from "@/lib/i18n";
import { assessmentCreateSchema, parseJsonBody } from "@/lib/request-validation";
import { isSupportedTestId, T_SKILLS_TEST_ID } from "@/lib/t-skills/versions";
import { maintenanceModeEnabled } from "@/lib/feature-flags";

export async function GET(request: Request) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  try {
    return NextResponse.json(await getAccountOverview(viewer), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  if (await maintenanceModeEnabled()) return NextResponse.json({ error: "MAINTENANCE_MODE" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "300" } });
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const parsed = await parseJsonBody(request, assessmentCreateSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const testId = body.test_id ?? T_SKILLS_TEST_ID;
  if (!isSupportedTestId(testId)) return NextResponse.json({ error: "TEST_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const locale = resolveLocaleInput(body.locale).locale;
  if (!canPublishLocale(locale)) return NextResponse.json({ error: "LOCALE_NOT_PUBLISHED", locale }, { status: 422, headers: { "Cache-Control": "no-store" } });
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
