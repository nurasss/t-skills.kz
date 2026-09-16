import { NextResponse } from "next/server";

import { PaymentProviderError } from "@/lib/payment-provider";
import { ReportProviderError } from "@/lib/report-provider";
import { StoreError } from "@/lib/durable-store";
import { authError, viewerFromRequest, type Viewer } from "@/lib/server-auth";

export function viewerOrResponse(request: Request): Viewer | NextResponse {
  const viewer = viewerFromRequest(request);
  return viewer ?? NextResponse.json(authError(), { status: 401 });
}

export function isResponse(value: Viewer | NextResponse): value is NextResponse {
  return value instanceof NextResponse;
}

export function sameOriginOrResponse(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) return csrfResponse();
    } catch {
      return csrfResponse();
    }
  }
  if (fetchSite === "cross-site" || fetchSite === "cross-origin") return csrfResponse();
  return null;
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "RATE_LIMITED", message: "Слишком много запросов. Попробуйте ещё раз позже." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" } },
  );
}

function csrfResponse() {
  return NextResponse.json(
    { error: "CSRF_ORIGIN_INVALID", message: "Запрос должен быть отправлен с этого сайта." },
    { status: 403, headers: { "Cache-Control": "no-store", Vary: "Origin" } },
  );
}

export function errorResponse(error: unknown) {
  if (error instanceof StoreError || error instanceof PaymentProviderError || error instanceof ReportProviderError) {
    const status = error instanceof StoreError ? error.status : 503;
    return NextResponse.json({ error: error.code, message: publicMessage(error.code) }, { status });
  }
  const code = error && typeof error === "object" && "code" in error && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "INTERNAL_SERVER_ERROR";
  console.error("api_request_failed", { error_code: code });
  return NextResponse.json({ error: "INTERNAL_SERVER_ERROR", message: "Не удалось выполнить запрос. Попробуйте ещё раз." }, { status: 500 });
}

function publicMessage(code: string) {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: "Войдите через ChatGPT, чтобы продолжить.",
    PAYMENT_REQUIRED: "Для этой оценки нужен оплаченный доступ.",
    PAYMENT_PRICE_NOT_CONFIGURED: "Оплата ещё не настроена для этой версии.",
    PAYMENT_CURRENCY_INVALID: "В настройках оплаты указана некорректная валюта.",
    PAYMENT_PROVIDER_UNSUPPORTED: "Выбранный платёжный провайдер не поддерживается.",
    STRIPE_SECRET_KEY_MISSING: "Платёжный провайдер ещё не настроен.",
    STRIPE_WEBHOOK_SECRET_MISSING: "Webhook провайдера ещё не настроен.",
    STRIPE_SIGNATURE_INVALID: "Подпись платёжного события не прошла проверку.",
    STRIPE_CHECKOUT_FAILED: "Платёжная страница не создалась. Попробуйте ещё раз.",
    STRIPE_RESPONSE_INVALID: "Платёжный провайдер вернул неполный ответ.",
    STRIPE_UNAVAILABLE: "Платёжный провайдер временно недоступен.",
    STRIPE_PAYLOAD_INVALID: "Платёжное событие имеет некорректный формат.",
    PDF_SIGNING_SECRET_MISSING: "Защищённая выдача PDF ещё не настроена.",
    PAYMENT_INTEGRITY_MISMATCH: "Платёжное событие не совпало с заказом и не выдало доступ.",
    PAYMENT_EVENT_REPLAY_MISMATCH: "Повторное платёжное событие не совпадает с исходным payload.",
    DATABASE_UNAVAILABLE: "Хранилище временно недоступно. Ответы не потеряны на устройстве.",
    ACCOUNT_DELETED: "Аккаунт удалён. Восстановить эту сессию нельзя.",
    ORDER_NOT_FOUND: "Заказ не найден.",
    SESSION_NOT_FOUND: "Сессия не найдена или больше недоступна.",
    SESSION_NOT_ACCEPTING_RESPONSES: "Сессия больше не принимает ответы.",
    ITEM_NOT_ALLOWED: "Этот вопрос не входит в текущую сессию.",
    IDEMPOTENCY_KEY_REQUIRED: "Для сохранения ответа нужен ключ повторяемости запроса.",
    IDEMPOTENCY_KEY_INVALID: "Ключ повторяемости запроса имеет некорректный формат.",
    EXPORT_CREATE_FAILED: "Экспорт временно недоступен. Запрос отмечен для повторной обработки.",
    ACCOUNT_DELETE_FAILED: "Удаление аккаунта временно не завершилось. Запрос отмечен для повторной обработки.",
    INVALID_RESPONSE: "Ответ имеет некорректный формат.",
    CORE_INCOMPLETE: "Сначала завершите основной блок вопросов.",
    ADAPTIVE_INCOMPLETE: "Сначала завершите адаптивный блок вопросов.",
    REPORT_NOT_FOUND: "Отчёт не найден.",
    PDF_NOT_READY: "PDF ещё формируется. Обновите страницу через несколько секунд.",
    PDF_NOT_FOUND: "PDF-файл пока недоступен. Попробуйте регенерацию отчёта.",
    PDF_STORAGE_UNAVAILABLE: "Хранилище PDF временно недоступно.",
    REPORT_FAILED_RETRYABLE: "Отчёт не сформирован. Его можно безопасно повторить.",
    OPENAI_API_KEY_MISSING: "Генератор отчёта ещё не настроен.",
    ACCOUNT_ARTIFACT_DELETE_FAILED: "Не удалось полностью удалить файлы аккаунта. Запрос отмечен для повторной обработки.",
    EXPORT_NOT_FOUND: "Запрос экспорта не найден.",
    ADMIN_REQUIRED: "Доступно только allowlisted admin.",
    CONSENT_REQUIRED: "Для продолжения нужны обязательные согласия.",
    CONSENT_NOT_AVAILABLE: "Согласие нельзя изменить на этом этапе сессии.",
    RATE_LIMITED: "Слишком много запросов. Попробуйте ещё раз позже.",
    CSRF_ORIGIN_INVALID: "Запрос должен быть отправлен с этого сайта.",
    TELEMETRY_EVENT_NOT_ALLOWED: "Это событие аналитики не разрешено.",
    LOCALE_NOT_PUBLISHED: "Эта версия языка ещё не опубликована для прохождения оценки.",
    DELETE_CONFIRMATION_REQUIRED: "Для удаления нужна явная команда подтверждения.",
    ASSESSMENT_DELETE_CONFIRMATION_REQUIRED: "Для удаления оценки нужна явная команда подтверждения.",
    ASSESSMENT_DELETE_FAILED: "Не удалось удалить данные оценки. Запрос отмечен для повторной обработки.",
  };
  return messages[code] ?? "Запрос не выполнен.";
}
