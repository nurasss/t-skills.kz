import { readdirSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const port = 8791;
const baseUrl = `http://127.0.0.1:${port}`;
const configPath = "dist/server/wrangler.json";
const stateDir = `.wrangler/beta-smoke-${Date.now()}`;
const userId = `beta_${Date.now()}`;

function runWrangler(args) {
  return execFileSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function assert(condition, message) {
  if (!condition) throw new Error(`BETA_SMOKE_ASSERTION_FAILED: ${message}`);
}

execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
for (const migration of readdirSync("drizzle").filter((entry) => /^\d+_.*\.sql$/.test(entry)).sort()) {
  runWrangler(["d1", "execute", "DB", "--local", "--config", configPath, "--persist-to", stateDir, "--file", `drizzle/${migration}`]);
}

let output = "";
const child = spawn(process.execPath, [
  "--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js",
  "dev", "--config", configPath, "--local", "--persist-to", stateDir,
  "--ip", "127.0.0.1", "--inspector-port", "0", "--port", String(port),
  "--var", "ORBITA_ENV:development", "--var", "PAYMENTS_ENABLED:false",
  "--var", "ENTITLEMENT_MODE:beta-free", "--var", "AI_ENABLED:false",
  "--var", "ADAPTIVE_PROVIDER:deterministic", "--var", "REPORT_PROVIDER:approved-library",
  "--var", "PDF_SIGNING_SECRET:beta-smoke-signing",
], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) break;
    } catch {}
    if (attempt === 59) throw new Error(`BETA_SMOKE_SERVER_START_TIMEOUT\n${output.slice(-4000)}`);
    await delay(500);
  }
  const headers = { "Content-Type": "application/json", "x-orbita-preview-user": userId, origin: baseUrl };
  const health = await fetch(`${baseUrl}/api/health`, { headers });
  const healthBody = await health.json();
  assert(healthBody.paymentsEnabled === false && healthBody.aiEnabled === false, "beta feature flags");
  assert(healthBody.entitlementMode === "beta-free" && healthBody.normStatus === "unvalidated", "beta mode and norm status");

  const checkout = await fetch(`${baseUrl}/api/checkout`, { method: "POST", headers, body: JSON.stringify({ test_id: "orbita30" }) });
  assert(checkout.status === 503, "checkout is disabled");

  const assessment = await fetch(`${baseUrl}/api/assessments`, { method: "POST", headers, body: JSON.stringify({ test_id: "orbita30" }) });
  const assessmentBody = await assessment.json();
  assert(assessment.status === 201 && assessmentBody.state === "ENTITLED", "free entitlement creates an entitled session");

  const consent = await fetch(`${baseUrl}/api/assessments/${assessmentBody.id}`, {
    method: "PATCH", headers, body: JSON.stringify({ consents: { terms: true, privacy: true, research: false, marketing: false } }),
  });
  assert(consent.ok, "beta consent flow");

  const query = runWrangler(["d1", "execute", "DB", "--local", "--config", configPath, "--persist-to", stateDir, "--command", `SELECT order_id, grant_source, grant_reference FROM entitlements WHERE user_id = '${userId}'`]);
  assert(query.includes("beta_free") && query.includes("beta_free:") && query.includes("order_id"), "beta grant is separate from payment");
  console.log(`BETA_FREE_SMOKE=PASS session=${assessmentBody.id} payments=OFF ai=OFF normStatus=unvalidated`);
} finally {
  child.kill("SIGTERM");
}
