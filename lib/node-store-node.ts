// Node durable backend for VPS deployments (SQLite file + local directory).
//
// Implements the exact D1/R2 surface the application uses so no query or
// storage call site changes between Cloudflare and VPS targets:
//   D1: prepare(sql).bind(...).run() | .all<T>() | .first<T>(), batch([...])
//   R2: put(key, bytes|string, { httpMetadata, customMetadata }),
//       get(key) -> { body, httpMetadata, httpEtag } | null, delete(key)
//
// D1 semantics preserved: positional `?` placeholders only (the only form
// used in this codebase), batch() runs atomically in one transaction,
// first() returns null on no rows, run()/batch() report meta.changes.
// Foreign keys are enforced (PRAGMA foreign_keys=ON) matching D1.
//
// This module is never bundled into the Cloudflare Worker: the VPS vite
// target aliases `@/lib/node-store` to this file, while every other target
// resolves the dependency-free stub in lib/node-store.ts.
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { DatabaseSync, type StatementSync } from "node:sqlite";

type BindValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Uint8Array
  | ArrayBuffer
  | Date;

type SqliteValue = string | number | bigint | Buffer | null;

function toSqliteValue(value: BindValue): SqliteValue {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return value;
}

type ExecResult = {
  success: true;
  results: never[];
  meta: { changes: number; last_row_id: number };
};

type QueryResult<T> = {
  success: true;
  results: T[];
  meta?: { changes: number };
};

class NodeD1BoundStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly params: BindValue[],
  ) {}

  private prepared(): StatementSync {
    return this.database.prepare(this.sql);
  }

  private values(): SqliteValue[] {
    return this.params.map(toSqliteValue);
  }

  async run(): Promise<ExecResult> {
    return this.executeWrite();
  }

  executeWrite(): ExecResult {
    const outcome = this.prepared().run(...this.values());
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(outcome.changes),
        last_row_id: Number(outcome.lastInsertRowid),
      },
    };
  }

  async all<T>(): Promise<QueryResult<T>> {
    // node:sqlite rows carry a null prototype; D1 returns plain objects.
    const rows = (this.prepared().all(...this.values()) as T[]).map((row) => ({ ...(row as object) }) as T);
    return { success: true, results: rows };
  }

  async first<T>(): Promise<T | null> {
    const row = this.prepared().get(...this.values()) as T | undefined;
    return row === undefined ? null : ({ ...(row as object) } as T);
  }
}

class NodeD1Database {
  constructor(private readonly database: DatabaseSync) {}

  prepare(sql: string) {
    return {
      bind: (...params: BindValue[]) => new NodeD1BoundStatement(this.database, sql, params),
    };
  }

  async batch(statements: NodeD1BoundStatement[]): Promise<Array<ExecResult | QueryResult<unknown>>> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const outcomes: Array<ExecResult | QueryResult<unknown>> = [];
      for (const statement of statements) {
        outcomes.push(statement.executeWrite());
      }
      this.database.exec("COMMIT");
      return outcomes;
    } catch (error) {
      try {
        this.database.exec("ROLLBACK");
      } catch {
        // Rollback failure means the transaction already ended; surface the original error.
      }
      throw error;
    }
  }
}

const openDatabases = new Map<string, DatabaseSync>();

function databaseFilePath(): string {
  return resolve(process.cwd(), process.env.SQLITE_DB_PATH ?? "./data/app.db");
}

function openDatabase(filePath: string): DatabaseSync {
  const resolved = resolve(filePath);
  const cached = openDatabases.get(resolved);
  if (cached) return cached;
  const database = new DatabaseSync(resolved);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = NORMAL");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA foreign_keys = ON");
  openDatabases.set(resolved, database);
  return database;
}

/** Test hook: close cached handles so temp files can be removed. */
export function closeNodeDatabases(): void {
  for (const database of openDatabases.values()) database.close();
  openDatabases.clear();
}

export function createNodeD1(filePath?: string): NodeD1Database {
  return new NodeD1Database(openDatabase(filePath ?? databaseFilePath()));
}

/** Singleton used by db/index.ts on the Node target. Cast to D1Database once here. */
export function nodeDatabase() {
  return createNodeD1() as unknown as import("@cloudflare/workers-types").D1Database;
}

// ---------------------------------------------------------------------------
// File-backed R2 replacement.
// ---------------------------------------------------------------------------

type PutValue = string | Uint8Array | ArrayBuffer;

type StoredMetadata = {
  httpMetadata?: Record<string, string | undefined>;
  customMetadata?: Record<string, string>;
  etag: string;
  size: number;
  uploadedAt: number;
};

function filesRootDir(): string {
  return resolve(process.cwd(), process.env.VPS_FILE_DIR ?? "./data/files");
}

function safeKeyPath(root: string, key: string): string {
  const segments = key.split("/");
  if (!segments.length) throw new Error("R2_KEY_INVALID");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === ".." || segment.includes("\\") || segment.length > 200) {
      throw new Error("R2_KEY_INVALID");
    }
  }
  const resolved = resolve(root, join(...segments));
  if (resolved !== root && !resolved.startsWith(`${root}/`)) throw new Error("R2_KEY_INVALID");
  return resolved;
}

function toBytes(value: PutValue): Buffer {
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return Buffer.from(value);
}

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

class NodeFileBucket {
  constructor(private readonly root: string) {}

  async put(
    key: string,
    value: PutValue,
    options?: { httpMetadata?: Record<string, string | undefined>; customMetadata?: Record<string, string> },
  ): Promise<void> {
    const path = safeKeyPath(this.root, key);
    const bytes = toBytes(value);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    const metadata: StoredMetadata = {
      httpMetadata: options?.httpMetadata,
      customMetadata: options?.customMetadata,
      etag: `"${sha256Hex(bytes)}"`,
      size: bytes.byteLength,
      uploadedAt: Date.now(),
    };
    await writeFile(`${path}.meta.json`, JSON.stringify(metadata));
  }

  async get(key: string): Promise<unknown> {
    let path: string;
    try {
      path = safeKeyPath(this.root, key);
    } catch {
      return null;
    }
    let metadata: StoredMetadata | undefined;
    try {
      metadata = JSON.parse(await readFile(`${path}.meta.json`, "utf8")) as StoredMetadata;
    } catch {
      return null;
    }
    return {
      key,
      size: metadata.size,
      httpEtag: metadata.etag,
      httpMetadata: metadata.httpMetadata ?? {},
      customMetadata: metadata.customMetadata ?? {},
      body: Readable.toWeb(createReadStream(path)),
    };
  }

  async delete(key: string): Promise<void> {
    let path: string;
    try {
      path = safeKeyPath(this.root, key);
    } catch {
      return;
    }
    await rm(path, { force: true });
    await rm(`${path}.meta.json`, { force: true });
  }
}

const openBuckets = new Map<string, NodeFileBucket>();

export function createNodeR2(rootDir?: string): NodeFileBucket {
  const resolved = resolve(rootDir ?? filesRootDir());
  const cached = openBuckets.get(resolved);
  if (cached) return cached;
  const bucket = new NodeFileBucket(resolved);
  openBuckets.set(resolved, bucket);
  return bucket;
}

/** Singleton used by db/index.ts on the Node target. Cast to R2Bucket once here. */
export function nodeBucket() {
  return createNodeR2() as unknown as import("@cloudflare/workers-types").R2Bucket;
}
