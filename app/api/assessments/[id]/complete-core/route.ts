import { NextResponse } from "next/server";

import { completeCore } from "@/lib/api-store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = completeCore(id);
  if (!result) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
  if ("error" in result) return NextResponse.json(result, { status: 422 });
  return NextResponse.json({ state: result.session.state, preliminary_score: result.session.profile, adaptive: result.selection });
}
