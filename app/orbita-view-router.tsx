"use client";

import {
  InfoViewFAQ,
  InfoViewSupport,
  InfoView as EditorialInfoView,
} from "@/app/views/info/info-view";
import { getLegalDocument, DEFAULT_LEGAL_CONFIG, localizedLegalReviewStatus, type LegalConfig } from "@/lib/legal-documents";
import { useSiteLang } from "@/lib/site-lang";
import { INFO_STRINGS } from "@/lib/site-strings";
import type { OrbitaController } from "@/hooks/use-orbita-controller";

function getInfoContent(kind: "privacy" | "terms" | "faq" | "support", supportContact: string | null, legal: LegalConfig | null, lang: "ru" | "kk" = "ru") {
  const t = INFO_STRINGS[lang];
  // Env-backed operator facts from /api/catalog; DEFAULT keeps unset fields
  // explicit until the owner configures them (review banner stays).
  const config: LegalConfig = { ...DEFAULT_LEGAL_CONFIG, ...(legal ?? {}) };
  const contact = supportContact || config.supportContact;
  config.supportContact = contact;
  if (kind === "privacy" || kind === "terms") {
    const legalDoc = getLegalDocument(kind, config, lang);
    return {
      title: legalDoc.title,
      version: legalDoc.version,
      updatedAt: legalDoc.updatedAt,
      reviewStatus: localizedLegalReviewStatus(config.reviewStatus, lang),
      blocks: legalDoc.blocks.map((block) => ({ title: block.title, body: block.body })),
    };
  }
  if (kind === "faq") {
    return {
      title: t.faqTitle,
      blocks: t.faq.map(([title, body]) => ({ title, body })),
    };
  }
  return {
    title: t.supportTitle,
    blocks: t.support.map(([title, body]) => {
      if (body !== "") return { title, body };
      return {
        title,
        body: supportContact ? `${supportContact} · ${t.supportContact}` : t.supportContactOff,
      };
    }),
  };
}

export function OrbitaViewRouter({ controller }: { controller: OrbitaController }) {
  const {
    view,
    phase,
    activeItem,
    activeValue,
    questionIndex,
    adaptiveIndex,
    coreItemCount,
    adaptiveItems,
    profile,
    report,
    reportProvider,
    autosaveStatus,
    elapsedSeconds,
    checkoutBusy,
    checkoutError,
    promoCode,
    publicCatalog,
    consents,
    accountOverview,
    accountLoading,
    accountActionStatus,
    requestError,
    adminMetrics,
    processingStatus,
    go,
    startCheckout,
    setPromoCode,
    setConsent,
    beginAssessment,
    saveOnboarding,
    onboarding,
    onboardingBusy,
    saveResponse,
    nextQuestion,
    retryReport,
    downloadReport,
    openReport,
    demoMode,
    startAssessmentFromAccount,
    exportAccountData,
    deleteAccountData,
    logout,
    deleteAssessmentData,
  } = controller;
  const [siteLang] = useSiteLang();

  if (view === "home") return null;
  if (view === "catalog") {
    return <LazyCatalog onNavigate={go} />;
  }
  if (view === "detail") {
    return <LazyDetail onNavigate={go} />;
  }
  if (view === "checkout") {
    return (
      <LazyCheckout
        onNavigate={go}
        onCheckout={startCheckout}
        promoCode={promoCode}
        onPromoCodeChange={setPromoCode}
        busy={checkoutBusy}
        error={checkoutError ?? requestError}
        catalog={publicCatalog}
      />
    );
  }
  if (view === "consent") {
    return (
      <LazyConsent
        consents={consents}
        onConsentChange={setConsent}
        onBegin={beginAssessment}
        onBack={() => go("account")}
        onPrivacy={() => go("privacy")}
      />
    );
  }
  if (view === "onboarding") {
    return <LazyOnboarding initial={onboarding} busy={onboardingBusy} error={controller.requestError} onSubmit={saveOnboarding} onBack={() => go("account")} />;
  }
  if (view === "teen") {
    return <LazyTeenFlow onHome={() => go("home")} />;
  }
  if (view === "assessment") {
    return (
      <LazyAssessment
        phase={phase}
        item={activeItem}
        currentIndex={phase === "core" ? questionIndex : adaptiveIndex}
        total={phase === "core" ? coreItemCount : adaptiveItems.length}
        overallTotal={coreItemCount === T_SKILLS_TEEN_STATIC_ITEM_COUNT ? T_SKILLS_TEEN_STATIC_ITEM_COUNT + T_SKILLS_TEEN_CLARIFICATION_COUNT : coreItemCount === T_SKILLS_STATIC_ITEM_COUNT ? T_SKILLS_TOTAL_QUESTION_COUNT : phase === "core" ? coreItemCount : coreItemCount + adaptiveItems.length}
        questionOffset={(coreItemCount === T_SKILLS_STATIC_ITEM_COUNT || coreItemCount === T_SKILLS_TEEN_STATIC_ITEM_COUNT) && phase === "adaptive" ? coreItemCount : 0}
        blockNumber={Math.floor(questionIndex / (coreItemCount === 60 ? 20 : 50)) + 1}
        selectedValue={activeValue}
        onAnswer={saveResponse}
        onNext={nextQuestion}
        onPause={() => go("account")}
        autosaveStatus={autosaveStatus}
        elapsedSeconds={elapsedSeconds}
      />
    );
  }
  if (view === "processing") {
    return <LazyProcessing status={processingStatus} onOpenResults={() => go("results")} onRetry={retryReport} profile={profile} coreCount={coreItemCount} />;
  }
  if (view === "results" && profile && report) {
    return (
      <LazyResults
        profile={profile}
        report={report}
        provider={reportProvider}
        demo={demoMode}
        onNavigate={go}
        onPrint={downloadReport}
      />
    );
  }
  if (view === "account") {
    return (
      <LazyAccount
        onNavigate={go}
        profile={profile}
        overview={accountOverview}
        loading={accountLoading}
        actionStatus={accountActionStatus}
        betaFree={publicCatalog?.test.accessMode === "beta-free"}
        onStartAssessment={startAssessmentFromAccount}
        onOpenReport={(id) => void openReport(id)}
        onExport={exportAccountData}
        onDelete={deleteAccountData}
        onLogout={() => void logout()}
        onDeleteAssessment={(id) => void deleteAssessmentData(id)}
      />
    );
  }
  if (view === "methodology") {
    return <LazyMethodology onNavigate={go} />;
  }
  if (view === "admin") {
    return <LazyAdmin profile={profile} metrics={adminMetrics} onNavigate={go} />;
  }
  if (view === "privacy" || view === "terms" || view === "faq" || view === "support") {
    if (view === "privacy" || view === "terms") {
      const content = getInfoContent(view, publicCatalog?.supportContact ?? null, publicCatalog?.legal ?? null, siteLang);
      return (
        <EditorialInfoView
          kind={view}
          onNavigate={go}
          title={content.title}
          blocks={content.blocks}
          version={content.version}
          updatedAt={content.updatedAt}
          reviewStatus={content.reviewStatus}
        />
      );
    }
    if (view === "faq") {
      return <InfoViewFAQ onNavigate={go} />;
    }
    return <InfoViewSupport onNavigate={go} supportContact={publicCatalog?.supportContact} />;
  }
  return null;
}

import { CatalogView } from "@/app/views/catalog/catalog-view";
import { DetailView } from "@/app/views/detail/detail-view";
import { CheckoutView } from "@/app/views/checkout/checkout-view";
import { ConsentView } from "@/app/views/consent/consent-view";
import { OnboardingView } from "@/app/views/onboarding/onboarding-view";
import { AssessmentView } from "@/app/views/assessment/assessment-view";
import { ProcessingView } from "@/app/views/assessment/processing-view";
import { ResultsView } from "@/app/views/results/results-view";
import { AccountView } from "@/app/views/account/account-view";
import { MethodologyView } from "@/app/views/methodology/methodology-view";
import { AdminView } from "@/app/views/admin/admin-view";
import { TeenFlowView } from "@/app/views/teen/teen-flow-view";
import type { AccountOverview, AdminMetrics, AssessmentItem, Phase, PublicCatalog, View } from "@/app/orbita-view-types";
import type { ReportJSON, ScoreProfile } from "@/lib/assessment-engine";
import type { OnboardingContext } from "@/lib/t-skills/contracts";
import { T_SKILLS_STATIC_ITEM_COUNT, T_SKILLS_TEEN_CLARIFICATION_COUNT, T_SKILLS_TEEN_STATIC_ITEM_COUNT, T_SKILLS_TOTAL_QUESTION_COUNT } from "@/lib/t-skills/versions";

function LazyCatalog(props: { onNavigate: (view: View) => void }) {
  return <CatalogView {...props} />;
}

function LazyDetail(props: { onNavigate: (view: View) => void }) {
  return <DetailView {...props} />;
}

function LazyCheckout(props: {
  onNavigate: (view: View) => void;
  onCheckout: () => void;
  promoCode: string;
  onPromoCodeChange: (value: string) => void;
  busy: boolean;
  error?: string;
  catalog?: PublicCatalog;
}) {
  return <CheckoutView {...props} />;
}

function LazyConsent(props: {
  consents: { terms: boolean; privacy: boolean; research: boolean; marketing: boolean };
  onConsentChange: (key: "terms" | "privacy" | "research" | "marketing", value: boolean) => void;
  onBegin: () => void;
  onBack: () => void;
  onPrivacy: () => void;
}) {
  return <ConsentView {...props} />;
}

function LazyAssessment(props: {
  phase: Phase;
  item?: AssessmentItem;
  currentIndex: number;
  total: number;
  overallTotal: number;
  questionOffset: number;
  blockNumber: number;
  selectedValue?: number;
  onAnswer: (value: number) => void;
  onNext: () => void;
  onPause: () => void;
  autosaveStatus: string;
  elapsedSeconds: number;
}) {
  return <AssessmentView {...props} />;
}

function LazyOnboarding(props: { initial?: OnboardingContext | null; busy?: boolean; error?: string; onSubmit: (value: OnboardingContext) => Promise<void>; onBack: () => void }) {
  return <OnboardingView {...props} />;
}

function LazyProcessing(props: {
  status: "ADAPTIVE_GENERATING" | "ADAPTIVE_PROVIDER_FAILED" | "SCORING" | "REPORT_GENERATING" | "REPORT_FAILED_RETRYABLE" | "COMPLETE";
  onOpenResults: () => void;
  onRetry: () => void;
  profile?: ScoreProfile;
  coreCount?: number;
}) {
  return <ProcessingView {...props} />;
}

function LazyResults(props: {
  profile: ScoreProfile;
  report: ReportJSON;
  provider?: string;
  demo?: boolean;
  onNavigate: (view: View) => void;
  onPrint: () => void;
}) {
  return <ResultsView {...props} />;
}

function LazyAccount(props: {
  onNavigate: (view: View) => void;
  profile?: ScoreProfile;
  overview?: AccountOverview;
  loading: boolean;
  actionStatus?: string;
  betaFree: boolean;
  onStartAssessment: () => void;
  onOpenReport: (reportId: string) => void;
  onExport: () => void;
  onDelete: () => void;
  onLogout: () => void;
  onDeleteAssessment: (assessmentId: string) => void;
}) {
  return <AccountView {...props} />;
}

function LazyMethodology(props: { onNavigate: (view: View) => void }) {
  return <MethodologyView {...props} />;
}

function LazyTeenFlow(props: { onHome: () => void }) {
  return <TeenFlowView {...props} />;
}

function LazyAdmin(props: { profile?: ScoreProfile; onNavigate: (view: View) => void; metrics?: AdminMetrics }) {
  return <AdminView {...props} />;
}
