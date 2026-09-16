import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const port = 8791;
const baseUrl = `http://127.0.0.1:${port}`;
const config = "dist/server/wrangler.json";
const state = `.wrangler/load-smoke-${Date.now()}`;
const userId = `load_${Date.now()}`;
const sessionId = `${userId}_session`;
const samples = new Map([["responses", []], ["assessment", []], ["complete-core", []]]);
let serverOutput = "";

function assert(value, message) {
  if (!value) throw new Error(`LOAD_ASSERTION_FAILED: ${message}`);
}

function wrangler(args) {
  return execFileSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function timed(name, path, init = {}) {
  const started = performance.now();
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(baseUrl + path, {
        ...init,
        signal: AbortSignal.timeout(30_000),
        headers: {
          "Content-Type": "application/json",
          "x-orbita-preview-user": userId,
          origin: baseUrl,
          ...(init.headers ?? {}),
        },
      });
      const body = await response.json().catch(() => null);
      if ([500, 503].includes(response.status) && attempt < 2) {
        await delay(250 * (attempt + 1));
        continue;
      }
      samples.get(name)?.push({
        ms: performance.now() - started,
        status: response.status,
        expectedRetryable: response.status === 409 && body?.error === "RESPONSE_WRITE_CONFLICT",
      });
      return { response, body };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay(250 * (attempt + 1));
    }
  }
  throw lastError;
}

function percentile(values, quantile) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).status < 500) return;
    } catch {
      // Worker is still starting.
    }
    await delay(250);
  }
  throw new Error(`LOAD_SERVER_START_TIMEOUT\n${serverOutput.slice(-3000)}`);
}

if (!existsSync(config)) execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });
rmSync(state, { recursive: true, force: true });
for (const migration of readdirSync("drizzle").filter((entry) => /^\d+_.*\.sql$/.test(entry)).sort()) {
  wrangler(["d1", "execute", "DB", "--local", "--config", config, "--persist-to", state, "--file", `drizzle/${migration}`]);
}

const now = Date.now();
wrangler([
  "d1", "execute", "DB", "--local", "--config", config, "--persist-to", state, "--command",
  [
    `INSERT INTO users (id,email,full_name,locale,created_at,updated_at,deleted_at) VALUES (${sql(userId)},${sql(`${userId}@local.invalid`)},'Load fixture','ru',${now},${now},NULL)`,
    `INSERT INTO orders (id,user_id,test_id,amount_minor,currency,status,provider,provider_checkout_id,provider_checkout_url,provider_payment_id,provider_event_id,idempotency_key,created_at,updated_at) VALUES (${sql(`${userId}_order`)},${sql(userId)},'orbita30',150000,'KZT','PAID','load-fixture',NULL,NULL,NULL,NULL,${sql(`${userId}_idem`)},${now},${now})`,
    `INSERT INTO entitlements (id,order_id,user_id,test_id,status,created_at,revoked_at) VALUES (${sql(`${userId}_entitlement`)},${sql(`${userId}_order`)},${sql(userId)},'orbita30','ACTIVE',${now},NULL)`,
    `INSERT INTO assessments (id,user_id,entitlement_id,test_id,locale,state,versions_json,adaptive_item_ids_json,selection_mode,preliminary_score_json,final_score_json,report_id,client_seq,created_at,consented_at,completed_at,purge_state,purge_after,updated_at) VALUES (${sql(sessionId)},${sql(userId)},${sql(`${userId}_entitlement`)},'orbita30','ru','CONSENTED','{}','[]',NULL,NULL,NULL,NULL,0,${now},${now},NULL,'ACTIVE',NULL,${now})`,
  ].join(";"),
]);

const child = spawn(process.execPath, [
  "--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "dev",
  "--config", config, "--local", "--persist-to", state, "--ip", "127.0.0.1", "--inspector-port", "0",
  "--port", String(port), "--var", "ORBITA_ENV:development",
], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
child.stdout.on("data", (chunk) => { serverOutput += chunk; });
child.stderr.on("data", (chunk) => { serverOutput += chunk; });

try {
  await waitForServer();
  const started = performance.now();
  const queue = Array.from({ length: 250 }, (_, index) => index + 1);
  // Production clients submit one answer at a time, but this load gate also
  // exercises optimistic server sequencing under concurrent retries.
  const workers = Array.from({ length: 2 }, async () => {
    while (queue.length) {
      const number = queue.shift();
      if (!number) return;
      const itemId = `Q${String(number).padStart(3, "0")}`;
      const responseValue = number === 241 ? 5 : number === 244 ? 2 : number === 247 ? 6 : number >= 241 ? 2 : number <= 150 ? 0 : 1;
      let result;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        result = await timed("responses", `/api/assessments/${sessionId}/responses`, {
          method: "POST",
          headers: { "Idempotency-Key": `${sessionId}:${itemId}` },
          body: JSON.stringify({ item_id: itemId, response: responseValue, response_time_ms: 800, client_seq: number }),
        });
        if (result.response.status !== 409 || result.body?.error !== "RESPONSE_WRITE_CONFLICT") break;
        await delay(10 * (attempt + 1));
      }
      assert(result.response.status === 200, `${itemId} status=${result.response.status} body=${JSON.stringify(result.body)}`);
    }
  });
  await Promise.all(workers);

  const replayResults = await Promise.all(Array.from({ length: 25 }, (_, index) => {
    const itemId = `Q${String(index + 1).padStart(3, "0")}`;
    return timed("responses", `/api/assessments/${sessionId}/responses`, {
      method: "POST",
      headers: { "Idempotency-Key": `${sessionId}:${itemId}` },
      body: JSON.stringify({ item_id: itemId, response: 0, response_time_ms: 800, client_seq: index + 1 }),
    });
  }));
  assert(replayResults.every(({ response, body }) => response.status === 200 && body?.replay === true), "idempotent replay under concurrency");

  const before = await timed("assessment", `/api/assessments/${sessionId}`);
  assert(before.response.status === 200 && Object.keys(before.body?.responses ?? {}).length === 250, "zero lost or duplicated core responses");
  const completions = await Promise.all([
    timed("complete-core", `/api/assessments/${sessionId}/complete-core`, { method: "POST", body: "{}" }),
    timed("complete-core", `/api/assessments/${sessionId}/complete-core`, { method: "POST", body: "{}" }),
  ]);
  assert(completions.every(({ response }) => response.status === 200), "concurrent complete-core is idempotent");
  const after = await timed("assessment", `/api/assessments/${sessionId}`);
  assert(after.body?.state === "ADAPTIVE_IN_PROGRESS", `valid state after completion: ${after.body?.state}`);

  const elapsedSeconds = (performance.now() - started) / 1000;
  for (const [name, entries] of samples) {
    const latencies = entries.map((entry) => entry.ms);
    const errors = entries.filter((entry) => entry.status >= 400 && entry.status !== 429 && !entry.expectedRetryable).length;
    const limited = entries.filter((entry) => entry.status === 429).length;
    const retryableConflicts = entries.filter((entry) => entry.expectedRetryable).length;
    console.log(JSON.stringify({
      endpoint: name,
      requests: entries.length,
      p50_ms: Number(percentile(latencies, 0.50).toFixed(1)),
      p95_ms: Number(percentile(latencies, 0.95).toFixed(1)),
      p99_ms: Number(percentile(latencies, 0.99).toFixed(1)),
      error_rate: errors / Math.max(entries.length, 1),
      throughput_rps: Number((entries.length / elapsedSeconds).toFixed(2)),
      rate_429: limited / Math.max(entries.length, 1),
      retryable_conflicts: retryableConflicts,
    }));
  }
  console.log("LOAD_GATE=PASS lost=0 duplicated=0 idempotency=PASS state=ADAPTIVE_IN_PROGRESS");
} finally {
  child.kill("SIGTERM");
  rmSync(state, { recursive: true, force: true });
}
