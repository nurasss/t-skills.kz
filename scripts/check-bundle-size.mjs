import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "dist/client";
if (!existsSync(root)) {
  console.log("BUNDLE_CHECK=SKIP dist_client_missing=YES run_after_build=YES");
  process.exit(0);
}

const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else files.push(path);
  }
}
walk(root);
const jsFiles = files.filter((file) => /\.(?:js|mjs|cjs)$/.test(file));
const oversized = jsFiles.filter((file) => statSync(file).size > 2_500_000);
const totalBytes = files.reduce((sum, file) => sum + statSync(file).size, 0);
if (oversized.length || totalBytes > 15_000_000) {
  console.error(`BUNDLE_CHECK_FAILED oversized=${oversized.join(",")} total_bytes=${totalBytes}`);
  process.exit(1);
}
console.log(`BUNDLE_CHECK=PASS files=${files.length} total_bytes=${totalBytes}`);
