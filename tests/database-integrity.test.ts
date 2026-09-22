import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();

function migratedDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "tskills-db-test-"));
  const path = join(directory, "app.db");
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON");
  const journal = JSON.parse(readFileSync(join(root, "drizzle/meta/_journal.json"), "utf8")) as { entries: Array<{ idx: number; tag: string }> };
  for (const entry of journal.entries.slice().sort((left, right) => left.idx - right.idx)) {
    const migration = readFileSync(join(root, "drizzle", `${entry.tag}.sql`), "utf8");
    for (const statement of migration.split(/--> statement-breakpoint/g).map((value) => value.trim()).filter(Boolean)) database.exec(statement);
  }
  return { database, directory };
}

test("database: active role assignment has a true partial uniqueness invariant", () => {
  const { database, directory } = migratedDatabase();
  try {
    database.prepare("INSERT INTO admin_role_assignments (id, user_id, role_id, assigned_by, created_at, disabled_at) VALUES (?, ?, ?, ?, ?, NULL)")
      .run("assignment-1", "system_tskills_seed", "role_support", "system_tskills_seed", 1);
    assert.throws(() => database.prepare("INSERT INTO admin_role_assignments (id, user_id, role_id, assigned_by, created_at, disabled_at) VALUES (?, ?, ?, ?, ?, NULL)")
      .run("assignment-2", "system_tskills_seed", "role_support", "system_tskills_seed", 2));
    database.prepare("UPDATE admin_role_assignments SET disabled_at = ? WHERE id = ?").run(3, "assignment-1");
    assert.doesNotThrow(() => database.prepare("INSERT INTO admin_role_assignments (id, user_id, role_id, assigned_by, created_at, disabled_at) VALUES (?, ?, ?, ?, ?, NULL)")
      .run("assignment-3", "system_tskills_seed", "role_support", "system_tskills_seed", 4));
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("database: promo reservation is race-safe and released checkout returns the code", () => {
  const { database, directory } = migratedDatabase();
  try {
    database.prepare(`INSERT INTO promo_codes (id, code, name, description, discount_type, discount_value, currency, max_total_uses, max_uses_per_user, valid_from, valid_until, minimum_order_amount, new_users_only, allowed_test_ids_json, allowed_email_domains_json, allowed_user_ids_json, campaign_id, status, created_by, created_at, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, '[]', '[]', '[]', NULL, 'ACTIVE', ?, 0, ?, 0)`)
      .run("promo-1", "ONE", "one", "", "PERCENT", 10, "KZT", 1, "system_tskills_seed", "system_tskills_seed");
    for (const id of ["order-1", "order-2"]) {
      database.prepare("INSERT INTO orders (id, user_id, test_id, amount_minor, currency, status, provider, idempotency_key, created_at, updated_at) VALUES (?, ?, 't-skills', 1000, 'KZT', 'PAYMENT_PENDING', 'stripe', ?, 1, 1)")
        .run(id, "system_tskills_seed", `${id}-key`);
    }
    const reserve = database.prepare(`INSERT INTO promo_redemptions (id, promo_code_id, user_id, order_id, campaign_id, original_amount_minor, discount_amount_minor, final_amount_minor, currency, reserved_at, reservation_expires_at, released_at, redeemed_at, status)
      SELECT ?, 'promo-1', 'system_tskills_seed', ?, NULL, 1000, 100, 900, 'KZT', 10, 1000, NULL, 10, 'RESERVED'
      WHERE (SELECT COUNT(*) FROM promo_redemptions r WHERE r.promo_code_id = 'promo-1' AND (r.status = 'REDEEMED' OR (r.status = 'RESERVED' AND r.reservation_expires_at > 10))) < 1`);
    assert.equal(Number(reserve.run("redemption-1", "order-1").changes), 1);
    assert.equal(Number(reserve.run("redemption-2", "order-2").changes), 0, "parallel contender cannot oversubscribe the last code");
    database.prepare("UPDATE promo_redemptions SET status = 'RELEASED', released_at = 11 WHERE id = 'redemption-1' AND status = 'RESERVED'").run();
    assert.equal(Number(reserve.run("redemption-2", "order-2").changes), 1, "failed or abandoned checkout releases its reservation");
    database.prepare("UPDATE promo_redemptions SET status = 'REDEEMED', redeemed_at = 12, reservation_expires_at = NULL WHERE id = 'redemption-2' AND status = 'RESERVED'").run();
    const row = database.prepare("SELECT status, released_at, redeemed_at FROM promo_redemptions WHERE id = 'redemption-2'").get() as { status: string; released_at: number | null; redeemed_at: number };
    assert.equal(row.status, "REDEEMED");
    assert.equal(row.released_at, null);
    assert.equal(row.redeemed_at, 12);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
