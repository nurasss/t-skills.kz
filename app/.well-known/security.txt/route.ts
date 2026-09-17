import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getRuntimeEnv();
  const contact = env.SECURITY_CONTACT_EMAIL?.trim();
  if (!contact || /[\r\n]/.test(contact) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return new NextResponse("security.txt is not configured.\n", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const canonicalOrigin = env.APP_BASE_URL?.trim().replace(/\/$/, "");
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  const lines = [
    `Contact: mailto:${contact}`,
    `Expires: ${expires}`,
    "Preferred-Languages: ru, en",
    ...(canonicalOrigin ? [`Canonical: ${canonicalOrigin}/.well-known/security.txt`] : []),
  ];
  return new NextResponse(`${lines.join("\n")}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
