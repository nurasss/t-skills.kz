import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

// Portable: build via the current node binary instead of the `npm` shim
// (unresolvable without a shell on some platforms).
execFileSync(process.execPath, ["scripts/run-framework.mjs", "build"], { cwd: root, stdio: "inherit" });
const migrationSql = readdirSync("drizzle")
  .filter((entry) => /^\d+_.*\.sql$/.test(entry))
  .sort()
  .map((entry) => readFileSync(`drizzle/${entry}`, "utf8"))
  .join("\n");
// Portable: migrations go through --file (command-line length limits vary).
const migrationDir = mkdtempSync(join(tmpdir(), "orbita-beta-migrations-"));
const migrationFile = join(migrationDir, "migrations.sql");
writeFileSync(migrationFile, migrationSql);
try {
  runWrangler(["d1", "execute", "DB", "--local", "--config", configPath, "--persist-to", stateDir, "--file", migrationFile]);
} finally {
  rmSync(migrationDir, { recursive: true, force: true });
}

let output = "";
const child = spawn(process.execPath, [
  "--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js",
  "dev", "--config", configPath, "--local", "--persist-to", stateDir,
  "--ip", "127.0.0.1", "--inspector-port", "0", "--port", String(port),
  "--var", "APP_ENV:development", "--var", "ORBITA_ENV:development", "--var", "LEGAL_DOCUMENTS_APPROVED:false", "--var", "PAYMENTS_ENABLED:false",
  "--var", "ENTITLEMENT_MODE:beta-free", "--var", "AI_ENABLED:false",
  "--var", "ADAPTIVE_PROVIDER:fallback", "--var", "MERCURY_MODEL:mercury-2.5", "--var", "REPORT_PROVIDER:approved-library",
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

  const catalog = await fetch(`${baseUrl}/api/catalog`, { headers });
  const catalogBody = await catalog.json();
  assert(catalog.ok && catalogBody.test?.assessmentVersion === "t-skills-teen-v2" && catalogBody.test?.accessMode === "beta-free" && catalogBody.test?.availableForCheckout === false, "beta catalog access mode and current T-Skills version");

  const checkout = await fetch(`${baseUrl}/api/checkout`, { method: "POST", headers, body: JSON.stringify({ test_id: "t-skills" }) });
  assert(checkout.status === 503, `checkout is disabled (received ${checkout.status}: ${await checkout.text()})`);

  const assessment = await fetch(`${baseUrl}/api/assessments`, { method: "POST", headers, body: JSON.stringify({ test_id: "t-skills" }) });
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
