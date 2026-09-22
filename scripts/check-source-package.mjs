import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const temporary = mkdtempSync(join(tmpdir(), "tskills-source-package-"));
const archive = join(temporary, "source.tar.gz");
const source = process.argv[2] ?? "HEAD";
const forbidden = /^(?:\.git\/|node_modules\/|dist\/|\.next\/|\.output\/|\.wrangler\/|\.env\.local$|\.env\..+\.local$)/u;

try {
  execFileSync(process.execPath, ["scripts/package-source.mjs", archive, source], { cwd: root, stdio: "inherit" });
  const files = execFileSync("tar", ["-tzf", archive], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  const found = files.filter((file) => forbidden.test(file));
  if (found.length) throw new Error(`SOURCE_PACKAGE_FORBIDDEN_PATHS:${found.join(",")}`);
  if (!files.includes("package-lock.json")) throw new Error("SOURCE_PACKAGE_LOCKFILE_MISSING");
  console.log(`SOURCE_PACKAGE_CHECK=PASS files=${files.length} bytes=${readFileSync(archive).byteLength}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
