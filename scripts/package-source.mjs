import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(process.cwd());
const output = resolve(process.argv[2] ?? join(tmpdir(), "orbita-30-source.tar.gz"));
const forbidden = ["node_modules/", "dist/", ".next/", ".wrangler/", ".vinext/", ".vite/", ".sites-runtime/", ".DS_Store"];
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .map((file) => file.trim())
  .filter(Boolean)
  .filter((file) => !forbidden.some((prefix) => file === prefix || file.startsWith(prefix)));
if (!files.includes("package-lock.json")) throw new Error("SOURCE_PACKAGE_LOCKFILE_MISSING");

mkdirSync(dirname(output), { recursive: true });
const staging = mkdtempSync(join(tmpdir(), "orbita-30-source-"));
try {
  for (const file of files) {
    const source = resolve(root, file);
    const target = join(staging, file);
    if (!source.startsWith(`${root}/`) || !existsSync(source)) throw new Error(`SOURCE_PACKAGE_INVALID_PATH:${file}`);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
  writeFileSync(join(staging, "SOURCE_MANIFEST.txt"), `${files.join("\n")}\n`);
  execFileSync("tar", ["-czf", output, "-C", staging, "."], { stdio: "inherit" });
  console.log(`Source package: ${output}`);
  console.log(`Files: ${files.length}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
