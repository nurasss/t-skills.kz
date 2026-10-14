import { NextResponse } from "next/server";

import { clearCsrfCookie, clearSessionCookie, revokeSession } from "@/lib/app-auth";
import { sameOriginOrResponse } from "@/lib/api-response";

export async function POST(request: Request) {
  const originError = sameOriginOrResponse(request, { requireCsrf: true });
  if (originError) return originError;
  await revokeSession(request).catch(() => undefined);
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  clearSessionCookie(response);
  clearCsrfCookie(response);
  return response;
}
