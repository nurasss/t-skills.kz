import { NextResponse } from "next/server";

import { viewerFromRequestAsync } from "@/lib/server-auth";

export async function GET(request: Request) {
  const viewer = await viewerFromRequestAsync(request);
  if (!viewer) return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ authenticated: true, user: { id: viewer.userId, email: viewer.email, displayName: viewer.displayName, role: viewer.role ?? "user" } }, { headers: { "Cache-Control": "no-store" } });
}
