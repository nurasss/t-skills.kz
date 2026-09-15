import { NextResponse } from "next/server";

import { errorResponse, isResponse, viewerOrResponse } from "@/lib/api-response";
import { deleteAccount } from "@/lib/durable-store";

export async function POST(request: Request) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  try {
    const body = (await request.json()) as { confirm?: string };
    if (body.confirm !== "DELETE") return NextResponse.json({ error: "DELETE_CONFIRMATION_REQUIRED" }, { status: 422 });
    return NextResponse.json(await deleteAccount(viewer));
  } catch (error) {
    return errorResponse(error);
  }
}

