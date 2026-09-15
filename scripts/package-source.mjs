import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(process.cwd());
const output = resolve(process.argv[2] ?? join(tmpdir(), "orbita-30-source.tar.gz"));
const sourceRevision = process.argv[3] ?? process.env.SOURCE_GIT_SHA ?? "HEAD";
const sourceGitSha = execFileSync("git", ["rev-parse", "--verify", `${sourceRevision}^{commit}`], { cwd: root, encoding: "utf8" }).trim();
const forbidden = ["node_modules/", "dist/", ".next/", ".wrangler/", ".vinext/", ".vite/", ".sites-runtime/", ".DS_Store"];
// Release evidence records their own source/package identity and is delivered
// alongside the immutable source archive, so excluding it avoids a hash cycle
// while keeping the archive free of generated release state. The handoff is
// also delivered alongside the archive because it records the exact source
// SHA and artifact hash after the source commit is frozen.
const releaseEvidence = new Set(["FINAL_ACCEPTANCE.md", "CI_EVIDENCE.txt", "RELEASE_MANIFEST.json", "PROJECT_HANDOFF.md"]);
const treeEntries = execFileSync("git", ["ls-tree", "-r", "-z", "--full-tree", sourceGitSha], { cwd: root })
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .map((entry) => {
    const match = entry.match(/^(\d+) (\w+) ([0-9a-f]+)\t(.+)$/s);
    if (!match) throw new Error("SOURCE_TREE_ENTRY_INVALID");
    const [, mode, type, object, file] = match;
    if (type !== "blob") throw new Error(`SOURCE_TREE_UNSUPPORTED_ENTRY:${file}`);
    return { mode, object, file };
  });
const includedEntries = treeEntries
  .filter(({ file }) => !releaseEvidence.has(file))
  .filter(({ file }) => !forbidden.some((prefix) => file === prefix || file.startsWith(prefix)))
  .sort((left, right) => left.file.localeCompare(right.file));
const files = includedEntries.map(({ file }) => file);
if (!files.includes("package-lock.json")) throw new Error("SOURCE_PACKAGE_LOCKFILE_MISSING");

const gitModes = new Map(includedEntries.map(({ file, mode }) => [file, mode]));
const gitObjects = new Map(
  includedEntries.map(({ file, object }) => [file, execFileSync("git", ["cat-file", "blob", object], { cwd: root })]),
);

function tarString(buffer, offset, length, value) {
  buffer.write(String(value), offset, length, "utf8");
}

function tarOctal(buffer, offset, length, value) {
  const text = Math.max(0, value).toString(8).padStart(length - 1, "0");
  buffer.write(`${text}\0`, offset, length, "ascii");
}

function tarHeader(file, size) {
  const header = Buffer.alloc(512, 0);
  let name = file;
  let prefix = "";
  if (Buffer.byteLength(name) > 100) {
    const split = name.lastIndexOf("/", 155);
    if (split < 1 || Buffer.byteLength(name.slice(split + 1)) > 100) throw new Error(`SOURCE_PATH_TOO_LONG:${file}`);
    prefix = name.slice(0, split);
    name = name.slice(split + 1);
  }
  tarString(header, 0, 100, name);
  tarOctal(header, 100, 8, gitModes.get(file) === "100755" ? 0o755 : 0o644);
  tarOctal(header, 108, 8, 0);
  tarOctal(header, 116, 8, 0);
  tarOctal(header, 124, 12, size);
  tarOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  tarString(header, 257, 6, "ustar");
  tarString(header, 263, 2, "00");
  tarString(header, 265, 32, "root");
  tarString(header, 297, 32, "root");
  tarString(header, 345, 155, prefix);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return header;
}

function deterministicTarGzip(packageFiles) {
  const chunks = [];
  for (const file of [...packageFiles, "SOURCE_MANIFEST.txt"].sort()) {
    const content = file === "SOURCE_MANIFEST.txt"
      ? Buffer.from(`source_git_sha=${sourceGitSha}\n${packageFiles.join("\n")}\n`, "utf8")
      : gitObjects.get(file);
    if (!content) throw new Error(`SOURCE_BLOB_MISSING:${file}`);
    chunks.push(tarHeader(file, content.length), content);
    const padding = (512 - (content.length % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks), { level: 9, mtime: 0 });
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, deterministicTarGzip(files));
console.log(`Source package: ${output}`);
console.log(`Source Git SHA: ${sourceGitSha}`);
console.log(`Files: ${files.length}`);
