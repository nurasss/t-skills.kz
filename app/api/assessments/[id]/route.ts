import { NextResponse } from "next/server";

import { errorResponse, isResponse, viewerOrResponse } from "@/lib/api-response";
import { consentSessionForUser, getSessionForUser } from "@/lib/durable-store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  try {
    const session = await getSessionForUser(id, viewer);
    if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({
      id: session.id,
      state: session.state,
      versions: session.versions,
      next_item_id: session.responses.Q001 === undefined ? "Q001" : null,
      core_answered: Object.keys(session.responses).filter((itemId) => Number(itemId.slice(1)) <= 250).length,
      adaptive_item_ids: session.adaptiveItemIds,
      response_count: Object.keys(session.responses).length,
      responses: session.responses,
      response_times: session.responseTimes,
      profile: session.profile ?? null,
      report_id: session.reportId ?? null,
      updated_at: session.updatedAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  let body: { consented?: boolean };
  try {
    body = (await request.json()) as { consented?: boolean };
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (!body.consented) return NextResponse.json({ error: "CONSENT_REQUIRED" }, { status: 422 });
  try {
    const session = await consentSessionForUser(id, viewer);
    return NextResponse.json({ id: session.id, state: session.state });
  } catch (error) {
    return errorResponse(error);
  }
}
