import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const teenUserId = `${userId}_teen`;
const teenEntitlementId = `${teenUserId}_entitlement`;
const noPaymentUserId = `${userId}_no_payment`;
const rateLimitUserId = `${userId}_rate_limit`;
const concurrentOrderId = `${userId}_concurrent`;
const refundNoKeyOrderId = `${userId}_refund_no_key`;
const retentionUserId = `${userId}_retention`;
const retentionAssessmentId = `${retentionUserId}_complete`;
const activeRetentionAssessmentId = `${retentionUserId}_active`;
const retentionOrderId = `${retentionUserId}_order`;
const retentionEntitlementId = `${retentionUserId}_entitlement`;
const activeRetentionOrderId = `${retentionUserId}_active_order`;
const activeRetentionEntitlementId = `${retentionUserId}_active_entitlement`;
const asyncPromoOrderId = `${userId}_async_promo_order`;
const asyncPromoRedemptionId = `${userId}_async_promo_redemption`;
const orphanPromoOrderId = `${userId}_orphan_promo_order`;
const orphanPromoRedemptionId = `${userId}_orphan_promo_redemption`;
const promoProbeUserId = `${userId}_promo_probe`;
const orphanPromoProbeUserId = `${userId}_orphan_promo_probe`;
const missingKeyUserId = `${userId}_missing_key`;
const missingKeyProbeUserId = `${userId}_missing_key_probe`;
const authHeaders = {
  "x-orbita-preview-user": userId,
  origin: baseUrl,
};
const teenCoreItemIds = JSON.parse(readFileSync("lib/t-skills/teen/content.v1.json", "utf8")).items75
  .map((item) => `t75-${item.n}`);

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
  const child = spawn(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "dev", "--config", configPath, "--local", "--persist-to", stateDir, "--ip", "127.0.0.1", "--inspector-port", "0", "--port", String(port), "--var", "APP_ENV:development", "--var", "ORBITA_ENV:development", "--var", "LEGAL_DOCUMENTS_APPROVED:false", "--var", `ORBITA_ADMIN_USER_IDS:${userId}`, "--var", "TEEN_BANK_ENABLED:true", "--var", "PAYMENTS_ENABLED:true", "--var", "ENTITLEMENT_MODE:payment", "--var", "AI_ENABLED:false", "--var", "PDF_SIGNING_SECRET:e2e-signing", "--var", "ORBITA_INTERNAL_TOKEN:e2e-internal", "--var", "STRIPE_WEBHOOK_SECRET:e2e-webhook", "--var", "STRIPE_SECRET_KEY: ", "--var", "ASSESSMENT_PRICE_MINOR:150000"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
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

// Always rebuild so this command verifies the current working tree rather than
// silently exercising a stale dist/ artifact from a previous release.
// Portable: build via the current node binary instead of the `npm` shim.
execFileSync(process.execPath, ["scripts/run-framework.mjs", "build"], { cwd: root, stdio: "inherit" });

const workerBundle = readFileSync(workerArtifact, "utf8");
const wranglerConfig = JSON.parse(readFileSync(configPath, "utf8"));
assert(workerBundle.includes("scheduled"), "built Worker exports a scheduled handler");
assert(wranglerConfig.triggers?.crons?.includes("0 2 * * *"), "Worker cron trigger is configured");

const migrationSql = readdirSync("drizzle")
  .filter((entry) => /^\d+_.*\.sql$/.test(entry))
  .sort()
  .map((entry) => readFileSync(`drizzle/${entry}`, "utf8"))
  .join("\n");
// Portable: large SQL goes through --file (command-line length limits vary;
// the temp dir is removed by the OS, it only holds a copy of drizzle/*.sql).
function writeMigrationsFile() {
  const dir = mkdtempSync(join(tmpdir(), "orbita-e2e-migrations-"));
  const file = join(dir, "migrations.sql");
  writeFileSync(file, migrationSql);
  return file;
}
runWrangler(["d1", "execute", "DB", "--local", "--config", configPath, "--persist-to", stateDir, "--file", writeMigrationsFile()]);

const timestamp = Date.now();
const seed = [
  `INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at, deleted_at) VALUES (${sql(userId)}, ${sql(`${userId}@local.invalid`)}, 'E2E Smoke', 'ru', ${timestamp}, ${timestamp}, NULL)`,
  `INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at, deleted_at) VALUES (${sql(deleteUserId)}, ${sql(`${deleteUserId}@local.invalid`)}, 'E2E Delete', 'ru', ${timestamp}, ${timestamp}, NULL)`,
  `INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at, deleted_at) VALUES (${sql(teenUserId)}, ${sql(`${teenUserId}@local.invalid`)}, 'E2E Teen', 'ru', ${timestamp}, ${timestamp}, NULL)`,
  `INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at, deleted_at) VALUES (${sql(noPaymentUserId)}, ${sql(`${noPaymentUserId}@local.invalid`)}, 'E2E No Payment', 'ru', ${timestamp}, ${timestamp}, NULL)`,
  `INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at, deleted_at) VALUES (${sql(rateLimitUserId)}, ${sql(`${rateLimitUserId}@local.invalid`)}, 'E2E Rate Limit', 'ru', ${timestamp}, ${timestamp}, NULL)`,
  `INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at, deleted_at) VALUES (${sql(retentionUserId)}, ${sql(`${retentionUserId}@local.invalid`)}, 'E2E Retention', 'ru', ${timestamp - 400 * 24 * 60 * 60 * 1000}, ${timestamp - 400 * 24 * 60 * 60 * 1000}, NULL)`,
  `INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at, deleted_at) VALUES (${sql(missingKeyUserId)}, ${sql(`${missingKeyUserId}@local.invalid`)}, 'E2E Missing Key', 'ru', ${timestamp}, ${timestamp}, NULL)`,
  `INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at, deleted_at) VALUES (${sql(missingKeyProbeUserId)}, ${sql(`${missingKeyProbeUserId}@local.invalid`)}, 'E2E Missing Key Probe', 'ru', ${timestamp}, ${timestamp}, NULL)`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES (${sql(retentionOrderId)}, ${sql(retentionUserId)}, 'orbita30', 150000, 'KZT', 'PAID', 'stripe', 'cs_retention', 'https://checkout.stripe.test/cs_retention', 'pi_retention', 'evt_retention', ${sql(`${retentionUserId}_idem`)}, ${timestamp - 400 * 24 * 60 * 60 * 1000}, ${timestamp - 400 * 24 * 60 * 60 * 1000})`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES (${sql(activeRetentionOrderId)}, ${sql(retentionUserId)}, 'orbita30', 150000, 'KZT', 'PAID', 'stripe', 'cs_retention_active', 'https://checkout.stripe.test/cs_retention_active', 'pi_retention_active', 'evt_retention_active', ${sql(`${retentionUserId}_active_idem`)}, ${timestamp - 400 * 24 * 60 * 60 * 1000}, ${timestamp - 400 * 24 * 60 * 60 * 1000})`,
  `INSERT OR IGNORE INTO entitlements (id, order_id, user_id, test_id, status, created_at, revoked_at) VALUES (${sql(retentionEntitlementId)}, ${sql(retentionOrderId)}, ${sql(retentionUserId)}, 'orbita30', 'ACTIVE', ${timestamp - 400 * 24 * 60 * 60 * 1000}, NULL)`,
  `INSERT OR IGNORE INTO entitlements (id, order_id, user_id, test_id, status, created_at, revoked_at) VALUES (${sql(activeRetentionEntitlementId)}, ${sql(activeRetentionOrderId)}, ${sql(retentionUserId)}, 'orbita30', 'ACTIVE', ${timestamp - 400 * 24 * 60 * 60 * 1000}, NULL)`,
  `INSERT OR IGNORE INTO assessments (id, user_id, entitlement_id, test_id, locale, state, versions_json, adaptive_item_ids_json, selection_mode, preliminary_score_json, final_score_json, report_id, client_seq, created_at, consented_at, completed_at, purge_state, purge_after, updated_at) VALUES (${sql(retentionAssessmentId)}, ${sql(retentionUserId)}, ${sql(retentionEntitlementId)}, 'orbita30', 'ru', 'COMPLETE', '{}', '[]', NULL, NULL, NULL, NULL, 0, ${timestamp - 400 * 24 * 60 * 60 * 1000}, NULL, ${timestamp - 400 * 24 * 60 * 60 * 1000}, 'ACTIVE', ${timestamp - 1}, ${timestamp - 400 * 24 * 60 * 60 * 1000})`,
  `INSERT OR IGNORE INTO assessments (id, user_id, entitlement_id, test_id, locale, state, versions_json, adaptive_item_ids_json, selection_mode, preliminary_score_json, final_score_json, report_id, client_seq, created_at, consented_at, completed_at, purge_state, purge_after, updated_at) VALUES (${sql(activeRetentionAssessmentId)}, ${sql(retentionUserId)}, ${sql(activeRetentionEntitlementId)}, 'orbita30', 'ru', 'CORE_IN_PROGRESS', '{}', '[]', NULL, NULL, NULL, NULL, 0, ${timestamp - 400 * 24 * 60 * 60 * 1000}, NULL, NULL, 'ACTIVE', ${timestamp - 1}, ${timestamp - 400 * 24 * 60 * 60 * 1000})`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES ('${userId}_ord', ${sql(userId)}, 'orbita30', 150000, 'KZT', 'PAID', 'stripe', 'cs_e2e', 'https://checkout.stripe.test/cs_e2e', 'pi_e2e', 'evt_e2e', ${sql(`${userId}_idem`)}, ${timestamp}, ${timestamp})`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES (${sql(refundNoKeyOrderId)}, ${sql(userId)}, 'orbita30', 150000, 'KZT', 'PAID', 'stripe', 'cs_refund_no_key', 'https://checkout.stripe.test/cs_refund_no_key', 'pi_refund_no_key', 'evt_refund_no_key', ${sql(`${userId}_refund_no_key_idem`)}, ${timestamp}, ${timestamp})`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES ('${userId}_pending', ${sql(userId)}, 'orbita30', 150000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'cs_pending', NULL, NULL, NULL, ${sql(`${userId}_pending_idem`)}, ${timestamp}, ${timestamp})`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES (${sql(concurrentOrderId)}, ${sql(userId)}, 'orbita30', 150000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'cs_concurrent', NULL, NULL, NULL, ${sql(`${userId}_concurrent_idem`)}, ${timestamp}, ${timestamp})`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, provider_checkout_url, provider_payment_id, provider_event_id, idempotency_key, created_at, updated_at) VALUES (${sql(`${deleteUserId}_ord`)}, ${sql(deleteUserId)}, 'orbita30', 150000, 'KZT', 'PAID', 'stripe', 'cs_delete', 'https://checkout.stripe.test/cs_delete', 'pi_delete', 'evt_delete', ${sql(`${deleteUserId}_idem`)}, ${timestamp}, ${timestamp})`,
  `INSERT OR IGNORE INTO entitlements (id, order_id, user_id, test_id, status, created_at, revoked_at) VALUES ('${userId}_ent', '${userId}_ord', ${sql(userId)}, 'orbita30', 'ACTIVE', ${timestamp}, NULL)`,
  `INSERT OR IGNORE INTO entitlements (id, order_id, user_id, test_id, status, created_at, revoked_at) VALUES (${sql(`${refundNoKeyOrderId}_ent`)}, ${sql(refundNoKeyOrderId)}, ${sql(userId)}, 'orbita30', 'ACTIVE', ${timestamp}, NULL)`,
  `INSERT OR IGNORE INTO entitlements (id, order_id, user_id, test_id, status, created_at, revoked_at) VALUES (${sql(`${deleteUserId}_ent`)}, ${sql(`${deleteUserId}_ord`)}, ${sql(deleteUserId)}, 'orbita30', 'ACTIVE', ${timestamp}, NULL)`,
  `INSERT OR IGNORE INTO entitlements (id, order_id, user_id, test_id, grant_source, grant_reference, status, created_at, revoked_at, expires_at) VALUES (${sql(teenEntitlementId)}, NULL, ${sql(teenUserId)}, 't-skills', 'beta_free', ${sql(`beta_free:${teenUserId}:t-skills`)}, 'ACTIVE', ${timestamp}, NULL, NULL)`,
  `INSERT OR IGNORE INTO campaigns (id, name, client_name, client_type, seat_limit, status, default_test_id, created_by, created_at, updated_at) VALUES ('camp_async_reservation', 'Async reservation campaign', 'E2E', 'COMPANY', 2, 'ACTIVE', 'orbita30', ${sql(userId)}, ${timestamp}, ${timestamp})`,
  `INSERT OR IGNORE INTO promo_codes (id, code, name, description, discount_type, discount_value, currency, max_total_uses, max_uses_per_user, valid_from, valid_until, minimum_order_amount, new_users_only, allowed_test_ids_json, allowed_email_domains_json, allowed_user_ids_json, campaign_id, status, created_by, created_at, updated_by, updated_at) VALUES ('promo_async_reservation', 'ASYNC1', 'Async payment reservation', '', 'PERCENT', 10, 'KZT', 1, 1, ${timestamp - 1000}, ${timestamp + 86400000}, NULL, 0, '["orbita30"]', '[]', '[]', 'camp_async_reservation', 'ACTIVE', ${sql(userId)}, ${timestamp}, ${sql(userId)}, ${timestamp})`,
  `INSERT OR IGNORE INTO promo_codes (id, code, name, description, discount_type, discount_value, currency, max_total_uses, max_uses_per_user, valid_from, valid_until, minimum_order_amount, new_users_only, allowed_test_ids_json, allowed_email_domains_json, allowed_user_ids_json, campaign_id, status, created_by, created_at, updated_by, updated_at) VALUES ('promo_orphan_reservation', 'ORPHAN1', 'Orphan checkout reservation', '', 'PERCENT', 10, 'KZT', 1, 1, ${timestamp - 1000}, ${timestamp + 86400000}, NULL, 0, '["orbita30"]', '[]', '[]', NULL, 'ACTIVE', ${sql(userId)}, ${timestamp}, ${sql(userId)}, ${timestamp})`,
  `INSERT OR IGNORE INTO promo_codes (id, code, name, description, discount_type, discount_value, currency, max_total_uses, max_uses_per_user, valid_from, valid_until, minimum_order_amount, new_users_only, allowed_test_ids_json, allowed_email_domains_json, allowed_user_ids_json, campaign_id, status, created_by, created_at, updated_by, updated_at) VALUES ('promo_missing_key', 'MISSING1', 'Missing Stripe key cleanup', '', 'PERCENT', 10, 'KZT', 1, 1, ${timestamp - 1000}, ${timestamp + 86400000}, NULL, 0, '["t-skills"]', '[]', '[]', NULL, 'ACTIVE', ${sql(userId)}, ${timestamp}, ${sql(userId)}, ${timestamp})`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, original_amount_minor, discount_amount_minor, final_amount_minor, currency, status, provider, promo_code_id, campaign_id, provider_checkout_id, idempotency_key, created_at, updated_at) VALUES (${sql(asyncPromoOrderId)}, ${sql(userId)}, 'orbita30', 135000, 150000, 15000, 135000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'promo_async_reservation', 'camp_async_reservation', 'cs_async_reservation', ${sql(`${userId}_async_promo_idem`)}, ${timestamp - 3600000}, ${timestamp - 3600000})`,
  `INSERT OR IGNORE INTO promo_redemptions (id, promo_code_id, user_id, order_id, campaign_id, original_amount_minor, discount_amount_minor, final_amount_minor, currency, reserved_at, reservation_expires_at, released_at, redeemed_at, status) VALUES (${sql(asyncPromoRedemptionId)}, 'promo_async_reservation', ${sql(userId)}, ${sql(asyncPromoOrderId)}, 'camp_async_reservation', 150000, 15000, 135000, 'KZT', ${timestamp - 3600000}, ${timestamp - 1000}, NULL, ${timestamp - 3600000}, 'RESERVED')`,
  `INSERT OR IGNORE INTO campaign_seat_reservations (id, campaign_id, user_id, order_id, checkout_session_id, status, reserved_at, expires_at, claimed_at, released_at, created_at, updated_at) VALUES (${sql(`${userId}_async_promo_seat`)}, 'camp_async_reservation', ${sql(userId)}, ${sql(asyncPromoOrderId)}, 'cs_async_reservation', 'RESERVED', ${timestamp - 3600000}, ${timestamp - 1000}, NULL, NULL, ${timestamp - 3600000}, ${timestamp - 3600000})`,
  `INSERT OR IGNORE INTO orders (id, user_id, test_id, amount_minor, original_amount_minor, discount_amount_minor, final_amount_minor, currency, status, provider, promo_code_id, provider_checkout_id, idempotency_key, created_at, updated_at) VALUES (${sql(orphanPromoOrderId)}, ${sql(userId)}, 'orbita30', 135000, 150000, 15000, 135000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'promo_orphan_reservation', NULL, ${sql(`${userId}_orphan_promo_idem`)}, ${timestamp - 3600000}, ${timestamp - 3600000})`,
  `INSERT OR IGNORE INTO promo_redemptions (id, promo_code_id, user_id, order_id, campaign_id, original_amount_minor, discount_amount_minor, final_amount_minor, currency, reserved_at, reservation_expires_at, released_at, redeemed_at, status) VALUES (${sql(orphanPromoRedemptionId)}, 'promo_orphan_reservation', ${sql(userId)}, ${sql(orphanPromoOrderId)}, NULL, 150000, 15000, 135000, 'KZT', ${timestamp - 3600000}, ${timestamp - 1000}, NULL, ${timestamp - 3600000}, 'RESERVED')`,
].join(";");
runWrangler(["d1", "execute", "DB", "--local", "--config", configPath, "--persist-to", stateDir, "--command", seed]);

let server = startServer();

try {
  await waitForServer();
  const catalog = await request("/api/catalog", { headers: { origin: undefined } });
  assert(catalog.response.status === 200, "public catalog");
  assert(catalog.body?.test?.amountMinor === 150000 && catalog.body?.test?.currency === "KZT", "backend price and currency are public");
  assert(catalog.body?.legal?.reviewStatus?.includes("Черновик") && catalog.body?.legal?.entityName === "[юридическое лицо оператора не настроено]", "public catalog does not publish unapproved legal fallback facts");
  const localHealth = await request("/api/health");
  assert(localHealth.body?.legalDocumentsApproved === false && localHealth.body?.productionDataIntakeEnabled === true, "local health separates legal approval from local smoke availability");
  assert(catalog.response.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "CSP is attached to public responses");
  assert(catalog.response.headers.get("strict-transport-security"), "HSTS is attached to public responses");
  assert(catalog.response.headers.get("x-content-type-options") === "nosniff", "content sniffing is disabled");
  const legacyCatalog = await request("/api/catalog?locale=kz");
  assert(legacyCatalog.body?.locale?.canonical === "kk" && legacyCatalog.body?.locale?.legacyAlias === true && legacyCatalog.body?.locale?.status === "unpublished", "legacy kz resolves to canonical kk without publishing it");

  const unauth = await fetch(`${baseUrl}/api/account`);
  assert(unauth.status === 401, "unauthenticated account is rejected");

  const refundNoKeyPath = `/api/admin/orders/${encodeURIComponent(refundNoKeyOrderId)}/refund`;
  const refundWithoutCsrf = await request(refundNoKeyPath, { method: "POST", body: "{}" });
  assert(refundWithoutCsrf.response.status === 403, "admin refund mutation requires CSRF even for allowlisted local admin");
  const csrfToken = "e2e-refund-csrf-token";
  const refundWithoutStripeKey = await request(refundNoKeyPath, {
    method: "POST",
    headers: { cookie: `orbita_csrf=${csrfToken}`, "x-csrf-token": csrfToken },
    body: "{}",
  });
  assert(refundWithoutStripeKey.response.status === 503 && refundWithoutStripeKey.body?.error?.code === "STRIPE_SECRET_KEY_MISSING", "refund refuses to change a paid order when Stripe is not configured");
  const untouchedRefundOrder = await request(`/api/admin/orders/${encodeURIComponent(refundNoKeyOrderId)}`);
  assert(untouchedRefundOrder.body?.order?.status === "PAID" && untouchedRefundOrder.body?.entitlement?.status === "ACTIVE", "missing Stripe configuration leaves payment and access intact");

  const adminCsrfToken = "e2e-admin-csrf-token";
  const adminCsrfHeaders = { cookie: `orbita_csrf=${adminCsrfToken}`, "x-csrf-token": adminCsrfToken };
  const faqDraftV1 = await request("/api/admin/content", {
    method: "POST",
    headers: adminCsrfHeaders,
    body: JSON.stringify({ content_key: "faq", locale: "ru", expected_version: 0, payload: { title: "FAQ v1", items: [{ q: "Q1?", a: "A1." }] } }),
  });
  assert(faqDraftV1.response.status === 201 && faqDraftV1.body?.version === 1, "CMS accepts a valid FAQ title/items draft with an initial version token");
  const faqDraftV2 = await request("/api/admin/content", {
    method: "POST",
    headers: adminCsrfHeaders,
    body: JSON.stringify({ content_key: "faq", locale: "ru", expected_version: 1, payload: { title: "FAQ v2", items: [{ q: "Q2?", a: "A2." }] } }),
  });
  assert(faqDraftV2.response.status === 201 && faqDraftV2.body?.version === 2, "CMS saves the next FAQ version with compare-and-swap");
  const staleFaqPublish = await request("/api/admin/content/faq/publish", {
    method: "POST",
    headers: adminCsrfHeaders,
    body: JSON.stringify({ locale: "ru", version: 1, reason: "stale publish regression" }),
  });
  assert(staleFaqPublish.response.status === 409, "CMS refuses to publish a stale FAQ version");
  const currentFaqPublish = await request("/api/admin/content/faq/publish", {
    method: "POST",
    headers: adminCsrfHeaders,
    body: JSON.stringify({ locale: "ru", version: 2, reason: "current publish regression" }),
  });
  assert(currentFaqPublish.response.status === 200 && currentFaqPublish.body?.version === 2, "CMS publishes only the current FAQ draft");
  const publicFaq = await request("/api/content?content_key=faq&locale=ru");
  assert(Array.isArray(publicFaq.body) && publicFaq.body[0]?.published?.title === "FAQ v2", "public CMS exposes the published FAQ title and payload");

  const malformedTeenPdf = await request("/api/teen/pdf", { method: "POST", body: "{" });
  assert(malformedTeenPdf.response.status === 400 && malformedTeenPdf.body?.error === "INVALID_BODY", "malformed teen PDF JSON is a client error");
  const invalidTeenPdf = await request("/api/teen/pdf", { method: "POST", body: JSON.stringify({ report: {} }) });
  assert(invalidTeenPdf.response.status === 422 && invalidTeenPdf.body?.error === "INVALID_REPORT", "invalid teen PDF report is rejected safely");
  const oversizedChunk = new Uint8Array(1024 * 1024 + 1024);
  const oversizedPdfBody = new ReadableStream({
    start(controller) {
      controller.enqueue(oversizedChunk);
      controller.enqueue(oversizedChunk);
      controller.close();
    },
  });
  const oversizedTeenPdf = await fetch(`${baseUrl}/api/teen/pdf`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: oversizedPdfBody,
    duplex: "half",
    signal: AbortSignal.timeout(15000),
  });
  assert(oversizedTeenPdf.status === 413, "streamed teen PDF request is stopped at the byte limit");

  const teenHeaders = { "x-orbita-preview-user": teenUserId };
  const teenAssessment = await request("/api/assessments", {
    method: "POST",
    headers: teenHeaders,
    body: JSON.stringify({ test_id: "t-skills" }),
  });
  assert(teenAssessment.response.status === 201 && teenAssessment.body?.state === "ENTITLED" && teenAssessment.body?.versions?.assessment === "t-skills-teen-v2", "active teen runtime creates a versioned entitled assessment");
  const teenSessionId = teenAssessment.body.id;
  const teenConsent = await request(`/api/assessments/${teenSessionId}`, {
    method: "PATCH",
    headers: teenHeaders,
    body: JSON.stringify({ consents: { terms: true, privacy: true, research: false, marketing: false } }),
  });
  assert(teenConsent.response.status === 200, "active teen assessment records versioned consent");
  const teenOnboarding = await request(`/api/assessments/${teenSessionId}/onboarding`, {
    method: "PUT",
    headers: teenHeaders,
    body: JSON.stringify({
      age: 16,
      education_level: "school",
      favorite_subjects: ["math", "physics"],
      value_ranking: ["growth", "creative-freedom", "income", "stability", "value-autonomy", "social-impact", "status", "work-life-balance"],
    }),
  });
  assert(teenOnboarding.response.status === 200, "active teen onboarding validates values and subjects");
  for (const [index, itemId] of teenCoreItemIds.entries()) {
    const response = await request(`/api/assessments/${teenSessionId}/responses`, {
      method: "POST",
      headers: { ...teenHeaders, "Idempotency-Key": `${teenSessionId}:${itemId}` },
      body: JSON.stringify({ item_id: itemId, response: [2, 1, -1, -2][index % 4], response_time_ms: 1000, client_seq: index + 1 }),
    });
    assert(response.response.status === 200, `save active teen core ${itemId} (${response.response.status})`);
  }
  const teenClarifications = await request(`/api/assessments/${teenSessionId}/complete-core`, {
    method: "POST",
    headers: teenHeaders,
    body: "{}",
  });
  assert(teenClarifications.response.status === 200 && teenClarifications.body?.adaptive_items?.length === 8 && teenClarifications.body?.state === "ADAPTIVE_IN_PROGRESS", "active teen runtime selects the expected 8 ambiguity questions");
  for (const [index, question] of teenClarifications.body.adaptive_items.entries()) {
    const itemId = question.id;
    const response = await request(`/api/assessments/${teenSessionId}/responses`, {
      method: "POST",
      headers: { ...teenHeaders, "Idempotency-Key": `${teenSessionId}:${itemId}` },
      body: JSON.stringify({ item_id: itemId, response: index % 4, response_time_ms: 1000, client_seq: teenCoreItemIds.length + index + 1 }),
    });
    assert(response.response.status === 200, `save active teen clarification ${itemId} (${response.response.status})`);
  }
  const teenComplete = await request(`/api/assessments/${teenSessionId}/complete`, {
    method: "POST",
    headers: teenHeaders,
    body: "{}",
  });
  assert(teenComplete.response.status === 200 && teenComplete.body?.score?.versions?.assessment === "t-skills-teen-v2" && teenComplete.body?.score?.answered === 83, "active teen scoring and completion persist the current version");
  assert(teenComplete.body?.report?.coreQuestionCount === 75 && teenComplete.body?.report?.adaptiveQuestionCount === 8 && teenComplete.body?.report?.career?.ranking?.length === 170, "active teen report includes core, clarifications and the complete approved career catalog");

  const campaigns = await request("/api/admin/campaigns");
  const asyncCampaign = campaigns.body?.data?.find((campaign) => campaign.id === "camp_async_reservation");
  assert(campaigns.response.status === 200 && asyncCampaign?.reserved === 1 && asyncCampaign?.unused === 1, "campaign list subtracts provider-backed overdue reservations from unused seats");
  const campaignDetail = await request("/api/admin/campaigns/camp_async_reservation");
  assert(campaignDetail.response.status === 200 && campaignDetail.body?.metrics?.reserved === 1 && campaignDetail.body?.metrics?.unused === 1, "campaign detail counts provider-backed overdue reservations");
  const promoList = await request("/api/admin/promo-codes?search=ASYNC1");
  const asyncPromo = promoList.body?.data?.find((promo) => promo.code === "ASYNC1");
  assert(promoList.response.status === 200 && asyncPromo?.status === "EXHAUSTED" && asyncPromo?.usage?.reserved === 1 && asyncPromo?.usage?.remaining === 0, "promo list accounts for reserved provider sessions in status and remaining count");
  const promoDetail = await request("/api/admin/promo-codes/promo_async_reservation");
  assert(promoDetail.response.status === 200 && promoDetail.body?.promo?.usage?.reserved === 1 && promoDetail.body?.promo?.usage?.remaining === 0, "promo detail reports reserved provider-backed capacity");
  const adminOverview = await request("/api/admin/overview");
  assert(
    adminOverview.response.status === 200
      && adminOverview.body?.promotions?.remainingCampaignAccesses === 1
      && adminOverview.body?.systemHealth?.overduePromoReservations === 1
      && adminOverview.body?.systemHealth?.overdueCampaignReservations === 1,
    "admin overview subtracts and surfaces provider-backed overdue reservations",
  );

  const overdueProviderReservation = await request("/api/checkout/validate-promo", {
    method: "POST",
    body: JSON.stringify({ code: "ASYNC1", test_id: "orbita30" }),
  });
  assert(
    overdueProviderReservation.response.status === 409 && overdueProviderReservation.body?.error === "PROMO_USAGE_LIMIT_REACHED",
    "expired local hold stays reserved while a Stripe checkout outcome is pending",
  );
  const asyncPayment = await signedStripeEvent({
    id: `${userId}_async_payment_succeeded`,
    type: "checkout.session.async_payment_succeeded",
    data: { object: { id: "cs_async_reservation", client_reference_id: asyncPromoOrderId, payment_status: "paid", amount_total: 135000, currency: "kzt", payment_intent: "pi_async_reservation", metadata: { order_id: asyncPromoOrderId, test_id: "orbita30" } } },
  });
  assert(asyncPayment.response.status === 200 && asyncPayment.body?.status === "PAID", "late asynchronous payment redeems the existing reservation");
  const campaignAfterPayment = await request("/api/admin/campaigns/camp_async_reservation");
  assert(campaignAfterPayment.response.status === 200 && campaignAfterPayment.body?.metrics?.activated === 1 && campaignAfterPayment.body?.metrics?.reserved === 0 && campaignAfterPayment.body?.metrics?.unused === 1, "campaign seat is claimed after the asynchronous payment settles");
  const promoStillConsumed = await request("/api/checkout/validate-promo", {
    method: "POST",
    headers: { "x-orbita-preview-user": promoProbeUserId },
    body: JSON.stringify({ code: "ASYNC1", test_id: "orbita30" }),
  });
  assert(promoStillConsumed.response.status === 409 && promoStillConsumed.body?.error === "PROMO_USAGE_LIMIT_REACHED", "late payment remains counted against the global promo limit");

  const orphanReservationReleased = await request("/api/checkout/validate-promo", {
    method: "POST",
    headers: { "x-orbita-preview-user": orphanPromoProbeUserId },
    body: JSON.stringify({ code: "ORPHAN1", test_id: "orbita30" }),
  });
  assert(orphanReservationReleased.response.status === 200 && orphanReservationReleased.body?.valid === true, "expired reservation without a provider session is released");

  const missingStripeKeyCheckout = await request("/api/checkout", {
    method: "POST",
    headers: { "x-orbita-preview-user": missingKeyUserId },
    body: JSON.stringify({ test_id: "t-skills", promo_code: "MISSING1" }),
  });
  assert(missingStripeKeyCheckout.response.status === 503 && missingStripeKeyCheckout.body?.error === "STRIPE_SECRET_KEY_MISSING", "checkout fails closed when the Stripe secret is absent");
  const releasedAfterConfigFailure = await request("/api/checkout/validate-promo", {
    method: "POST",
    headers: { "x-orbita-preview-user": missingKeyProbeUserId },
    body: JSON.stringify({ code: "MISSING1", test_id: "t-skills" }),
  });
  assert(releasedAfterConfigFailure.response.status === 200 && releasedAfterConfigFailure.body?.valid === true, "failed checkout setup immediately releases its promo reservation");

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
  assert(session.body.locale === "ru" && session.body.versions.assessment === "orbita30_ru_v2" && session.body.versions.itemBank === "core60-v1" && session.body.versions.translation === "ru-source-v1", "assessment captures v2 versions and canonical locale");
  const otherUser = await request(`/api/assessments/${sessionId}`, { headers: { "x-orbita-preview-user": `${userId}_other` } });
  assert(otherUser.response.status === 404, "user B cannot read user A assessment by direct ID");
  const consent = await request(`/api/assessments/${sessionId}`, { method: "PATCH", body: JSON.stringify({ consents: { terms: true, privacy: true, research: false, marketing: false } }) });
  assert(consent.response.status === 200, "versioned consent");

  let sequence = 1;
  for (let number = 1; number <= 60; number += 1) {
    const itemId = `Q${String(number).padStart(3, "0")}`;
    const value = number <= 30 ? 4 : 0;
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
      assert(resumed.response.status === 200 && resumed.body?.responses?.Q001 === value && resumed.body?.next_item_id === "Q002" && resumed.body?.core_answered === 1, "assessment resumes after Worker restart with the next item");
    }
    sequence += 1;
  }
  const adaptive = await request(`/api/assessments/${sessionId}/complete-core`, { method: "POST", body: "{}" });
  assert(adaptive.response.status === 200 && adaptive.body?.adaptive?.selectedItemIds?.length >= 10 && adaptive.body?.adaptive?.selectedItemIds?.length <= 15 && adaptive.body?.adaptive_items?.length === adaptive.body?.adaptive?.selectedItemIds?.length, "v2 adaptive generation/fallback selection");
  assert(adaptive.body?.state === "ADAPTIVE_FALLBACK" && adaptive.body?.adaptive?.mode === "approved-fallback", "local E2E uses approved adaptive fallback");
  for (const question of adaptive.body.adaptive_items) {
    const itemId = question.questionId;
    const value = question.format === "forced_choice" ? 0 : 4;
    const response = await request(`/api/assessments/${sessionId}/responses`, { method: "POST", headers: { "Idempotency-Key": `${sessionId}:${itemId}` }, body: JSON.stringify({ item_id: itemId, response: value, response_time_ms: 1000, client_seq: sequence }) });
    assert(response.response.status === 200, `save ${itemId} (${response.response.status}): ${JSON.stringify(response.body)}`);
    sequence += 1;
  }
  const completed = await request(`/api/assessments/${sessionId}/complete`, { method: "POST", body: "{}" });
  assert([200, 202].includes(completed.response.status), "complete assessment");
  assert(completed.body?.score?.normStatus === "unvalidated" && completed.body?.score?.versions?.assessment === "orbita30_ru_v2", "norm-safe v2 score persisted");
  assert(completed.body?.report?.assessmentVersion === "orbita30_ru_v2" && completed.body?.report?.coreQuestionCount === 60 && completed.body?.report?.adaptiveQuestionCount >= 10 && completed.body?.report?.adaptiveQuestionCount <= 15 && completed.body?.report?.adaptiveFallbackUsed === true, "v2 report metadata");
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
  const rateLimitWindow = Date.now();
  // Seed a nearby future bucket so this assertion cannot straddle a minute boundary.
  const rateLimitWindowStartedAt = Math.ceil(rateLimitWindow / (60 * 1000)) * (60 * 1000) + 60 * 1000;
  runWrangler(["d1", "execute", "DB", "--local", "--config", configPath, "--persist-to", stateDir, "--command", `INSERT OR REPLACE INTO rate_limits (bucket_key, window_started_at, request_count, updated_at) VALUES (${sql(`telemetry:${rateLimitUserId}`)}, ${rateLimitWindowStartedAt}, 119, ${rateLimitWindow})`]);
  const rateLimitHeaders = { "x-orbita-preview-user": rateLimitUserId };
  const allowedAtLimit = await request("/api/telemetry", { method: "POST", headers: rateLimitHeaders, body: JSON.stringify({ name: "test_view", metadata: { status: "at_limit" } }) });
  assert(allowedAtLimit.response.status === 200, `rate-limit allows request 120 (${allowedAtLimit.response.status})`);
  const rateLimited = await request("/api/telemetry", { method: "POST", headers: rateLimitHeaders, body: JSON.stringify({ name: "test_view", metadata: { status: "over_limit" } }) });
  const allowedBeforeLimit = allowedAtLimit.response.status === 200 ? 120 : 0;
  assert(allowedBeforeLimit === 120, `rate-limit allows exactly 120 requests, got ${allowedBeforeLimit}`);
  assert(rateLimited?.response.status === 429 && rateLimited.response.headers.get("retry-after"), `mutation rate limit returns 429 and Retry-After (${rateLimited?.response.status})`);
  const exported = await request("/api/account/export", { method: "POST", body: "{}" });
  assert(exported.response.status === 201 && typeof exported.body?.downloadPath === "string", "data export");
  const exportedFile = await request(exported.body.downloadPath);
  assert(exportedFile.response.status === 200 && exportedFile.buffer.includes(Buffer.from("responses")) && exportedFile.buffer.includes(Buffer.from("response_source")) && exportedFile.buffer.includes(Buffer.from("adaptiveQuestions")) && exportedFile.buffer.includes(Buffer.from("presentation_metadata_json")) && exportedFile.buffer.includes(Buffer.from("itemBankVersion")), "export artifact includes v2 response source and adaptive snapshots");
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
  const refund = await signedStripeEvent({ id: `${userId}_refund_event`, type: "charge.refunded", data: { object: { id: "ch_refund", amount: 150000, amount_refunded: 150000, refunded: true, currency: "kzt", payment_intent: "pi_pending", metadata: { order_id: `${userId}_pending` } } } });
  assert(refund.response.status === 200 && refund.body?.status === "REFUNDED" && refund.body?.orderStatus === "REFUNDED", "full refund event records operational state");
  const latePaid = await signedStripeEvent({ ...event, id: `${userId}_late_paid_after_refund` });
  assert(latePaid.response.status === 200 && latePaid.body?.orderStatus === "REFUNDED" && latePaid.body?.entitlementCreated === false, "late paid webhook cannot downgrade a refunded order or grant access");
  const refundedOrderDetail = await request(`/api/admin/orders/${encodeURIComponent(`${userId}_pending`)}`);
  assert(refundedOrderDetail.body?.order?.status === "REFUNDED" && refundedOrderDetail.body?.entitlement?.status === "REVOKED", "full refund revokes the entitlement");

  const partialRefund = await signedStripeEvent({ id: `${userId}_partial_refund_event`, type: "charge.refunded", data: { object: { id: "ch_e2e", amount: 150000, amount_refunded: 25000, refunded: false, currency: "kzt", payment_intent: "pi_e2e", metadata: { order_id: `${userId}_ord` } } } });
  assert(partialRefund.response.status === 200 && partialRefund.body?.status === "PARTIALLY_REFUNDED" && partialRefund.body?.orderStatus === "PARTIALLY_REFUNDED", "partial charge refund is not treated as a full refund");
  const partialRefundOrder = await request(`/api/admin/orders/${encodeURIComponent(`${userId}_ord`)}`);
  assert(partialRefundOrder.body?.order?.status === "PARTIALLY_REFUNDED" && partialRefundOrder.body?.entitlement?.status === "ACTIVE", "partial refund preserves access");
  const pendingPartialRefund = await signedStripeEvent({ id: `${userId}_pending_partial_refund_event`, type: "refund.created", data: { object: { id: "re_pending_partial", amount: 5000, currency: "kzt", payment_intent: "pi_e2e", status: "pending", metadata: { order_id: `${userId}_ord` } } } });
  assert(pendingPartialRefund.response.status === 200 && pendingPartialRefund.body?.status === "REFUND_PENDING" && pendingPartialRefund.body?.orderStatus === "PARTIALLY_REFUNDED", "pending follow-up refund preserves the completed partial refund status");
  const pendingRefundOverview = await request("/api/admin/overview");
  assert(pendingRefundOverview.body?.systemHealth?.pendingRefunds === 1, "admin health counts a pending refund event for a partially refunded order");
  const failedRefund = await signedStripeEvent({ id: `${userId}_failed_refund_event`, type: "refund.failed", data: { object: { id: "re_failed", amount: 15000, currency: "kzt", payment_intent: "pi_e2e", status: "failed", metadata: { order_id: `${userId}_ord` } } } });
  assert(failedRefund.response.status === 200 && failedRefund.body?.status === "REFUND_FAILED" && failedRefund.body?.orderStatus === "PARTIALLY_REFUNDED", "failed refund does not erase a previously completed partial refund");
  const settledRefundOverview = await request("/api/admin/overview");
  assert(settledRefundOverview.body?.systemHealth?.pendingRefunds === 0 && settledRefundOverview.body?.systemHealth?.failedRefunds === 1, "admin health clears the pending refund and counts the provider failure");
  const fullAfterPartial = await signedStripeEvent({ id: `${userId}_full_after_partial_event`, type: "charge.refunded", data: { object: { id: "ch_e2e", amount: 150000, amount_refunded: 150000, refunded: true, currency: "kzt", payment_intent: "pi_e2e", metadata: { order_id: `${userId}_ord` } } } });
  assert(fullAfterPartial.response.status === 200 && fullAfterPartial.body?.orderStatus === "REFUNDED", "cumulative full refund finalizes a partially refunded order");
  const fullAfterPartialOrder = await request(`/api/admin/orders/${encodeURIComponent(`${userId}_ord`)}`);
  assert(fullAfterPartialOrder.body?.entitlement?.status === "REVOKED", "cumulative full refund revokes access");
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
  const deleteAnswer = await request(`/api/assessments/${deleteSessionId}/responses`, { method: "POST", headers: { ...deleteHeaders, "Idempotency-Key": `${deleteSessionId}:Q001` }, body: JSON.stringify({ item_id: "Q001", response: 4, response_time_ms: 1000, client_seq: 1 }) });
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
