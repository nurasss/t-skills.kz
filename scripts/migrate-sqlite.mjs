// Applies drizzle/*.sql migrations to the VPS SQLite file in journal order.
// Tracks state in a local _migrations table (same tag set wrangler uses from
// drizzle/meta/_journal.json), so Cloudflare D1 and VPS SQLite stay on the
// identical migration chain. Safe to re-run: applied tags are skipped.
//
// Usage: node scripts/migrate-sqlite.mjs [--db ./data/app.db]
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbFlag = process.argv.findIndex((arg) => arg === "--db");
const dbPath = resolve(
  process.argv[dbFlag + 1] ?? process.env.SQLITE_DB_PATH ?? "./data/app.db",
);
mkdirSync(dirname(dbPath), { recursive: true });

const root = new URL("..", import.meta.url);
const journal = JSON.parse(
  readFileSync(new URL("drizzle/meta/_journal.json", root), "utf8"),
);
const tags = journal.entries
  .slice()
  .sort((a, b) => a.idx - b.idx)
  .map((entry) => entry.tag);

const database = new DatabaseSync(dbPath);
database.exec("PRAGMA journal_mode = WAL");
database.exec("PRAGMA busy_timeout = 5000");
database.exec(
  "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
);
const applied = new Set(
  database
    .prepare("SELECT name FROM _migrations")
    .all()
    .map((row) => row.name),
);

let count = 0;
for (const tag of tags) {
  if (applied.has(tag)) continue;
  const sql = readFileSync(new URL(`drizzle/${tag}.sql`, root), "utf8");
  const statements = sql
    .split(/--> statement-breakpoint/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const statement of statements) database.exec(statement);
    database
      .prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)")
      .run(tag, Date.now());
    database.exec("COMMIT");
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // Transaction already ended; surface the original failure.
    }
    throw error;
  }
  count += 1;
  console.log(`MIGRATION_APPLIED=${tag}`);
}
database.close();
console.log(`MIGRATE_SQLITE_DONE applied=${count} db=${dbPath}`);
