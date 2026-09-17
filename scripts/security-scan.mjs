import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const forbiddenSourcePatterns = [
  { name: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, gitPattern: "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----" },
  { name: "stripe-secret", pattern: /sk_(?:live|test)_[A-Za-z0-9]{16,}/, gitPattern: "sk_(live|test)_[A-Za-z0-9]{16,}" },
  { name: "openai-secret", pattern: /sk-[A-Za-z0-9]{24,}/, gitPattern: "sk-[A-Za-z0-9]{24,}" },
  { name: "webhook-secret", pattern: /whsec_[A-Za-z0-9]{16,}/, gitPattern: "whsec_[A-Za-z0-9]{16,}" },
];
const forbiddenFiles = ["node_modules", "dist", ".next", ".wrangler", ".vinext", ".vite", ".sites-runtime", ".DS_Store"];

const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);
const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean);
const files = [...new Set([...tracked, ...untracked])];
const deleted = new Set([
  ...execFileSync("git", ["diff", "--name-only", "--diff-filter=D"], { cwd: root, encoding: "utf8" }).split("\n"),
  ...execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=D"], { cwd: root, encoding: "utf8" }).split("\n"),
].map((file) => file.trim()).filter(Boolean));
const findings = [];
for (const file of files) {
  if (forbiddenFiles.some((prefix) => file === prefix || file.startsWith(`${prefix}/`))) findings.push(`forbidden tracked path: ${file}`);
  if (!existsSync(resolve(root, file))) {
    if (tracked.includes(file) && !deleted.has(file)) findings.push(`missing tracked file: ${file}`);
    continue;
  }
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

if (tracked.length && existsSync(resolve(root, ".git"))) {
  const revisions = new Set(
    execFileSync("git", ["rev-list", "--all"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .map((revision) => revision.trim())
      .filter(Boolean),
  );
  const unreachable = execFileSync("git", ["fsck", "--no-reflogs", "--unreachable"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  for (const line of unreachable.split("\n")) {
    const match = line.match(/^unreachable commit ([0-9a-f]+)$/);
    if (match) revisions.add(match[1]);
  }
  for (const revision of revisions) {
    for (const finding of forbiddenSourcePatterns) {
      try {
        execFileSync(
          "git",
          ["grep", "-I", "-n", "-E", finding.gitPattern, revision, "--", ".", ":(exclude)scripts/security-scan.mjs"],
          { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
        );
        findings.push(`${finding.name}: git history contains a match (revision ${revision.slice(0, 12)})`);
      } catch {
        // git grep exits with status 1 when no match exists.
      }
    }
  }
}
if (findings.length) {
  console.error(findings.join("\n"));
  process.exit(1);
}
console.log(`SECRET_SCAN=PASS tracked_files=${tracked.length} untracked_files=${untracked.length}`);
