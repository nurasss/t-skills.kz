"use client";

import { InfoView } from "@/app/orbita-public-views";
import {
  AccountView,
  AdminView,
  AssessmentView,
  BreakView,
  CatalogView,
  CheckoutView,
  ConsentView,
  DetailView,
  HomeView,
  MethodologyView,
  ProcessingView,
  ResultsView,
} from "@/app/orbita-views";
import type { OrbitaController } from "@/hooks/use-orbita-controller";

export function OrbitaViewRouter({ controller }: { controller: OrbitaController }) {
  const {
    view,
    phase,
    activeItem,
    activeValue,
    questionIndex,
    adaptiveIndex,
    adaptiveItems,
    selection,
    profile,
    report,
    reportProvider,
    autosaveStatus,
    elapsedSeconds,
    checkoutBusy,
    checkoutError,
    publicCatalog,
    consents,
    accountOverview,
    accountLoading,
    accountActionStatus,
    adminMetrics,
    demoMode,
    processingStatus,
    go,
    openDemo,
    startCheckout,
    setConsent,
    beginAssessment,
    saveResponse,
    nextQuestion,
    continueFromBreak,
    retryReport,
    downloadReport,
    openReport,
    startAssessmentFromAccount,
    exportAccountData,
    deleteAccountData,
    deleteAssessmentData,
  } = controller;
  if (view === "home") return <HomeView onNavigate={go} onDemo={openDemo} />;
  if (view === "catalog") return <CatalogView onNavigate={go} />;
  if (view === "detail") return <DetailView onNavigate={go} onDemo={openDemo} />;
  if (view === "checkout") return <CheckoutView onNavigate={go} onCheckout={startCheckout} busy={checkoutBusy} error={checkoutError} catalog={publicCatalog} />;
  if (view === "consent") return <ConsentView consents={consents} onConsentChange={setConsent} onBegin={beginAssessment} onBack={() => go("account")} onPrivacy={() => go("privacy")} />;
  if (view === "assessment") return <AssessmentView phase={phase} item={activeItem} currentIndex={phase === "core" ? questionIndex % 50 : adaptiveIndex} total={phase === "core" ? 50 : adaptiveItems.length} blockNumber={Math.floor(questionIndex / 50) + 1} selectedValue={activeValue} onAnswer={saveResponse} onNext={nextQuestion} onPause={() => go("break")} autosaveStatus={autosaveStatus} elapsedSeconds={elapsedSeconds} />;
  if (view === "break") return <BreakView adaptiveReady={phase === "adaptive"} selection={selection} onContinue={continueFromBreak} onExit={() => go("account")} />;
  if (view === "processing") return <ProcessingView status={processingStatus} onOpenResults={() => go("results")} onRetry={retryReport} profile={profile} />;
  if (view === "results" && profile && report) return <ResultsView profile={profile} report={report} provider={reportProvider} onNavigate={go} onPrint={downloadReport} />;
  if (view === "account") {
    return (
      <AccountView
        onNavigate={go}
        profile={profile}
        demoMode={demoMode}
        overview={accountOverview}
        loading={accountLoading}
        actionStatus={accountActionStatus}
        betaFree={publicCatalog?.test.accessMode === "beta-free"}
        onStartAssessment={startAssessmentFromAccount}
        onOpenReport={(id) => void openReport(id)}
        onExport={exportAccountData}
        onDelete={deleteAccountData}
        onDeleteAssessment={(id) => void deleteAssessmentData(id)}
      />
    );
  }
  if (view === "methodology") return <MethodologyView onNavigate={go} />;
  if (view === "admin") return <AdminView profile={profile} metrics={adminMetrics} onNavigate={go} />;
  if (view === "privacy" || view === "terms" || view === "faq" || view === "support") return <InfoView kind={view} onNavigate={go} supportContact={publicCatalog?.supportContact} />;
  return <HomeView onNavigate={go} onDemo={openDemo} />;
}
