import { NextResponse } from "next/server";

import { createAuthToken, registrationRequiresInvite, safeReturnTo, sessionTokenHash, trustedAppBaseUrl } from "@/lib/app-auth";
import { getD1 } from "@/db";
import { errorResponse, rateLimitResponse, sameOriginOrResponse } from "@/lib/api-response";
import { checkAuthRateLimit } from "@/lib/auth-rate-limit";
import { EmailDeliveryError, sendTransactionalEmail } from "@/lib/email";
import { hashPassword, validatePassword } from "@/lib/password";
import { authRegisterSchema, parseJsonBody } from "@/lib/request-validation";
import { PRIVACY_DOCUMENT_VERSION, TERMS_DOCUMENT_VERSION } from "@/lib/legal-documents";
import { buildAuthActionUrl } from "@/lib/auth-links";

export async function POST(request: Request) {
  const originError = sameOriginOrResponse(request, { requireCsrf: true });
  if (originError) return originError;
  const parsed = await parseJsonBody(request, authRegisterSchema);
  if (!parsed.ok) return parsed.response;
  const { email, password, invite_token: inviteToken, return_to: returnTo } = parsed.data;
  const destination = safeReturnTo(returnTo);
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: "PASSWORD_INVALID", message: passwordError }, { status: 422, headers: { "Cache-Control": "no-store" } });
  const rate = await checkAuthRateLimit(request, "register", 5, 15 * 60 * 1000, email);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);

  try {
    const database = getD1();
    let invite: { token_hash: string; email: string } | null = null;
    if (registrationRequiresInvite()) {
      if (!inviteToken) return NextResponse.json({ error: "INVITE_REQUIRED", message: "Для регистрации нужен персональный код приглашения." }, { status: 403, headers: { "Cache-Control": "no-store" } });
      invite = await database
        .prepare(`SELECT token_hash, email FROM auth_invites WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? LIMIT 1`)
        .bind(await sessionTokenHash(inviteToken), Date.now())
        .first<{ token_hash: string; email: string }>();
      if (!invite || invite.email !== email) return NextResponse.json({ error: "INVITE_INVALID", message: "Код приглашения недействителен." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }

    const existing = await database
      .prepare(`SELECT u.id, c.user_id AS credential_user_id, c.email_verified_at FROM users u LEFT JOIN auth_credentials c ON c.user_id = u.id WHERE lower(u.email) = ? AND u.deleted_at IS NULL LIMIT 1`)
      .bind(email)
      .first<{ id: string; credential_user_id: string | null; email_verified_at: number | null }>();
    if (existing?.email_verified_at) {
      return NextResponse.json({ ok: true, message: "Если адрес зарегистрирован, дальнейшие инструкции уже доступны на e-mail.", redirect_to: destination }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }

    const userId = existing?.id ?? `usr_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
    const passwordHash = await hashPassword(password);
    const timestamp = Date.now();
    if (existing) {
      const statements = [
        database.prepare(`UPDATE users SET status = 'active', updated_at = ? WHERE id = ? AND deleted_at IS NULL`).bind(timestamp, userId),
        existing.credential_user_id
          ? database.prepare(`UPDATE auth_credentials SET password_hash = ?, password_algorithm = 'pbkdf2-sha256$v1', failed_attempts = 0, locked_until = NULL, terms_accepted_at = ?, privacy_accepted_at = ?, legal_version = ?, updated_at = ? WHERE user_id = ?`).bind(passwordHash, timestamp, timestamp, `${TERMS_DOCUMENT_VERSION};${PRIVACY_DOCUMENT_VERSION}`, timestamp, userId)
          : database.prepare(`INSERT INTO auth_credentials (user_id, password_hash, password_algorithm, email_verified_at, failed_attempts, locked_until, terms_accepted_at, privacy_accepted_at, legal_version, created_at, updated_at) VALUES (?, ?, 'pbkdf2-sha256$v1', NULL, 0, NULL, ?, ?, ?, ?, ?)`).bind(userId, passwordHash, timestamp, timestamp, `${TERMS_DOCUMENT_VERSION};${PRIVACY_DOCUMENT_VERSION}`, timestamp, timestamp),
      ];
      await database.batch(statements);
    } else {
      await database.batch([
        database.prepare(`INSERT INTO users (id, email, full_name, role, status, locale, created_at, updated_at, deleted_at) VALUES (?, ?, NULL, 'user', 'active', 'ru', ?, ?, NULL)`).bind(userId, email, timestamp, timestamp),
        database.prepare(`INSERT INTO auth_credentials (user_id, password_hash, password_algorithm, email_verified_at, failed_attempts, locked_until, terms_accepted_at, privacy_accepted_at, legal_version, created_at, updated_at) VALUES (?, ?, 'pbkdf2-sha256$v1', NULL, 0, NULL, ?, ?, ?, ?, ?)`).bind(userId, passwordHash, timestamp, timestamp, `${TERMS_DOCUMENT_VERSION};${PRIVACY_DOCUMENT_VERSION}`, timestamp, timestamp),
      ]);
    }

    const token = await createAuthToken(userId, "email-verification", 24 * 60 * 60);
    const verifyUrl = buildAuthActionUrl(trustedAppBaseUrl(request), "verify", token);
    let delivery = { delivered: false };
    try {
      delivery = await sendTransactionalEmail({
        to: email,
        subject: "Подтвердите e-mail для T-Skills",
        text: "Подтвердите адрес электронной почты, чтобы войти в T-Skills. Ссылка действует 24 часа.",
        actionLabel: "Подтвердить e-mail",
        actionUrl: verifyUrl,
      });
    } catch (error) {
      if (!(error instanceof EmailDeliveryError)) throw error;
      console.error("registration_email_delivery_failed", { error_code: "EMAIL_DELIVERY_FAILED" });
    }
    if (invite) {
      await database.prepare(`UPDATE auth_invites SET used_at = ? WHERE token_hash = ? AND used_at IS NULL`).bind(Date.now(), invite.token_hash).run();
    }
    return NextResponse.json({
      ok: true,
      delivered: delivery.delivered,
      message: "Если регистрация доступна, мы отправили инструкции на указанный адрес.",
      redirect_to: destination,
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
