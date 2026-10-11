import assert from "node:assert/strict";
import test from "node:test";

import {
  executableAssessmentVersionReason,
  isExecutableAssessmentVersion,
} from "@/lib/assessment-runtime-registry";
import { T_SKILLS_TEST_ID, T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";
import { T_SKILLS_PAIRWISE_BANK_V1 } from "@/lib/t-skills/content-v4";
import { T_SKILLS_ADAPTIVE_BANK_V1 } from "@/lib/t-skills/adaptive-bank-v1";

// P2.22 — assessment publish gate at the pure seam.
//
// `executableAssessmentVersionReason` (lib/assessment-runtime-registry.ts) is
// the publish precondition: an admin row may be published only when its full
// runtime is registered here. A truthy reason blocks publication; null means
// publishable. DB flows (version-row CRUD in lib/admin-store.ts) need an
// integration harness; the gate decision itself is pure and pinned below.

function validContract() {
  return {
    productId: T_SKILLS_TEST_ID,
    version: T_SKILLS_VERSION_IDS.assessment,
    scoringVersion: T_SKILLS_VERSION_IDS.scoring,
    contentVersion: T_SKILLS_VERSION_IDS.itemBank,
    careerModelVersion: T_SKILLS_VERSION_IDS.careerMatching,
    reportVersion: T_SKILLS_VERSION_IDS.report,
    adaptiveVersion: T_SKILLS_VERSION_IDS.adaptive,
    itemCount: T_SKILLS_PAIRWISE_BANK_V1.length + T_SKILLS_ADAPTIVE_BANK_V1.length,
  };
}

test("registered runtime versions are publishable", () => {
  const contract = validContract();
  assert.equal(executableAssessmentVersionReason(contract), null);
  assert.equal(isExecutableAssessmentVersion(contract), true);
});

test("unknown scoring versions block publication", () => {
  const v999 = { ...validContract(), scoringVersion: "pairwise-scoring-v999" };
  assert.equal(executableAssessmentVersionReason(v999), "ASSESSMENT_RUNTIME_SCORER_UNREGISTERED");
  assert.equal(isExecutableAssessmentVersion(v999), false);
  const unknown = { ...validContract(), scoringVersion: "unknown-scorer" };
  assert.equal(executableAssessmentVersionReason(unknown), "ASSESSMENT_RUNTIME_SCORER_UNREGISTERED");
  assert.equal(isExecutableAssessmentVersion(unknown), false);
});

test("every unregistered version field blocks publication with its own reason", () => {
  const cases = [
    { patch: { productId: "other-product" }, reason: "ASSESSMENT_RUNTIME_PRODUCT_UNSUPPORTED" },
    { patch: { version: "t-skills_pairwise_v999" }, reason: "ASSESSMENT_RUNTIME_VERSION_UNREGISTERED" },
    { patch: { contentVersion: "t-skills-pairwise-items-v999" }, reason: "ASSESSMENT_RUNTIME_ITEM_BANK_UNREGISTERED" },
    { patch: { itemCount: validContract().itemCount + 1 }, reason: "ASSESSMENT_RUNTIME_ITEM_BANK_UNREGISTERED" },
    { patch: { careerModelVersion: "career-matching-v999" }, reason: "ASSESSMENT_RUNTIME_CAREER_MODEL_UNREGISTERED" },
    { patch: { reportVersion: "t-skills-report-v999" }, reason: "ASSESSMENT_RUNTIME_REPORT_UNREGISTERED" },
    { patch: { adaptiveVersion: "career-adaptive-v999" }, reason: "ASSESSMENT_RUNTIME_ADAPTIVE_UNREGISTERED" },
    { patch: { adaptiveVersion: null }, reason: "ASSESSMENT_RUNTIME_ADAPTIVE_UNREGISTERED" },
  ] as const;
  for (const { patch, reason } of cases) {
    const contract = { ...validContract(), ...patch };
    assert.equal(executableAssessmentVersionReason(contract), reason);
    assert.equal(isExecutableAssessmentVersion(contract), false);
  }
});
