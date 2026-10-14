import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit, consentSessionForUser, coreAnsweredForSession, deleteAssessmentForUser, getConsentsForUser, getOnboardingForUser, getSessionForUser, nextItemIdForSession, type ConsentChoices } from "@/lib/durable-store";
import { assessmentConsentSchema, assessmentDeleteSchema, parseJsonBody } from "@/lib/request-validation";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  try {
    const session = await getSessionForUser(id, viewer);
    if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const consents = await getConsentsForUser(id, viewer);
    const onboarding = await getOnboardingForUser(id, viewer);
    return NextResponse.json({
      id: session.id,
      state: session.state,
      selection_mode: session.selectionMode ?? null,
      locale: session.locale,
      versions: session.versions,
      next_item_id: nextItemIdForSession(session),
      core_answered: coreAnsweredForSession(session),
      adaptive_item_ids: session.adaptiveItemIds,
      adaptive_items: session.adaptiveItems,
      adaptive_generation_status: session.adaptiveGenerationStatus ?? null,
      adaptive_fallback_used: session.adaptiveFallbackUsed ?? false,
      response_count: Object.keys(session.responses).length,
      responses: session.responses,
      response_times: session.responseTimes,
      profile: session.profile ?? null,
      report_id: session.reportId ?? null,
      consents,
      onboarding,
      updated_at: session.updatedAt,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const { id } = await params;
  const parsed = await parseJsonBody(request, assessmentConsentSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const raw = body.consents;
  const choices: ConsentChoices = raw
    ? {
        terms: raw.terms === true,
        privacy: raw.privacy === true,
        research: raw.research === true,
        marketing: raw.marketing === true,
      }
    : { terms: body.consented === true, privacy: body.consented === true, research: false, marketing: false };
  if (!choices.terms || !choices.privacy) return NextResponse.json({ error: "CONSENT_REQUIRED" }, { status: 422, headers: { "Cache-Control": "no-store" } });
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "consent", limit: 5, windowMs: 15 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const session = await consentSessionForUser(id, viewer, choices);
    return NextResponse.json({ id: session.id, state: session.state, consents: await getConsentsForUser(id, viewer) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const { id } = await params;
  try {
    const parsed = await parseJsonBody(request, assessmentDeleteSchema);
    if (!parsed.ok) return parsed.response;
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "privacy-assessment-delete", limit: 3, windowMs: 24 * 60 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    return NextResponse.json(await deleteAssessmentForUser(id, viewer), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
