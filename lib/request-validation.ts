import { NextResponse } from "next/server";
import { z } from "zod";
import { requestIdFrom } from "@/lib/security-headers";

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
  locale: z.enum(["ru", "kk"]).optional(),
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
  locale: z.enum(["ru", "kk"]).optional(),
}).strict();

export const verificationRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  locale: z.enum(["ru", "kk"]).optional(),
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
  locale: z.enum(["ru", "kk"]).optional(),
}).strict();

const nullableInt = z.number().int().min(0).nullable().optional();
const localeSchema = z.enum(["ru", "kk"]);

export const createPromoSchema = z.object({
  code: z.string().trim().min(3).max(64),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).optional(),
  discount_type: z.enum(["PERCENT", "FIXED_AMOUNT", "FREE_ACCESS"]),
  discount_value: z.number().int().min(0),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/),
  max_total_uses: nullableInt,
  max_uses_per_user: nullableInt,
  valid_from: z.number().int().nullable().optional(),
  valid_until: z.number().int().nullable().optional(),
  minimum_order_amount: nullableInt,
  new_users_only: z.boolean().optional(),
  allowed_test_ids: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  allowed_email_domains: z.array(z.string().trim().min(1).max(254)).max(100).optional(),
  allowed_user_ids: z.array(z.string().trim().min(1).max(128)).max(500).optional(),
  campaign_id: z.string().trim().max(128).nullable().optional(),
}).strict();

export const updatePromoSchema = createPromoSchema.partial().extend({
  status: z.enum(["ACTIVE", "DISABLED", "DRAFT"]).optional(),
  expected_updated_at: z.number().int().optional(),
  reason: z.string().trim().min(1).max(2_000).optional(),
}).strict();

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1).max(200),
  client_name: z.string().trim().min(1).max(200),
  client_type: z.enum(["SCHOOL", "UNIVERSITY", "COMPANY", "PARTNER", "OTHER"]),
  internal_notes: z.string().trim().max(4_000).optional(),
  seat_limit: z.number().int().min(1).max(1_000_000),
  // ONE_PER_ASSESSMENT was never backed by a data model.  Keeping only the
  // implemented policy is safer than silently promising an unenforced one.
  seat_usage_policy: z.literal("ONE_PER_USER").optional(),
  valid_from: z.number().int().nullable().optional(),
  valid_until: z.number().int().nullable().optional(),
  default_test_id: z.string().trim().min(1).max(64),
}).strict();

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: z.enum(["ACTIVE", "DISABLED", "ARCHIVED"]).optional(),
  expected_updated_at: z.number().int().optional(),
  reason: z.string().trim().min(1).max(2_000).optional(),
}).strict();

export const grantEntitlementSchema = z.object({
  test_id: z.string().trim().min(1).max(64),
  reason: z.string().trim().min(1).max(2_000),
  expires_at: z.number().int().nullable().optional(),
  campaign_id: z.string().trim().max(128).nullable().optional(),
  promo_code_id: z.string().trim().max(128).nullable().optional(),
}).strict();

export const adminSupportActionSchema = z.object({
  action: z.enum(["GRANT_ACCESS", "REVOKE_ENTITLEMENT", "ALLOW_RETAKE", "RESEND_REPORT", "INVALIDATE_UNFINISHED", "FORCE_LOGOUT", "BLOCK_ACCOUNT", "UNBLOCK_ACCOUNT"]),
  entitlement_id: z.string().trim().max(128).optional(),
  reason: z.string().trim().max(2_000).optional(),
  grant: grantEntitlementSchema.optional(),
}).strict();

export const contentUpdateSchema = z.object({
  content_key: z.string().trim().min(1).max(160),
  locale: localeSchema,
  payload: z.record(z.unknown()).superRefine((payload, context) => {
    const serialized = JSON.stringify(payload);
    if (serialized.length > 100_000) context.addIssue({ code: z.ZodIssueCode.custom, message: "Content payload is too large." });
  }),
  expected_version: z.number().int().min(0).optional(),
}).strict();

export const contentPublishSchema = z.object({
  locale: localeSchema,
  version: z.number().int().min(1),
  reason: z.string().trim().min(1).max(2_000).optional(),
}).strict();

export const contentRestoreSchema = z.object({
  locale: localeSchema,
  version: z.number().int().min(1),
  reason: z.string().trim().min(1).max(2_000),
}).strict();

export const pricingUpdateSchema = z.object({
  test_id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  amount_minor: z.number().int().min(1).max(100_000_000),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/),
  expected_updated_at: z.number().int().optional(),
  reason: z.string().trim().min(1).max(2_000),
}).strict();

export const assessmentVersionCreateSchema = z.object({
  product_id: z.string().trim().min(1).max(64),
  version: z.string().trim().min(1).max(128),
  scoring_version: z.string().trim().min(1).max(128),
  content_version: z.string().trim().min(1).max(128),
  career_model_version: z.string().trim().min(1).max(128),
  report_version: z.string().trim().min(1).max(128),
  adaptive_version: z.string().trim().max(128).nullable().optional(),
  item_count: z.number().int().min(1).max(10_000),
  metadata: z.record(z.unknown()).optional(),
}).strict();

export const assessmentVersionPublishSchema = z.object({
  version_id: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(1).max(2_000),
}).strict();

export const careerEntrySchema = z.object({
  catalog_version: z.string().trim().min(1).max(128),
  slug: z.string().trim().min(1).max(160),
  status: z.enum(["DRAFT", "ACTIVE", "DISABLED"]).optional(),
  title_ru: z.string().trim().min(1).max(240),
  title_kk: z.string().trim().min(1).max(240),
  description_ru: z.string().trim().min(1).max(10_000),
  description_kk: z.string().trim().min(1).max(10_000),
  category: z.string().trim().min(1).max(160),
  education_paths: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  work_environment: z.string().trim().max(2_000).optional(),
  career_tags: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
  source_version: z.string().trim().min(1).max(128),
}).strict();

export const careerCatalogPublishSchema = z.object({
  version: z.string().trim().min(1).max(128),
  reason: z.string().trim().min(1).max(2_000),
}).strict();

export const adminRoleAssignmentSchema = z.object({
  user_id: z.string().trim().min(1).max(128),
  role: z.enum(["SUPER_ADMIN", "OWNER", "CONTENT_MANAGER", "SUPPORT", "FINANCE", "ANALYST"]),
  reason: z.string().trim().min(1).max(2_000),
}).strict();

export const featureFlagUpdateSchema = z.object({
  key: z.enum(["teen_enabled", "payments_enabled", "maintenance_mode"]),
  enabled: z.boolean(),
  reason: z.string().trim().min(1).max(2_000),
}).strict();

export const settingUpdateSchema = z.object({
  key: z.enum(["support_contact", "public_product_availability", "default_locale", "checkout_enabled", "maintenance_message"]),
  value: z.string().trim().max(4_000),
  reason: z.string().trim().min(1).max(2_000),
}).strict();

export const assessmentCreateSchema = z.object({
  test_id: z.string().trim().max(64).optional(),
  locale: z.string().trim().max(12).optional(),
  promo_code: z.string().trim().min(3).max(64).optional(),
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

const onboardingList = z.array(z.string().trim().min(1).max(160)).max(20);

export const assessmentOnboardingSchema = z.object({
  age: z.number().int().min(10).max(100),
  education_level: z.string().trim().min(1).max(160),
  favorite_subjects: onboardingList.min(1),
  interests: onboardingList.optional(),
  hobbies: onboardingList.optional(),
  preferred_activities: onboardingList.optional(),
  country: z.string().trim().min(1).max(160).optional(),
  language: z.string().trim().min(1).max(160).optional(),
  planned_education_path: z.string().trim().min(1).max(160).optional(),
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
    return { ok: false, response: invalidBodyResponse(request, "REQUEST_TOO_LARGE", "Запрос слишком большой.", 413) };
  }

  let raw: string;
  try {
    raw = await readRequestText(request, maxBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return { ok: false, response: invalidBodyResponse(request, "REQUEST_TOO_LARGE", "Запрос слишком большой.", 413) };
    }
    return { ok: false, response: invalidBodyResponse(request, "INVALID_BODY", "Не удалось прочитать запрос.", 400) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, response: invalidBodyResponse(request, "INVALID_JSON", "Некорректный JSON.", 400) };
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, response: invalidBodyResponse(request, "INVALID_REQUEST", "Проверьте заполненные поля.", 422) };
  }
  return { ok: true, data: result.data };
}

function invalidBodyResponse(request: Request, code: string, message: string, status: number) {
  const requestId = requestIdFrom(request);
  const isAdminApi = new URL(request.url).pathname.startsWith("/api/admin/");
  return NextResponse.json(
    isAdminApi ? { error: { code, message, requestId } } : { error: code, message },
    { status, headers: { "Cache-Control": "no-store", ...(isAdminApi ? { "X-Request-ID": requestId } : {}) } },
  );
}
