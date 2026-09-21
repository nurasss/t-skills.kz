import { NextResponse } from "next/server";

import { newAuthToken, sessionTokenHash, trustedAppBaseUrl } from "@/lib/app-auth";
import { getD1 } from "@/db";
import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { checkAuthRateLimit } from "@/lib/auth-rate-limit";
import { sendTransactionalEmail } from "@/lib/email";
import { adminInviteSchema, parseJsonBody } from "@/lib/request-validation";
import { isAdmin } from "@/lib/server-auth";
import { buildAuthActionUrl } from "@/lib/auth-links";
import { EMAIL_STRINGS, resolveEmailLocale } from "@/lib/site-strings";

export async function POST(request: Request) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  if (!isAdmin(viewer)) return NextResponse.json({ error: "ADMIN_REQUIRED", message: "Недостаточно прав." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const parsed = await parseJsonBody(request, adminInviteSchema);
  if (!parsed.ok) return parsed.response;
  const rate = await checkAuthRateLimit(request, "admin-invite", 20, 15 * 60 * 1000, viewer.userId);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
  try {
    const token = newAuthToken();
    const database = getD1();
    await database.prepare(`INSERT INTO auth_invites (token_hash, email, created_by, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)`).bind(await sessionTokenHash(token), parsed.data.email, viewer.userId, Date.now(), Date.now() + 7 * 24 * 60 * 60 * 1000).run();
    const em = EMAIL_STRINGS[resolveEmailLocale((parsed.data as { locale?: unknown }).locale)];
    await sendTransactionalEmail({
      to: parsed.data.email,
      subject: em.inviteSubject,
      text: em.inviteText,
      actionLabel: em.inviteAction,
      actionUrl: buildAuthActionUrl(trustedAppBaseUrl(request), "register", token),
    });
    return NextResponse.json({ ok: true, message: "Приглашение отправлено." }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
