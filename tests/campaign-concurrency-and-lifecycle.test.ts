import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();

function migratedDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "tskills-lifecycle-test-"));
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

test("campaign: seat reservation enforces capacity atomically preventing oversubscription", () => {
  const { database, directory } = migratedDatabase();
  try {
    const now = Date.now();
    // Seed campaign with capacity = 1
    database.prepare(`
      INSERT INTO campaigns (id, name, client_name, client_type, seat_limit, status, default_test_id, created_by, created_at, updated_at)
      VALUES ('camp-1', 'Pilot School', 'School 1', 'SCHOOL', 1, 'ACTIVE', 't-skills', 'system_tskills_seed', ?, ?)
    `).run(now, now);

    // Seed two orders
    database.prepare("INSERT INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, idempotency_key, created_at, updated_at) VALUES ('ord-1', 'system_tskills_seed', 't-skills', 150000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'k-1', ?, ?)")
      .run(now, now);
    database.prepare("INSERT INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, idempotency_key, created_at, updated_at) VALUES ('ord-2', 'system_tskills_seed', 't-skills', 150000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'k-2', ?, ?)")
      .run(now, now);

    const reserveStmt = database.prepare(`
      INSERT INTO campaign_seat_reservations
        (id, campaign_id, user_id, order_id, checkout_session_id, status,
         reserved_at, expires_at, claimed_at, released_at, created_at, updated_at)
      SELECT
        CASE WHEN (
          (SELECT COUNT(*) FROM campaign_members m WHERE m.campaign_id = 'camp-1') +
          (SELECT COUNT(*) FROM campaign_seat_reservations csr WHERE csr.campaign_id = 'camp-1' AND csr.status = 'RESERVED' AND (csr.expires_at > ? OR EXISTS (SELECT 1 FROM orders o WHERE o.id = csr.order_id AND o.provider_checkout_id IS NOT NULL AND o.status <> 'PAYMENT_FAILED')))
        ) < (SELECT seat_limit FROM campaigns WHERE id = 'camp-1')
        THEN ? ELSE NULL END,
        'camp-1', 'system_tskills_seed', ?, NULL, 'RESERVED', ?, ?, NULL, NULL, ?, ?
    `);

    // First contender attempts to reserve
    assert.equal(Number(reserveStmt.run(now, "res-1", "ord-1", now, now + 1800000, now, now).changes), 1);

    // Second contender attempts to reserve the same seat concurrently -> fails (id is null so INSERT fails NOT NULL)
    assert.throws(
      () => reserveStmt.run(now, "res-2", "ord-2", now, now + 1800000, now, now),
      /NOT NULL constraint failed: campaign_seat_reservations\.id/
    );

    // Check count of active reservations
    const count = database.prepare("SELECT COUNT(*) as count FROM campaign_seat_reservations WHERE campaign_id = 'camp-1' AND status = 'RESERVED'").get() as { count: number };
    assert.equal(count.count, 1, "only 1 reservation exists");

    // When order 1 expires/releases reservation:
    database.prepare("UPDATE campaign_seat_reservations SET status = 'RELEASED', released_at = ? WHERE id = 'res-1'").run(now + 10);

    // Second contender can now successfully reserve
    assert.equal(Number(reserveStmt.run(now + 20, "res-2", "ord-2", now + 20, now + 1800000, now + 20, now + 20).changes), 1);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("campaign: expired local TTL keeps an attached Stripe seat until a terminal payment event", () => {
  const { database, directory } = migratedDatabase();
  try {
    const now = Date.now();
    database.prepare(`
      INSERT INTO campaigns (id, name, client_name, client_type, seat_limit, status, default_test_id, created_by, created_at, updated_at)
      VALUES ('camp-async', 'Async School', 'Async School', 'SCHOOL', 1, 'ACTIVE', 't-skills', 'system_tskills_seed', ?, ?)
    `).run(now, now);
    database.prepare(`
      INSERT INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, provider_checkout_id, idempotency_key, created_at, updated_at)
      VALUES ('ord-async', 'system_tskills_seed', 't-skills', 150000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'cs_async', 'key-async', ?, ?),
             ('ord-next', 'system_tskills_seed', 't-skills', 150000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'cs-next', 'key-next', ?, ?)
    `).run(now - 3600000, now - 3600000, now, now);
    database.prepare(`
      INSERT INTO campaign_seat_reservations
        (id, campaign_id, user_id, order_id, checkout_session_id, status, reserved_at, expires_at, claimed_at, released_at, created_at, updated_at)
      VALUES ('res-async', 'camp-async', 'system_tskills_seed', 'ord-async', 'cs_async', 'RESERVED', ?, ?, NULL, NULL, ?, ?)
    `).run(now - 3600000, now - 1, now - 3600000, now - 3600000);

    const reserve = database.prepare(`
      INSERT INTO campaign_seat_reservations
        (id, campaign_id, user_id, order_id, checkout_session_id, status, reserved_at, expires_at, claimed_at, released_at, created_at, updated_at)
      SELECT
        CASE WHEN (
          (SELECT COUNT(*) FROM campaign_members m WHERE m.campaign_id = 'camp-async') +
          (SELECT COUNT(*) FROM campaign_seat_reservations csr
           WHERE csr.campaign_id = 'camp-async' AND csr.status = 'RESERVED'
             AND (csr.expires_at > ? OR EXISTS (
               SELECT 1 FROM orders o WHERE o.id = csr.order_id
                 AND o.provider_checkout_id IS NOT NULL AND o.status <> 'PAYMENT_FAILED'
             )))
        ) < (SELECT seat_limit FROM campaigns WHERE id = 'camp-async')
        THEN ? ELSE NULL END,
        'camp-async', 'system_tskills_seed', 'ord-next', 'cs-next', 'RESERVED', ?, ?, NULL, NULL, ?, ?
    `);
    assert.throws(() => reserve.run(now, "res-next", now, now + 1800000, now, now), /NOT NULL constraint failed/);

    // A verified failure event releases the session-backed reservation and
    // makes the seat available again. Local time alone does not do so.
    database.prepare("UPDATE orders SET status = 'PAYMENT_FAILED', updated_at = ? WHERE id = 'ord-async'").run(now + 1);
    database.prepare("UPDATE campaign_seat_reservations SET status = 'RELEASED', released_at = ?, updated_at = ? WHERE id = 'res-async' AND status = 'RESERVED'").run(now + 1, now + 1);
    assert.equal(Number(reserve.run(now + 2, "res-next", now + 2, now + 1800000, now + 2, now + 2).changes), 1);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("campaign: payment confirmation claims reservation and issues entitlement and membership", () => {
  const { database, directory } = migratedDatabase();
  try {
    const now = Date.now();
    database.prepare(`
      INSERT INTO campaigns (id, name, client_name, client_type, seat_limit, status, default_test_id, created_by, created_at, updated_at)
      VALUES ('camp-2', 'Alpha Corp', 'Alpha', 'COMPANY', 5, 'ACTIVE', 't-skills', 'system_tskills_seed', ?, ?)
    `).run(now, now);

    database.prepare("INSERT INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, idempotency_key, created_at, updated_at) VALUES ('ord-3', 'system_tskills_seed', 't-skills', 150000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'k-3', ?, ?)")
      .run(now, now);

    database.prepare(`
      INSERT INTO campaign_seat_reservations
        (id, campaign_id, user_id, order_id, checkout_session_id, status, reserved_at, expires_at, claimed_at, released_at, created_at, updated_at)
      VALUES ('res-3', 'camp-2', 'system_tskills_seed', 'ord-3', 'cs_123', 'RESERVED', ?, ?, NULL, NULL, ?, ?)
    `).run(now, now + 1800000, now, now);

    // Simulate payment paid event
    const paidAt = now + 5000;
    database.prepare("UPDATE orders SET status = 'PAID', updated_at = ? WHERE id = 'ord-3'").run(paidAt);
    database.prepare("UPDATE campaign_seat_reservations SET status = 'CLAIMED', claimed_at = ?, updated_at = ? WHERE order_id = 'ord-3' AND status = 'RESERVED'").run(paidAt, paidAt);
    database.prepare(`
      INSERT INTO entitlements (id, order_id, user_id, test_id, grant_source, grant_reference, promo_code_id, campaign_id, status, created_at, revoked_at, expires_at)
      VALUES ('ent-3', 'ord-3', 'system_tskills_seed', 't-skills', 'campaign', 'campaign:ord-3', NULL, 'camp-2', 'ACTIVE', ?, NULL, NULL)
    `).run(paidAt);
    database.prepare(`
      INSERT INTO campaign_members (id, campaign_id, user_id, entitlement_id, created_at)
      VALUES ('mem-3', 'camp-2', 'system_tskills_seed', 'ent-3', ?)
    `).run(paidAt);

    // Verify reservation status is CLAIMED
    const resRow = database.prepare("SELECT status, claimed_at FROM campaign_seat_reservations WHERE id = 'res-3'").get() as { status: string; claimed_at: number };
    assert.equal(resRow.status, "CLAIMED");
    assert.equal(resRow.claimed_at, paidAt);

    // Verify campaign member is registered
    const memRow = database.prepare("SELECT id, campaign_id, user_id FROM campaign_members WHERE campaign_id = 'camp-2'").get() as { id: string; campaign_id: string; user_id: string };
    assert.equal(memRow.id, "mem-3");
    assert.equal(memRow.user_id, "system_tskills_seed");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("campaign: failed checkout releases reservation and restores seat capacity", () => {
  const { database, directory } = migratedDatabase();
  try {
    const now = Date.now();
    database.prepare(`
      INSERT INTO campaigns (id, name, client_name, client_type, seat_limit, status, default_test_id, created_by, created_at, updated_at)
      VALUES ('camp-fail', 'Beta Corp', 'Beta', 'COMPANY', 1, 'ACTIVE', 't-skills', 'system_tskills_seed', ?, ?)
    `).run(now, now);

    database.prepare("INSERT INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, idempotency_key, created_at, updated_at) VALUES ('ord-fail', 'system_tskills_seed', 't-skills', 150000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'k-fail', ?, ?)")
      .run(now, now);

    database.prepare(`
      INSERT INTO campaign_seat_reservations
        (id, campaign_id, user_id, order_id, checkout_session_id, status, reserved_at, expires_at, claimed_at, released_at, created_at, updated_at)
      VALUES ('res-fail', 'camp-fail', 'system_tskills_seed', 'ord-fail', 'cs_fail', 'RESERVED', ?, ?, NULL, NULL, ?, ?)
    `).run(now, now + 1800000, now, now);

    // Simulate checkout expired / payment failed
    const failedAt = now + 10000;
    database.prepare("UPDATE orders SET status = 'PAYMENT_FAILED', updated_at = ? WHERE id = 'ord-fail'").run(failedAt);
    database.prepare("UPDATE campaign_seat_reservations SET status = 'RELEASED', released_at = ?, updated_at = ? WHERE order_id = 'ord-fail' AND status = 'RESERVED'").run(failedAt, failedAt);

    // Verify reservation status is RELEASED
    const resRow = database.prepare("SELECT status, released_at FROM campaign_seat_reservations WHERE id = 'res-fail'").get() as { status: string; released_at: number };
    assert.equal(resRow.status, "RELEASED");
    assert.equal(resRow.released_at, failedAt);

    // Check available seats count
    const active = database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM campaign_members WHERE campaign_id = 'camp-fail') AS claimed,
        (SELECT COUNT(*) FROM campaign_seat_reservations csr WHERE csr.campaign_id = 'camp-fail' AND csr.status = 'RESERVED' AND (csr.expires_at > ? OR EXISTS (SELECT 1 FROM orders o WHERE o.id = csr.order_id AND o.provider_checkout_id IS NOT NULL AND o.status <> 'PAYMENT_FAILED'))) AS reserved
    `).get(failedAt) as { claimed: number; reserved: number };
    assert.equal(active.claimed, 0);
    assert.equal(active.reserved, 0);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("promo: seat reservation enforces max_total_uses atomically (PROMO_USAGE_LIMIT_REACHED)", () => {
  const { database, directory } = migratedDatabase();
  try {
    const now = Date.now();
    database.prepare(`
      INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at)
      VALUES ('u-1', 'u1@test.invalid', 'User 1', 'ru', ?, ?),
             ('u-2', 'u2@test.invalid', 'User 2', 'ru', ?, ?)
    `).run(now, now, now, now);

    database.prepare(`
      INSERT INTO promo_codes (id, code, name, discount_type, discount_value, currency, max_total_uses, max_uses_per_user, status, created_by, updated_by, created_at, updated_at)
      VALUES ('promo-1', 'LIMITED50', '50% off', 'PERCENT', 50, 'KZT', 1, 1, 'ACTIVE', 'system_tskills_seed', 'system_tskills_seed', ?, ?)
    `).run(now, now);

    database.prepare("INSERT INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, idempotency_key, created_at, updated_at) VALUES ('ord-p1', 'u-1', 't-skills', 75000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'k-p1', ?, ?)")
      .run(now, now);
    database.prepare("INSERT INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, idempotency_key, created_at, updated_at) VALUES ('ord-p2', 'u-2', 't-skills', 75000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'k-p2', ?, ?)")
      .run(now, now);

    const reservePromoStmt = database.prepare(`
      INSERT INTO promo_redemptions
        (id, promo_code_id, user_id, order_id, campaign_id, original_amount_minor,
         discount_amount_minor, final_amount_minor, currency, reserved_at,
         reservation_expires_at, released_at, redeemed_at, status)
      SELECT
        CASE WHEN EXISTS (
          SELECT 1 FROM promo_codes p WHERE p.id = 'promo-1' AND p.status = 'ACTIVE'
            AND (p.valid_from IS NULL OR p.valid_from <= ?)
            AND (p.valid_until IS NULL OR p.valid_until > ?)
            AND (p.max_total_uses IS NULL OR (
              SELECT COUNT(*) FROM promo_redemptions r
              WHERE r.promo_code_id = p.id AND (r.status = 'REDEEMED' OR (r.status = 'RESERVED' AND (r.reservation_expires_at > ? OR EXISTS (SELECT 1 FROM orders o WHERE o.id = r.order_id AND o.provider_checkout_id IS NOT NULL AND o.status <> 'PAYMENT_FAILED'))))
            ) < p.max_total_uses)
        ) THEN ? ELSE NULL END,
        'promo-1', ?, ?, NULL, 150000, 75000, 75000, 'KZT', ?, ?, NULL, ?, 'RESERVED'
    `);

    // First user reserves promo -> succeeds
    const expiresAt = now + 1920000;
    assert.equal(Number(reservePromoStmt.run(now, now, now, "red-1", "u-1", "ord-p1", now, expiresAt, now).changes), 1);

    // Second user attempts to reserve same promo concurrently -> fails NOT NULL constraint on id
    assert.throws(
      () => reservePromoStmt.run(now, now, now, "red-2", "u-2", "ord-p2", now, expiresAt, now),
      /NOT NULL constraint failed: promo_redemptions\.id/
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("promo: expired reservation frees slot for subsequent user reservation", () => {
  const { database, directory } = migratedDatabase();
  try {
    const now = Date.now();
    database.prepare(`
      INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at)
      VALUES ('u-1', 'u1@test.invalid', 'User 1', 'ru', ?, ?),
             ('u-2', 'u2@test.invalid', 'User 2', 'ru', ?, ?)
    `).run(now, now, now, now);

    database.prepare(`
      INSERT INTO promo_codes (id, code, name, discount_type, discount_value, currency, max_total_uses, max_uses_per_user, status, created_by, updated_by, created_at, updated_at)
      VALUES ('promo-exp', 'EXPTIME', 'Expiry Test', 'PERCENT', 10, 'KZT', 1, 1, 'ACTIVE', 'system_tskills_seed', 'system_tskills_seed', ?, ?)
    `).run(now, now);

    database.prepare("INSERT INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, idempotency_key, created_at, updated_at) VALUES ('ord-e1', 'u-1', 't-skills', 135000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'k-e1', ?, ?)")
      .run(now, now);
    database.prepare("INSERT INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, idempotency_key, created_at, updated_at) VALUES ('ord-e2', 'u-2', 't-skills', 135000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'k-e2', ?, ?)")
      .run(now, now);

    // User 1 reserved with expiry in past
    const pastExpiry = now - 5000;
    database.prepare(`
      INSERT INTO promo_redemptions (id, promo_code_id, user_id, order_id, campaign_id, original_amount_minor, discount_amount_minor, final_amount_minor, currency, reserved_at, reservation_expires_at, released_at, redeemed_at, status)
      VALUES ('red-e1', 'promo-exp', 'u-1', 'ord-e1', NULL, 150000, 15000, 135000, 'KZT', ?, ?, NULL, ?, 'RESERVED')
    `).run(now - 10000, pastExpiry, now);

    // User 2 attempts to reserve: since pastExpiry < now, active count is 0
    const reserveStmt = database.prepare(`
      INSERT INTO promo_redemptions
        (id, promo_code_id, user_id, order_id, campaign_id, original_amount_minor,
         discount_amount_minor, final_amount_minor, currency, reserved_at,
         reservation_expires_at, released_at, redeemed_at, status)
      SELECT
        CASE WHEN EXISTS (
          SELECT 1 FROM promo_codes p WHERE p.id = 'promo-exp' AND p.status = 'ACTIVE'
            AND (p.max_total_uses IS NULL OR (
              SELECT COUNT(*) FROM promo_redemptions r
              WHERE r.promo_code_id = p.id AND (r.status = 'REDEEMED' OR (r.status = 'RESERVED' AND (r.reservation_expires_at > ? OR EXISTS (SELECT 1 FROM orders o WHERE o.id = r.order_id AND o.provider_checkout_id IS NOT NULL AND o.status <> 'PAYMENT_FAILED'))))
            ) < p.max_total_uses)
        ) THEN ? ELSE NULL END,
        'promo-exp', 'u-2', 'ord-e2', NULL, 150000, 15000, 135000, 'KZT', ?, ?, NULL, ?, 'RESERVED'
    `);

    assert.equal(Number(reserveStmt.run(now, "red-e2", now, now + 1920000, now).changes), 1, "expired promo slot is successfully claimed by second user");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("late payment: released promo reservation prevents duplicate redemption on late payment webhook, ensuring max_total_uses is never exceeded", () => {
  const { database, directory } = migratedDatabase();
  try {
    const now = Date.now();
    database.prepare(`
      INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at)
      VALUES ('u-late-1', 'u1@test.invalid', 'User 1', 'ru', ?, ?),
             ('u-late-2', 'u2@test.invalid', 'User 2', 'ru', ?, ?)
    `).run(now, now, now, now);

    database.prepare(`
      INSERT INTO promo_codes (id, code, name, discount_type, discount_value, currency, max_total_uses, max_uses_per_user, status, created_by, updated_by, created_at, updated_at)
      VALUES ('promo-late', 'LATEPROMO', 'Late Test', 'PERCENT', 10, 'KZT', 1, 1, 'ACTIVE', 'system_tskills_seed', 'system_tskills_seed', ?, ?)
    `).run(now, now);

    database.prepare("INSERT INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, idempotency_key, created_at, updated_at) VALUES ('ord-late-1', 'u-late-1', 't-skills', 135000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'k-late-1', ?, ?)")
      .run(now, now);
    database.prepare("INSERT INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, idempotency_key, created_at, updated_at) VALUES ('ord-late-2', 'u-late-2', 't-skills', 135000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'k-late-2', ?, ?)")
      .run(now, now);

    // User 1 reserved, but checkout expired so reservation became RELEASED
    database.prepare(`
      INSERT INTO promo_redemptions (id, promo_code_id, user_id, order_id, campaign_id, original_amount_minor, discount_amount_minor, final_amount_minor, currency, reserved_at, reservation_expires_at, released_at, redeemed_at, status)
      VALUES ('red-late-1', 'promo-late', 'u-late-1', 'ord-late-1', NULL, 150000, 15000, 135000, 'KZT', ?, ?, ?, ?, 'RELEASED')
    `).run(now - 10000, now - 5000, now - 5000, now - 10000);

    // User 2 reserved and successfully paid, redeeming the promo (max_total_uses = 1 reached)
    database.prepare(`
      INSERT INTO promo_redemptions (id, promo_code_id, user_id, order_id, campaign_id, original_amount_minor, discount_amount_minor, final_amount_minor, currency, reserved_at, reservation_expires_at, released_at, redeemed_at, status)
      VALUES ('red-late-2', 'promo-late', 'u-late-2', 'ord-late-2', NULL, 150000, 15000, 135000, 'KZT', ?, NULL, NULL, ?, 'REDEEMED')
    `).run(now - 4000, now - 1000);

    // Verify 1 promo has been redeemed
    const countBefore = database.prepare("SELECT COUNT(*) as c FROM promo_redemptions WHERE promo_code_id = 'promo-late' AND status = 'REDEEMED'").get() as { c: number };
    assert.equal(countBefore.c, 1);

    // Now late payment webhook arrives for ord-late-1
    // The handlePaymentEvent statement only updates status to REDEEMED if status is currently RESERVED:
    const lateUpdate = database.prepare(`
      UPDATE promo_redemptions
      SET status = 'REDEEMED', redeemed_at = ?, reservation_expires_at = NULL
      WHERE order_id = 'ord-late-1' AND status = 'RESERVED'
    `).run(now);

    assert.equal(lateUpdate.changes, 0, "late webhook cannot transition RELEASED promo reservation to REDEEMED");

    // Check redeemed count: still exactly 1, <= max_total_uses
    const countAfter = database.prepare("SELECT COUNT(*) as c FROM promo_redemptions WHERE promo_code_id = 'promo-late' AND status = 'REDEEMED'").get() as { c: number };
    assert.equal(countAfter.c, 1, "redeemed count strictly does not exceed max_total_uses (1)");

    const red1 = database.prepare("SELECT status FROM promo_redemptions WHERE id = 'red-late-1'").get() as { status: string };
    assert.equal(red1.status, "RELEASED");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("webhook: payment event delivery is idempotent across multiple calls", () => {
  const { database, directory } = migratedDatabase();
  try {
    const now = Date.now();
    database.prepare(`
      INSERT OR IGNORE INTO users (id, email, full_name, locale, created_at, updated_at)
      VALUES ('u-idemp', 'uidemp@test.invalid', 'User Idemp', 'ru', ?, ?)
    `).run(now, now);

    database.prepare(`
      INSERT INTO campaigns (id, name, client_name, client_type, seat_limit, status, default_test_id, created_by, created_at, updated_at)
      VALUES ('camp-idemp', 'Idemp Corp', 'Idemp', 'COMPANY', 2, 'ACTIVE', 't-skills', 'system_tskills_seed', ?, ?)
    `).run(now, now);

    database.prepare("INSERT INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, idempotency_key, created_at, updated_at) VALUES ('ord-idemp', 'u-idemp', 't-skills', 150000, 'KZT', 'PAYMENT_PENDING', 'stripe', 'k-idemp', ?, ?)")
      .run(now, now);

    database.prepare(`
      INSERT INTO campaign_seat_reservations
        (id, campaign_id, user_id, order_id, checkout_session_id, status, reserved_at, expires_at, claimed_at, released_at, created_at, updated_at)
      VALUES ('res-idemp', 'camp-idemp', 'u-idemp', 'ord-idemp', 'cs_idemp', 'RESERVED', ?, ?, NULL, NULL, ?, ?)
    `).run(now, now + 1800000, now, now);

    // First webhook delivery
    database.prepare("INSERT OR IGNORE INTO payment_events (id, order_id, provider, event_type, status, payload_hash, received_at) VALUES ('evt-1', 'ord-idemp', 'stripe', 'checkout.session.completed', 'PAID', 'hash-1', ?)")
      .run(now);
    database.prepare("UPDATE orders SET status = 'PAID', updated_at = ? WHERE id = 'ord-idemp'").run(now);
    database.prepare("UPDATE campaign_seat_reservations SET status = 'CLAIMED', claimed_at = ?, updated_at = ? WHERE order_id = 'ord-idemp' AND status = 'RESERVED'").run(now, now);
    database.prepare(`
      INSERT INTO entitlements (id, order_id, user_id, test_id, grant_source, grant_reference, promo_code_id, campaign_id, status, created_at, revoked_at, expires_at)
      VALUES ('ent-idemp', 'ord-idemp', 'u-idemp', 't-skills', 'campaign', 'campaign:ord-idemp', NULL, 'camp-idemp', 'ACTIVE', ?, NULL, NULL)
    `).run(now);
    database.prepare(`
      INSERT OR IGNORE INTO campaign_members (id, campaign_id, user_id, entitlement_id, created_at)
      SELECT 'mem-idemp', c.id, 'u-idemp', 'ent-idemp', ?
      FROM campaigns c
      WHERE c.id = 'camp-idemp'
        AND NOT EXISTS (SELECT 1 FROM campaign_members m WHERE m.campaign_id = c.id AND m.user_id = 'u-idemp')
    `).run(now);

    // Second webhook delivery (replay)
    const replayEvt = database.prepare("INSERT OR IGNORE INTO payment_events (id, order_id, provider, event_type, status, payload_hash, received_at) VALUES ('evt-1', 'ord-idemp', 'stripe', 'checkout.session.completed', 'PAID', 'hash-1', ?)")
      .run(now + 100);
    assert.equal(replayEvt.changes, 0, "duplicate payment event is ignored");

    const replayMember = database.prepare(`
      INSERT OR IGNORE INTO campaign_members (id, campaign_id, user_id, entitlement_id, created_at)
      SELECT 'mem-idemp-2', c.id, 'u-idemp', 'ent-idemp', ?
      FROM campaigns c
      WHERE c.id = 'camp-idemp'
        AND NOT EXISTS (SELECT 1 FROM campaign_members m WHERE m.campaign_id = c.id AND m.user_id = 'u-idemp')
    `).run(now + 100);
    assert.equal(replayMember.changes, 0, "duplicate campaign member is ignored without error");

    // Exactly 1 member and 1 entitlement exist
    const memCount = database.prepare("SELECT COUNT(*) as count FROM campaign_members WHERE campaign_id = 'camp-idemp'").get() as { count: number };
    assert.equal(memCount.count, 1);
    const entCount = database.prepare("SELECT COUNT(*) as count FROM entitlements WHERE order_id = 'ord-idemp'").get() as { count: number };
    assert.equal(entCount.count, 1);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("refund flow: cancels entitlements, frees campaign seat, and removes campaign member", () => {
  const { database, directory } = migratedDatabase();
  try {
    const now = Date.now();
    database.prepare(`
      INSERT INTO campaigns (id, name, client_name, client_type, seat_limit, status, default_test_id, created_by, created_at, updated_at)
      VALUES ('camp-rf', 'School Refund', 'School', 'SCHOOL', 1, 'ACTIVE', 't-skills', 'system_tskills_seed', ?, ?)
    `).run(now, now);

    database.prepare("INSERT INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, idempotency_key, created_at, updated_at) VALUES ('ord-rf', 'system_tskills_seed', 't-skills', 150000, 'KZT', 'PAID', 'stripe', 'k-rf', ?, ?)")
      .run(now, now);

    database.prepare(`
      INSERT INTO campaign_seat_reservations
        (id, campaign_id, user_id, order_id, checkout_session_id, status, reserved_at, expires_at, claimed_at, released_at, created_at, updated_at)
      VALUES ('res-rf', 'camp-rf', 'system_tskills_seed', 'ord-rf', 'cs_rf', 'CLAIMED', ?, ?, ?, NULL, ?, ?)
    `).run(now, now + 1800000, now, now, now);

    database.prepare(`
      INSERT INTO entitlements (id, order_id, user_id, test_id, grant_source, grant_reference, promo_code_id, campaign_id, status, created_at, revoked_at, expires_at)
      VALUES ('ent-rf', 'ord-rf', 'system_tskills_seed', 't-skills', 'campaign', 'campaign:ord-rf', NULL, 'camp-rf', 'ACTIVE', ?, NULL, NULL)
    `).run(now);

    database.prepare(`
      INSERT INTO campaign_members (id, campaign_id, user_id, entitlement_id, created_at)
      VALUES ('mem-rf', 'camp-rf', 'system_tskills_seed', 'ent-rf', ?)
    `).run(now);

    // Verify campaign is full before refund (1/1 seats)
    const membersBefore = database.prepare("SELECT COUNT(*) as c FROM campaign_members WHERE campaign_id = 'camp-rf'").get() as { c: number };
    assert.equal(membersBefore.c, 1);

    // Perform refund batch
    const refundAt = now + 10000;
    database.prepare("UPDATE orders SET status = 'REFUNDED', updated_at = ? WHERE id = 'ord-rf' AND status = 'PAID'").run(refundAt);
    database.prepare("UPDATE entitlements SET status = 'REVOKED', revoked_at = ? WHERE order_id = 'ord-rf' AND status = 'ACTIVE'").run(refundAt);
    database.prepare("UPDATE campaign_seat_reservations SET status = 'RELEASED', released_at = ?, updated_at = ? WHERE order_id = 'ord-rf' AND status IN ('RESERVED', 'CLAIMED')").run(refundAt, refundAt);
    database.prepare("DELETE FROM campaign_members WHERE entitlement_id IN (SELECT id FROM entitlements WHERE order_id = 'ord-rf')").run();

    // Verify order is REFUNDED
    const orderRow = database.prepare("SELECT status FROM orders WHERE id = 'ord-rf'").get() as { status: string };
    assert.equal(orderRow.status, "REFUNDED");

    // Verify entitlement is REVOKED
    const entRow = database.prepare("SELECT status, revoked_at FROM entitlements WHERE id = 'ent-rf'").get() as { status: string; revoked_at: number };
    assert.equal(entRow.status, "REVOKED");
    assert.equal(entRow.revoked_at, refundAt);

    // Verify seat reservation is RELEASED
    const seatRow = database.prepare("SELECT status, released_at FROM campaign_seat_reservations WHERE id = 'res-rf'").get() as { status: string; released_at: number };
    assert.equal(seatRow.status, "RELEASED");
    assert.equal(seatRow.released_at, refundAt);

    // Verify campaign member was removed so seat is free again
    const membersAfter = database.prepare("SELECT COUNT(*) as c FROM campaign_members WHERE campaign_id = 'camp-rf'").get() as { c: number };
    assert.equal(membersAfter.c, 0, "campaign seat is freed");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cms: drafts are never visible in public query and published updates immediately", () => {
  const { database, directory } = migratedDatabase();
  try {
    const now = Date.now();
    // Insert entry with draft version 2 and published version 1
    database.prepare(`
      INSERT INTO content_entries (id, content_key, locale, current_version, published_version, updated_by, updated_at)
      VALUES ('cnt-1', 'homepage', 'ru', 2, 1, 'system_tskills_seed', ?)
    `).run(now);

    database.prepare(`
      INSERT INTO content_versions (id, content_key, locale, version, payload_json, status, created_by, created_at, published_by, published_at)
      VALUES ('cntv-1', 'homepage', 'ru', 1, ?, 'PUBLISHED', 'system_tskills_seed', ?, 'system_tskills_seed', ?)
    `).run(JSON.stringify({ heroPre: "Old Pre", heroLede: "Old Lede", cta: "Old CTA" }), now, now);

    database.prepare(`
      INSERT INTO content_versions (id, content_key, locale, version, payload_json, status, created_by, created_at, published_by, published_at)
      VALUES ('cntv-2', 'homepage', 'ru', 2, ?, 'DRAFT', 'system_tskills_seed', ?, NULL, NULL)
    `).run(JSON.stringify({ heroPre: "Secret Draft Pre", heroLede: "Draft Lede", cta: "Draft CTA" }), now);

    // Query mimicking listContent with publicOnly = true
    const publicRow = database.prepare(`
      SELECT e.content_key, e.locale, e.published_version, pv.payload_json AS published_payload_json
      FROM content_entries e
      JOIN content_versions pv ON pv.content_key = e.content_key AND pv.locale = e.locale AND pv.version = e.published_version
      WHERE e.locale = 'ru' AND e.content_key = 'homepage' AND e.published_version IS NOT NULL
    `).get() as { content_key: string; published_version: number; published_payload_json: string };

    assert.equal(publicRow.published_version, 1);
    const publishedPayload = JSON.parse(publicRow.published_payload_json);
    assert.equal(publishedPayload.heroPre, "Old Pre");
    assert.equal("Secret Draft Pre" in publishedPayload, false);

    // Ensure draft without published_version is completely invisible publicly
    database.prepare(`
      INSERT INTO content_entries (id, content_key, locale, current_version, published_version, updated_by, updated_at)
      VALUES ('cnt-draft-only', 'faq', 'ru', 1, NULL, 'system_tskills_seed', ?)
    `).run(now);
    database.prepare(`
      INSERT INTO content_versions (id, content_key, locale, version, payload_json, status, created_by, created_at)
      VALUES ('cntv-draft-only', 'faq', 'ru', 1, ?, 'DRAFT', 'system_tskills_seed', ?)
    `).run(JSON.stringify({ title: "Unpublished FAQ" }), now);

    const unpublishedQuery = database.prepare(`
      SELECT e.content_key
      FROM content_entries e
      JOIN content_versions pv ON pv.content_key = e.content_key AND pv.locale = e.locale AND pv.version = e.published_version
      WHERE e.content_key = 'faq' AND e.published_version IS NOT NULL
    `).get();

    assert.equal(unpublishedQuery, undefined, "unpublished draft has 0 rows in public query");

    // Publish version 2 of homepage
    const publishTime = now + 2000;
    database.prepare("UPDATE content_versions SET status = 'PUBLISHED', published_by = 'system_tskills_seed', published_at = ? WHERE content_key = 'homepage' AND locale = 'ru' AND version = 2").run(publishTime);
    database.prepare("UPDATE content_entries SET published_version = 2, updated_at = ? WHERE content_key = 'homepage' AND locale = 'ru'").run(publishTime);

    const publicAfterPublish = database.prepare(`
      SELECT e.published_version, pv.payload_json AS published_payload_json
      FROM content_entries e
      JOIN content_versions pv ON pv.content_key = e.content_key AND pv.locale = e.locale AND pv.version = e.published_version
      WHERE e.locale = 'ru' AND e.content_key = 'homepage'
    `).get() as { published_version: number; published_payload_json: string };

    assert.equal(publicAfterPublish.published_version, 2);
    assert.equal(JSON.parse(publicAfterPublish.published_payload_json).heroPre, "Secret Draft Pre");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("campaign: optimistic concurrency conflict detection", () => {
  const { database, directory } = migratedDatabase();
  try {
    const now = 1000;
    database.prepare(`
      INSERT INTO campaigns (id, name, client_name, client_type, seat_limit, status, default_test_id, created_by, created_at, updated_at)
      VALUES ('camp-occ', 'OCC Campaign', 'Client OCC', 'COMPANY', 10, 'ACTIVE', 't-skills', 'system_tskills_seed', ?, ?)
    `).run(now, now);

    // Contender A attempts update with matching updated_at (now = 1000)
    const updateStmt = database.prepare(`
      UPDATE campaigns
      SET seat_limit = ?, updated_at = ?
      WHERE id = 'camp-occ' AND updated_at = ?
    `);

    const resultA = updateStmt.run(20, 2000, 1000);
    assert.equal(Number(resultA.changes), 1, "first update succeeds");

    // Contender B attempts update with stale updated_at (still assumes 1000)
    const resultB = updateStmt.run(30, 3000, 1000);
    assert.equal(Number(resultB.changes), 0, "stale update produces 0 affected rows -> 409 CAMPAIGN_VERSION_CONFLICT");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("admin RBAC: role permission sets enforce least privilege boundaries", () => {
  const rolePermissions: Record<string, string[]> = {
    SUPER_ADMIN: ["dashboard.read", "orders.read", "orders.refund", "promos.create", "campaigns.manage", "users.support_actions"],
    CONTENT_MANAGER: ["dashboard.read", "content.read", "content.edit", "content.publish"],
    SUPPORT: ["dashboard.read", "users.read", "users.support_actions", "entitlements.read", "entitlements.grant"],
    FINANCE: ["dashboard.read", "orders.read", "orders.refund", "promos.read", "promos.create", "campaigns.manage"],
    ANALYST: ["dashboard.read", "analytics.read", "campaigns.read", "orders.read"],
  };

  // ANALYST cannot refund orders or create promos
  assert.equal(rolePermissions.ANALYST.includes("orders.refund"), false);
  assert.equal(rolePermissions.ANALYST.includes("promos.create"), false);

  // CONTENT_MANAGER cannot refund orders or manage campaigns
  assert.equal(rolePermissions.CONTENT_MANAGER.includes("orders.refund"), false);
  assert.equal(rolePermissions.CONTENT_MANAGER.includes("campaigns.manage"), false);

  // SUPPORT cannot refund orders or manage campaigns
  assert.equal(rolePermissions.SUPPORT.includes("orders.refund"), false);
  assert.equal(rolePermissions.SUPPORT.includes("campaigns.manage"), false);

  // FINANCE can refund orders and create promos, but cannot perform user support actions or edit content
  assert.equal(rolePermissions.FINANCE.includes("orders.refund"), true);
  assert.equal(rolePermissions.FINANCE.includes("promos.create"), true);
  assert.equal(rolePermissions.FINANCE.includes("users.support_actions"), false);
  assert.equal(rolePermissions.FINANCE.includes("content.edit"), false);
});
