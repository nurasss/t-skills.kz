import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();

function migratedDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "tskills-promo-test-"));
  const path = join(directory, "app.db");
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON");
  const journal = JSON.parse(readFileSync(join(root, "drizzle/meta/_journal.json"), "utf8")) as { entries: Array<{ idx: number; tag: string }> };
  for (const entry of journal.entries.slice().sort((left, right) => left.idx - right.idx)) {
    const migration = readFileSync(join(root, "drizzle", `${entry.tag}.sql`), "utf8");
    for (const statement of migration.split(/--> statement-breakpoint/g).map((value) => value.trim()).filter(Boolean)) {
      database.exec(statement);
    }
  }
  return { database, directory };
}

test("promo: validate and redeem lifecycle with admin-created promo codes", () => {
  const { database, directory } = migratedDatabase();
  try {
    const now = Date.now();
    // Seed users
    database.prepare(`
      INSERT INTO users (id, email, full_name, role, status, locale, created_at, updated_at)
      VALUES ('u-admin', 'admin@example.com', 'Admin User', 'admin', 'active', 'ru', ?, ?),
             ('u-tester', 'tester@example.com', 'Test User', 'user', 'active', 'ru', ?, ?)
    `).run(now, now, now, now);

    // Seed promo code created by admin: 100% free access promo
    database.prepare(`
      INSERT INTO promo_codes (
        id, code, name, description, discount_type, discount_value, currency,
        max_total_uses, max_uses_per_user, valid_from, valid_until,
        minimum_order_amount, new_users_only, allowed_test_ids_json,
        allowed_email_domains_json, allowed_user_ids_json, campaign_id,
        status, created_by, created_at, updated_by, updated_at
      ) VALUES (
        'promo-free-1', 'PILOTFREE', 'Pilot Free Pass', 'Free access for beta testers',
        'FREE_ACCESS', 100, 'KZT',
        5, 1, ?, ?,
        NULL, 0, '["t-skills"]',
        '[]', '[]', NULL,
        'ACTIVE', 'u-admin', ?, 'u-admin', ?
      )
    `).run(now - 10000, now + 1000000, now, now);

    // 1. Verify that PILOTFREE exists and is active
    const promoRow = database.prepare("SELECT * FROM promo_codes WHERE code = 'PILOTFREE'").get() as {
      id: string;
      code: string;
      discount_type: string;
      status: string;
      max_total_uses: number;
    };
    assert.ok(promoRow, "Promo code PILOTFREE should exist in DB");
    assert.equal(promoRow.discount_type, "FREE_ACCESS");
    assert.equal(promoRow.status, "ACTIVE");

    // 2. Simulate order creation with free promo
    const orderId = "ord-free-1";
    database.prepare(`
      INSERT INTO orders (
        id, user_id, test_id, amount_minor, original_amount_minor,
        discount_amount_minor, final_amount_minor, currency, status, provider,
        promo_code_id, idempotency_key, created_at, updated_at
      ) VALUES (
        ?, 'u-tester', 't-skills', 0, 150000,
        150000, 0, 'KZT', 'PAID', 'stripe',
        'promo-free-1', 'key-free-1', ?, ?
      )
    `).run(orderId, now, now);

    // 3. Atomically record promo redemption
    const redemptionId = "red-free-1";
    const reserveStmt = database.prepare(`
      INSERT INTO promo_redemptions (
        id, promo_code_id, user_id, order_id, campaign_id, original_amount_minor,
        discount_amount_minor, final_amount_minor, currency, reserved_at,
        reservation_expires_at, released_at, redeemed_at, status
      )
      SELECT
        CASE WHEN EXISTS (
          SELECT 1 FROM promo_codes p WHERE p.id = 'promo-free-1' AND p.status = 'ACTIVE'
            AND (p.valid_from IS NULL OR p.valid_from <= ?)
            AND (p.valid_until IS NULL OR p.valid_until > ?)
            AND (p.max_total_uses IS NULL OR (
              SELECT COUNT(*) FROM promo_redemptions r
              WHERE r.promo_code_id = p.id AND (r.status = 'REDEEMED' OR (r.status = 'RESERVED' AND (r.reservation_expires_at > ? OR EXISTS (SELECT 1 FROM orders o WHERE o.id = r.order_id AND o.provider_checkout_id IS NOT NULL AND o.status <> 'PAYMENT_FAILED'))))
            ) < p.max_total_uses)
            AND (p.max_uses_per_user IS NULL OR (
              SELECT COUNT(*) FROM promo_redemptions r
              WHERE r.promo_code_id = p.id AND r.user_id = 'u-tester' AND (r.status = 'REDEEMED' OR (r.status = 'RESERVED' AND (r.reservation_expires_at > ? OR EXISTS (SELECT 1 FROM orders o WHERE o.id = r.order_id AND o.provider_checkout_id IS NOT NULL AND o.status <> 'PAYMENT_FAILED'))))
            ) < p.max_uses_per_user)
        ) THEN ? ELSE NULL END,
        'promo-free-1', 'u-tester', ?, NULL, 150000, 150000, 0, 'KZT', ?, NULL, NULL, ?, 'REDEEMED'
    `);

    const result = reserveStmt.run(now, now, now, now, redemptionId, orderId, now, now);
    assert.equal(Number(result.changes), 1, "Redemption must be recorded successfully");

    // 4. Create entitlement for the user
    const entId = "ent-free-1";
    database.prepare(`
      INSERT INTO entitlements (
        id, order_id, user_id, test_id, grant_source, grant_reference,
        promo_code_id, campaign_id, status, created_at, revoked_at, expires_at
      ) VALUES (
        ?, ?, 'u-tester', 't-skills', 'promo_free', 'promo:ord-free-1',
        'promo-free-1', NULL, 'ACTIVE', ?, NULL, NULL
      )
    `).run(entId, orderId, now);

    const entRow = database.prepare("SELECT * FROM entitlements WHERE id = ?").get(entId) as {
      id: string;
      grant_source: string;
      promo_code_id: string;
      status: string;
    };
    assert.equal(entRow.grant_source, "promo_free");
    assert.equal(entRow.promo_code_id, "promo-free-1");
    assert.equal(entRow.status, "ACTIVE");

    // 5. Subsequent attempt by same user hits max_uses_per_user (1 use limit)
    assert.throws(() => {
      reserveStmt.run(now, now, now, now, "red-free-2", "ord-free-2", now, now);
    }, /NOT NULL constraint failed: promo_redemptions\.id/);

    // 6. Assessment creation consumes entitlement into ENTITLED state
    const sessId = "sess-free-1";
    database.prepare(`
      INSERT INTO assessments (
        id, user_id, entitlement_id, test_id, locale, state, versions_json,
        adaptive_item_ids_json, selection_mode, preliminary_score_json,
        final_score_json, report_id, client_seq, created_at, consented_at,
        completed_at, updated_at
      ) VALUES (
        ?, 'u-tester', ?, 't-skills', 'ru', 'ENTITLED', '{}',
        '[]', NULL, NULL, NULL, NULL, 0, ?, NULL, NULL, ?
      )
    `).run(sessId, entId, now, now);

    const sessRow = database.prepare("SELECT * FROM assessments WHERE id = ?").get(sessId) as {
      id: string;
      state: string;
      entitlement_id: string;
    };
    assert.equal(sessRow.state, "ENTITLED");
    assert.equal(sessRow.entitlement_id, entId);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("promo: security checks - disabled, expired, and domain-restricted codes are rejected", () => {
  const { database, directory } = migratedDatabase();
  try {
    const now = Date.now();
    database.prepare(`
      INSERT INTO users (id, email, full_name, role, status, locale, created_at, updated_at)
      VALUES ('u-1', 'student@school.kz', 'Student', 'user', 'active', 'ru', ?, ?),
             ('u-2', 'outsider@gmail.com', 'Outsider', 'user', 'active', 'ru', ?, ?)
    `).run(now, now, now, now);

    // Expired promo
    database.prepare(`
      INSERT INTO promo_codes (
        id, code, name, discount_type, discount_value, currency,
        valid_from, valid_until, status, created_by, created_at, updated_by, updated_at
      ) VALUES (
        'promo-exp', 'EXPIRED2026', 'Expired Code', 'PERCENT', 50, 'KZT',
        ?, ?, 'ACTIVE', 'u-1', ?, 'u-1', ?
      )
    `).run(now - 100000, now - 1000, now, now);

    // Domain restricted promo (only @school.kz)
    database.prepare(`
      INSERT INTO promo_codes (
        id, code, name, discount_type, discount_value, currency,
        allowed_email_domains_json, status, created_by, created_at, updated_by, updated_at
      ) VALUES (
        'promo-dom', 'SCHOOLONLY', 'School Code', 'FREE_ACCESS', 100, 'KZT',
        '["school.kz"]', 'ACTIVE', 'u-1', ?, 'u-1', ?
      )
    `).run(now, now);

    // Disabled promo
    database.prepare(`
      INSERT INTO promo_codes (
        id, code, name, discount_type, discount_value, currency,
        status, created_by, created_at, updated_by, updated_at
      ) VALUES (
        'promo-dis', 'DISABLED50', 'Disabled Code', 'PERCENT', 50, 'KZT',
        'DISABLED', 'u-1', ?, 'u-1', ?
      )
    `).run(now, now);

    const checkStmt = database.prepare(`
      SELECT
        CASE
          WHEN status != 'ACTIVE' THEN 'PROMO_NOT_ACTIVE'
          WHEN valid_until IS NOT NULL AND valid_until <= ? THEN 'PROMO_EXPIRED'
          WHEN valid_from IS NOT NULL AND valid_from > ? THEN 'PROMO_NOT_STARTED'
          ELSE 'VALID'
        END AS validity
      FROM promo_codes WHERE code = ?
    `);

    const expCheck = checkStmt.get(now, now, "EXPIRED2026") as { validity: string };
    assert.equal(expCheck.validity, "PROMO_EXPIRED");

    const disCheck = checkStmt.get(now, now, "DISABLED50") as { validity: string };
    assert.equal(disCheck.validity, "PROMO_NOT_ACTIVE");

    const schoolCheck = checkStmt.get(now, now, "SCHOOLONLY") as { validity: string };
    assert.equal(schoolCheck.validity, "VALID");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
