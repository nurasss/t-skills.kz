import { NextResponse } from "next/server";

import { createCsrfToken, setCsrfCookie } from "@/lib/app-auth";

export async function GET() {
  const token = await createCsrfToken();
  const response = NextResponse.json({ csrf_token: token }, { headers: { "Cache-Control": "no-store" } });
  setCsrfCookie(response, token);
  return response;
}
