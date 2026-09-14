import { NextResponse } from "next/server";

import { createAssessment } from "@/lib/api-store";

export async function POST(request: Request) {
  let body: { user_id?: string; test_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Preview defaults keep the contract easy to exercise.
  }
  const session = createAssessment({ userId: body.user_id, testId: body.test_id });
  return NextResponse.json({ id: session.id, state: session.state, versions: session.versions, next_item_id: "Q001" }, { status: 201 });
}
