import { NextResponse } from "next/server";

import { consentSession, getSession } from "@/lib/api-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ id: session.id, state: session.state, versions: session.versions, next_item_id: "Q001", core_answered: Object.keys(session.responses).filter((itemId) => Number(itemId.slice(1)) <= 250).length, adaptive_item_ids: session.adaptiveItemIds, updated_at: session.updatedAt });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: { consented?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  if (!body.consented) return NextResponse.json({ error: "CONSENT_REQUIRED" }, { status: 422 });
  const session = consentSession(id);
  if (!session) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ id: session.id, state: session.state });
}
