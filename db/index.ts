import { env } from "cloudflare:workers";

export type OrbitaRuntimeEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
  PAYMENT_PROVIDER?: string;
  PAYMENTS_ENABLED?: string;
  ENTITLEMENT_MODE?: string;
  AI_ENABLED?: string;
  AUTH_PROVIDER?: string;
  REGISTRATION_MODE?: string;
  PUBLIC_SIGNUP_ENABLED?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_REPLY_TO?: string;
  EMAIL_PROVIDER?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  AUTH_SESSION_TTL_SECONDS?: string;
  AUTH_RATE_LIMIT_SECRET?: string;
  ASSESSMENT_PRICE_MINOR?: string;
  ASSESSMENT_CURRENCY?: string;
  APP_BASE_URL?: string;
  PUBLIC_INDEXING_ENABLED?: string;
  APP_ENV?: string;
  REPORT_PROVIDER?: string;
  REPORT_MODEL?: string;
  REPORT_TIMEOUT_MS?: string;
  PDF_SIGNING_SECRET?: string;
  ADAPTIVE_PROVIDER?: string;
  ADAPTIVE_MODEL?: string;
  ADAPTIVE_TIMEOUT_MS?: string;
  INCEPTION_API_KEY?: string;
  MERCURY_MODEL?: string;
  MERCURY_TIMEOUT_MS?: string;
  MERCURY_MAX_RETRIES?: string;
  RETENTION_DAYS?: string;
  ORBITA_ENV?: string;
  ORBITA_ADMIN_USER_IDS?: string;
  TSKILLS_UNLIMITED_ASSESSMENT_EMAILS?: string;
  ORBITA_INTERNAL_TOKEN?: string;
  SECURITY_CONTACT_EMAIL?: string;
  SUPPORT_CONTACT?: string;
  LEGAL_CONTACT_ADDRESS?: string;
  LEGAL_CONTACT_PHONE?: string;
  LEGAL_ENTITY_NAME?: string;
  LEGAL_DOCUMENTS_APPROVED?: string;
  LEGAL_JURISDICTION?: string;
  LEGAL_PROCESSING_PURPOSES?: string;
  LEGAL_DATA_CATEGORIES?: string;
  LEGAL_RETENTION_SCHEDULE?: string;
  LEGAL_PROCESSORS?: string;
  LEGAL_CROSS_BORDER_PROCESSING?: string;
  LEGAL_USER_RIGHTS?: string;
  LEGAL_SECURITY_SUMMARY?: string;
  LEGAL_RESEARCH_POLICY?: string;
  LEGAL_MARKETING_POLICY?: string;
  LEGAL_REFUND_POLICY?: string;
  LEGAL_COOKIE_POLICY?: string;
  RETENTION_DRY_RUN?: string;
  TRUST_PROXY?: string;
  TEEN_BANK_ENABLED?: string;
  SQLITE_DB_PATH?: string;
  VPS_FILE_DIR?: string;
};

export function getRuntimeEnv() {
  return env as unknown as OrbitaRuntimeEnv;
}

export function getD1() {
  const database = getRuntimeEnv().DB;
  if (!database) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure the logical DB binding before using persistent routes.",
    );
  }
  return database;
}

export function getR2() {
  const bucket = getRuntimeEnv().BUCKET;
  if (!bucket) {
    throw new Error(
      "Cloudflare R2 binding `BUCKET` is unavailable. Configure the logical BUCKET binding before using file routes.",
    );
  }
  return bucket;
}
