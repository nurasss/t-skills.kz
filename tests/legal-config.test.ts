import assert from "node:assert/strict";
import test from "node:test";

import {
  legalConfigFromEnvironment,
  legalDocumentsApprovedForEnvironment as legalDocumentsApproved,
  publicIndexingAllowedForEnvironment as publicIndexingEnabledForEnvironment,
} from "@/lib/legal-policy";
import { DEFAULT_LEGAL_CONFIG, getLegalDocument } from "@/lib/legal-documents";

const approvedEnvironment = {
  APP_ENV: "production-beta",
  ORBITA_ENV: "production",
  LEGAL_DOCUMENTS_APPROVED: "true",
  SUPPORT_CONTACT: "privacy@operator.kz",
  LEGAL_ENTITY_NAME: "Verified Operator LLP",
  LEGAL_CONTACT_ADDRESS: "Verified street 1, City",
  LEGAL_CONTACT_PHONE: "+1 555 010 2000",
  LEGAL_JURISDICTION: "Jurisdiction reviewed by counsel",
  LEGAL_PROCESSING_PURPOSES: "Purposes reviewed by counsel",
  LEGAL_DATA_CATEGORIES: "Categories reviewed by counsel",
  LEGAL_RETENTION_SCHEDULE: "Schedule reviewed by counsel",
  LEGAL_PROCESSORS: "Processors reviewed by counsel",
  LEGAL_CROSS_BORDER_PROCESSING: "Cross-border information reviewed by counsel",
  LEGAL_USER_RIGHTS: "Rights reviewed by counsel",
  LEGAL_SECURITY_SUMMARY: "Security statement reviewed",
  LEGAL_RESEARCH_POLICY: "Research policy reviewed",
  LEGAL_MARKETING_POLICY: "Marketing policy reviewed",
  LEGAL_REFUND_POLICY: "Refund policy reviewed",
  LEGAL_COOKIE_POLICY: "Cookie policy reviewed",
};

test("legal facts remain redacted until all operator fields and explicit approval are present", () => {
  assert.notEqual(DEFAULT_LEGAL_CONFIG.entityName, "ТОО «T-Skills»");
  assert.notEqual(DEFAULT_LEGAL_CONFIG.contactPhone, "+7 (727) 310-00-00");
  assert.notEqual(DEFAULT_LEGAL_CONFIG.reviewStatus, "");
  assert.equal(legalDocumentsApproved({ ...approvedEnvironment, LEGAL_DOCUMENTS_APPROVED: "false" }), false);
  assert.equal(legalDocumentsApproved({ ...approvedEnvironment, LEGAL_CONTACT_PHONE: "[phone not configured]" }), false);

  const draft = legalConfigFromEnvironment({ ...approvedEnvironment, LEGAL_DOCUMENTS_APPROVED: "false" });
  assert.equal(draft.entityName, DEFAULT_LEGAL_CONFIG.entityName);
  assert.equal(draft.contactPhone, DEFAULT_LEGAL_CONFIG.contactPhone);
  assert.equal(draft.reviewStatus, DEFAULT_LEGAL_CONFIG.reviewStatus);
  assert.equal(draft.supportContact, "privacy@operator.kz");
  const draftPrivacy = getLegalDocument("privacy", draft);
  assert.deepEqual(draftPrivacy.blocks, [{ title: "Контакт поддержки", body: "privacy@operator.kz" }]);
  assert.equal(JSON.stringify(draftPrivacy).includes("Республика Казахстан"), false);
  assert.doesNotMatch(draft.contactPhone, /310-00-00/);
  assert.notEqual(draft.entityName, "ТОО «T-Skills»");

  const approved = legalConfigFromEnvironment(approvedEnvironment);
  assert.equal(approved.entityName, "Verified Operator LLP");
  assert.equal(approved.contactPhone, "+1 555 010 2000");
  assert.equal(approved.reviewStatus, "");
  const approvedPrivacy = getLegalDocument("privacy", approved);
  assert.ok(approvedPrivacy.blocks.some((block) => block.body.includes("Processors reviewed by counsel")));
});

test("public indexing follows its explicit switch independently of legal approval", () => {
  assert.equal(publicIndexingEnabledForEnvironment({ PUBLIC_INDEXING_ENABLED: "false" }), false);
  assert.equal(publicIndexingEnabledForEnvironment({
    APP_ENV: "production-beta",
    ORBITA_ENV: "production",
    PUBLIC_INDEXING_ENABLED: "true",
    LEGAL_DOCUMENTS_APPROVED: "false",
  }), true);
  assert.equal(publicIndexingEnabledForEnvironment({
    ...approvedEnvironment,
    PUBLIC_INDEXING_ENABLED: "true",
  }), true);
  assert.equal(publicIndexingEnabledForEnvironment({
    APP_ENV: "development",
    ORBITA_ENV: "development",
    PUBLIC_INDEXING_ENABLED: "true",
  }), true);
});
