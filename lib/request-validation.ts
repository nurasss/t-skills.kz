import { NextResponse } from "next/server";
import { z } from "zod";

export type ParsedBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readRequestText(request: Request, maxBytes: number) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalBytes += result.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(decoder.decode(result.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join("");
  } finally {
    reader.releaseLock();
  }
}

export const authRegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().max(128),
  password_confirmation: z.string().max(128),
  terms_consent: z.boolean().refine((value) => value, "Примите условия использования."),
  privacy_consent: z.boolean().refine((value) => value, "Подтвердите ознакомление с политикой конфиденциальности."),
  invite_token: z.string().trim().max(256).optional(),
  return_to: z.string().trim().max(512).optional(),
}).strict().superRefine((value, context) => {
  if (value.password !== value.password_confirmation) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["password_confirmation"], message: "Пароли не совпадают." });
  }
});

export const authLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().max(128),
  return_to: z.string().trim().max(512).optional(),
}).strict();

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
}).strict();

export const verificationRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
}).strict();

export const emailVerificationSchema = z.object({
  token: z.string().trim().min(32).max(256),
}).strict();

export const passwordResetSchema = z.object({
  token: z.string().trim().min(32).max(256),
  password: z.string().max(128),
  password_confirmation: z.string().max(128),
}).strict().superRefine((value, context) => {
  if (value.password !== value.password_confirmation) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["password_confirmation"], message: "Пароли не совпадают." });
  }
});

export const adminInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
}).strict();

export const assessmentCreateSchema = z.object({
  test_id: z.string().trim().max(64).optional(),
  locale: z.string().trim().max(12).optional(),
}).strict();

export const assessmentConsentSchema = z.object({
  consented: z.boolean().optional(),
  consents: z.object({
    terms: z.boolean(),
    privacy: z.boolean(),
    research: z.boolean(),
    marketing: z.boolean(),
  }).strict().optional(),
}).strict();

export const assessmentDeleteSchema = z.object({ confirm: z.literal("DELETE_ASSESSMENT") }).strict();
export const accountDeleteSchema = z.object({ confirm: z.literal("DELETE") }).strict();

export const responseSaveSchema = z.object({
  item_id: z.string().trim().min(1).max(128),
  response: z.number().int().min(-2).max(7),
  response_time_ms: z.number().int().min(0).max(86_400_000).optional(),
  client_seq: z.number().int().min(0).max(1_000_000).optional(),
}).strict();

export const telemetrySchema = z.object({
  name: z.string().trim().min(1).max(64),
  assessment_id: z.string().trim().min(1).max(128).optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict();

export const internalAdaptiveSchema = z.object({
  responses: z.record(z.number()).optional(),
  answered_item_ids: z.array(z.string().trim().min(1).max(128)).max(500).optional(),
  target_count: z.number().int().min(10).max(15).optional(),
}).strict();

export const retentionSchema = z.object({
  dry_run: z.boolean().optional(),
  limit: z.number().int().min(1).max(1_000).optional(),
  fault_after_artifacts: z.boolean().optional(),
}).strict();

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = 32 * 1024,
): Promise<ParsedBody<T>> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return { ok: false, response: invalidBodyResponse("REQUEST_TOO_LARGE", "Запрос слишком большой.", 413) };
  }

  let raw: string;
  try {
    raw = await readRequestText(request, maxBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return { ok: false, response: invalidBodyResponse("REQUEST_TOO_LARGE", "Запрос слишком большой.", 413) };
    }
    return { ok: false, response: invalidBodyResponse("INVALID_BODY", "Не удалось прочитать запрос.", 400) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, response: invalidBodyResponse("INVALID_JSON", "Некорректный JSON.", 400) };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, response: invalidBodyResponse("INVALID_REQUEST", "Проверьте заполненные поля.", 422) };
  }
  return { ok: true, data: result.data };
}

function invalidBodyResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: code, message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
