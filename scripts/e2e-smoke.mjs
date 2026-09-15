import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const port = 8788;
const baseUrl = `http://127.0.0.1:${port}`;
const configPath = "dist/server/wrangler.json";
const workerArtifact = "dist/server/index.js";
const stateDir = `.wrangler/e2e-smoke-${Date.now()}`;
const userId = `e2e_${Date.now()}`;
const authHeaders = {
  "x-orbita-preview-user": userId,
  origin: baseUrl,
};

function runWrangler(args) {
  return execFileSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function request(path, init = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(15000), headers: { ...authHeaders, "Content-Type": "application/json", ...(init.headers ?? {}) } });
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") ?? "";
      let body = null;
      if (contentType.includes("json") && buffer.length) body = JSON.parse(buffer.toString("utf8"));
      if (response.status !== 503 || attempt === 2) return { response, buffer, body };
      await delay(500 * (attempt + 1));
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await delay(500 * (attempt + 1));
        continue;
      }
      console.error(`E2E request failed: ${path}\n${output.slice(-4000)}`);
      throw error;
    }
  }
  throw lastError;
}

function assert(condition, message) {
  if (!condition) throw new Error(`E2E_ASSERTION_FAILED: ${message}`);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.status < 500) return;
    } catch {
      // The Worker is still starting.
    }
    await delay(500);
  }
  throw new Error("E2E_SERVER_START_TIMEOUT");
}

if (!existsSync(configPath)) {
  execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
}

const workerBundle = readFileSync(workerArtifact, "utf8");
const wranglerConfig = JSON.parse(readFileSync(configPath, "utf8"));
assert(workerBundle.includes("scheduled"), "built Worker exports a scheduled handler");
assert(wranglerConfig.triggers?.crons?.includes("0 2 * * *"), "Worker cron trigger is configured");

for (const migration of readdirSync("drizzle").filter((entry) => /^\d+_.*\.sql$/.test(entry)).sort()) {
  runWrangler(["d1", "execute", "DB", "--local", "--config", configPath, "--persist-to", stateDir, "--file", `drizzle/${migration}`]);
}

const timestamp = Date.now();
const seed = [
  `INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at, deleted_at) VALUES (${sql(userId)}, ${sql(`${userId}@local.invalid`)}, 'E2E Smoke', 'ru', ${timestamp}, ${timestamp}, NULL)`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES ('${userId}_ord', ${sql(userId)}, 'orbita30', 150000, 'KZT', 'PAID', 'stripe', 'cs_e2e', 'https://checkout.stripe.test/cs_e2e', 'pi_e2e', 'evt_e2e', ${sql(`${userId}_idem`)}, ${timestamp}, ${timestamp})`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES ('${userId}_pending', ${sql(userId)}, 'orbita30', 150000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'cs_pending', NULL, NULL, NULL, ${sql(`${userId}_pending_idem`)}, ${timestamp}, ${timestamp})`,
  `INSERT OR IGNORE INTO entitlements (id, order_id, user_id, test_id, status, created_at, revoked_at) VALUES ('${userId}_ent', '${userId}_ord', ${sql(userId)}, 'orbita30', 'ACTIVE', ${timestamp}, NULL)`,
].join(";");
runWrangler(["d1", "execute", "DB", "--local", "--config", configPath, "--persist-to", stateDir, "--command", seed]);

const server = spawn(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "dev", "--config", configPath, "--local", "--persist-to", stateDir, "--ip", "127.0.0.1", "--inspector-port", "0", "--port", String(port), "--var", "ORBITA_ENV:development", "--var", "PDF_SIGNING_SECRET:e2e-signing", "--var", "ORBITA_INTERNAL_TOKEN:e2e-internal", "--var", "STRIPE_WEBHOOK_SECRET:e2e-webhook", "--var", "ASSESSMENT_PRICE_MINOR:150000"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

try {
  await waitForServer();
  const catalog = await request("/api/catalog", { headers: { origin: undefined } });
  assert(catalog.response.status === 200, "public catalog");
  assert(catalog.body?.test?.amountMinor === 150000 && catalog.body?.test?.currency === "KZT", "backend price and currency are public");

  const unauth = await fetch(`${baseUrl}/api/account`);
  assert(unauth.status === 401, "unauthenticated account is rejected");

  const account = await request("/api/account");
  assert(account.response.status === 200, "authenticated account");
  const session = await request("/api/assessments", { method: "POST", body: JSON.stringify({ test_id: "orbita30" }) });
  assert(session.response.status === 201 && typeof session.body?.id === "string", "assessment creation after seeded entitlement");
  const sessionId = session.body.id;
  const consent = await request(`/api/assessments/${sessionId}`, { method: "PATCH", body: JSON.stringify({ consents: { terms: true, privacy: true, research: false, marketing: false } }) });
  assert(consent.response.status === 200, "versioned consent");

  let sequence = 1;
  for (let number = 1; number <= 250; number += 1) {
    const itemId = `Q${String(number).padStart(3, "0")}`;
    const value = number === 241 ? 5 : number === 244 ? 2 : number === 247 ? 6 : number >= 241 ? 2 : number <= 150 ? 0 : 4;
    const response = await request(`/api/assessments/${sessionId}/responses`, { method: "POST", headers: { "Idempotency-Key": `${sessionId}:${itemId}` }, body: JSON.stringify({ item_id: itemId, response: value, response_time_ms: 1000, client_seq: sequence }) });
    assert(response.response.status === 200, `save ${itemId} (${response.response.status}): ${JSON.stringify(response.body)}`);
    if (number === 1) {
      const replay = await request(`/api/assessments/${sessionId}/responses`, { method: "POST", headers: { "Idempotency-Key": `${sessionId}:${itemId}` }, body: JSON.stringify({ item_id: itemId, response: value, response_time_ms: 1000, client_seq: sequence }) });
      assert(replay.response.status === 200 && replay.body?.replay === true, "response idempotency replay");
    }
    sequence += 1;
  }
  const adaptive = await request(`/api/assessments/${sessionId}/complete-core`, { method: "POST", body: "{}" });
  assert(adaptive.response.status === 200 && adaptive.body?.adaptive?.selectedItemIds?.length === 12, "adaptive selection");
  for (const itemId of adaptive.body.adaptive.selectedItemIds) {
    const number = Number(itemId.slice(1));
    const value = number >= 281 ? 0 : 4;
    const response = await request(`/api/assessments/${sessionId}/responses`, { method: "POST", headers: { "Idempotency-Key": `${sessionId}:${itemId}` }, body: JSON.stringify({ item_id: itemId, response: value, response_time_ms: 1000, client_seq: sequence }) });
    assert(response.response.status === 200, `save ${itemId} (${response.response.status}): ${JSON.stringify(response.body)}`);
    sequence += 1;
  }
  const completed = await request(`/api/assessments/${sessionId}/complete`, { method: "POST", body: "{}" });
  assert([200, 202].includes(completed.response.status), "complete assessment");
  assert(completed.body?.score?.normStatus === "unvalidated", "norm-safe score persisted");
  assert(completed.body?.report?.interpretationLibraryVersion === "approved-interpretation-v1", "approved report library version");
  const reportId = completed.body.report_id;
  const link = await request(`/api/reports/${reportId}/download-link`, { method: "POST", body: "{}" });
  assert(link.response.status === 200 && typeof link.body?.download_path === "string", "signed PDF link");
  await delay(1000);
  const pdf = await request(link.body.download_path);
  assert(pdf.response.status === 200 && pdf.response.headers.get("content-type")?.includes("application/pdf") && pdf.buffer.length > 1000, "PDF download");
  if (process.env.E2E_PDF_OUTPUT) writeFileSync(process.env.E2E_PDF_OUTPUT, pdf.buffer);
  const telemetry = await request("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "test_view", metadata: { provider: "stripe", raw_answer: 7 } }) });
  assert(telemetry.response.status === 200, "allowlisted privacy-safe telemetry");
  const exported = await request("/api/account/export", { method: "POST", body: "{}" });
  assert(exported.response.status === 201 && typeof exported.body?.downloadPath === "string", "data export");
  const exportedFile = await request(exported.body.downloadPath);
  assert(exportedFile.response.status === 200 && exportedFile.buffer.includes(Buffer.from("responses")), "export artifact");

  const event = {
    id: `${userId}_paid_event`,
    type: "checkout.session.completed",
    data: { object: { id: "cs_pending", client_reference_id: `${userId}_pending`, payment_status: "paid", amount_total: 150000, currency: "kzt", payment_intent: "pi_pending", metadata: { order_id: `${userId}_pending`, test_id: "orbita30" } } },
  };
  const eventPayload = JSON.stringify(event);
  const eventTimestamp = Math.floor(Date.now() / 1000);
  const eventSignature = `t=${eventTimestamp},v1=${createHmac("sha256", "e2e-webhook").update(`${eventTimestamp}.${eventPayload}`).digest("hex")}`;
  const payment = await request("/api/payments/webhook", { method: "POST", headers: { "stripe-signature": eventSignature }, body: eventPayload });
  assert(payment.response.status === 200 && payment.body?.entitlementCreated === true, "signed payment webhook grants entitlement after exact match");
  const paymentReplay = await request("/api/payments/webhook", { method: "POST", headers: { "stripe-signature": eventSignature }, body: eventPayload });
  assert(paymentReplay.response.status === 200 && paymentReplay.body?.duplicate === true, "payment webhook replay is idempotent");

  const internalUnauthenticated = await fetch(`${baseUrl}/internal/retention`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dry_run: true }) });
  assert(internalUnauthenticated.status === 401, "retention endpoint requires internal token");
  const retention = await request("/internal/retention", { method: "POST", headers: { "X-Internal-Token": "e2e-internal" }, body: JSON.stringify({ dry_run: true, limit: 10 }) });
  assert(retention.response.status === 200 && retention.body?.dryRun === true, "retention dry-run endpoint");
  console.log(`E2E smoke passed: ${sessionId}`);
} catch (error) {
  console.error(output.slice(-8000));
  throw error;
} finally {
  server.kill("SIGTERM");
  await delay(500);
}
