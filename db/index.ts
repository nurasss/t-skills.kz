import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type OrbitaRuntimeEnv = {
  DB?: D1Database;
  BUCKET?: R2Bucket;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
  PAYMENT_PROVIDER?: string;
  ASSESSMENT_PRICE_MINOR?: string;
  ASSESSMENT_CURRENCY?: string;
  APP_BASE_URL?: string;
  REPORT_PROVIDER?: string;
  REPORT_MODEL?: string;
  REPORT_TIMEOUT_MS?: string;
  PDF_SIGNING_SECRET?: string;
  ADAPTIVE_PROVIDER?: string;
  ADAPTIVE_MODEL?: string;
  ADAPTIVE_TIMEOUT_MS?: string;
  RETENTION_DAYS?: string;
  ORBITA_ENV?: string;
  ORBITA_ADMIN_USER_IDS?: string;
  ORBITA_INTERNAL_TOKEN?: string;
  CRON_SECRET?: string;
  SUPPORT_CONTACT?: string;
  LEGAL_ENTITY_NAME?: string;
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
  RETENTION_DRY_RUN?: string;
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

export function getDb() {
  return drizzle(getD1(), { schema });
}
