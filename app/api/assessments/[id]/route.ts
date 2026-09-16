import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit, consentSessionForUser, deleteAssessmentForUser, getConsentsForUser, getSessionForUser, nextItemIdForSession, type ConsentChoices } from "@/lib/durable-store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  try {
    const session = await getSessionForUser(id, viewer);
    if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    const consents = await getConsentsForUser(id, viewer);
    return NextResponse.json({
      id: session.id,
      state: session.state,
      selection_mode: session.selectionMode ?? null,
      locale: session.locale,
      versions: session.versions,
      next_item_id: nextItemIdForSession(session),
      core_answered: Object.keys(session.responses).filter((itemId) => Number(itemId.slice(1)) <= 250).length,
      adaptive_item_ids: session.adaptiveItemIds,
      response_count: Object.keys(session.responses).length,
      responses: session.responses,
      response_times: session.responseTimes,
      profile: session.profile ?? null,
      report_id: session.reportId ?? null,
      consents,
      updated_at: session.updatedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const { id } = await params;
  let body: { consented?: unknown; consents?: Partial<Record<keyof ConsentChoices, unknown>> };
  try {
    body = (await request.json()) as { consented?: unknown; consents?: Partial<Record<keyof ConsentChoices, unknown>> };
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const raw = body.consents;
  const choices: ConsentChoices = raw
    ? {
        terms: raw.terms === true,
        privacy: raw.privacy === true,
        research: raw.research === true,
        marketing: raw.marketing === true,
      }
    : { terms: body.consented === true, privacy: body.consented === true, research: false, marketing: false };
  if (raw && Object.values(raw).some((value) => typeof value !== "boolean")) {
    return NextResponse.json({ error: "INVALID_CONSENT_PAYLOAD" }, { status: 422 });
  }
  if (!choices.terms || !choices.privacy) return NextResponse.json({ error: "CONSENT_REQUIRED" }, { status: 422 });
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "consent", limit: 5, windowMs: 15 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const session = await consentSessionForUser(id, viewer, choices);
    return NextResponse.json({ id: session.id, state: session.state, consents: await getConsentsForUser(id, viewer) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const { id } = await params;
  try {
    const body = (await request.json()) as { confirm?: string };
    if (body.confirm !== "DELETE_ASSESSMENT") {
      return NextResponse.json({ error: "ASSESSMENT_DELETE_CONFIRMATION_REQUIRED" }, { status: 422 });
    }
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "privacy-assessment-delete", limit: 3, windowMs: 24 * 60 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    return NextResponse.json(await deleteAssessmentForUser(id, viewer));
  } catch (error) {
    return errorResponse(error);
  }
}
