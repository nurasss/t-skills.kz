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

export function errorResponse(error: unknown) {
  if (error instanceof StoreError || error instanceof PaymentProviderError || error instanceof ReportProviderError) {
    const status = error instanceof StoreError ? error.status : 503;
    return NextResponse.json({ error: error.code, message: publicMessage(error.code) }, { status });
  }
  console.error("api_request_failed", error);
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
    DATABASE_UNAVAILABLE: "Хранилище временно недоступно. Ответы не потеряны на устройстве.",
    ACCOUNT_DELETED: "Аккаунт удалён. Восстановить эту сессию нельзя.",
    ORDER_NOT_FOUND: "Заказ не найден.",
    SESSION_NOT_FOUND: "Сессия не найдена или больше недоступна.",
    SESSION_NOT_ACCEPTING_RESPONSES: "Сессия больше не принимает ответы.",
    ITEM_NOT_ALLOWED: "Этот вопрос не входит в текущую сессию.",
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
  };
  return messages[code] ?? "Запрос не выполнен.";
}
