import type { DatabaseSync } from "node:sqlite";

export interface TempDBoundStatement {
  first<T>(): T | null;
  all<T>(): { results: T[] };
  run(): unknown;
}

export interface TempD1 {
  raw: DatabaseSync;
  exec(sql: string): void;
  prepare(sql: string): {
    bind(...args: unknown[]): TempDBoundStatement;
    first<T>(): T | null;
    all<T>(): { results: T[] };
    run(): unknown;
  };
  batch(statements: unknown[]): Promise<unknown[]>;
}

export function createTempD1(): TempD1;
