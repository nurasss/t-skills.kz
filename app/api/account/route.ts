import { NextResponse } from "next/server";

import { errorResponse, isResponse, viewerOrResponse } from "@/lib/api-response";
import { getAccountOverview } from "@/lib/durable-store";

export async function GET(request: Request) {
  const viewer = viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  try {
    return NextResponse.json(await getAccountOverview(viewer));
  } catch (error) {
    return errorResponse(error);
  }
}

