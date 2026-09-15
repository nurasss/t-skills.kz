import { NextResponse } from "next/server";

import { errorResponse, isResponse, viewerOrResponse } from "@/lib/api-response";
import { createAssessmentForUser, getAccountOverview } from "@/lib/durable-store";

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
  let body: { test_id?: string } = {};
  try {
    body = (await request.json()) as { test_id?: string };
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const testId = body.test_id ?? "orbita30";
  if (testId !== "orbita30") return NextResponse.json({ error: "TEST_NOT_FOUND" }, { status: 404 });
  try {
    const result = await createAssessmentForUser({ viewer, testId });
    return NextResponse.json({
      id: result.session.id,
      state: result.session.state,
      versions: result.session.versions,
      next_item_id: result.session.responses.Q001 === undefined ? "Q001" : null,
      reused: result.reused,
    }, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
