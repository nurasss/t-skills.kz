import { NextResponse } from "next/server";

import { createSession, findAuthToken, newAuthToken, setSessionCookie } from "@/lib/app-auth";
import { getD1 } from "@/db";
import { errorResponse, rateLimitResponse, sameOriginOrResponse } from "@/lib/api-response";
import { checkAuthRateLimit } from "@/lib/auth-rate-limit";
import { emailVerificationSchema, parseJsonBody } from "@/lib/request-validation";

export async function POST(request: Request) {
  const originError = sameOriginOrResponse(request, { requireCsrf: true });
  if (originError) return originError;
  const parsed = await parseJsonBody(request, emailVerificationSchema);
  if (!parsed.ok) return parsed.response;
  const { token } = parsed.data;
  const rate = await checkAuthRateLimit(request, "verify", 10, 15 * 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
  try {
    const authToken = await findAuthToken(token, "email-verification");
    if (!authToken) return NextResponse.json({ error: "TOKEN_INVALID", message: "Ссылка подтверждения недействительна или устарела." }, { status: 422, headers: { "Cache-Control": "no-store" } });
    const database = getD1();
    const consumedAt = Date.now();
    const consumptionNonce = newAuthToken();
    const results = await database.batch([
      database
        .prepare(
          `UPDATE auth_tokens SET used_at = ?, consumption_nonce = ?
           WHERE token_hash = ? AND type = 'email-verification' AND expires_at > ? AND used_at IS NULL
             AND EXISTS (
               SELECT 1 FROM auth_credentials c
               JOIN users u ON u.id = c.user_id
               WHERE c.user_id = ? AND u.deleted_at IS NULL
           )`,
        )
        .bind(consumedAt, consumptionNonce, authToken.token_hash, consumedAt, authToken.user_id),
      database
        .prepare(
          `UPDATE auth_credentials SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ?
           WHERE user_id = ? AND EXISTS (
             SELECT 1 FROM auth_tokens WHERE token_hash = ? AND type = 'email-verification' AND used_at = ? AND consumption_nonce = ?
           )`,
        )
        .bind(consumedAt, consumedAt, authToken.user_id, authToken.token_hash, consumedAt, consumptionNonce),
      database
        .prepare(
          `UPDATE users SET status = 'active', updated_at = ?
           WHERE id = ? AND deleted_at IS NULL AND EXISTS (
             SELECT 1 FROM auth_tokens WHERE token_hash = ? AND type = 'email-verification' AND used_at = ? AND consumption_nonce = ?
           )`,
        )
        .bind(consumedAt, authToken.user_id, authToken.token_hash, consumedAt, consumptionNonce),
      database
        .prepare(`UPDATE auth_tokens SET consumption_nonce = NULL WHERE token_hash = ? AND used_at = ? AND consumption_nonce = ?`)
        .bind(authToken.token_hash, consumedAt, consumptionNonce),
    ]);
    if ((results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1 || (results[2]?.meta?.changes ?? 0) !== 1) {
      return NextResponse.json({ error: "TOKEN_INVALID", message: "Ссылка подтверждения недействительна или уже использована." }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    const session = await createSession(authToken.user_id);
    const response = NextResponse.json({ ok: true, redirect_to: "/account" }, { headers: { "Cache-Control": "no-store" } });
    setSessionCookie(response, session);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
