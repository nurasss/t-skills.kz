import { NextResponse } from "next/server";

import { newAuthToken, sessionTokenHash, trustedAppBaseUrl } from "@/lib/app-auth";
import { getD1 } from "@/db";
import { checkAuthRateLimit } from "@/lib/auth-rate-limit";
import { sendTransactionalEmail } from "@/lib/email";
import { adminInviteSchema, parseJsonBody } from "@/lib/request-validation";
import { buildAuthActionUrl } from "@/lib/auth-links";
import { EMAIL_STRINGS, resolveEmailLocale } from "@/lib/site-strings";
import { adminErrorResponse, adminRateLimitResponse, adminViewerOrResponse, writeAdminAudit } from "@/lib/admin-rbac";

export async function POST(request: Request) {
  const context = await adminViewerOrResponse(request, "admins.manage", true);
  if (context instanceof NextResponse) return context;
  const parsed = await parseJsonBody(request, adminInviteSchema);
  if (!parsed.ok) return parsed.response;
  const rate = await checkAuthRateLimit(request, "admin-invite", 20, 15 * 60 * 1000, context.viewer.userId);
  if (!rate.allowed) return adminRateLimitResponse(request, rate.retryAfterSeconds);
  try {
    const token = newAuthToken();
    const database = getD1();
    await database.prepare(`INSERT INTO auth_invites (token_hash, email, created_by, created_at, expires_at, used_at) VALUES (?, ?, ?, ?, ?, NULL)`).bind(await sessionTokenHash(token), parsed.data.email, context.viewer.userId, Date.now(), Date.now() + 7 * 24 * 60 * 60 * 1000).run();
    await writeAdminAudit({ context, request, action: "ADMIN_INVITE_CREATED", entityType: "auth_invite", metadata: { emailDomain: parsed.data.email.split("@").pop()?.toLowerCase() ?? "" } });
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
    return adminErrorResponse(error, request);
  }
}
