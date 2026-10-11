"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, apiJson, topLevelNavigate, trackOptionalAnalytics, writePendingResponses } from "@/app/orbita-api";
import type { AccountOverview, AdminMetrics, AssessmentItem, PendingResponse, Phase, PublicCatalog, ReportPayload, SessionPayload, View } from "@/app/orbita-view-types";
import {
  getItemById,
  type AdaptiveSelection,
  type ReportJSON,
  type ResponseMap,
  type ScoreProfile,
} from "@/lib/assessment-engine";
import { ITEM_BANK, type Item } from "@/lib/item-bank";
import { CORE60_BANK } from "@/lib/v2-item-bank";
import { type GeneratedAdaptiveQuestion } from "@/lib/mercury-adaptive-provider";
import { T_SKILLS_PAIRWISE_BANK_V1 } from "@/lib/t-skills/content-v4";
import { T_SKILLS_TEEN_VERSION_IDS, T_SKILLS_TEST_ID, T_SKILLS_VERSION_IDS, isTSkillsTeenVersion } from "@/lib/t-skills/versions";
import { buildTeenDemoData, teenPairwiseItemsForAssessmentVersion } from "@/lib/t-skills/teen/runtime";
import { useSiteLang } from "@/lib/site-lang";
import { CTRL_STRINGS, translateControllerStatus } from "@/lib/site-strings";
import type { AdaptiveQuestion, OnboardingContext } from "@/lib/t-skills/contracts";
import { findPendingItem, pendingForSession, replacePending } from "@/lib/response-retry-queue";
import { metadataForView, routeForView, viewStateForPath } from "@/lib/view-routing";
import { useAssessmentQueue } from "@/hooks/use-assessment-queue";

const LEGACY_CORE_ITEMS = ITEM_BANK.filter((item) => Number(item.id.slice(1)) <= 250);
const itemKey = (item: AssessmentItem) => "questionId" in item ? item.questionId : item.id;
const coreItemsForVersion = (assessmentVersion: string): readonly AssessmentItem[] => isTSkillsTeenVersion(assessmentVersion)
  ? teenPairwiseItemsForAssessmentVersion(assessmentVersion)
  : assessmentVersion === T_SKILLS_VERSION_IDS.assessment ? T_SKILLS_PAIRWISE_BANK_V1 : assessmentVersion === "orbita30_ru_v2" ? CORE60_BANK : LEGACY_CORE_ITEMS;
const needsTSkillsOnboarding = (assessmentVersion: string) => isTSkillsTeenVersion(assessmentVersion) || assessmentVersion === T_SKILLS_VERSION_IDS.assessment;

export type OrbitaControllerOptions = {
  initialView?: View;
  initialSessionId?: string;
  initialReportId?: string;
};

export type OrbitaController = {
  view: View;
  phase: Phase;
  reportId?: string;
  questionIndex: number;
  coreItemCount: number;
  adaptiveIndex: number;
  adaptiveItems: AssessmentItem[];
  activeItem?: AssessmentItem;
  activeValue?: number;
  selection?: AdaptiveSelection;
  profile?: ScoreProfile;
  report?: ReportJSON;
  reportProvider?: string;
  requestError?: string;
  autosaveStatus: string;
  checkoutBusy: boolean;
  checkoutError?: string;
  promoCode: string;
  publicCatalog?: PublicCatalog;
  accountOverview?: AccountOverview;
  accountLoading: boolean;
  accountActionStatus?: string;
  adminMetrics?: AdminMetrics;
  demoMode: boolean;
  elapsedSeconds: number;
  processingStatus: "ADAPTIVE_GENERATING" | "ADAPTIVE_PROVIDER_FAILED" | "SCORING" | "REPORT_GENERATING" | "REPORT_FAILED_RETRYABLE" | "COMPLETE";
  consents: { terms: boolean; privacy: boolean; research: boolean; marketing: boolean };
  onboarding?: OnboardingContext | null;
  onboardingBusy: boolean;
  go: (next: View, phaseOverride?: Phase) => void;
  dismissRequestError: () => void;
  openDemo: () => void;
  startCheckout: () => Promise<void>;
  setPromoCode: (value: string) => void;
  setConsent: (key: "terms" | "privacy" | "research" | "marketing", value: boolean) => void;
  beginAssessment: () => Promise<void>;
  saveOnboarding: (value: OnboardingContext) => Promise<void>;
  saveResponse: (value: number, waitForServer?: boolean) => void | Promise<void>;
  nextQuestion: (responseOverride?: number) => Promise<void>;
  retryReport: () => Promise<void>;
  downloadReport: () => Promise<void>;
  openReport: (id: string) => Promise<void>;
  startAssessmentFromAccount: () => Promise<void>;
  exportAccountData: () => Promise<void>;
  deleteAccountData: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAssessmentData: (assessmentId: string) => Promise<void>;
};

export function useOrbitaController({
  initialView = "home",
  initialSessionId,
  initialReportId,
}: OrbitaControllerOptions): OrbitaController {
  const [view, setView] = useState<View>(initialView);
  const [phase, setPhaseState] = useState<Phase>("core");
  const phaseRef = useRef<Phase>("core");
  const setPhase = (next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };
  const [reportId, setReportId] = useState<string | undefined>(initialReportId);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [coreItems, setCoreItems] = useState<AssessmentItem[]>([...CORE60_BANK]);
  const [adaptiveQuestionSnapshots, setAdaptiveQuestionSnapshots] = useState<Array<GeneratedAdaptiveQuestion | AdaptiveQuestion>>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [adaptiveIndex, setAdaptiveIndex] = useState(0);
  const [selection, setSelection] = useState<AdaptiveSelection>();
  const [profile, setProfile] = useState<ScoreProfile>();
  const [report, setReport] = useState<ReportJSON>();
  const [reportProvider, setReportProvider] = useState<string>();
  const [siteLang] = useSiteLang();
  const st = CTRL_STRINGS[siteLang];
  const [autosaveStatus, setAutosaveStatus] = useState(st.ready);
  const siteLangRef = useRef(siteLang);
  useEffect(() => {
    // Переключение РУ/ҚЗ во время теста: перевести уже показанный статус
    // автосохранения, не трогая вопрос, ответы, прогресс и сессию.
    const prev = siteLangRef.current;
    siteLangRef.current = siteLang;
    if (prev === siteLang) return;
    setAutosaveStatus((current) => translateControllerStatus(current, prev, siteLang));
  }, [siteLang]);
  const [requestError, setRequestError] = useState<string>();
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string>();
  const [promoCode, setPromoCode] = useState("");
  const [publicCatalog, setPublicCatalog] = useState<PublicCatalog>();
  const [accountOverview, setAccountOverview] = useState<AccountOverview>();
  const [accountLoading, setAccountLoading] = useState(initialView === "account");
  const [accountActionStatus, setAccountActionStatus] = useState<string>();
  const [adminMetrics, setAdminMetrics] = useState<AdminMetrics>();
  const [demoMode, setDemoMode] = useState(false);
  const questionStartedAt = useRef(0);
  const sessionIdRef = useRef(initialSessionId);
  const reportIdRef = useRef(initialReportId);
  const { pendingRef, serverSavedRef, persistPendingResponse } = useAssessmentQueue({ onStatus: setAutosaveStatus, savedText: st.saved, offlineText: st.offline });
  const webMcpStateRef = useRef({ sessionId: undefined as string | undefined, phase, view, answered: 0, coreAnswered: 0, adaptiveCount: 0, activeItemId: undefined as string | undefined });
  const webMcpActionsRef = useRef<{ start: () => Promise<void>; submit: (value: number) => Promise<void> }>({ start: async () => undefined, submit: async () => undefined });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<"ADAPTIVE_GENERATING" | "ADAPTIVE_PROVIDER_FAILED" | "SCORING" | "REPORT_GENERATING" | "REPORT_FAILED_RETRYABLE" | "COMPLETE">("SCORING");
  const [consents, setConsents] = useState({ terms: false, privacy: false, research: false, marketing: false });
  const [onboarding, setOnboarding] = useState<OnboardingContext | null>(null);
  const [onboardingBusy, setOnboardingBusy] = useState(false);

  const activateSession = (id?: string) => {
    sessionIdRef.current = id;
  };

  const activateReport = (id?: string) => {
    reportIdRef.current = id;
    setReportId(id);
  };

  const go = (next: View, phaseOverride: Phase = phaseRef.current) => {
    const nextPath = routeForView(next, { sessionId: sessionIdRef.current, reportId: reportIdRef.current, phase: phaseOverride });
    if (next === "account" || next === "checkout" || next === "admin") {
      topLevelNavigate(nextPath);
      return;
    }
    const currentRoute = viewStateForPath(window.location.pathname, window.history.state);
    const phaseChanged = next === "assessment" && currentRoute?.phase !== phaseOverride;
    const routeChanged = window.location.pathname !== nextPath || currentRoute?.view !== next || phaseChanged;
    if (next === "assessment") setPhase(phaseOverride);
    if (routeChanged) {
      const currentHistoryState = window.history.state;
      const nextHistoryState = currentHistoryState && typeof currentHistoryState === "object"
        ? { ...(currentHistoryState as Record<string, unknown>), orbitaView: next, orbitaPhase: phaseOverride }
        : { orbitaView: next, orbitaPhase: phaseOverride };
      window.history.pushState(nextHistoryState, "", nextPath);
    }
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const adaptiveItems = useMemo<AssessmentItem[]>(
    () => adaptiveQuestionSnapshots.length
      ? adaptiveQuestionSnapshots
      : (selection?.selectedItemIds ?? []).map((id) => getItemById(id)).filter((item): item is Item => Boolean(item)),
    [selection, adaptiveQuestionSnapshots],
  );
  const activeItem = phase === "core" ? coreItems[questionIndex] : adaptiveItems[adaptiveIndex];
  const activeValue = activeItem ? responses[itemKey(activeItem)] : undefined;
  const firstUnansweredCore = coreItems.findIndex((item) => typeof responses[itemKey(item)] !== "number");

  const hydrateSession = (payload: SessionPayload) => {
    const pending = pendingForSession(pendingRef.current, payload.id);
    const pendingResponses = Object.fromEntries(pending.map((item) => [item.itemId, item.response])) as ResponseMap;
    serverSavedRef.current = new Set(Object.keys(payload.responses));
    setResponses({ ...payload.responses, ...pendingResponses });
    setOnboarding(payload.onboarding ?? null);
    setCoreItems([...coreItemsForVersion(payload.versions.assessment)]);
    setAdaptiveQuestionSnapshots(payload.adaptive_items ?? []);
    if (payload.consents?.length) {
      setConsents((current) => payload.consents!.reduce((next, consent) => ({ ...next, [consent.consentType]: consent.granted }), current));
    }
    if (payload.adaptive_item_ids.length) {
      setSelection({
        selectedItemIds: payload.adaptive_item_ids,
        targetCount: payload.adaptive_item_ids.length,
        mode: payload.selection_mode ?? "deterministic-fallback",
        validation: "passed",
        reasonCodes: {},
      });
    }
    if (payload.profile) setProfile(payload.profile);
    activateSession(payload.id);
    if (payload.report_id) activateReport(payload.report_id);
    setPhase(payload.state.includes("ADAPTIVE") || payload.state === "REPORT_GENERATING" || payload.state === "REPORT_FAILED_RETRYABLE" || payload.state === "COMPLETE" ? "adaptive" : "core");
    if (payload.state === "ADAPTIVE_GENERATING") setProcessingStatus("ADAPTIVE_GENERATING");
    else if (payload.state === "ADAPTIVE_PROVIDER_FAILED") setProcessingStatus("ADAPTIVE_PROVIDER_FAILED");
    else if (payload.state === "REPORT_GENERATING") setProcessingStatus("REPORT_GENERATING");
    else if (payload.state === "REPORT_FAILED_RETRYABLE") setProcessingStatus("REPORT_FAILED_RETRYABLE");
    else if (payload.state === "COMPLETE") setProcessingStatus("COMPLETE");
    const currentCoreItems = coreItemsForVersion(payload.versions.assessment);
    const coreIndex = currentCoreItems.findIndex((item) => typeof payload.responses[itemKey(item)] !== "number");
    setQuestionIndex(coreIndex >= 0 ? coreIndex : currentCoreItems.length - 1);
    const adaptiveIndexFromServer = (payload.adaptive_items ?? []).findIndex((item) => typeof payload.responses[itemKey(item)] !== "number");
    setAdaptiveIndex(adaptiveIndexFromServer >= 0 ? adaptiveIndexFromServer : 0);
    trackOptionalAnalytics({ name: "resume", assessment_id: payload.id, metadata: { status: payload.state, count: Object.keys(payload.responses).length } });
  };

  const loadReportData = async (id: string, openWhenReady = false) => {
    try {
      const payload = await apiJson<ReportPayload>(`/api/reports/${encodeURIComponent(id)}`);
      activateReport(payload.id);
      setProfile(payload.score);
      setReportProvider(payload.provider ?? undefined);
      setReport(payload.report ?? undefined);
      if (payload.status === "COMPLETE" && payload.report) {
        setProcessingStatus("COMPLETE");
        if (openWhenReady) {
          setView("results");
          window.history.replaceState({}, "", `/results/${payload.id}`);
        }
      } else if (payload.status === "REPORT_FAILED_RETRYABLE") {
        setProcessingStatus("REPORT_FAILED_RETRYABLE");
      } else {
        setProcessingStatus("REPORT_GENERATING");
      }
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : st.errReport);
    }
  };

  const loadSessionData = async (id: string, requestedView: View = initialView): Promise<View | undefined> => {
    try {
      const payload = await apiJson<SessionPayload>(`/api/assessments/${encodeURIComponent(id)}`);
      hydrateSession(payload);
      if (payload.report_id) void loadReportData(payload.report_id, initialView === "results");
      let nextView: View | undefined;
      if (payload.state === "PAID" || payload.state === "ENTITLED") nextView = "consent";
      else if (payload.state === "CONSENTED" || payload.state === "CORE_IN_PROGRESS") {
        const needsOnboarding = needsTSkillsOnboarding(payload.versions.assessment) && !payload.onboarding;
        nextView = needsOnboarding ? "onboarding" : "assessment";
      }
      else if (["ADAPTIVE_GENERATING", "ADAPTIVE_PROVIDER_FAILED"].includes(payload.state)) nextView = "processing";
      else if (["ADAPTIVE_IN_PROGRESS", "ADAPTIVE_FALLBACK"].includes(payload.state)) nextView = requestedView === "processing" ? "processing" : "assessment";
      else if (payload.state === "REPORT_GENERATING" || payload.state === "REPORT_FAILED_RETRYABLE") nextView = "processing";
      else if (payload.state === "COMPLETE") nextView = requestedView === "results" ? "results" : "processing";
      if (nextView) setView(nextView);
      return nextView;
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : st.errSession);
      return undefined;
    }
  };

  useEffect(() => {
    const syncBrowserRoute = () => {
      const route = viewStateForPath(window.location.pathname, window.history.state);
      if (!route) {
        window.location.reload();
        return;
      }
      const previousSessionId = sessionIdRef.current;
      const previousReportId = reportIdRef.current;
      if (route.sessionId) {
        sessionIdRef.current = route.sessionId;
        if (route.sessionId !== previousSessionId) void loadSessionData(route.sessionId, route.view);
      }
      if (route.reportId) {
        reportIdRef.current = route.reportId;
        setReportId(route.reportId);
        if (route.reportId !== previousReportId) void loadReportData(route.reportId, route.view === "results");
      }
      setPhase(route.phase);
      setView(route.view);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("popstate", syncBrowserRoute);
    return () => window.removeEventListener("popstate", syncBrowserRoute);
    // The browser listener is intentionally installed once; route data lives in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const metadata = metadataForView(view, phase, siteLang);
    document.title = metadata.title;
    let description = document.head.querySelector('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.setAttribute("name", "description");
      document.head.appendChild(description);
    }
    description.setAttribute("content", metadata.description);
  }, [view, phase, siteLang]);

  const finishCore = async () => {
    if (!sessionIdRef.current) return;
    setAutosaveStatus(st.scoring);
    try {
      const result = await apiJson<{ state: string; preliminary_score: ScoreProfile; adaptive: AdaptiveSelection; adaptive_items?: Array<GeneratedAdaptiveQuestion | AdaptiveQuestion> }>(`/api/assessments/${encodeURIComponent(sessionIdRef.current)}/complete-core`, { method: "POST" });
      setProfile(result.preliminary_score);
      setSelection(result.adaptive);
      setAdaptiveQuestionSnapshots(result.adaptive_items ?? []);
      setPhase("adaptive");
      setAdaptiveIndex(0);
      setRequestError(undefined);
      // Без экрана перерыва: сразу к уточняющим вопросам.
      go("assessment", "adaptive");
      trackOptionalAnalytics({ name: "adaptive_selected", assessment_id: sessionIdRef.current, metadata: { count: result.adaptive.selectedItemIds.length } });
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : st.errBlock);
    }
  };

  const completeAdaptive = async () => {
    if (!sessionIdRef.current) return;
    setProcessingStatus("SCORING");
    setRequestError(undefined);
    go("processing");
    try {
      const result = await apiJson<{ state: string; report_id: string; report_status: string; score: ScoreProfile; report: ReportJSON | null; pdf_available: boolean }>(`/api/assessments/${encodeURIComponent(sessionIdRef.current)}/complete`, { method: "POST" });
      activateReport(result.report_id);
      setProfile(result.score);
      setReport(result.report ?? undefined);
      setProcessingStatus(result.report_status === "COMPLETE" && result.report ? "COMPLETE" : result.report_status === "REPORT_FAILED_RETRYABLE" ? "REPORT_FAILED_RETRYABLE" : "REPORT_GENERATING");
      setReportProvider(undefined);
      trackOptionalAnalytics({ name: "report_viewed", assessment_id: sessionIdRef.current });
    } catch (error) {
      setProcessingStatus("REPORT_FAILED_RETRYABLE");
      setRequestError(error instanceof ApiClientError ? error.message : st.errReportGen);
    }
  };

  const saveResponse = (value: number, waitForServer = false) => {
    if (!activeItem || !sessionIdRef.current || demoMode) return;
    const activeItemId = itemKey(activeItem);
    // Передумывание до «Продолжить»: новое значение заменяет предыдущее
    // (сервер разрешает правку внутри своей фазы).
    if (responses[activeItemId] === value) {
      const existing = findPendingItem(pendingRef.current, sessionIdRef.current, activeItemId);
      if (existing) setAutosaveStatus(st.saving);
      if (waitForServer && existing) return persistPendingResponse(existing);
      return;
    }
    const responseTimeMs = Math.max(0, Date.now() - questionStartedAt.current);
    const pending: PendingResponse = {
      sessionId: sessionIdRef.current,
      itemId: activeItemId,
      response: value,
      responseTimeMs,
      clientSeq: Object.keys(responses).length + 1,
      idempotencyKey: `${sessionIdRef.current}:${activeItemId}:${crypto.randomUUID()}`,
      queuedAt: Date.now(),
    };
    pendingRef.current = replacePending(pendingRef.current, pending);
    writePendingResponses(pendingRef.current);
    setResponses((current) => ({ ...current, [activeItemId]: value }));
    setAutosaveStatus(st.saving);
    const request = persistPendingResponse(pending);
    if (waitForServer) return request;
    void request.catch(() => undefined);
  };

  const beginAssessment = async () => {
    if (!sessionIdRef.current) {
      setRequestError(st.errAccess);
      return;
    }
    if (!(consents.terms && consents.privacy)) return;
    try {
      await apiJson(`/api/assessments/${encodeURIComponent(sessionIdRef.current)}`, {
        method: "PATCH",
        body: JSON.stringify({ consented: true, consents }),
      });
      if (isTSkillsSessionVersion()) {
        setRequestError(undefined);
        go("onboarding");
        trackOptionalAnalytics({ name: "assessment_started", assessment_id: sessionIdRef.current });
        return;
      }
      setPhase("core");
      setQuestionIndex(firstUnansweredCore >= 0 ? firstUnansweredCore : 0);
      setAdaptiveIndex(0);
      setRequestError(undefined);
      setElapsedSeconds(0);
      go("assessment");
      trackOptionalAnalytics({ name: "assessment_started", assessment_id: sessionIdRef.current });
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : st.errConsents);
    }
  };

  const isTSkillsSessionVersion = () => {
    const current = coreItems[0];
    return Boolean(current && "leftTraitId" in current && (current.version === T_SKILLS_VERSION_IDS.itemBank || current.version.startsWith("t-skills")));
  };

  const saveOnboarding = async (value: OnboardingContext) => {
    if (!sessionIdRef.current) return;
    setOnboardingBusy(true);
    setRequestError(undefined);
    try {
      const result = await apiJson<{ onboarding: OnboardingContext }>(`/api/assessments/${encodeURIComponent(sessionIdRef.current)}/onboarding`, {
        method: "PUT",
        body: JSON.stringify({
          age: value.age,
          education_level: value.educationLevel,
          favorite_subjects: value.favoriteSubjects,
          ...(value.valueRanking ? { value_ranking: value.valueRanking } : {}),
        }),
      });
      setOnboarding(result.onboarding);
      setPhase("core");
      setQuestionIndex(firstUnansweredCore >= 0 ? firstUnansweredCore : 0);
      setAdaptiveIndex(0);
      setElapsedSeconds(0);
      go("assessment", "core");
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : st.errOnboarding);
    } finally {
      setOnboardingBusy(false);
    }
  };

  const nextQuestion = async (responseOverride?: number) => {
    const currentItemId = activeItem ? itemKey(activeItem) : undefined;
    const currentResponse = typeof responseOverride === "number" ? responseOverride : currentItemId ? responses[currentItemId] : undefined;
    if (!activeItem || !currentItemId || typeof currentResponse !== "number") return;
    const pending = findPendingItem(pendingRef.current, sessionIdRef.current, currentItemId);
    if (pending) {
      try {
        await persistPendingResponse(pending);
      } catch (error) {
        setRequestError(error instanceof ApiClientError ? error.message : st.errUnconfirmed);
        return;
      }
    }
    if (!currentItemId || !serverSavedRef.current.has(currentItemId)) return;
    if (phase === "core") {
      const nextIndex = questionIndex + 1;
      if (nextIndex >= coreItems.length) {
        await finishCore();
      } else {
        questionStartedAt.current = Date.now();
        setElapsedSeconds(0);
        setQuestionIndex(nextIndex);
        // Без промежуточных пауз: непрерывный поток вопросов.
        const block = coreItems.length === 60 ? nextIndex / 20 : coreItems.length === 67 ? nextIndex / 20 : nextIndex / 50;
        if (Number.isInteger(block)) {
          trackOptionalAnalytics({ name: "block_completed", assessment_id: sessionIdRef.current, metadata: { block } });
        }
      }
    } else {
      const nextIndex = adaptiveIndex + 1;
      if (nextIndex >= adaptiveItems.length) await completeAdaptive();
      else {
        questionStartedAt.current = Date.now();
        setElapsedSeconds(0);
        setAdaptiveIndex(nextIndex);
      }
    }
  };

  const startCheckout = async () => {
    const code = promoCode.trim();
    if (publicCatalog?.test.accessMode === "beta-free" && !code) {
      await startAssessmentFromAccount();
      return;
    }
    if (publicCatalog?.test.accessMode !== "beta-free" && !publicCatalog?.test.availableForCheckout && !code) {
      setCheckoutError(st.errCheckoutOff);
      return;
    }
    setCheckoutBusy(true);
    setCheckoutError(undefined);
    try {
      trackOptionalAnalytics({ name: "checkout_started", metadata: { provider: "stripe", mode: "hosted" } });
      const result = await apiJson<{ checkout_url: string | null; free_access?: boolean }>('/api/checkout', {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ test_id: T_SKILLS_TEST_ID, promo_code: code || undefined }),
      });
      if (result.free_access) {
        await startAssessmentFromAccount();
        return;
      }
      if (!result.checkout_url) throw new ApiClientError("CHECKOUT_URL_MISSING", "Платёжная ссылка не была создана.");
      trackOptionalAnalytics({ name: "checkout_redirected" });
      window.location.assign(result.checkout_url);
    } catch (error) {
      setCheckoutError(error instanceof ApiClientError ? error.message : st.errCheckout);
    } finally {
      setCheckoutBusy(false);
    }
  };

  const exportAccountData = async () => {
    try {
      const result = await apiJson<{ downloadPath: string }>("/api/account/export", { method: "POST" });
      setAccountActionStatus(st.exportReady);
      topLevelNavigate(result.downloadPath);
    } catch (error) {
      setAccountActionStatus(error instanceof ApiClientError ? error.message : st.errExport);
    }
  };

  const deleteAccountData = async () => {
    if (!window.confirm("Удалить аккаунт и все сохранённые ответы? Это действие нельзя отменить.")) return;
    try {
      await apiJson("/api/account/delete", { method: "POST", body: JSON.stringify({ confirm: "DELETE" }) });
      await apiJson("/api/auth/logout", { method: "POST" }).catch(() => undefined);
      topLevelNavigate("/");
    } catch (error) {
      setAccountActionStatus(error instanceof ApiClientError ? error.message : st.errDelAcc);
    }
  };

  const logout = async () => {
    setAccountActionStatus(st.loggingOut);
    try {
      await apiJson("/api/auth/logout", { method: "POST" });
    } catch {
      // Сессия уже недействительна — всё равно уходим на главную.
    }
    topLevelNavigate("/");
  };

  const deleteAssessmentData = async (assessmentId: string) => {
    if (!window.confirm("Удалить эту оценку, ответы и PDF? Это действие нельзя отменить.")) return;
    try {
      await apiJson(`/api/assessments/${encodeURIComponent(assessmentId)}`, { method: "DELETE", body: JSON.stringify({ confirm: "DELETE_ASSESSMENT" }) });
      setAccountActionStatus(st.assessDeleted);
      const refreshed = await apiJson<AccountOverview>("/api/account");
      setAccountOverview(refreshed);
    } catch (error) {
      setAccountActionStatus(error instanceof ApiClientError ? error.message : st.errDelAssess);
    }
  };
  const startAssessmentFromAccount = async () => {
    setAccountActionStatus(st.creatingSession);
    setRequestError(undefined);
    try {
      const result = await apiJson<{ id: string }>("/api/assessments", { method: "POST", body: JSON.stringify({ test_id: T_SKILLS_TEST_ID }) });
      activateSession(result.id);
      setDemoMode(false);
      setProfile(undefined);
      setReport(undefined);
      setSelection(undefined);
      setCoreItems([...teenPairwiseItemsForAssessmentVersion(T_SKILLS_TEEN_VERSION_IDS.assessment)]);
      setAdaptiveQuestionSnapshots([]);
      setResponses({});
      serverSavedRef.current = new Set();
      const nextView = await loadSessionData(result.id);
      if (nextView) go(nextView, nextView === "assessment" ? phaseRef.current : undefined);
      setAccountActionStatus(st.sessionReady);
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : "Не удалось создать сессию.";
      setAccountActionStatus(message);
      setRequestError(message);
    }
  };

  const openReport = async (id: string) => {
    activateReport(id);
    setProcessingStatus("REPORT_GENERATING");
    setRequestError(undefined);
    go("processing");
    await loadReportData(id);
  };

  const retryReport = async () => {
    if (!reportIdRef.current) return;
    setProcessingStatus("REPORT_GENERATING");
    setRequestError(undefined);
    try {
      await apiJson(`/api/reports/${encodeURIComponent(reportIdRef.current)}/regenerate`, { method: "POST" });
      await loadReportData(reportIdRef.current);
    } catch (error) {
      setProcessingStatus("REPORT_FAILED_RETRYABLE");
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось повторить генерацию.");
    }
  };

  const retryProcessing = async () => {
    if (processingStatus === "ADAPTIVE_GENERATING" || processingStatus === "ADAPTIVE_PROVIDER_FAILED") {
      await finishCore();
      return;
    }
    await retryReport();
  };

  const downloadReport = async () => {
    if (!reportIdRef.current || demoMode) {
      window.print();
      return;
    }
    try {
      const link = await apiJson<{ download_path: string }>(`/api/reports/${encodeURIComponent(reportIdRef.current)}/download-link`, { method: "POST" });
      const response = await fetch(link.download_path, { credentials: "include" });
      if (!response.ok) throw new ApiClientError("PDF_DOWNLOAD_FAILED", "Не удалось скачать PDF.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `t-skills-${reportIdRef.current}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось скачать PDF.");
    }
  };

  const openDemo = () => {
    const { profile: demoProfile, report: demoReport } = buildTeenDemoData();
    activateSession(undefined);
    activateReport(undefined);
    setDemoMode(true);
    setProfile(demoProfile);
    setReport(demoReport);
    setPhase("adaptive");
    go("results");
  };

  const setConsent = (key: "terms" | "privacy" | "research" | "marketing", value: boolean) => {
    setConsents((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    webMcpStateRef.current = {
      sessionId: sessionIdRef.current,
      phase,
      view,
      answered: Object.keys(responses).length,
      coreAnswered: Object.keys(responses).filter((id) => coreItems.some((item) => itemKey(item) === id)).length,
      adaptiveCount: adaptiveItems.length,
      activeItemId: activeItem ? itemKey(activeItem) : undefined,
    };
    webMcpActionsRef.current = {
      start: startAssessmentFromAccount,
      submit: async (value: number) => {
        if (!activeItem) throw new Error("There is no active T-Skills question.");
        if (demoMode) throw new Error("The demo profile cannot accept persisted answers.");
        if (serverSavedRef.current.has(itemKey(activeItem))) throw new Error("The current question is already answered.");
        await saveResponse(value, true);
        await nextQuestion(value);
      },
    };
  // The action functions are intentionally stored in refs for one-time WebMCP registration.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, view, responses, adaptiveItems, activeItem, demoMode]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (initialSessionId) void loadSessionData(initialSessionId);
      else if (initialReportId) void loadReportData(initialReportId, true);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId, initialReportId]);

  useEffect(() => {
    if (view !== "assessment") return;
    questionStartedAt.current = Date.now();
    const started = questionStartedAt.current;
    const interval = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [view, phase, questionIndex, adaptiveIndex]);

  useEffect(() => {
    if (view !== "checkout" && view !== "support" && view !== "account") return;
    let cancelled = false;
    void apiJson<PublicCatalog>("/api/catalog")
      .then((payload) => { if (!cancelled) setPublicCatalog(payload); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [view]);

  useEffect(() => {
    if (view !== "catalog" || demoMode) return;
    trackOptionalAnalytics({ name: "catalog_viewed" });
    trackOptionalAnalytics({ name: "test_view", metadata: { test_id: T_SKILLS_TEST_ID } });
  }, [view, demoMode]);

  useEffect(() => {
    if (view !== "assessment" || demoMode || !sessionIdRef.current) return;
    const onBeforeUnload = () => {
      trackOptionalAnalytics({ name: "assessment_abandoned", assessment_id: sessionIdRef.current }, { keepalive: true });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [view, demoMode, phase]);

  useEffect(() => {
    if (view !== "account") return;
    const errAccount = st.errAccount;
    let cancelled = false;
    let timer: number | undefined;
    const load = async () => {
      setAccountLoading(true);
      try {
        const payload = await apiJson<AccountOverview>("/api/account");
        if (!cancelled) setAccountOverview(payload);
      } catch (error) {
        if (!cancelled) setAccountActionStatus(error instanceof ApiClientError ? error.message : errAccount);
      } finally {
        if (!cancelled) setAccountLoading(false);
      }
    };
    void load();
    if (window.location.search.includes("payment=success")) timer = window.setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [view, st.errAccount]);

  useEffect(() => {
    if (view !== "admin") return;
    void apiJson<AdminMetrics>("/api/admin/overview")
      .then((payload) => setAdminMetrics(payload))
      .catch(() => undefined);
  }, [view]);

  useEffect(() => {
    if (view !== "processing" || !reportId || processingStatus === "COMPLETE" || processingStatus === "REPORT_FAILED_RETRYABLE") return;
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const payload = await apiJson<ReportPayload>(`/api/reports/${encodeURIComponent(reportId)}`);
        if (cancelled) return;
        setProfile(payload.score);
        setReportProvider(payload.provider ?? undefined);
        setReport(payload.report ?? undefined);
        if (payload.status === "COMPLETE" && payload.report) setProcessingStatus("COMPLETE");
        else if (payload.status === "REPORT_FAILED_RETRYABLE") setProcessingStatus("REPORT_FAILED_RETRYABLE");
        else if (attempts < 40) timer = window.setTimeout(poll, 1500);
        else setProcessingStatus("REPORT_FAILED_RETRYABLE");
      } catch (error) {
        if (!cancelled) setRequestError(error instanceof ApiClientError ? error.message : "Не удалось проверить статус отчёта.");
        if (!cancelled && attempts < 40) timer = window.setTimeout(poll, 2000);
        else if (!cancelled) setProcessingStatus("REPORT_FAILED_RETRYABLE");
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [view, reportId, processingStatus]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: "get_orbita_progress",
        title: "Get T-Skills progress",
        description: "Read the current T-Skills session state and progress without changing it.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async () => ({ ...webMcpStateRef.current, sessionId: webMcpStateRef.current.sessionId ?? null, activeItemId: webMcpStateRef.current.activeItemId ?? null }),
      },
      {
        name: "start_orbita_assessment",
        title: "Start T-Skills assessment",
        description: "Create or resume the authenticated user's paid T-Skills assessment session.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async () => { await webMcpActionsRef.current.start(); return { sessionId: webMcpStateRef.current.sessionId ?? null, view: "consent" }; },
      },
      {
        name: "submit_orbita_answer",
        title: "Submit T-Skills answer",
        description: "Submit one answer for the currently displayed T-Skills question and persist it.",
        inputSchema: { type: "object", properties: { value: { type: "integer", minimum: -2, maximum: 7 } }, required: ["value"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input: unknown) => {
          const value = input && typeof input === "object" && typeof (input as { value?: unknown }).value === "number" ? (input as { value: number }).value : NaN;
          if (!Number.isInteger(value) || !webMcpStateRef.current.activeItemId) throw new Error("A valid integer answer and active question are required.");
          const itemId = webMcpStateRef.current.activeItemId;
          await webMcpActionsRef.current.submit(value);
          return { itemId, accepted: true, nextView: webMcpStateRef.current.view };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
      } catch {
        // Unsupported or rejected registration must not affect the visible product.
      }
    }
    return () => lifecycle.abort();
  }, []);


  return {
    view,
    phase,
    reportId,
    questionIndex,
    coreItemCount: coreItems.length,
    adaptiveIndex,
    adaptiveItems,
    activeItem,
    activeValue,
    selection,
    profile,
    report,
    reportProvider,
    requestError,
    autosaveStatus,
    checkoutBusy,
    checkoutError,
    promoCode,
    publicCatalog,
    accountOverview,
    accountLoading,
    accountActionStatus,
    adminMetrics,
    demoMode,
    elapsedSeconds,
    processingStatus,
    consents,
    onboarding,
    onboardingBusy,
    go,
    dismissRequestError: () => setRequestError(undefined),
    openDemo,
    startCheckout,
    setPromoCode,
    setConsent,
    beginAssessment,
    saveOnboarding,
    saveResponse,
    nextQuestion,
    retryReport: retryProcessing,
    downloadReport,
    openReport,
    startAssessmentFromAccount,
    exportAccountData,
    deleteAccountData,
    logout,
    deleteAssessmentData,
  };
}
