import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
const config = "dist/server/wrangler.json";
if (!existsSync(config)) throw new Error("RETENTION_PLAN_BUILD_REQUIRED");

function wrangler(args) {
  return execFileSync(
    process.execPath,
    ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", ...args],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

const state = mkdtempSync(join(tmpdir(), "orbita-30-query-plan-"));
try {
  for (const migration of readdirSync("drizzle").filter((entry) => /^\d+_.*\.sql$/.test(entry)).sort()) {
    wrangler(["d1", "execute", "DB", "--local", "--config", config, "--persist-to", state, "--file", "drizzle/" + migration]);
  }
  const activeStates = [
    "CREATED",
    "PAYMENT_PENDING",
    "PAID",
    "CONSENTED",
    "CORE_IN_PROGRESS",
    "ADAPTIVE_SELECTING",
    "ADAPTIVE_IN_PROGRESS",
    "SCORING",
    "REPORT_GENERATING",
  ].map((stateName) => "'" + stateName + "'").join(", ");
  const query =
    "EXPLAIN QUERY PLAN SELECT id, state, purge_after FROM assessments " +
    "WHERE purge_state = 'ACTIVE' AND purge_after IS NOT NULL AND purge_after < 1 " +
    "AND state NOT IN (" + activeStates + ") ORDER BY purge_after ASC LIMIT 100";
  const plan = wrangler(["d1", "execute", "DB", "--local", "--config", config, "--persist-to", state, "--command", query]);
  if (!plan.includes("assessments_purge_due_idx") || /SCAN assessments\b/.test(plan)) {
    throw new Error("RETENTION_QUERY_PLAN_NOT_INDEX_BACKED\n" + plan);
  }
  console.log("RETENTION_QUERY_PLAN=PASS index=assessments_purge_due_idx");
} finally {
  rmSync(state, { recursive: true, force: true });
}
