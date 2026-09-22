import { T_SKILLS_PAIRWISE_BANK_V1 } from "@/lib/t-skills/content-v4";
import { T_SKILLS_ADAPTIVE_BANK_V1 } from "@/lib/t-skills/adaptive-bank-v1";
import { T_SKILLS_VERSION_IDS, T_SKILLS_TEST_ID } from "@/lib/t-skills/versions";

type AssessmentVersionContract = {
  productId: string;
  version: string;
  scoringVersion: string;
  contentVersion: string;
  careerModelVersion: string;
  reportVersion: string;
  adaptiveVersion: string | null;
  itemCount: number;
};

/**
 * The admin registry is not a code generator.  A row can be published only
 * when its complete runtime is already registered here.  This prevents an
 * attractive-looking DB version from routing users to a missing scorer or
 * item bank.
 */
export function executableAssessmentVersionReason(value: AssessmentVersionContract) {
  if (value.productId !== T_SKILLS_TEST_ID) return "ASSESSMENT_RUNTIME_PRODUCT_UNSUPPORTED";
  if (value.version !== T_SKILLS_VERSION_IDS.assessment) return "ASSESSMENT_RUNTIME_VERSION_UNREGISTERED";
  if (value.scoringVersion !== T_SKILLS_VERSION_IDS.scoring) return "ASSESSMENT_RUNTIME_SCORER_UNREGISTERED";
  if (value.contentVersion !== T_SKILLS_VERSION_IDS.itemBank || value.itemCount !== T_SKILLS_PAIRWISE_BANK_V1.length + T_SKILLS_ADAPTIVE_BANK_V1.length) return "ASSESSMENT_RUNTIME_ITEM_BANK_UNREGISTERED";
  if (value.careerModelVersion !== T_SKILLS_VERSION_IDS.careerMatching) return "ASSESSMENT_RUNTIME_CAREER_MODEL_UNREGISTERED";
  if (value.reportVersion !== T_SKILLS_VERSION_IDS.report) return "ASSESSMENT_RUNTIME_REPORT_UNREGISTERED";
  if (value.adaptiveVersion !== T_SKILLS_VERSION_IDS.adaptive) return "ASSESSMENT_RUNTIME_ADAPTIVE_UNREGISTERED";
  return null;
}

export function isExecutableAssessmentVersion(value: AssessmentVersionContract) {
  return executableAssessmentVersionReason(value) === null;
}
