import { T_SKILLS_PAIRWISE_BANK_V1 } from "@/lib/t-skills/content-v4";
import { T_SKILLS_ADAPTIVE_BANK_V1 } from "@/lib/t-skills/adaptive-bank-v1";
import { T_SKILLS_TEEN_CLARIFICATION_POOL, T_SKILLS_TEEN_STATIC_ITEM_COUNT, T_SKILLS_TEEN_V1_FIX_VERSION_IDS, T_SKILLS_TEEN_V1_VERSION_IDS, T_SKILLS_TEEN_V3_VERSION_IDS, T_SKILLS_TEEN_V4_VERSION_IDS, T_SKILLS_TEEN_V5_VERSION_IDS, T_SKILLS_TEEN_VERSION_IDS, T_SKILLS_VERSION_IDS, T_SKILLS_TEST_ID } from "@/lib/t-skills/versions";

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
  if (value.version === T_SKILLS_TEEN_V5_VERSION_IDS.assessment) return teenRuntimeReason(value, T_SKILLS_TEEN_V5_VERSION_IDS);
  if (value.version === T_SKILLS_TEEN_V4_VERSION_IDS.assessment) return teenRuntimeReason(value, T_SKILLS_TEEN_V4_VERSION_IDS);
  if (value.version === T_SKILLS_TEEN_V3_VERSION_IDS.assessment) return teenRuntimeReason(value, T_SKILLS_TEEN_V3_VERSION_IDS);
  if (value.version === T_SKILLS_TEEN_VERSION_IDS.assessment) return teenRuntimeReason(value, T_SKILLS_TEEN_VERSION_IDS);
  if (value.version === T_SKILLS_TEEN_V1_VERSION_IDS.assessment) return teenRuntimeReason(value, T_SKILLS_TEEN_V1_VERSION_IDS);
  if (value.version === T_SKILLS_TEEN_V1_FIX_VERSION_IDS.assessment) return "ASSESSMENT_RUNTIME_VERSION_INTERNAL_ONLY";
  if (value.version !== T_SKILLS_VERSION_IDS.assessment) return "ASSESSMENT_RUNTIME_VERSION_UNREGISTERED";
  if (value.scoringVersion !== T_SKILLS_VERSION_IDS.scoring) return "ASSESSMENT_RUNTIME_SCORER_UNREGISTERED";
  if (value.contentVersion !== T_SKILLS_VERSION_IDS.itemBank || value.itemCount !== T_SKILLS_PAIRWISE_BANK_V1.length + T_SKILLS_ADAPTIVE_BANK_V1.length) return "ASSESSMENT_RUNTIME_ITEM_BANK_UNREGISTERED";
  if (value.careerModelVersion !== T_SKILLS_VERSION_IDS.careerMatching) return "ASSESSMENT_RUNTIME_CAREER_MODEL_UNREGISTERED";
  if (value.reportVersion !== T_SKILLS_VERSION_IDS.report) return "ASSESSMENT_RUNTIME_REPORT_UNREGISTERED";
  if (value.adaptiveVersion !== T_SKILLS_VERSION_IDS.adaptive) return "ASSESSMENT_RUNTIME_ADAPTIVE_UNREGISTERED";
  return null;
}

/** Career model runtime a published assessment version must be paired with. */
export function careerRuntimeForAssessmentVersion(version: string) {
  return version === T_SKILLS_TEEN_V5_VERSION_IDS.assessment || version === T_SKILLS_TEEN_V4_VERSION_IDS.assessment || version === T_SKILLS_TEEN_V3_VERSION_IDS.assessment || version === T_SKILLS_TEEN_VERSION_IDS.assessment || version === T_SKILLS_TEEN_V1_VERSION_IDS.assessment || version === T_SKILLS_TEEN_V1_FIX_VERSION_IDS.assessment
    ? "built-in:t-skills-teen-career-v1"
    : "built-in:t-skills-career-v1";
}

function teenRuntimeReason(
  value: AssessmentVersionContract,
  version: typeof T_SKILLS_TEEN_V5_VERSION_IDS | typeof T_SKILLS_TEEN_V4_VERSION_IDS | typeof T_SKILLS_TEEN_V3_VERSION_IDS | typeof T_SKILLS_TEEN_VERSION_IDS | typeof T_SKILLS_TEEN_V1_VERSION_IDS,
) {
  if (value.scoringVersion !== version.scoring) return "ASSESSMENT_RUNTIME_SCORER_UNREGISTERED";
  if (value.contentVersion !== version.itemBank || value.itemCount !== T_SKILLS_TEEN_STATIC_ITEM_COUNT + T_SKILLS_TEEN_CLARIFICATION_POOL) return "ASSESSMENT_RUNTIME_ITEM_BANK_UNREGISTERED";
  if (value.careerModelVersion !== version.careerMatching) return "ASSESSMENT_RUNTIME_CAREER_MODEL_UNREGISTERED";
  if (value.reportVersion !== version.report) return "ASSESSMENT_RUNTIME_REPORT_UNREGISTERED";
  if (value.adaptiveVersion !== version.adaptive) return "ASSESSMENT_RUNTIME_ADAPTIVE_UNREGISTERED";
  return null;
}

export function isExecutableAssessmentVersion(value: AssessmentVersionContract) {
  return executableAssessmentVersionReason(value) === null;
}
