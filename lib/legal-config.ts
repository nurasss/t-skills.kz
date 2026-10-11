import { getRuntimeEnv, type OrbitaRuntimeEnv } from "@/db";
import {
  legalConfigFromEnvironment,
  legalDocumentsApprovedForEnvironment,
} from "@/lib/legal-policy";
import type { LegalConfig } from "@/lib/legal-documents";

export { legalConfigFromEnvironment } from "@/lib/legal-policy";

export function legalDocumentsApproved(environment: Partial<OrbitaRuntimeEnv> = getRuntimeEnv()) {
  return legalDocumentsApprovedForEnvironment(environment);
}

export function getLegalConfig(): LegalConfig {
  return legalConfigFromEnvironment(getRuntimeEnv());
}
