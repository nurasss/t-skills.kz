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
const deleteUserId = `${userId}_delete`;
const noPaymentUserId = `${userId}_no_payment`;
const concurrentOrderId = `${userId}_concurrent`;
const retentionUserId = `${userId}_retention`;
const retentionAssessmentId = `${retentionUserId}_complete`;
const activeRetentionAssessmentId = `${retentionUserId}_active`;
const retentionOrderId = `${retentionUserId}_order`;
const retentionEntitlementId = `${retentionUserId}_entitlement`;
const activeRetentionOrderId = `${retentionUserId}_active_order`;
const activeRetentionEntitlementId = `${retentionUserId}_active_entitlement`;
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
      if (![500, 503].includes(response.status) || attempt === 2) return { response, buffer, body };
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

let output = "";
function startServer() {
  const child = spawn(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "dev", "--config", configPath, "--local", "--persist-to", stateDir, "--ip", "127.0.0.1", "--inspector-port", "0", "--port", String(port), "--var", "ORBITA_ENV:development", "--var", "PDF_SIGNING_SECRET:e2e-signing", "--var", "ORBITA_INTERNAL_TOKEN:e2e-internal", "--var", "STRIPE_WEBHOOK_SECRET:e2e-webhook", "--var", "ASSESSMENT_PRICE_MINOR:150000"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  return child;
}

async function restartServer(child) {
  child.kill("SIGTERM");
  await delay(800);
  const restarted = startServer();
  await waitForServer();
  return restarted;
}

async function signedStripeEvent(event) {
  const eventPayload = JSON.stringify(event);
  const eventTimestamp = Math.floor(Date.now() / 1000);
  const eventSignature = `t=${eventTimestamp},v1=${createHmac("sha256", "e2e-webhook").update(`${eventTimestamp}.${eventPayload}`).digest("hex")}`;
  return request("/api/payments/webhook", { method: "POST", headers: { "stripe-signature": eventSignature }, body: eventPayload });
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
  `INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at, deleted_at) VALUES (${sql(deleteUserId)}, ${sql(`${deleteUserId}@local.invalid`)}, 'E2E Delete', 'ru', ${timestamp}, ${timestamp}, NULL)`,
  `INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at, deleted_at) VALUES (${sql(noPaymentUserId)}, ${sql(`${noPaymentUserId}@local.invalid`)}, 'E2E No Payment', 'ru', ${timestamp}, ${timestamp}, NULL)`,
  `INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at, deleted_at) VALUES (${sql(retentionUserId)}, ${sql(`${retentionUserId}@local.invalid`)}, 'E2E Retention', 'ru', ${timestamp - 400 * 24 * 60 * 60 * 1000}, ${timestamp - 400 * 24 * 60 * 60 * 1000}, NULL)`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES (${sql(retentionOrderId)}, ${sql(retentionUserId)}, 'orbita30', 150000, 'KZT', 'PAID', 'stripe', 'cs_retention', 'https://checkout.stripe.test/cs_retention', 'pi_retention', 'evt_retention', ${sql(`${retentionUserId}_idem`)}, ${timestamp - 400 * 24 * 60 * 60 * 1000}, ${timestamp - 400 * 24 * 60 * 60 * 1000})`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES (${sql(activeRetentionOrderId)}, ${sql(retentionUserId)}, 'orbita30', 150000, 'KZT', 'PAID', 'stripe', 'cs_retention_active', 'https://checkout.stripe.test/cs_retention_active', 'pi_retention_active', 'evt_retention_active', ${sql(`${retentionUserId}_active_idem`)}, ${timestamp - 400 * 24 * 60 * 60 * 1000}, ${timestamp - 400 * 24 * 60 * 60 * 1000})`,
  `INSERT OR IGNORE INTO entitlements (id, order_id, user_id, test_id, status, created_at, revoked_at) VALUES (${sql(retentionEntitlementId)}, ${sql(retentionOrderId)}, ${sql(retentionUserId)}, 'orbita30', 'ACTIVE', ${timestamp - 400 * 24 * 60 * 60 * 1000}, NULL)`,
  `INSERT OR IGNORE INTO entitlements (id, order_id, user_id, test_id, status, created_at, revoked_at) VALUES (${sql(activeRetentionEntitlementId)}, ${sql(activeRetentionOrderId)}, ${sql(retentionUserId)}, 'orbita30', 'ACTIVE', ${timestamp - 400 * 24 * 60 * 60 * 1000}, NULL)`,
  `INSERT OR IGNORE INTO assessments (id, user_id, entitlement_id, test_id, locale, state, versions_json, adaptive_item_ids_json, selection_mode, preliminary_score_json, final_score_json, report_id, client_seq, created_at, consented_at, completed_at, purge_state, purge_after, updated_at) VALUES (${sql(retentionAssessmentId)}, ${sql(retentionUserId)}, ${sql(retentionEntitlementId)}, 'orbita30', 'ru', 'COMPLETE', '{}', '[]', NULL, NULL, NULL, NULL, 0, ${timestamp - 400 * 24 * 60 * 60 * 1000}, NULL, ${timestamp - 400 * 24 * 60 * 60 * 1000}, 'ACTIVE', ${timestamp - 1}, ${timestamp - 400 * 24 * 60 * 60 * 1000})`,
  `INSERT OR IGNORE INTO assessments (id, user_id, entitlement_id, test_id, locale, state, versions_json, adaptive_item_ids_json, selection_mode, preliminary_score_json, final_score_json, report_id, client_seq, created_at, consented_at, completed_at, purge_state, purge_after, updated_at) VALUES (${sql(activeRetentionAssessmentId)}, ${sql(retentionUserId)}, ${sql(activeRetentionEntitlementId)}, 'orbita30', 'ru', 'CORE_IN_PROGRESS', '{}', '[]', NULL, NULL, NULL, NULL, 0, ${timestamp - 400 * 24 * 60 * 60 * 1000}, NULL, NULL, 'ACTIVE', ${timestamp - 1}, ${timestamp - 400 * 24 * 60 * 60 * 1000})`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES ('${userId}_ord', ${sql(userId)}, 'orbita30', 150000, 'KZT', 'PAID', 'stripe', 'cs_e2e', 'https://checkout.stripe.test/cs_e2e', 'pi_e2e', 'evt_e2e', ${sql(`${userId}_idem`)}, ${timestamp}, ${timestamp})`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES ('${userId}_pending', ${sql(userId)}, 'orbita30', 150000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'cs_pending', NULL, NULL, NULL, ${sql(`${userId}_pending_idem`)}, ${timestamp}, ${timestamp})`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES (${sql(concurrentOrderId)}, ${sql(userId)}, 'orbita30', 150000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'cs_concurrent', NULL, NULL, NULL, ${sql(`${userId}_concurrent_idem`)}, ${timestamp}, ${timestamp})`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES (${sql(`${deleteUserId}_ord`)}, ${sql(deleteUserId)}, 'orbita30', 150000, 'KZT', 'PAID', 'stripe', 'cs_delete', 'https://checkout.stripe.test/cs_delete', 'pi_delete', 'evt_delete', ${sql(`${deleteUserId}_idem`)}, ${timestamp}, ${timestamp})`,
  `INSERT OR IGNORE INTO entitlements (id, order_id, user_id, test_id, status, created_at, revoked_at) VALUES ('${userId}_ent', '${userId}_ord', ${sql(userId)}, 'orbita30', 'ACTIVE', ${timestamp}, NULL)`,
  `INSERT OR IGNORE INTO entitlements (id, order_id, user_id, test_id, status, created_at, revoked_at) VALUES (${sql(`${deleteUserId}_ent`)}, ${sql(`${deleteUserId}_ord`)}, ${sql(deleteUserId)}, 'orbita30', 'ACTIVE', ${timestamp}, NULL)`,
].join(";");
runWrangler(["d1", "execute", "DB", "--local", "--config", configPath, "--persist-to", stateDir, "--command", seed]);

let server = startServer();

try {
  await waitForServer();
  const catalog = await request("/api/catalog", { headers: { origin: undefined } });
  assert(catalog.response.status === 200, "public catalog");
  assert(catalog.body?.test?.amountMinor === 150000 && catalog.body?.test?.currency === "KZT", "backend price and currency are public");
  assert(catalog.response.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "CSP is attached to public responses");
  assert(catalog.response.headers.get("strict-transport-security"), "HSTS is attached to public responses");
  assert(catalog.response.headers.get("x-content-type-options") === "nosniff", "content sniffing is disabled");
  const legacyCatalog = await request("/api/catalog?locale=kz");
  assert(legacyCatalog.body?.locale?.canonical === "kk" && legacyCatalog.body?.locale?.legacyAlias === true && legacyCatalog.body?.locale?.status === "unpublished", "legacy kz resolves to canonical kk without publishing it");

  const unauth = await fetch(`${baseUrl}/api/account`);
  assert(unauth.status === 401, "unauthenticated account is rejected");

  const account = await request("/api/account");
  assert(account.response.status === 200, "authenticated account");
  const csrf = await request("/api/assessments", { method: "POST", headers: { origin: "https://evil.example" }, body: JSON.stringify({ test_id: "orbita30" }) });
  assert(csrf.response.status === 403 && csrf.body?.error === "CSRF_ORIGIN_INVALID", "cross-origin mutation is rejected");
  const paymentGate = await request("/api/assessments", { method: "POST", headers: { "x-orbita-preview-user": noPaymentUserId }, body: JSON.stringify({ test_id: "orbita30" }) });
  assert(paymentGate.response.status === 402, "redirect or unpaid order cannot create assessment access");
  const blockedLocale = await request("/api/assessments", { method: "POST", body: JSON.stringify({ test_id: "orbita30", locale: "kk" }) });
  assert(blockedLocale.response.status === 422 && blockedLocale.body?.error === "LOCALE_NOT_PUBLISHED", "unpublished locale cannot start an assessment");
  const session = await request("/api/assessments", { method: "POST", body: JSON.stringify({ test_id: "orbita30" }) });
  assert(session.response.status === 201 && typeof session.body?.id === "string", "assessment creation after seeded entitlement");
  const sessionId = session.body.id;
  assert(session.body.locale === "ru" && session.body.versions.translation === "ru-source-v1", "assessment captures canonical locale and translation version");
  const otherUser = await request(`/api/assessments/${sessionId}`, { headers: { "x-orbita-preview-user": `${userId}_other` } });
  assert(otherUser.response.status === 404, "user B cannot read user A assessment by direct ID");
  const consent = await request(`/api/assessments/${sessionId}`, { method: "PATCH", body: JSON.stringify({ consents: { terms: true, privacy: true, research: false, marketing: false } }) });
  assert(consent.response.status === 200, "versioned consent");

  let sequence = 1;
  for (let number = 1; number <= 250; number += 1) {
    const itemId = `Q${String(number).padStart(3, "0")}`;
    const value = number === 241 ? 5 : number === 244 ? 2 : number === 247 ? 6 : number >= 241 ? 2 : number <= 150 ? 0 : 4;
    if (number === 1) {
      const missingIdempotencyKey = await request(`/api/assessments/${sessionId}/responses`, { method: "POST", body: JSON.stringify({ item_id: itemId, response: value }) });
      assert(missingIdempotencyKey.response.status === 422 && missingIdempotencyKey.body?.error === "IDEMPOTENCY_KEY_REQUIRED", "response submit requires an idempotency key");
    }
    const response = await request(`/api/assessments/${sessionId}/responses`, { method: "POST", headers: { "Idempotency-Key": `${sessionId}:${itemId}` }, body: JSON.stringify({ item_id: itemId, response: value, response_time_ms: 1000, client_seq: sequence }) });
    assert(response.response.status === 200, `save ${itemId} (${response.response.status}): ${JSON.stringify(response.body)}`);
    if (number === 1) {
      const replay = await request(`/api/assessments/${sessionId}/responses`, { method: "POST", headers: { "Idempotency-Key": `${sessionId}:${itemId}` }, body: JSON.stringify({ item_id: itemId, response: value, response_time_ms: 1000, client_seq: sequence }) });
      assert(replay.response.status === 200 && replay.body?.replay === true, "response idempotency replay");
      server = await restartServer(server);
      const resumed = await request(`/api/assessments/${sessionId}`);
      assert(resumed.response.status === 200 && resumed.body?.responses?.Q001 === value, "assessment resumes after Worker restart");
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
  const reportBeforeRegeneration = await request(`/api/reports/${reportId}`);
  assert(reportBeforeRegeneration.response.status === 200, "owner can read report");
  const otherReport = await request(`/api/reports/${reportId}`, { headers: { "x-orbita-preview-user": `${userId}_other` } });
  assert(otherReport.response.status === 404, "user B cannot read user A report");
  const otherReportLink = await request(`/api/reports/${reportId}/download-link`, { method: "POST", headers: { "x-orbita-preview-user": `${userId}_other` }, body: "{}" });
  assert(otherReportLink.response.status === 404, "user B cannot create user A PDF link");
  const regenerated = await request(`/api/reports/${reportId}/regenerate`, { method: "POST", body: "{}" });
  assert(regenerated.response.status === 200 && regenerated.body?.score_unchanged === true, "report regeneration does not rescore");
  const reportAfterRegeneration = await request(`/api/reports/${reportId}`);
  assert(JSON.stringify(reportAfterRegeneration.body?.score) === JSON.stringify(reportBeforeRegeneration.body?.score), "regeneration keeps frozen score JSON");
  const link = await request(`/api/reports/${reportId}/download-link`, { method: "POST", body: "{}" });
  assert(link.response.status === 200 && typeof link.body?.download_path === "string", "signed PDF link");
  const missingToken = await request(`/api/reports/${reportId}/download`);
  assert(missingToken.response.status === 401, "PDF download without token is rejected");
  const tamperedPath = link.body.download_path.replace("token=", "token=bad.");
  const tampered = await request(tamperedPath);
  assert(tampered.response.status === 401, "tampered PDF token is rejected");
  const wrongOwnerPdf = await request(link.body.download_path, { headers: { "x-orbita-preview-user": `${userId}_other` } });
  assert(wrongOwnerPdf.response.status === 401, "user B cannot use user A PDF token");
  await delay(1000);
  const pdf = await request(link.body.download_path);
  assert(pdf.response.status === 200 && pdf.response.headers.get("content-type")?.includes("application/pdf") && pdf.buffer.length > 1000, "PDF download");
  if (process.env.E2E_PDF_OUTPUT) writeFileSync(process.env.E2E_PDF_OUTPUT, pdf.buffer);
  const telemetry = await request("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "test_view", metadata: { provider: "stripe", raw_answer: 7 } }) });
  assert(telemetry.response.status === 200, "allowlisted privacy-safe telemetry");
  let rateLimited;
  let allowedBeforeLimit = 1;
  for (let attempt = 0; attempt < 125; attempt += 1) {
    const burst = await request("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "test_view", metadata: { status: "burst" } }) });
    if (burst.response.status === 429) {
      rateLimited = burst;
      break;
    }
    assert(burst.response.status === 200, `rate-limit warmup ${attempt + 1}`);
    allowedBeforeLimit += 1;
  }
  assert(allowedBeforeLimit === 120, `rate-limit allows exactly 120 requests, got ${allowedBeforeLimit}`);
  assert(rateLimited?.response.status === 429 && rateLimited.response.headers.get("retry-after"), "mutation rate limit returns 429 and Retry-After");
  const exported = await request("/api/account/export", { method: "POST", body: "{}" });
  assert(exported.response.status === 201 && typeof exported.body?.downloadPath === "string", "data export");
  const exportedFile = await request(exported.body.downloadPath);
  assert(exportedFile.response.status === 200 && exportedFile.buffer.includes(Buffer.from("responses")) && exportedFile.buffer.includes(Buffer.from("presentation_metadata_json")) && exportedFile.buffer.includes(Buffer.from("itemBankVersion")), "export artifact includes response presentation metadata");
  const otherExportFile = await request(exported.body.downloadPath, { headers: { "x-orbita-preview-user": `${userId}_other` } });
  assert(otherExportFile.response.status === 404, "user B cannot read user A export");

  const event = {
    id: `${userId}_paid_event`,
    type: "checkout.session.completed",
    data: { object: { id: "cs_pending", client_reference_id: `${userId}_pending`, payment_status: "paid", amount_total: 150000, currency: "kzt", payment_intent: "pi_pending", metadata: { order_id: `${userId}_pending`, test_id: "orbita30" } } },
  };
  const payment = await signedStripeEvent(event);
  assert(payment.response.status === 200 && payment.body?.entitlementCreated === true, "signed payment webhook grants entitlement after exact match");
  const paymentReplay = await signedStripeEvent(event);
  assert(paymentReplay.response.status === 200 && paymentReplay.body?.duplicate === true, "payment webhook replay is idempotent");
  const badSignature = await request("/api/payments/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=bad" }, body: JSON.stringify(event) });
  assert(badSignature.response.status === 400, "invalid webhook signature is rejected");
  const wrongAmount = await signedStripeEvent({ ...event, id: `${userId}_wrong_amount`, data: { object: { ...event.data.object, amount_total: 149999 } } });
  assert(wrongAmount.response.status === 409 && wrongAmount.body?.error === "PAYMENT_INTEGRITY_MISMATCH", "wrong payment amount is rejected");
  const wrongCurrency = await signedStripeEvent({ ...event, id: `${userId}_wrong_currency`, data: { object: { ...event.data.object, currency: "usd" } } });
  assert(wrongCurrency.response.status === 409 && wrongCurrency.body?.error === "PAYMENT_INTEGRITY_MISMATCH", "wrong payment currency is rejected");
  const wrongSession = await signedStripeEvent({ ...event, id: `${userId}_wrong_session`, data: { object: { ...event.data.object, id: "cs_other" } } });
  assert(wrongSession.response.status === 409 && wrongSession.body?.error === "PAYMENT_INTEGRITY_MISMATCH", "wrong checkout session is rejected");
  const wrongTest = await signedStripeEvent({ ...event, id: `${userId}_wrong_test`, data: { object: { ...event.data.object, metadata: { order_id: `${userId}_pending`, test_id: "other-test" } } } });
  assert(wrongTest.response.status === 409 && wrongTest.body?.error === "PAYMENT_INTEGRITY_MISMATCH", "wrong test id is rejected");
  const unpaid = await signedStripeEvent({ ...event, id: `${userId}_unpaid`, data: { object: { ...event.data.object, payment_status: "unpaid" } } });
  assert(unpaid.response.status === 200 && unpaid.body?.ignored === true, "unpaid checkout event does not grant access");
  const concurrentEvent = { ...event, id: `${userId}_concurrent_event`, data: { object: { ...event.data.object, id: "cs_concurrent", client_reference_id: concurrentOrderId, payment_intent: "pi_concurrent", metadata: { order_id: concurrentOrderId, test_id: "orbita30" } } } };
  const concurrentResults = await Promise.all([signedStripeEvent(concurrentEvent), signedStripeEvent(concurrentEvent)]);
  assert(concurrentResults.every((result) => result.response.status === 200) && concurrentResults.some((result) => result.body?.entitlementCreated === true) && concurrentResults.some((result) => result.body?.duplicate === true), "concurrent duplicate webhook delivery is idempotent");
  const refund = await signedStripeEvent({ id: `${userId}_refund_event`, type: "charge.refunded", data: { object: { id: "ch_refund", payment_intent: "pi_pending", metadata: { order_id: `${userId}_pending` } } } });
  assert(refund.response.status === 200 && refund.body?.status === "REFUNDED", "refund event records operational state");
  const dispute = await signedStripeEvent({ id: `${userId}_dispute_event`, type: "charge.dispute.created", data: { object: { id: "dp_test", payment_intent: "pi_pending", metadata: { order_id: `${userId}_pending` } } } });
  assert(dispute.response.status === 200 && dispute.body?.status === "DISPUTED", "dispute event records operational state");
  const disputeClosed = await signedStripeEvent({ id: `${userId}_dispute_closed_event`, type: "charge.dispute.closed", data: { object: { id: "dp_test", payment_intent: "pi_pending", metadata: { order_id: `${userId}_pending` } } } });
  assert(disputeClosed.response.status === 200 && disputeClosed.body?.status === "DISPUTE_CLOSED", "closed dispute event is recorded without silent access mutation");

  runWrangler(["r2", "object", "delete", `site-creator-r2/reports/${userId}/${reportId}.pdf`, "--local", "--persist-to", stateDir, "--force"]);
  const missingR2 = await request(link.body.download_path);
  assert(missingR2.response.status === 404, "missing R2 PDF is reported safely");

  const deleteHeaders = { "x-orbita-preview-user": deleteUserId };
  const deletable = await request("/api/assessments", { method: "POST", headers: deleteHeaders, body: JSON.stringify({ test_id: "orbita30" }) });
  assert(deletable.response.status === 201, "second user can create an owned assessment");
  const deleteSessionId = deletable.body.id;
  const deleteConsent = await request(`/api/assessments/${deleteSessionId}`, { method: "PATCH", headers: deleteHeaders, body: JSON.stringify({ consents: { terms: true, privacy: true, research: false, marketing: false } }) });
  assert(deleteConsent.response.status === 200, "deletion fixture consent");
  const deleteAnswer = await request(`/api/assessments/${deleteSessionId}/responses`, { method: "POST", headers: { ...deleteHeaders, "Idempotency-Key": `${deleteSessionId}:Q001` }, body: JSON.stringify({ item_id: "Q001", response: 0, response_time_ms: 1000, client_seq: 1 }) });
  assert(deleteAnswer.response.status === 200, "deletion fixture response persisted");
  const deleteAssessment = await request(`/api/assessments/${deleteSessionId}`, { method: "DELETE", headers: deleteHeaders, body: JSON.stringify({ confirm: "DELETE_ASSESSMENT" }) });
  assert(deleteAssessment.response.status === 200 && deleteAssessment.body?.deleted === true, "assessment deletion endpoint purges owned assessment");
  const deletedAssessment = await request(`/api/assessments/${deleteSessionId}`, { headers: deleteHeaders });
  assert(deletedAssessment.response.status === 404, "deleted assessment is no longer readable");
  const deletedAssessmentExport = await request("/api/account/export", { method: "POST", headers: deleteHeaders, body: "{}" });
  assert(deletedAssessmentExport.response.status === 201, "deleted assessment account export remains available");
  const deletedAssessmentExportFile = await request(deletedAssessmentExport.body.downloadPath, { headers: deleteHeaders });
  assert(deletedAssessmentExportFile.response.status === 200 && !deletedAssessmentExportFile.buffer.includes(Buffer.from(deleteSessionId)), "deleted assessment is physically absent from owner export");

  const internalUnauthenticated = await request("/internal/retention", { method: "POST", headers: { "X-Internal-Token": undefined }, body: JSON.stringify({ dry_run: true }) });
  assert(internalUnauthenticated.response.status === 401, "retention endpoint requires internal token");
  const retention = await request("/internal/retention", { method: "POST", headers: { "X-Internal-Token": "e2e-internal" }, body: JSON.stringify({ dry_run: true, limit: 10 }) });
  assert(retention.response.status === 200 && retention.body?.dryRun === true && retention.body?.candidateAssessments >= 1, "retention dry-run endpoint and candidate preview");
  const interruptedRetention = await request("/internal/retention", { method: "POST", headers: { "X-Internal-Token": "e2e-internal" }, body: JSON.stringify({ dry_run: false, limit: 10, fault_after_artifacts: true }) });
  assert(interruptedRetention.response.status === 200 && interruptedRetention.body?.purgedAssessments === 0, "retention interruption leaves durable job after artifact deletion");
  const retainedAfterInterruption = await request(`/api/assessments/${retentionAssessmentId}`, { headers: { "x-orbita-preview-user": retentionUserId } });
  assert(retainedAfterInterruption.response.status === 200, "retention crash boundary keeps database state recoverable");
  const retentionRun = await request("/internal/retention", { method: "POST", headers: { "X-Internal-Token": "e2e-internal" }, body: JSON.stringify({ dry_run: false, limit: 10 }) });
  assert(retentionRun.response.status === 200 && retentionRun.body?.dryRun === false && retentionRun.body?.resumedJobs >= 1 && retentionRun.body?.purgedAssessments >= 1 && retentionRun.body?.completedJobs >= 1, "retention retry completes persistent purge job");
  const purgedRetentionAssessment = await request(`/api/assessments/${retentionAssessmentId}`, { headers: { "x-orbita-preview-user": retentionUserId } });
  assert(purgedRetentionAssessment.response.status === 404, "retention purges an old completed assessment");
  const activeRetentionAssessment = await request(`/api/assessments/${activeRetentionAssessmentId}`, { headers: { "x-orbita-preview-user": retentionUserId } });
  assert(activeRetentionAssessment.response.status === 200 && activeRetentionAssessment.body?.state === "CORE_IN_PROGRESS", "retention excludes active assessment state");
  const purgeJob = runWrangler(["d1", "execute", "DB", "--local", "--config", configPath, "--persist-to", stateDir, "--command", `SELECT status,error_class,counts_json FROM purge_jobs WHERE target_id = ${sql(retentionAssessmentId)}`]);
  assert(purgeJob.includes("PURGE_COMPLETE") && !purgeJob.includes("R2_DELETE_FAILED") && !purgeJob.includes("D1_DELETE_FAILED"), "retention job reaches idempotent final state");
  console.log(`E2E smoke passed: ${sessionId}`);
} catch (error) {
  console.error(output.slice(-8000));
  throw error;
} finally {
  server.kill("SIGTERM");
  await delay(500);
}
