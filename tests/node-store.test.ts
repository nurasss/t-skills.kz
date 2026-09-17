import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  closeNodeDatabases,
  createNodeD1,
  createNodeR2,
} from "@/lib/node-store-node";

function tempDir(prefix: string) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test("node D1 shim matches the used query surface", async () => {
  const database = createNodeD1(join(tempDir("tskills-d1-"), "app.db"));
  await database
    .prepare("CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, score INTEGER NOT NULL)")
    .bind()
    .run();
  const inserted = await database
    .prepare("INSERT INTO users (id, email, score) VALUES (?, ?, ?)")
    .bind("u1", "a@example.com", 42)
    .run();
  assert.equal(inserted.success, true);
  assert.equal(inserted.meta?.changes, 1);

  const all = await database.prepare("SELECT id, email, score FROM users ORDER BY id").bind().all<{ id: string; score: number }>();
  assert.equal(all.success, true);
  assert.deepEqual(all.results, [{ id: "u1", email: "a@example.com", score: 42 }]);

  const one = await database.prepare("SELECT score FROM users WHERE id = ?").bind("u1").first<{ score: number }>();
  assert.deepEqual(one, { score: 42 });

  const missing = await database.prepare("SELECT score FROM users WHERE id = ?").bind("nope").first<{ score: number }>();
  assert.equal(missing, null);

  const empty = await database.prepare("SELECT score FROM users WHERE id = ?").bind("nope").all();
  assert.deepEqual(empty.results, []);
  closeNodeDatabases();
});

test("node D1 batch is atomic and reports changes", async () => {
  const database = createNodeD1(join(tempDir("tskills-batch-"), "app.db"));
  await database.prepare("CREATE TABLE items (id TEXT PRIMARY KEY, n INTEGER NOT NULL)").bind().run();
  const outcomes = await database.batch([
    database.prepare("INSERT INTO items (id, n) VALUES (?, ?)").bind("a", 1),
    database.prepare("INSERT INTO items (id, n) VALUES (?, ?)").bind("b", 2),
  ]);
  assert.equal(outcomes.length, 2);
  assert.equal(outcomes[0]?.meta?.changes, 1);
  assert.equal(outcomes[1]?.meta?.changes, 1);

  await assert.rejects(
    database.batch([
      database.prepare("INSERT INTO items (id, n) VALUES (?, ?)").bind("c", 3),
      database.prepare("INSERT INTO items (id, n) VALUES (?, ?)").bind("a", 99),
    ]),
  );
  const rows = await database.prepare("SELECT id FROM items ORDER BY id").bind().all<{ id: string }>();
  assert.deepEqual(rows.results.map((row) => row.id), ["a", "b"]);
  closeNodeDatabases();
});

test("node D1 enforces foreign keys like D1", async () => {
  const database = createNodeD1(join(tempDir("tskills-fk-"), "app.db"));
  await database.prepare("CREATE TABLE parent (id TEXT PRIMARY KEY)").bind().run();
  await database.prepare("CREATE TABLE child (id TEXT PRIMARY KEY, parent_id TEXT NOT NULL REFERENCES parent(id))").bind().run();
  await assert.rejects(database.prepare("INSERT INTO child (id, parent_id) VALUES (?, ?)").bind("c1", "missing").run());
  closeNodeDatabases();
});

test("node R2 shim round-trips files with metadata", async () => {
  const bucket = createNodeR2(tempDir("tskills-r2-"));
  await bucket.put("reports/u1/rep1.pdf", new Uint8Array([1, 2, 3, 255]), {
    httpMetadata: { contentType: "application/pdf", contentDisposition: 'attachment; filename="t-skills-rep1.pdf"' },
    customMetadata: { reportId: "rep1" },
  });
  const object = (await bucket.get("reports/u1/rep1.pdf")) as {
    body: unknown;
    httpMetadata?: Record<string, string>;
    customMetadata?: Record<string, string>;
    httpEtag?: string;
  } | null;
  assert.ok(object);
  assert.equal(object.httpMetadata?.contentType, "application/pdf");
  assert.equal(object.customMetadata?.reportId, "rep1");
  assert.match(object.httpEtag ?? "", /^"[0-9a-f]{64}"$/);
  const bytes = new Uint8Array(await new Response(object.body as BodyInit).arrayBuffer());
  assert.deepEqual([...bytes], [1, 2, 3, 255]);

  await bucket.put("exports/u1/req1.json", '{"ok":true}', { httpMetadata: { contentType: "application/json" } });
  const text = await new Response(
    ((await bucket.get("exports/u1/req1.json")) as { body: BodyInit }).body,
  ).text();
  assert.equal(text, '{"ok":true}');

  assert.equal(await bucket.get("missing/key.pdf"), null);
  await bucket.delete("reports/u1/rep1.pdf");
  assert.equal(await bucket.get("reports/u1/rep1.pdf"), null);
  await bucket.delete("missing/key.pdf");
});

test("node R2 shim rejects path traversal", async () => {
  const bucket = createNodeR2(tempDir("tskills-r2trav-"));
  await assert.rejects(bucket.put("../../evil.txt", "x"));
  assert.equal(await bucket.get("../../evil.txt"), null);
});
