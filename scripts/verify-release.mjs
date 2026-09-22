import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const manifest = JSON.parse(readFileSync(resolve(root, "RELEASE_MANIFEST.json"), "utf8"));
const sourceSha = manifest.source_git_sha;
const requiredNode = manifest.runtime?.required_node;
const expectedNode = manifest.node_version;
const expectedArtifact = manifest.artifact_name;
const expectedArtifactSha = manifest.artifact_sha256;

function assert(value, message) {
  if (!value) throw new Error(`RELEASE_VERIFY_FAILED: ${message}`);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

assert(manifest.schema_version === "t-skills-release-manifest-v3", "manifest schema");
assert(/^[0-9a-f]{40}$/.test(sourceSha), "source_git_sha");
assert(requiredNode === "22.13.0", "required Node must be exact 22.13.0");
assert(process.version === `v${requiredNode}`, `running ${process.version}, expected v${requiredNode}`);
assert(expectedNode === requiredNode, "node_version mismatch");
assert(expectedArtifact === manifest.source_package?.file, "artifact_name mismatch");
assert(expectedArtifactSha === manifest.source_package?.sha256, "artifact_sha256 mismatch");
assert(manifest.package_lock_sha256 === manifest.runtime?.package_lock_sha256, "package_lock_sha256 mismatch");
assert(manifest.assessment_version === manifest.versions?.assessment, "assessment_version mismatch");
assert(manifest.item_bank_version === manifest.versions?.item_bank, "item_bank_version mismatch");
assert(manifest.scoring_version === manifest.versions?.scoring, "scoring_version mismatch");
assert(manifest.adaptive_version === manifest.versions?.adaptive, "adaptive_version mismatch");
assert(manifest.adaptive_provider === manifest.versions?.adaptive_provider, "adaptive_provider mismatch");
assert(manifest.adaptive_model === manifest.versions?.adaptive_model, "adaptive_model mismatch");
assert(manifest.adaptive_prompt_version === manifest.versions?.adaptive_prompt, "adaptive_prompt_version mismatch");
assert(manifest.selector_version === manifest.versions?.adaptive_selector, "selector_version mismatch");
assert(manifest.report_version === manifest.versions?.report, "report_version mismatch");
assert(manifest.report_prompt_version === manifest.versions?.report_prompt, "report_prompt_version mismatch");
assert(manifest.translation_version === manifest.versions?.translation, "translation_version mismatch");
assert(manifest.interpretation_library_version === manifest.versions?.interpretation_library, "interpretation_library_version mismatch");
assert(manifest.norm_version === manifest.versions?.norms, "norm_version mismatch");
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
  assert(firstHash === manifest.artifact_sha256, "flat artifact hash mismatch");
  console.log(`RELEASE_VERIFY=PASS source_git_sha=${sourceSha} sha256=${firstHash}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
