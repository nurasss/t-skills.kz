import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const manifest = JSON.parse(readFileSync(resolve(root, "RELEASE_MANIFEST.json"), "utf8"));
const sourceSha = manifest.source_git_sha;
const requiredNode = manifest.runtime?.required_node;

function assert(value, message) {
  if (!value) throw new Error(`RELEASE_VERIFY_FAILED: ${message}`);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

assert(manifest.schema_version === "orbita-30-release-manifest-v2", "manifest schema");
assert(/^[0-9a-f]{40}$/.test(sourceSha), "source_git_sha");
assert(requiredNode === "22.13.0", "required Node must be exact 22.13.0");
assert(process.version === `v${requiredNode}`, `running ${process.version}, expected v${requiredNode}`);
execFileSync("git", ["cat-file", "-e", `${sourceSha}^{commit}`], { cwd: root });
const lock = execFileSync("git", ["show", `${sourceSha}:package-lock.json`], { cwd: root });
assert(hash(lock) === manifest.runtime.package_lock_sha256, "package-lock hash mismatch");

const temporary = mkdtempSync(join(tmpdir(), "orbita-release-verify-"));
try {
  const first = join(temporary, "source-a.tar.gz");
  const second = join(temporary, "source-b.tar.gz");
  for (const output of [first, second]) {
    execFileSync(process.execPath, ["scripts/package-source.mjs", output, sourceSha], { cwd: root, stdio: "inherit" });
  }
  const firstHash = hash(readFileSync(first));
  const secondHash = hash(readFileSync(second));
  assert(firstHash === secondHash, "two clean packages differ");
  assert(firstHash === manifest.source_package.sha256, "artifact hash mismatch");
  console.log(`RELEASE_VERIFY=PASS source_git_sha=${sourceSha} sha256=${firstHash}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
