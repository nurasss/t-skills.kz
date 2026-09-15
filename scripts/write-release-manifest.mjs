import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const archiveArgument = process.argv[2];
if (!archiveArgument) throw new Error("RELEASE_ARCHIVE_REQUIRED");
const archive = resolve(archiveArgument);

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const migrations = execFileSync("git", ["ls-files", "drizzle"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .map((file) => file.trim())
  .filter((file) => /^drizzle\/\d+_.*\.sql$/.test(file))
  .sort();
const packageLockSha256 = sha256File(resolve(root, "package-lock.json"));
const sourceGitSha = git(["rev-parse", "HEAD"]);
const manifest = {
  schemaVersion: "orbita-30-release-manifest-v1",
  generatedAt: new Date().toISOString(),
  sourceGitSha,
  sourcePackage: {
    file: "orbita-30-source-release.tar.gz",
    sha256: sha256File(archive),
    excludes: ["node_modules", "dist", ".next", ".wrangler", ".vinext", ".vite", ".sites-runtime", ".DS_Store", "release evidence records"],
  },
  runtime: {
    node: process.version,
    engine: ">=22.13.0",
    packageLockSha256,
  },
  database: {
    latestMigration: migrations.at(-1)?.replace(/^drizzle\//, "") ?? null,
    migrations,
  },
  versions: {
    assessment: "orbita30_ru_v1",
    itemBank: "draft-pilot-v1",
    scoring: "mvp-0.4-norm-safe",
    norms: "pilot-index-unvalidated-v1",
    adaptiveSelector: "selector-0.3",
    report: "report-0.3",
    reportPrompt: "report-writer-0.3",
    translation: "ru-source-v1",
    interpretationLibrary: "approved-interpretation-v1",
    consent: "privacy-2026-09",
  },
  gatePolicy: {
    engineering: "NO until clean Linux CI and clean release checkout evidence",
    closedPilot: "NO until external content/legal/protocol/support approvals",
    publicPaid: "NO until public auth/live Stripe/KZ legal/operations approvals",
    validatedClaims: "NO until preregistered psychometric evidence and independent review",
    normativePercentiles: "NO until approved language/population-specific norms",
  },
};
writeFileSync(resolve(root, "RELEASE_MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`RELEASE_MANIFEST=PASS source_git_sha=${sourceGitSha} source_sha256=${manifest.sourcePackage.sha256}`);
