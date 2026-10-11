import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
const staging = config.env?.staging;
const production = config.env?.production;
if (!staging || !production) throw new Error("DEPLOY_CONFIG_MISSING_ENVIRONMENTS");

for (const [name, environment] of [["staging", staging], ["production", production]]) {
  const database = environment.d1_databases?.find((item) => item.binding === "DB");
  const bucket = environment.r2_buckets?.find((item) => item.binding === "BUCKET");
  if (!database || !bucket) throw new Error(`DEPLOY_CONFIG_MISSING_BINDING:${name}`);
  if (/^00000000-0000-4000-8000-00000000000[12]$/.test(database.database_id)) {
    throw new Error(`DEPLOY_CONFIG_PLACEHOLDER_D1:${name}`);
  }
  const vars = environment.vars ?? {};
  const required = {
    AUTH_PROVIDER: "app-password",
    REGISTRATION_MODE: "hybrid",
    PUBLIC_SIGNUP_ENABLED: "false",
    PUBLIC_INDEXING_ENABLED: "false",
    PAYMENTS_ENABLED: "false",
    ENTITLEMENT_MODE: "beta-free",
    REPORT_PROVIDER: "approved-library",
    MERCURY_MODEL: "mercury-2.5",
    MERCURY_TIMEOUT_MS: "12000",
    MERCURY_MAX_RETRIES: "2",
  };
  for (const [key, value] of Object.entries(required)) {
    if (vars[key] !== value) throw new Error(`DEPLOY_CONFIG_UNSAFE_FLAG:${name}:${key}`);
  }
  const expectedAppEnv = name === "staging" ? "staging" : "production-beta";
  if (vars.APP_ENV !== expectedAppEnv || vars.ORBITA_ENV !== name) {
    throw new Error(`DEPLOY_CONFIG_ENVIRONMENT_MISMATCH:${name}`);
  }
  if (name === "production" && !/^https:\/\//.test(vars.APP_BASE_URL ?? "")) {
    throw new Error("DEPLOY_CONFIG_PRODUCTION_APP_BASE_URL_MUST_BE_HTTPS");
  }
  const requiredSecrets = environment.secrets?.required ?? [];
  for (const secret of ["RESEND_API_KEY", "AUTH_RATE_LIMIT_SECRET", "PDF_SIGNING_SECRET", "ORBITA_INTERNAL_TOKEN"]) {
    if (!requiredSecrets.includes(secret)) throw new Error(`DEPLOY_CONFIG_SECRET_NOT_REQUIRED:${name}:${secret}`);
  }
  if (!/^https:\/\//.test(vars.APP_BASE_URL ?? "")) throw new Error(`DEPLOY_CONFIG_APP_BASE_URL_MUST_BE_HTTPS:${name}`);
  if (!vars.EMAIL_FROM?.trim() || /example\.(?:com|org|net|test)|\.invalid|replace|placeholder/i.test(vars.EMAIL_FROM)) {
    throw new Error(`DEPLOY_CONFIG_EMAIL_FROM_MISSING:${name}`);
  }
  if (!vars.SECURITY_CONTACT_EMAIL?.trim() || /example\.(?:com|org|net|test)|\.invalid|replace|placeholder/i.test(vars.SECURITY_CONTACT_EMAIL)) {
    throw new Error(`DEPLOY_CONFIG_SECURITY_CONTACT_MISSING:${name}`);
  }
  const legalKeys = [
    "SUPPORT_CONTACT",
    "LEGAL_ENTITY_NAME",
    "LEGAL_CONTACT_ADDRESS",
    "LEGAL_CONTACT_PHONE",
    "LEGAL_JURISDICTION",
    "LEGAL_PROCESSING_PURPOSES",
    "LEGAL_DATA_CATEGORIES",
    "LEGAL_RETENTION_SCHEDULE",
    "LEGAL_PROCESSORS",
    "LEGAL_CROSS_BORDER_PROCESSING",
    "LEGAL_USER_RIGHTS",
    "LEGAL_SECURITY_SUMMARY",
    "LEGAL_RESEARCH_POLICY",
    "LEGAL_MARKETING_POLICY",
    "LEGAL_REFUND_POLICY",
    "LEGAL_COOKIE_POLICY",
  ];
  for (const key of legalKeys) {
    if (!vars[key]?.trim() || /ТРЕБУЕТСЯ|REPLACE|PLACEHOLDER|example\.(?:com|org|net|test)|\.invalid/i.test(vars[key])) {
      throw new Error(`DEPLOY_CONFIG_LEGAL_VALUE_MISSING:${name}:${key}`);
    }
  }
  if (name === "production" && vars.LEGAL_DOCUMENTS_APPROVED !== "true") {
    throw new Error("DEPLOY_CONFIG_LEGAL_APPROVAL_REQUIRED:production");
  }
  if (name === "staging" && (vars.AI_ENABLED !== "true" || vars.ADAPTIVE_PROVIDER !== "mercury")) throw new Error("DEPLOY_CONFIG_STAGING_MERCURY_NOT_ENABLED");
  if (name === "production" && (vars.AI_ENABLED !== "false" || !["deterministic", "fallback"].includes(vars.ADAPTIVE_PROVIDER))) throw new Error("DEPLOY_CONFIG_PRODUCTION_MERCURY_MUST_REMAIN_OFF");
}

if (staging.name === production.name) throw new Error("DEPLOY_CONFIG_SHARED_WORKER");
if (staging.d1_databases[0].database_id === production.d1_databases[0].database_id) throw new Error("DEPLOY_CONFIG_SHARED_D1");
if (staging.r2_buckets[0].bucket_name === production.r2_buckets[0].bucket_name) throw new Error("DEPLOY_CONFIG_SHARED_R2");
console.log("DEPLOYMENT_CONFIG=PASS isolated_workers=YES isolated_d1=YES isolated_r2=YES payments=OFF staging_mercury=ON production_mercury=OFF");
