import { writeFileSync } from "node:fs";

const environment = process.argv[2];
if (!['staging', 'production'].includes(environment)) throw new Error("HOSTED_SMOKE_ENV_INVALID");
const url = process.env[environment === "staging" ? "STAGING_URL" : "PRODUCTION_URL"]?.replace(/\/$/, "");
if (!url) throw new Error("HOSTED_SMOKE_CONFIGURATION_MISSING");

const anonymous = await fetch(`${url}/api/health`, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
const health = await anonymous.json().catch(() => null);
if (!anonymous.ok || health?.status !== "ok") throw new Error(`HOSTED_SMOKE_HEALTH_FAILED:${anonymous.status}`);
const expectedAiEnabled = environment === "staging";
const expectedAdaptiveProvider = environment === "staging" ? "mercury" : "deterministic";
if (health.paymentsEnabled !== false || health.aiEnabled !== expectedAiEnabled || health.adaptiveProvider !== expectedAdaptiveProvider || health.entitlementMode !== "beta-free" || health.normStatus !== "unvalidated") {
  throw new Error("HOSTED_SMOKE_UNSAFE_FLAGS");
}

const protectedResponse = await fetch(`${url}/api/account`, {
  redirect: "manual",
  signal: AbortSignal.timeout(20_000),
});
if (protectedResponse.status !== 401 && protectedResponse.status !== 302 && protectedResponse.status !== 307) throw new Error(`HOSTED_SMOKE_PROTECTED_ROUTE_FAILED:${protectedResponse.status}`);

const evidence = {
  environment,
  url,
  checkedAt: new Date().toISOString(),
  publicHealth: "PASS",
  protectedAccount: "PASS",
  authProvider: "app-password",
  health,
  sourceSha: process.env.GITHUB_SHA ?? null,
  runUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : null,
};
writeFileSync(`hosted-smoke-${environment}.json`, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`HOSTED_SMOKE=PASS environment=${environment} protected_account=YES payments=OFF ai=${expectedAiEnabled ? "ON" : "OFF"} normStatus=unvalidated`);
