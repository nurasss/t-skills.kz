import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const acceptance = readFileSync(resolve(root, "FINAL_ACCEPTANCE.md"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(root, "RELEASE_MANIFEST.json"), "utf8"));

const expectedRequirementIds = [
  ...Array.from({ length: 6 }, (_, index) => `ENG-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 7 }, (_, index) => `TST-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 6 }, (_, index) => `SEC-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 5 }, (_, index) => `AUTH-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 5 }, (_, index) => `PAY-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 5 }, (_, index) => `AI-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 10 }, (_, index) => `PSY-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 6 }, (_, index) => `LOC-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 6 }, (_, index) => `OPS-${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 6 }, (_, index) => `LEG-${String(index + 1).padStart(2, "0")}`),
];

const requirementIdsInDocument = [];
const requirementRows = new Map();
for (const match of acceptance.matchAll(/^\| ([A-Z]+-\d{2}) \| ([^|]+) \|/gm)) {
  requirementIdsInDocument.push(match[1]);
  requirementRows.set(match[1], match[2].trim());
}

const missingIds = expectedRequirementIds.filter((id) => !requirementRows.has(id));
const duplicateIds = expectedRequirementIds.filter((id) => requirementIdsInDocument.filter((candidate) => candidate === id).length > 1);
const invalidMetadataRows = acceptance.split("\n")
  .filter((line) => /^\| [A-Z]+-\d{2} \|/.test(line))
  .filter((line) => {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    return cells.length !== 7 || cells[5].length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(cells[6]);
  });
if (missingIds.length || duplicateIds.length || invalidMetadataRows.length) {
  throw new Error(`GATE_CHECKLIST_INVALID missing=${missingIds.join(",")} duplicate=${duplicateIds.join(",")} metadata_rows=${invalidMetadataRows.length}`);
}

const isPass = (id) => requirementRows.get(id)?.startsWith("PASS") === true;
const allPass = (ids) => ids.every(isPass);

const g0Checklist = [
  "ENG-01", "ENG-03", "ENG-04", "ENG-06",
  "TST-01", "TST-02", "TST-03", "TST-04", "TST-05", "TST-06", "TST-07",
  "SEC-01", "SEC-02", "SEC-03", "SEC-04", "SEC-05", "SEC-06",
  "AI-01", "AI-02", "AI-03", "AI-05",
];
const g1Checklist = ["ENG-05", "AI-04", "OPS-01", "OPS-02", "OPS-03", "OPS-05", "OPS-06", "LEG-01", "LEG-02", "LEG-04", "LEG-06", "PSY-01", "PSY-02"];
const g2Checklist = ["AUTH-01", "AUTH-02", "AUTH-03", "AUTH-04", "AUTH-05", "PAY-01", "PAY-02", "PAY-03", "PAY-04", "PAY-05", "LEG-03", "OPS-04"];
const g3Checklist = ["PSY-03", "PSY-04", "PSY-05", "PSY-06", "PSY-07", "PSY-08", "PSY-10", "LOC-03", "LOC-04", "LOC-05"];
const g3bChecklist = ["PSY-09", "LOC-06"];

function gitStatusIsClean() {
  return execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() === "";
}

function manifestIsConsistent() {
  if (manifest.schema_version !== "orbita-30-release-manifest-v2") return false;
  if (!/^[0-9a-f]{40}$/.test(manifest.source_git_sha ?? "")) return false;
  if (manifest.node_version !== "22.13.0" || manifest.runtime?.required_node !== "22.13.0") return false;
  if (manifest.artifact_sha256 !== manifest.source_package?.sha256) return false;
  if (!/^[0-9a-f]{64}$/.test(manifest.artifact_sha256 ?? "")) return false;
  if (manifest.package_lock_sha256 !== manifest.runtime?.package_lock_sha256) return false;
  if (!/^[0-9a-f]{64}$/.test(manifest.package_lock_sha256 ?? "")) return false;
  try {
    execFileSync("git", ["cat-file", "-e", `${manifest.source_git_sha}^{commit}`], { cwd: root, stdio: "ignore" });
  } catch {
    return false;
  }
  const artifact = resolve(root, `release-artifacts/orbita-30-source-release-${manifest.source_git_sha.slice(0, 7)}.tar.gz`);
  if (existsSync(artifact)) {
    const actual = createHash("sha256").update(readFileSync(artifact)).digest("hex");
    if (actual !== manifest.artifact_sha256) return false;
  }
  return true;
}

function signedExternalEvidence(gate) {
  const path = process.env[`ORBITA_${gate}_EVIDENCE_FILE`];
  if (!path) return false;
  try {
    const evidence = JSON.parse(readFileSync(resolve(path), "utf8"));
    return evidence.gate === gate
      && evidence.approved === true
      && evidence.source_git_sha === manifest.source_git_sha
      && typeof evidence.approved_by === "string"
      && evidence.approved_by.trim().length > 0
      && typeof evidence.approved_at === "string"
      && evidence.approved_at.trim().length > 0;
  } catch {
    return false;
  }
}

const hostedCiEvidence = process.env.GITHUB_ACTIONS === "true" && process.env.ORBITA_CI_GATES_PASSED === "true";
const localReleaseChecks = allPass(g0Checklist) && manifestIsConsistent() && gitStatusIsClean();
const g0 = localReleaseChecks && hostedCiEvidence;
const g1 = g0 && allPass(g1Checklist) && signedExternalEvidence("G1");
const g2 = g1 && allPass(g2Checklist) && signedExternalEvidence("G2");
const g3 = g2 && allPass(g3Checklist) && signedExternalEvidence("G3");
const g3b = g3 && allPass(g3bChecklist) && signedExternalEvidence("G3B");

console.log(`READY_FOR_ENGINEERING_100=${g0 ? "YES" : "NO"}`);
console.log(`READY_FOR_CLOSED_PILOT=${g1 ? "YES" : "NO"}`);
console.log(`READY_FOR_PUBLIC_PAID_LAUNCH=${g2 ? "YES" : "NO"}`);
console.log(`READY_FOR_VALIDATED_CLAIMS=${g3 ? "YES" : "NO"}`);
console.log(`READY_FOR_NORMATIVE_PERCENTILES=${g3b ? "YES" : "NO"}`);
console.log(`GATE_EVALUATION=PASS local_release_checks=${localReleaseChecks ? "PASS" : "FAIL"} hosted_ci=${hostedCiEvidence ? "PASS" : "MISSING"}`);
