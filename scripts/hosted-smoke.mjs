import { writeFileSync } from "node:fs";

const environment = process.argv[2];
if (!['staging', 'production'].includes(environment)) throw new Error("HOSTED_SMOKE_ENV_INVALID");
const url = process.env[environment === "staging" ? "STAGING_URL" : "PRODUCTION_URL"]?.replace(/\/$/, "");
const clientId = process.env.CF_ACCESS_CLIENT_ID;
const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
if (!url || !clientId || !clientSecret) throw new Error("HOSTED_SMOKE_CONFIGURATION_MISSING");

const anonymous = await fetch(`${url}/api/health`, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
if (anonymous.status >= 200 && anonymous.status < 300) throw new Error("HOSTED_SMOKE_ANONYMOUS_NOT_BLOCKED");

const authenticated = await fetch(`${url}/api/health`, {
  headers: { "CF-Access-Client-Id": clientId, "CF-Access-Client-Secret": clientSecret },
  signal: AbortSignal.timeout(20_000),
});
const body = await authenticated.json().catch(() => null);
if (!authenticated.ok || body?.status !== "ok") throw new Error(`HOSTED_SMOKE_HEALTH_FAILED:${authenticated.status}`);
if (body.paymentsEnabled !== false || body.aiEnabled !== false || body.entitlementMode !== "beta-free" || body.normStatus !== "unvalidated") {
  throw new Error("HOSTED_SMOKE_UNSAFE_FLAGS");
}

const evidence = {
  environment,
  url,
  checkedAt: new Date().toISOString(),
  anonymousBlocked: true,
  accessServiceToken: "PASS",
  health: body,
  sourceSha: process.env.GITHUB_SHA ?? null,
  runUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
};
writeFileSync(`hosted-smoke-${environment}.json`, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`HOSTED_SMOKE=PASS environment=${environment} anonymous=BLOCKED payments=OFF ai=OFF normStatus=unvalidated`);
