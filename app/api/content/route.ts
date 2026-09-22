import { NextResponse } from "next/server";

import { adminErrorResponse } from "@/lib/admin-rbac";
import { listContent } from "@/lib/admin-store";

export async function GET(request: Request) {
  try {
    return NextResponse.json(await listContent(request, true), { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    return adminErrorResponse(error, request);
  }
}
