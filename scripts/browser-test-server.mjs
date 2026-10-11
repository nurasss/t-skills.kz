import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const config = "dist/server/wrangler.json";
const state = ".wrangler/browser-e2e";

function wrangler(args) {
  return execFileSync(
    process.execPath,
    ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", ...args],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

rmSync(state, { recursive: true, force: true });
const migrationSql = readdirSync("drizzle")
  .filter((entry) => /^\d+_.*\.sql$/.test(entry))
  .sort()
  .map((entry) => readFileSync(join("drizzle", entry), "utf8"))
  .join("\n");
// Portable: pass migrations via --file instead of a giant --command argument
// (command-line length limits vary by platform).
const migrationDir = mkdtempSync(join(tmpdir(), "orbita-migrations-"));
const migrationFile = join(migrationDir, "migrations.sql");
writeFileSync(migrationFile, migrationSql);
try {
  wrangler(["d1", "execute", "DB", "--local", "--config", config, "--persist-to", state, "--file", migrationFile]);
} finally {
  rmSync(migrationDir, { recursive: true, force: true });
}

const child = spawn(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--config",
    config,
    "--local",
    "--persist-to",
    state,
    "--ip",
    "127.0.0.1",
    "--inspector-port",
    "0",
    "--port",
    "8790",
    "--var",
    "APP_ENV:development",
    "--var",
    "ORBITA_ENV:development",
    "--var",
    "LEGAL_DOCUMENTS_APPROVED:false",
    "--var",
    "TEEN_BANK_ENABLED:true",
    "--var",
    "ASSESSMENT_PRICE_MINOR:150000",
    "--var",
    "STRIPE_SECRET_KEY:sk_test_browser_fixture",
  ],
  { cwd: root, stdio: "inherit" },
);

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
