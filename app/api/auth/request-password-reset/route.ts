import { NextResponse } from "next/server";

import { createAuthToken, trustedAppBaseUrl } from "@/lib/app-auth";
import { getD1 } from "@/db";
import { errorResponse, rateLimitResponse, sameOriginOrResponse } from "@/lib/api-response";
import { checkAuthRateLimit } from "@/lib/auth-rate-limit";
import { EmailDeliveryError, sendTransactionalEmail } from "@/lib/email";
import { parseJsonBody, passwordResetRequestSchema } from "@/lib/request-validation";
import { buildAuthActionUrl } from "@/lib/auth-links";

const GENERIC_MESSAGE = "Если аккаунт с таким адресом существует, мы отправили инструкции по восстановлению.";

export async function POST(request: Request) {
  const originError = sameOriginOrResponse(request, { requireCsrf: true });
  if (originError) return originError;
  const parsed = await parseJsonBody(request, passwordResetRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { email } = parsed.data;
  const rate = await checkAuthRateLimit(request, "password-reset", 5, 15 * 60 * 1000, email);
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
  try {
    const row = await getD1()
      .prepare(`SELECT u.id FROM users u JOIN auth_credentials c ON c.user_id = u.id WHERE lower(u.email) = ? AND u.deleted_at IS NULL AND u.status = 'active' AND c.email_verified_at IS NOT NULL LIMIT 1`)
      .bind(email)
      .first<{ id: string }>();
    if (row) {
      const token = await createAuthToken(row.id, "password-reset", 60 * 60);
      try {
        await sendTransactionalEmail({
          to: email,
          subject: "Сброс пароля T-Skills",
          text: "Мы получили запрос на сброс пароля. Если это были вы, ссылка действует 1 час.",
          actionLabel: "Создать новый пароль",
          actionUrl: buildAuthActionUrl(trustedAppBaseUrl(request), "reset", token),
        });
      } catch (error) {
        if (!(error instanceof EmailDeliveryError)) throw error;
        console.error("password_reset_email_delivery_failed", { error_code: "EMAIL_DELIVERY_FAILED" });
      }
    }
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
