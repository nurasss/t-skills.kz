import { getRuntimeEnv } from "@/db";
import { DEFAULT_LEGAL_CONFIG, type LegalConfig } from "@/lib/legal-documents";

function value(key: keyof LegalConfig, envValue: string | undefined) {
  return envValue?.trim() || DEFAULT_LEGAL_CONFIG[key];
}

export function getLegalConfig(): LegalConfig {
  const runtimeEnv = getRuntimeEnv();
  return {
    entityName: value("entityName", runtimeEnv.LEGAL_ENTITY_NAME),
    supportContact: value("supportContact", runtimeEnv.SUPPORT_CONTACT),
    contactAddress: value("contactAddress", runtimeEnv.LEGAL_CONTACT_ADDRESS),
    contactPhone: value("contactPhone", runtimeEnv.LEGAL_CONTACT_PHONE),
    jurisdiction: value("jurisdiction", runtimeEnv.LEGAL_JURISDICTION),
    processingPurposes: value("processingPurposes", runtimeEnv.LEGAL_PROCESSING_PURPOSES),
    dataCategories: value("dataCategories", runtimeEnv.LEGAL_DATA_CATEGORIES),
    retentionSchedule: value("retentionSchedule", runtimeEnv.LEGAL_RETENTION_SCHEDULE),
    processors: value("processors", runtimeEnv.LEGAL_PROCESSORS),
    crossBorderProcessing: value("crossBorderProcessing", runtimeEnv.LEGAL_CROSS_BORDER_PROCESSING),
    userRights: value("userRights", runtimeEnv.LEGAL_USER_RIGHTS),
    securitySummary: value("securitySummary", runtimeEnv.LEGAL_SECURITY_SUMMARY),
    researchPolicy: value("researchPolicy", runtimeEnv.LEGAL_RESEARCH_POLICY),
    marketingPolicy: value("marketingPolicy", runtimeEnv.LEGAL_MARKETING_POLICY),
    refundPolicy: value("refundPolicy", runtimeEnv.LEGAL_REFUND_POLICY),
    cookiePolicy: value("cookiePolicy", runtimeEnv.LEGAL_COOKIE_POLICY),
    reviewStatus: DEFAULT_LEGAL_CONFIG.reviewStatus,
  };
}
