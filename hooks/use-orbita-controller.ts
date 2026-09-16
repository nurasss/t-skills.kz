"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, apiJson, topLevelNavigate, writePendingResponses } from "@/app/orbita-api";
import type { AccountOverview, AdminMetrics, PendingResponse, Phase, PublicCatalog, ReportPayload, SessionPayload, View } from "@/app/orbita-view-types";
import {
  buildDemoResponses,
  buildReport,
  getItemById,
  scoreAssessment,
  selectAdaptiveItems,
  type AdaptiveSelection,
  type ReportJSON,
  type ResponseMap,
  type ScoreProfile,
} from "@/lib/assessment-engine";
import { ITEM_BANK, type Item } from "@/lib/item-bank";
import { enqueuePending, findPendingItem, pendingForSession } from "@/lib/response-retry-queue";
import { routeForView } from "@/lib/view-routing";
import { useAssessmentQueue } from "@/hooks/use-assessment-queue";

const CORE_ITEMS = ITEM_BANK.filter((item) => Number(item.id.slice(1)) <= 250);

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
  adaptiveIndex: number;
  adaptiveItems: Item[];
  activeItem?: Item;
  activeValue?: number;
  selection?: AdaptiveSelection;
  profile?: ScoreProfile;
  report?: ReportJSON;
  reportProvider?: string;
  requestError?: string;
  autosaveStatus: string;
  checkoutBusy: boolean;
  checkoutError?: string;
  publicCatalog?: PublicCatalog;
  accountOverview?: AccountOverview;
  accountLoading: boolean;
  accountActionStatus?: string;
  adminMetrics?: AdminMetrics;
  demoMode: boolean;
  elapsedSeconds: number;
  processingStatus: "SCORING" | "REPORT_GENERATING" | "REPORT_FAILED_RETRYABLE" | "COMPLETE";
  consents: { terms: boolean; privacy: boolean; research: boolean; marketing: boolean };
  go: (next: View, phaseOverride?: Phase) => void;
  dismissRequestError: () => void;
  openDemo: () => void;
  startCheckout: () => Promise<void>;
  setConsent: (key: "terms" | "privacy" | "research" | "marketing", value: boolean) => void;
  beginAssessment: () => Promise<void>;
  saveResponse: (value: number, waitForServer?: boolean) => void | Promise<void>;
  nextQuestion: (responseOverride?: number) => Promise<void>;
  continueFromBreak: () => void;
  retryReport: () => Promise<void>;
  downloadReport: () => Promise<void>;
  openReport: (id: string) => Promise<void>;
  startAssessmentFromAccount: () => Promise<void>;
  exportAccountData: () => Promise<void>;
  deleteAccountData: () => Promise<void>;
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
  const [questionIndex, setQuestionIndex] = useState(0);
  const [adaptiveIndex, setAdaptiveIndex] = useState(0);
  const [selection, setSelection] = useState<AdaptiveSelection>();
  const [profile, setProfile] = useState<ScoreProfile>();
  const [report, setReport] = useState<ReportJSON>();
  const [reportProvider, setReportProvider] = useState<string>();
  const [autosaveStatus, setAutosaveStatus] = useState("готово");
  const [requestError, setRequestError] = useState<string>();
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string>();
  const [publicCatalog, setPublicCatalog] = useState<PublicCatalog>();
  const [accountOverview, setAccountOverview] = useState<AccountOverview>();
  const [accountLoading, setAccountLoading] = useState(initialView === "account");
  const [accountActionStatus, setAccountActionStatus] = useState<string>();
  const [adminMetrics, setAdminMetrics] = useState<AdminMetrics>();
  const [demoMode, setDemoMode] = useState(false);
  const questionStartedAt = useRef(0);
  const sessionIdRef = useRef(initialSessionId);
  const reportIdRef = useRef(initialReportId);
  const { pendingRef, serverSavedRef, persistPendingResponse } = useAssessmentQueue({ onStatus: setAutosaveStatus });
  const webMcpStateRef = useRef({ sessionId: undefined as string | undefined, phase, view, answered: 0, coreAnswered: 0, adaptiveCount: 0, activeItemId: undefined as string | undefined });
  const webMcpActionsRef = useRef<{ start: () => Promise<void>; submit: (value: number) => Promise<void> }>({ start: async () => undefined, submit: async () => undefined });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<"SCORING" | "REPORT_GENERATING" | "REPORT_FAILED_RETRYABLE" | "COMPLETE">("SCORING");
  const [consents, setConsents] = useState({ terms: false, privacy: false, research: false, marketing: false });

  const activateSession = (id?: string) => {
    sessionIdRef.current = id;
  };

  const activateReport = (id?: string) => {
    reportIdRef.current = id;
    setReportId(id);
  };

  const go = (next: View, phaseOverride: Phase = phaseRef.current) => {
    setView(next);
    window.history.replaceState({}, "", routeForView(next, { sessionId: sessionIdRef.current, reportId: reportIdRef.current, phase: phaseOverride }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const adaptiveItems = useMemo(
    () => (selection?.selectedItemIds ?? []).map((id) => getItemById(id)).filter((item): item is Item => Boolean(item)),
    [selection],
  );
  const activeItem = phase === "core" ? CORE_ITEMS[questionIndex] : adaptiveItems[adaptiveIndex];
  const activeValue = activeItem ? responses[activeItem.id] : undefined;
  const firstUnansweredCore = CORE_ITEMS.findIndex((item) => typeof responses[item.id] !== "number");

  const hydrateSession = (payload: SessionPayload) => {
    const pending = pendingForSession(pendingRef.current, payload.id);
    const pendingResponses = Object.fromEntries(pending.map((item) => [item.itemId, item.response])) as ResponseMap;
    serverSavedRef.current = new Set(Object.keys(payload.responses));
    setResponses({ ...payload.responses, ...pendingResponses });
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
    const coreIndex = CORE_ITEMS.findIndex((item) => typeof payload.responses[item.id] !== "number");
    setQuestionIndex(coreIndex >= 0 ? coreIndex : CORE_ITEMS.length - 1);
    void apiJson("/api/telemetry", {
      method: "POST",
      body: JSON.stringify({ name: "resume", assessment_id: payload.id, metadata: { status: payload.state, count: Object.keys(payload.responses).length } }),
    }).catch(() => undefined);
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
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось загрузить отчёт.");
    }
  };

  const loadSessionData = async (id: string) => {
    try {
      const payload = await apiJson<SessionPayload>(`/api/assessments/${encodeURIComponent(id)}`);
      hydrateSession(payload);
      if (payload.report_id) void loadReportData(payload.report_id, initialView === "results");
      if (payload.state === "PAID") setView("consent");
      else if (payload.state === "CONSENTED" || payload.state === "CORE_IN_PROGRESS") setView(initialView === "break" ? "break" : "assessment");
      else if (payload.state === "ADAPTIVE_IN_PROGRESS") setView(initialView === "processing" ? "processing" : "break");
      else if (payload.state === "REPORT_GENERATING" || payload.state === "REPORT_FAILED_RETRYABLE") setView("processing");
      else if (payload.state === "COMPLETE") setView(initialView === "results" ? "results" : "processing");
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось загрузить сессию.");
    }
  };

  const finishCore = async () => {
    if (!sessionIdRef.current) return;
    setAutosaveStatus("считаем основной сигнал…");
    try {
      const result = await apiJson<{ state: string; preliminary_score: ScoreProfile; adaptive: AdaptiveSelection }>(`/api/assessments/${encodeURIComponent(sessionIdRef.current)}/complete-core`, { method: "POST" });
      setProfile(result.preliminary_score);
      setSelection(result.adaptive);
      setPhase("adaptive");
      setRequestError(undefined);
      go("break", "adaptive");
      void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "adaptive_selected", assessment_id: sessionIdRef.current, metadata: { count: result.adaptive.selectedItemIds.length } }) }).catch(() => undefined);
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось завершить основной блок.");
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
      void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "report_viewed", assessment_id: sessionIdRef.current }) }).catch(() => undefined);
    } catch (error) {
      setProcessingStatus("REPORT_FAILED_RETRYABLE");
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось сформировать отчёт.");
    }
  };

  const saveResponse = (value: number, waitForServer = false) => {
    if (!activeItem || !sessionIdRef.current || demoMode) return;
    if (serverSavedRef.current.has(activeItem.id)) return;
    const alreadyPending = findPendingItem(pendingRef.current, sessionIdRef.current, activeItem.id);
    if (alreadyPending) {
      setAutosaveStatus("сохраняем первый выбор…");
      if (waitForServer) return persistPendingResponse(alreadyPending);
      return;
    }
    const responseTimeMs = Math.max(0, Date.now() - questionStartedAt.current);
    const pending: PendingResponse = {
      sessionId: sessionIdRef.current,
      itemId: activeItem.id,
      response: value,
      responseTimeMs,
      clientSeq: Object.keys(responses).length + 1,
      idempotencyKey: `${sessionIdRef.current}:${activeItem.id}:${crypto.randomUUID()}`,
    };
    pendingRef.current = enqueuePending(pendingRef.current, pending);
    writePendingResponses(pendingRef.current);
    setResponses((current) => ({ ...current, [activeItem.id]: value }));
    setAutosaveStatus("сохраняем…");
    const request = persistPendingResponse(pending);
    if (waitForServer) return request;
    void request.catch(() => undefined);
  };

  const beginAssessment = async () => {
    if (!sessionIdRef.current) {
      setRequestError("Сначала создайте оплаченный доступ в личном кабинете.");
      return;
    }
    if (!(consents.terms && consents.privacy)) return;
    try {
      await apiJson(`/api/assessments/${encodeURIComponent(sessionIdRef.current)}`, {
        method: "PATCH",
        body: JSON.stringify({ consented: true, consents }),
      });
      setPhase("core");
      setQuestionIndex(firstUnansweredCore >= 0 ? firstUnansweredCore : 0);
      setAdaptiveIndex(0);
      setRequestError(undefined);
      questionStartedAt.current = Date.now();
      setElapsedSeconds(0);
      go("assessment");
      void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "assessment_started", assessment_id: sessionIdRef.current }) }).catch(() => undefined);
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось сохранить согласия.");
    }
  };

  const nextQuestion = async (responseOverride?: number) => {
    const currentResponse = typeof responseOverride === "number" ? responseOverride : activeItem ? responses[activeItem.id] : undefined;
    if (!activeItem || typeof currentResponse !== "number") return;
    const pending = findPendingItem(pendingRef.current, sessionIdRef.current, activeItem.id);
    if (pending) {
      try {
        await persistPendingResponse(pending);
      } catch (error) {
        setRequestError(error instanceof ApiClientError ? error.message : "Ответ ещё не подтверждён сервером.");
        return;
      }
    }
    if (!serverSavedRef.current.has(activeItem.id)) return;
    if (phase === "core") {
      const nextIndex = questionIndex + 1;
      if (nextIndex >= CORE_ITEMS.length) {
        await finishCore();
      } else {
        questionStartedAt.current = Date.now();
        setElapsedSeconds(0);
        setQuestionIndex(nextIndex);
        if (nextIndex % 50 === 0) {
          void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "block_completed", assessment_id: sessionIdRef.current, metadata: { block: nextIndex / 50 } }) }).catch(() => undefined);
          go("break");
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
    if (!publicCatalog?.test.availableForCheckout) {
      setCheckoutError("Оплата пока недоступна: цена или Stripe ещё не настроены.");
      return;
    }
    setCheckoutBusy(true);
    setCheckoutError(undefined);
    try {
      void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "checkout_started", metadata: { provider: "stripe", mode: "hosted" } }) }).catch(() => undefined);
      const result = await apiJson<{ checkout_url: string }>('/api/checkout', {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ test_id: "orbita30" }),
      });
      if (!result.checkout_url) throw new ApiClientError("CHECKOUT_URL_MISSING", "Платёжная ссылка не была создана.");
      void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "checkout_redirected" }) }).catch(() => undefined);
      window.location.assign(result.checkout_url);
    } catch (error) {
      setCheckoutError(error instanceof ApiClientError ? error.message : "Не удалось открыть оплату.");
    } finally {
      setCheckoutBusy(false);
    }
  };

  const exportAccountData = async () => {
    try {
      const result = await apiJson<{ downloadPath: string }>("/api/account/export", { method: "POST" });
      setAccountActionStatus("экспорт готов");
      topLevelNavigate(result.downloadPath);
    } catch (error) {
      setAccountActionStatus(error instanceof ApiClientError ? error.message : "Не удалось подготовить экспорт.");
    }
  };

  const deleteAccountData = async () => {
    if (!window.confirm("Удалить аккаунт и все сохранённые ответы? Это действие нельзя отменить.")) return;
    try {
      await apiJson("/api/account/delete", { method: "POST", body: JSON.stringify({ confirm: "DELETE" }) });
      topLevelNavigate("/signout-with-chatgpt?return_to=%2F");
    } catch (error) {
      setAccountActionStatus(error instanceof ApiClientError ? error.message : "Не удалось удалить аккаунт.");
    }
  };

  const deleteAssessmentData = async (assessmentId: string) => {
    if (!window.confirm("Удалить эту оценку, ответы и PDF? Это действие нельзя отменить.")) return;
    try {
      await apiJson(`/api/assessments/${encodeURIComponent(assessmentId)}`, { method: "DELETE", body: JSON.stringify({ confirm: "DELETE_ASSESSMENT" }) });
      setAccountActionStatus("оценка удалена");
      const refreshed = await apiJson<AccountOverview>("/api/account");
      setAccountOverview(refreshed);
    } catch (error) {
      setAccountActionStatus(error instanceof ApiClientError ? error.message : "Не удалось удалить оценку.");
    }
  };
  const startAssessmentFromAccount = async () => {
    setAccountActionStatus("создаём сессию…");
    try {
      const result = await apiJson<{ id: string }>("/api/assessments", { method: "POST", body: JSON.stringify({ test_id: "orbita30" }) });
      activateSession(result.id);
      setDemoMode(false);
      setProfile(undefined);
      setReport(undefined);
      setSelection(undefined);
      setResponses({});
      serverSavedRef.current = new Set();
      await loadSessionData(result.id);
      setView("consent");
      window.history.replaceState({}, "", `/assessment/${result.id}`);
      setAccountActionStatus("сессия готова");
    } catch (error) {
      setAccountActionStatus(error instanceof ApiClientError ? error.message : "Не удалось создать сессию.");
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
      anchor.download = `orbita-30-${reportIdRef.current}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось скачать PDF.");
    }
  };

  const openDemo = () => {
    const demoResponses = buildDemoResponses();
    const demoProfile = scoreAssessment(demoResponses);
    const demoCoreAnswered = Object.keys(demoResponses).filter((id) => Number(id.slice(1)) <= 250);
    const demoSelection = selectAdaptiveItems(demoProfile, demoCoreAnswered, 12);
    activateSession(undefined);
    activateReport(undefined);
    setDemoMode(true);
    setResponses(demoResponses);
    setSelection(demoSelection);
    setProfile(demoProfile);
    setReport(buildReport(demoProfile));
    setPhase("adaptive");
    go("results");
  };

  const setConsent = (key: "terms" | "privacy" | "research" | "marketing", value: boolean) => {
    setConsents((current) => ({ ...current, [key]: value }));
  };

  const continueFromBreak = () => {
    if (phase === "core") {
      setQuestionIndex(firstUnansweredCore >= 0 ? firstUnansweredCore : 0);
      go("assessment");
    } else {
      const nextAdaptive = adaptiveItems.findIndex((item) => typeof responses[item.id] !== "number");
      setAdaptiveIndex(nextAdaptive >= 0 ? nextAdaptive : 0);
      go("assessment");
    }
  };

  useEffect(() => {
    webMcpStateRef.current = {
      sessionId: sessionIdRef.current,
      phase,
      view,
      answered: Object.keys(responses).length,
      coreAnswered: Object.keys(responses).filter((id) => Number(id.slice(1)) <= 250).length,
      adaptiveCount: adaptiveItems.length,
      activeItemId: activeItem?.id,
    };
    webMcpActionsRef.current = {
      start: startAssessmentFromAccount,
      submit: async (value: number) => {
        if (!activeItem) throw new Error("There is no active ORBITA question.");
        if (demoMode) throw new Error("The demo profile cannot accept persisted answers.");
        if (serverSavedRef.current.has(activeItem.id)) throw new Error("The current question is already answered.");
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
    if (view !== "checkout" && view !== "support") return;
    let cancelled = false;
    void apiJson<PublicCatalog>("/api/catalog")
      .then((payload) => { if (!cancelled) setPublicCatalog(payload); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [view]);

  useEffect(() => {
    if (view !== "catalog" || demoMode) return;
    void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "catalog_viewed" }) }).catch(() => undefined);
    void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "test_view", metadata: { test_id: "orbita30" } }) }).catch(() => undefined);
  }, [view, demoMode]);

  useEffect(() => {
    if (view !== "assessment" || demoMode || !sessionIdRef.current) return;
    const onBeforeUnload = () => {
      const payload = JSON.stringify({ name: "assessment_abandoned", assessment_id: sessionIdRef.current });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/telemetry", new Blob([payload], { type: "application/json" }));
      } else {
        void apiJson("/api/telemetry", { method: "POST", body: payload }).catch(() => undefined);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [view, demoMode, phase]);

  useEffect(() => {
    if (view !== "account") return;
    let cancelled = false;
    let timer: number | undefined;
    const load = async () => {
      setAccountLoading(true);
      try {
        const payload = await apiJson<AccountOverview>("/api/account");
        if (!cancelled) setAccountOverview(payload);
      } catch (error) {
        if (!cancelled) setAccountActionStatus(error instanceof ApiClientError ? error.message : "Не удалось загрузить кабинет.");
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
  }, [view]);

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
        title: "Get ORBITA progress",
        description: "Read the current ORBITA-30 session state and progress without changing it.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async () => ({ ...webMcpStateRef.current, sessionId: webMcpStateRef.current.sessionId ?? null, activeItemId: webMcpStateRef.current.activeItemId ?? null }),
      },
      {
        name: "start_orbita_assessment",
        title: "Start ORBITA assessment",
        description: "Create or resume the authenticated user's paid ORBITA-30 assessment session.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async () => { await webMcpActionsRef.current.start(); return { sessionId: webMcpStateRef.current.sessionId ?? null, view: "consent" }; },
      },
      {
        name: "submit_orbita_answer",
        title: "Submit ORBITA answer",
        description: "Submit one answer for the currently displayed ORBITA-30 question and persist it.",
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
    publicCatalog,
    accountOverview,
    accountLoading,
    accountActionStatus,
    adminMetrics,
    demoMode,
    elapsedSeconds,
    processingStatus,
    consents,
    go,
    dismissRequestError: () => setRequestError(undefined),
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
  };
}
