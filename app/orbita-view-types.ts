import type {
  ReportJSON,
  ResponseMap,
  ScoreProfile,
} from "@/lib/assessment-engine";

export type View =
  | "home"
  | "catalog"
  | "detail"
  | "checkout"
  | "consent"
  | "assessment"
  | "break"
  | "processing"
  | "results"
  | "account"
  | "methodology"
  | "privacy"
  | "terms"
  | "faq"
  | "support"
  | "admin";

export type Phase = "core" | "adaptive";

export type AccountOrder = {
  id: string;
  testId: string;
  amountMinor: number;
  currency: string;
  status: "PAYMENT_PENDING" | "PAID" | "PAYMENT_FAILED" | "REFUNDED" | "DISPUTED" | "DISPUTE_CLOSED";
  provider: string;
  checkoutUrl: string | null;
  createdAt: string;
};

export type AccountAssessment = {
  id: string;
  testId: string;
  state: string;
  locale?: "ru" | "kk" | "en";
  clientSeq: number;
  adaptiveCount: number;
  reportId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountOverview = {
  user: { id: string; email: string; displayName: string; locale?: "ru" | "kk" | "en" };
  orders: AccountOrder[];
  assessments: AccountAssessment[];
};

export type PendingResponse = {
  sessionId: string;
  itemId: string;
  response: number;
  responseTimeMs: number;
  clientSeq: number;
  idempotencyKey: string;
};

export type SessionPayload = {
  id: string;
  state: string;
  locale?: "ru" | "kk" | "en";
  selection_mode: "deterministic-fallback" | "ai-openai" | null;
  versions: ScoreProfile["versions"];
  next_item_id: string | null;
  core_answered: number;
  adaptive_item_ids: string[];
  response_count: number;
  responses: ResponseMap;
  response_times: Record<string, number>;
  profile?: ScoreProfile | null;
  report_id: string | null;
  consents?: Array<{
    consentType: "terms" | "privacy" | "research" | "marketing";
    granted: boolean;
    textVersion: string;
    decidedAt: string;
    revokedAt: string | null;
  }>;
  updated_at: string;
};

export type ReportPayload = {
  id: string;
  assessment_id: string;
  status: string;
  provider: string | null;
  score: ScoreProfile;
  report: ReportJSON | null;
  pdf_available: boolean;
  generation?: {
    promptVersion: string | null;
    modelId: string | null;
    inputHash: string | null;
    outputHash: string | null;
    validationResult: string | null;
  };
  updated_at: string;
};

export type AdminMetrics = {
  users: number;
  orders: Array<{ status: string; count: number }>;
  assessments: Array<{ state: string; count: number }>;
  reports: Array<{ status: string; count: number }>;
  telemetryLast7Days: Array<{ name: string; count: number }>;
  pilotAnalytics: {
    sampleSize: number;
    minimumSampleForPsychometrics: number;
    insufficientData: boolean;
    privacy: string;
  };
  generatedAt: string;
};

export type PublicCatalog = {
  supportContact: string | null;
  locale?: {
    requested: string | null;
    canonical: "ru" | "kk" | "en";
    legacyAlias: boolean;
    status: "published" | "unpublished";
    translationVersion: string | null;
  };
  test: {
    id: "orbita30";
    name: string;
    assessmentVersion: string;
    amountMinor: number | null;
    currency: string;
    availableForCheckout: boolean;
    includesPdf: true;
    oneTime: true;
    description: string;
  };
};

export type WebMcpState = {
  sessionId?: string;
  phase: Phase;
  view: View;
  answered: number;
  coreAnswered: number;
  adaptiveCount: number;
  activeItemId?: string;
};

export type WebMcpActions = {
  start: () => Promise<void>;
  submit: (value: number) => Promise<void>;
};
