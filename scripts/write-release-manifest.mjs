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
const manifest = {
  schema_version: "orbita-30-release-manifest-v2",
  generated_at: new Date().toISOString(),
  source_git_sha: sourceGitSha,
  source_package: {
    file: "orbita-30-source-release.tar.gz",
    sha256: sha256(readFileSync(archive)),
    packaging_rule: "tracked blobs from exact source_git_sha; generated release evidence and PROJECT_HANDOFF.md excluded",
  },
  runtime: {
    node: process.version.replace(/^v/, ""),
    required_node: "22.13.0",
    package_lock_sha256: sha256(packageLock),
  },
  database: {
    latest_migration: migrations.at(-1)?.replace(/^drizzle\//, "") ?? null,
    migrations,
  },
  versions: {
    assessment: "orbita30_ru_v1",
    item_bank: "draft-pilot-v1",
    scoring: "mvp-0.4-norm-safe",
    norms: "pilot-index-unvalidated-v1",
    adaptive_selector: "selector-0.3",
    report: "report-0.3",
    report_prompt: "report-writer-0.3",
    translation: "ru-source-v1",
    interpretation_library: "approved-interpretation-v1",
    consent: "privacy-2026-09",
  },
  acceptance_gates: {
    ready_for_engineering_100: "PENDING_CLEAN_LINUX_RELEASE_VERIFICATION",
    ready_for_closed_pilot: "NO_EXTERNAL_APPROVALS",
    ready_for_public_paid_launch: "NO_PUBLIC_AUTH_LIVE_STRIPE_LEGAL_OPERATIONS",
    ready_for_validated_claims: "NO_PSYCHOMETRIC_VALIDATION",
    ready_for_normative_percentiles: "NO_APPROVED_NORMS",
  },
};
writeFileSync(resolve(root, "RELEASE_MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`RELEASE_MANIFEST=PASS source_git_sha=${sourceGitSha} source_sha256=${manifest.source_package.sha256}`);
