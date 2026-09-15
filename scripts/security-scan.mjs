import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const forbiddenSourcePatterns = [
  { name: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "stripe-secret", pattern: /sk_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { name: "openai-secret", pattern: /sk-[A-Za-z0-9]{24,}/ },
  { name: "webhook-secret", pattern: /whsec_[A-Za-z0-9]{16,}/ },
];
const forbiddenFiles = ["node_modules", "dist", ".next", ".wrangler", ".vinext", ".vite", ".sites-runtime", ".DS_Store"];

const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);
const findings = [];
for (const file of tracked) {
  if (forbiddenFiles.some((prefix) => file === prefix || file.startsWith(`${prefix}/`))) findings.push(`forbidden tracked path: ${file}`);
  if (!existsSync(resolve(root, file))) findings.push(`missing tracked file: ${file}`);
  if (!existsSync(resolve(root, file))) continue;
  let content;
  try {
    content = readFileSync(resolve(root, file), "utf8");
  } catch {
    continue;
  }
  for (const finding of forbiddenSourcePatterns) {
    if (finding.pattern.test(content) && !file.endsWith(".example") && !file.includes("security-scan")) findings.push(`${finding.name}: ${file}`);
  }
}
if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log(`SECRET_SCAN=PASS tracked_files=${tracked.length}`);
