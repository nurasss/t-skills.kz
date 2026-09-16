import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const archiveArgument = process.argv[2];
if (!archiveArgument) throw new Error("RELEASE_ARCHIVE_REQUIRED");
const archive = resolve(archiveArgument);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const sourceGitSha = git(["rev-parse", process.argv[3] ?? process.env.SOURCE_GIT_SHA ?? "HEAD"]);
if (process.version !== "v22.13.0") throw new Error(`RELEASE_RUNTIME_REQUIRED: expected v22.13.0, got ${process.version}`);
const migrations = git(["ls-tree", "-r", "--name-only", sourceGitSha, "--", "drizzle"])
  .split("\n")
  .filter((file) => /^drizzle\/\d+_.*\.sql$/.test(file))
  .sort();
const packageLock = execFileSync("git", ["show", `${sourceGitSha}:package-lock.json`], { cwd: root });
const nodeVersion = process.version.replace(/^v/, "");
const artifactName = "orbita-30-source-release.tar.gz";
const artifactSha256 = sha256(readFileSync(archive));
const manifest = {
  schema_version: "orbita-30-release-manifest-v2",
  generated_at: new Date().toISOString(),
  source_git_sha: sourceGitSha,
  node_version: nodeVersion,
  package_lock_sha256: sha256(packageLock),
  artifact_name: artifactName,
  artifact_sha256: artifactSha256,
  assessment_version: "orbita30_ru_v2",
  item_bank_version: "core60-v1",
  scoring_version: "mvp-0.5-core60",
  adaptive_version: "mercury-generated-0.1",
  adaptive_provider: "inception-labs",
  adaptive_model: "mercury-2.5",
  adaptive_prompt_version: "mercury-adaptive-v1",
  selector_version: "mercury-generated-0.1",
  report_version: "report-0.4",
  report_prompt_version: "report-writer-0.3",
  translation_version: "ru-source-v1",
  interpretation_library_version: "approved-interpretation-v1",
  norm_version: "unvalidated-v2",
  source_package: {
    file: artifactName,
    sha256: artifactSha256,
    packaging_rule: "tracked blobs from exact source_git_sha; generated release evidence, DEPLOYMENT_EVIDENCE.md and PROJECT_HANDOFF.md excluded",
  },
  runtime: {
    node: nodeVersion,
    required_node: "22.13.0",
    package_lock_sha256: sha256(packageLock),
  },
  database: {
    latest_migration: migrations.at(-1)?.replace(/^drizzle\//, "") ?? null,
    migrations,
  },
  versions: {
    assessment: "orbita30_ru_v2",
    item_bank: "core60-v1",
    scoring: "mvp-0.5-core60",
    adaptive: "mercury-generated-0.1",
    adaptive_provider: "inception-labs",
    adaptive_model: "mercury-2.5",
    adaptive_prompt: "mercury-adaptive-v1",
    norms: "unvalidated-v2",
    adaptive_selector: "mercury-generated-0.1",
    report: "report-0.4",
    report_prompt: "report-writer-0.3",
    translation: "ru-source-v1",
    interpretation_library: "approved-interpretation-v1",
    consent: "privacy-2026-09",
  },
  acceptance_gates: {
    ready_for_engineering_100: "PENDING_GITHUB_ACTIONS_CLEAN_LINUX_CI",
    ready_for_closed_pilot: "NO_EXTERNAL_APPROVALS",
    ready_for_public_paid_launch: "NO_PUBLIC_AUTH_LIVE_STRIPE_LEGAL_OPERATIONS",
    ready_for_validated_claims: "NO_PSYCHOMETRIC_VALIDATION",
    ready_for_normative_percentiles: "NO_APPROVED_NORMS",
  },
};
writeFileSync(resolve(root, "RELEASE_MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`RELEASE_MANIFEST=PASS source_git_sha=${sourceGitSha} source_sha256=${manifest.source_package.sha256}`);
