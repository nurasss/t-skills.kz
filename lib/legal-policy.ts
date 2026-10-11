import type { OrbitaRuntimeEnv } from "@/db";
import { DEFAULT_LEGAL_CONFIG, type LegalConfig } from "@/lib/legal-documents";

const REQUIRED_LEGAL_ENV_KEYS = [
  "SUPPORT_CONTACT",
  "LEGAL_ENTITY_NAME",
  "LEGAL_CONTACT_ADDRESS",
  "LEGAL_CONTACT_PHONE",
  "LEGAL_JURISDICTION",
  "LEGAL_PROCESSING_PURPOSES",
  "LEGAL_DATA_CATEGORIES",
  "LEGAL_RETENTION_SCHEDULE",
  "LEGAL_PROCESSORS",
  "LEGAL_CROSS_BORDER_PROCESSING",
  "LEGAL_USER_RIGHTS",
  "LEGAL_SECURITY_SUMMARY",
  "LEGAL_RESEARCH_POLICY",
  "LEGAL_MARKETING_POLICY",
  "LEGAL_REFUND_POLICY",
  "LEGAL_COOKIE_POLICY",
] as const satisfies readonly (keyof OrbitaRuntimeEnv)[];

function configuredLegalValue(value: string | undefined) {
  const trimmed = value?.trim();
  return Boolean(trimmed && !/^(?:\[|placeholder\b|replace\b|tbd\b|todo\b|not configured\b|example\b|не настроен[ао]?\b|не утвержден[ао]?\b)/i.test(trimmed) && !/(?:example\.(?:com|org|net|test)|\.invalid)\b/i.test(trimmed));
}

export function legalDocumentsApprovedForEnvironment(environment: Partial<OrbitaRuntimeEnv>) {
  return environment.LEGAL_DOCUMENTS_APPROVED?.trim().toLowerCase() === "true" &&
    REQUIRED_LEGAL_ENV_KEYS.every((key) => configuredLegalValue(environment[key]));
}

/** Indexing is controlled explicitly and independently of legal review metadata. */
export function publicIndexingAllowedForEnvironment(environment: Partial<OrbitaRuntimeEnv>) {
  return environment.PUBLIC_INDEXING_ENABLED?.trim().toLowerCase() === "true";
}

function value(key: keyof LegalConfig, envValue: string | undefined) {
  const trimmed = envValue?.trim();
  if (trimmed === undefined || !configuredLegalValue(trimmed)) return DEFAULT_LEGAL_CONFIG[key];
  return trimmed;
}

export function legalConfigFromEnvironment(environment: Partial<OrbitaRuntimeEnv>): LegalConfig {
  const configured: LegalConfig = {
    entityName: value("entityName", environment.LEGAL_ENTITY_NAME),
    supportContact: value("supportContact", environment.SUPPORT_CONTACT),
    contactAddress: value("contactAddress", environment.LEGAL_CONTACT_ADDRESS),
    contactPhone: value("contactPhone", environment.LEGAL_CONTACT_PHONE),
    jurisdiction: value("jurisdiction", environment.LEGAL_JURISDICTION),
    processingPurposes: value("processingPurposes", environment.LEGAL_PROCESSING_PURPOSES),
    dataCategories: value("dataCategories", environment.LEGAL_DATA_CATEGORIES),
    retentionSchedule: value("retentionSchedule", environment.LEGAL_RETENTION_SCHEDULE),
    processors: value("processors", environment.LEGAL_PROCESSORS),
    crossBorderProcessing: value("crossBorderProcessing", environment.LEGAL_CROSS_BORDER_PROCESSING),
    userRights: value("userRights", environment.LEGAL_USER_RIGHTS),
    securitySummary: value("securitySummary", environment.LEGAL_SECURITY_SUMMARY),
    researchPolicy: value("researchPolicy", environment.LEGAL_RESEARCH_POLICY),
    marketingPolicy: value("marketingPolicy", environment.LEGAL_MARKETING_POLICY),
    refundPolicy: value("refundPolicy", environment.LEGAL_REFUND_POLICY),
    cookiePolicy: value("cookiePolicy", environment.LEGAL_COOKIE_POLICY),
    reviewStatus: "",
  };
  if (legalDocumentsApprovedForEnvironment(environment)) return configured;
  return {
    ...DEFAULT_LEGAL_CONFIG,
    // A verified operational support contact may remain public during a closed beta.
    supportContact: value("supportContact", environment.SUPPORT_CONTACT),
  };
}
