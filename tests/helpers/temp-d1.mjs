// Minimal D1-compatible shim over node:sqlite for integration tests.
// Covers the query surface used by the admin publish and career-save paths:
// prepare().bind().first()/.all()/.run() plus batch() and exec().
// Temporary databases only; never wired into production code.
//
// Known limitations (explicit, by design):
// - foreign_keys are OFF (migrations re-enable them; rows reference
//   fabricated ids), so FK violations are invisible here;
// - batch() executes statements sequentially WITHOUT a transaction, so a
//   mid-batch failure would leave a partial write (production D1 batch is
//   transactional). Tests assert post-conditions, never partial-failure
//   atomicity.
import { DatabaseSync } from "node:sqlite";

export function createTempD1() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = OFF");
  const wrap = (stmt, args) => ({
    first() {
      const row = stmt.get(...args);
      return row ?? null;
    },
    all() {
      return { results: stmt.all(...args) };
    },
    run() {
      stmt.run(...args);
      return { success: true };
    },
  });
  return {
    raw: db,
    exec(sql) {
      db.exec(sql);
    },
    prepare(sql) {
      const stmt = db.prepare(sql);
      const bound = (...args) => wrap(stmt, args);
      return {
        bind: (...args) => bound(...args),
        first: () => wrap(stmt, []).first(),
        all: () => wrap(stmt, []).all(),
        run: () => wrap(stmt, []).run(),
      };
    },
    async batch(statements) {
      const out = [];
      for (const item of statements) {
        out.push(await item.run());
      }
      return out;
    },
  };
}
