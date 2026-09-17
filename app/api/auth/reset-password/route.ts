import { NextResponse } from "next/server";

import { findAuthToken, newAuthToken, revokeAllSessions } from "@/lib/app-auth";
import { getD1 } from "@/db";
import { errorResponse, rateLimitResponse, sameOriginOrResponse } from "@/lib/api-response";
import { checkAuthRateLimit } from "@/lib/auth-rate-limit";
import { hashPassword, validatePassword } from "@/lib/password";
import { parseJsonBody, passwordResetSchema } from "@/lib/request-validation";

export async function POST(request: Request) {
  const originError = sameOriginOrResponse(request, { requireCsrf: true });
  if (originError) return originError;
  const parsed = await parseJsonBody(request, passwordResetSchema);
  if (!parsed.ok) return parsed.response;
  const { token, password } = parsed.data;
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: "PASSWORD_INVALID", message: passwordError }, { status: 422, headers: { "Cache-Control": "no-store" } });
  const rate = await checkAuthRateLimit(request, "password-reset-submit", 8, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
  try {
    const authToken = await findAuthToken(token, "password-reset");
    if (!authToken) return NextResponse.json({ error: "TOKEN_INVALID", message: "Ссылка сброса недействительна или устарела." }, { status: 422, headers: { "Cache-Control": "no-store" } });
    const passwordHash = await hashPassword(password);
    const database = getD1();
    const consumedAt = Date.now();
    const consumptionNonce = newAuthToken();
    const results = await database.batch([
      database
        .prepare(
          `UPDATE auth_tokens SET used_at = ?, consumption_nonce = ?
           WHERE token_hash = ? AND type = 'password-reset' AND expires_at > ? AND used_at IS NULL
             AND EXISTS (SELECT 1 FROM auth_credentials WHERE user_id = ?)`,
        )
        .bind(consumedAt, consumptionNonce, authToken.token_hash, consumedAt, authToken.user_id),
      database
        .prepare(
          `UPDATE auth_credentials SET password_hash = ?, password_algorithm = 'pbkdf2-sha256$v1', failed_attempts = 0, locked_until = NULL, updated_at = ?
           WHERE user_id = ? AND EXISTS (
             SELECT 1 FROM auth_tokens WHERE token_hash = ? AND type = 'password-reset' AND used_at = ? AND consumption_nonce = ?
           )`,
        )
        .bind(passwordHash, consumedAt, authToken.user_id, authToken.token_hash, consumedAt, consumptionNonce),
      database
        .prepare(`UPDATE auth_tokens SET consumption_nonce = NULL WHERE token_hash = ? AND used_at = ? AND consumption_nonce = ?`)
        .bind(authToken.token_hash, consumedAt, consumptionNonce),
    ]);
    if ((results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1) {
      return NextResponse.json({ error: "TOKEN_INVALID", message: "Ссылка сброса недействительна или уже использована." }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    await revokeAllSessions(authToken.user_id);
    return NextResponse.json({ ok: true, message: "Пароль изменён. Теперь можно войти." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
