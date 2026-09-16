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
    AUTH_PROVIDER: "cloudflare-access",
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
  if (name === "staging" && (vars.AI_ENABLED !== "true" || vars.ADAPTIVE_PROVIDER !== "mercury")) throw new Error("DEPLOY_CONFIG_STAGING_MERCURY_NOT_ENABLED");
  if (name === "production" && (vars.AI_ENABLED !== "false" || !["deterministic", "fallback"].includes(vars.ADAPTIVE_PROVIDER))) throw new Error("DEPLOY_CONFIG_PRODUCTION_MERCURY_MUST_REMAIN_OFF");
}

if (staging.name === production.name) throw new Error("DEPLOY_CONFIG_SHARED_WORKER");
if (staging.d1_databases[0].database_id === production.d1_databases[0].database_id) throw new Error("DEPLOY_CONFIG_SHARED_D1");
if (staging.r2_buckets[0].bucket_name === production.r2_buckets[0].bucket_name) throw new Error("DEPLOY_CONFIG_SHARED_R2");
console.log("DEPLOYMENT_CONFIG=PASS isolated_workers=YES isolated_d1=YES isolated_r2=YES payments=OFF staging_mercury=ON production_mercury=OFF");
