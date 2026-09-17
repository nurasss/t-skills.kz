import { NextResponse } from "next/server";

import { createSession, safeReturnTo, setSessionCookie } from "@/lib/app-auth";
import { getD1 } from "@/db";
import { errorResponse, rateLimitResponse, sameOriginOrResponse } from "@/lib/api-response";
import { checkAuthRateLimit } from "@/lib/auth-rate-limit";
import { verifyPassword } from "@/lib/password";
import { authLoginSchema, parseJsonBody } from "@/lib/request-validation";

const GENERIC_LOGIN_ERROR = "Неверный e-mail или пароль.";

export async function POST(request: Request) {
  const originError = sameOriginOrResponse(request, { requireCsrf: true });
  if (originError) return originError;
  const parsed = await parseJsonBody(request, authLoginSchema);
  if (!parsed.ok) return parsed.response;
  const { email, password, return_to: returnTo } = parsed.data;
  const destination = safeReturnTo(returnTo);
  const rate = await checkAuthRateLimit(request, "login", 10, 15 * 60 * 1000, email);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

  try {
    const row = await getD1()
      .prepare(`SELECT u.id, u.status, c.password_hash, c.email_verified_at, c.failed_attempts, c.locked_until FROM users u JOIN auth_credentials c ON c.user_id = u.id WHERE lower(u.email) = ? AND u.deleted_at IS NULL LIMIT 1`)
      .bind(email)
      .first<{ id: string; status: string; password_hash: string; email_verified_at: number | null; failed_attempts: number; locked_until: number | null }>();
    const locked = Boolean(row?.locked_until && row.locked_until > Date.now());
    const validPassword = await verifyPassword(password, row?.password_hash);
    if (!row || row.status !== "active" || locked || !validPassword) {
      if (row && !locked) {
        const failedAt = Date.now();
        const lockUntil = failedAt + 15 * 60 * 1000;
        // Keep the threshold update atomic so concurrent bad attempts cannot
        // overwrite each other's counter with a stale value.
        await getD1().prepare(
          `UPDATE auth_credentials
           SET failed_attempts = CASE WHEN failed_attempts + 1 >= 8 THEN 0 ELSE failed_attempts + 1 END,
               locked_until = CASE WHEN failed_attempts + 1 >= 8 THEN ? ELSE NULL END,
               updated_at = ?
           WHERE user_id = ? AND (locked_until IS NULL OR locked_until <= ?)`,
        ).bind(lockUntil, failedAt, row.id, failedAt).run();
      }
      return NextResponse.json({ error: "AUTH_INVALID", message: GENERIC_LOGIN_ERROR }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    if (!row.email_verified_at) return NextResponse.json({ error: "EMAIL_NOT_VERIFIED", message: "Сначала подтвердите e-mail по ссылке из письма." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    await getD1().prepare(`UPDATE auth_credentials SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE user_id = ?`).bind(Date.now(), row.id).run();
    const token = await createSession(row.id);
    const response = NextResponse.json({ ok: true, redirect_to: destination }, { headers: { "Cache-Control": "no-store" } });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
