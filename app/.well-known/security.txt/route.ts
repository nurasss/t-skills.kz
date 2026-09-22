import { getRuntimeEnv } from "@/db";

export const dynamic = "force-dynamic";

/**
 * RFC 9116 security.txt. Отдаёт контакт, только если он настроен
 * (SECURITY_CONTACT_EMAIL); иначе корректный 404, а не заглушка.
 */
export async function GET() {
  const contact = getRuntimeEnv().SECURITY_CONTACT_EMAIL?.trim();
  if (!contact) {
    return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const body = `Contact: mailto:${contact}\nExpires: 2027-09-20T00:00:00.000Z\n`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
