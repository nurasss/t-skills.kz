import { NextResponse } from "next/server";

import { errorResponse, isResponse, viewerOrResponse } from "@/lib/api-response";
import { completeCoreForUser } from "@/lib/durable-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  try {
    const result = await completeCoreForUser(id, viewer);
    return NextResponse.json({ state: result.session.state, preliminary_score: result.session.profile, adaptive: result.selection, adaptive_run: result.run ?? null, reused: result.reused });
  } catch (error) {
    return errorResponse(error);
  }
}
