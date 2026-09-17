import type { Phase, View } from "@/app/orbita-view-types";

export type ViewRouteState = {
  view: View;
  sessionId?: string;
  reportId?: string;
  phase: Phase;
};

type ViewMetadata = {
  title: string;
  description: string;
};

const VIEW_VALUES = new Set<View>([
  "home",
  "catalog",
  "detail",
  "checkout",
  "consent",
  "assessment",
  "break",
  "processing",
  "results",
  "account",
  "methodology",
  "privacy",
  "terms",
  "faq",
  "support",
  "admin",
]);

function encodeRoutePart(value: string) {
  return encodeURIComponent(value);
}

function decodeRoutePart(value: string) {
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded || decoded === "." || decoded === ".." || decoded.includes("/") || decoded.length > 200) return undefined;
    return decoded;
  } catch {
    return undefined;
  }
}

function normalizedSegments(pathname: string) {
  const path = pathname.split("?", 1)[0]?.replace(/\/+$/, "") || "/";
  if (path === "/") return [] as string[];
  const rawSegments = path.split("/").filter(Boolean);
  const segments = rawSegments.map(decodeRoutePart);
  return segments.every((segment): segment is string => Boolean(segment)) ? segments : null;
}

function historyView(historyState: unknown) {
  if (!historyState || typeof historyState !== "object") return undefined;
  const candidate = (historyState as { orbitaView?: unknown }).orbitaView;
  return typeof candidate === "string" && VIEW_VALUES.has(candidate as View) ? candidate as View : undefined;
}

function historyPhase(historyState: unknown) {
  if (!historyState || typeof historyState !== "object") return undefined;
  const candidate = (historyState as { orbitaPhase?: unknown }).orbitaPhase;
  return candidate === "core" || candidate === "adaptive" ? candidate : undefined;
}

export const TEST_DETAIL_SLUG = "t-skills";
export const CHECKOUT_SLUG = "t-skills";
const LEGACY_TEST_DETAIL_SLUGS = new Set(["orbita30"]);

export function routeForView(view: View, context: { sessionId?: string; reportId?: string; phase: Phase }) {
  if (view === "home") return "/";
  if (view === "catalog") return "/tests";
  if (view === "detail") return `/tests/${TEST_DETAIL_SLUG}`;
  if (view === "checkout") return `/checkout/${CHECKOUT_SLUG}`;
  if ((view === "consent" || view === "assessment") && context.sessionId) return `/assessment/${encodeRoutePart(context.sessionId)}`;
  if (view === "break" && context.sessionId) return context.phase === "adaptive" ? `/assessment/${encodeRoutePart(context.sessionId)}/adaptive` : `/assessment/${encodeRoutePart(context.sessionId)}/break`;
  if (view === "processing" && context.sessionId) return `/assessment/${encodeRoutePart(context.sessionId)}/processing`;
  if (view === "results" && context.reportId) return `/results/${encodeRoutePart(context.reportId)}`;
  if (view === "account") return "/account";
  if (view === "methodology") return "/methodology";
  if (view === "privacy") return "/privacy";
  if (view === "terms") return "/terms";
  if (view === "faq") return "/faq";
  if (view === "support") return "/support";
  if (view === "admin") return "/admin";
  return "/";
}

/**
 * Resolve the routes that are rendered inside the single client-side shell.
 * The optional history state distinguishes the consent and assessment states
 * that intentionally share the same canonical URL.
 */
export function viewStateForPath(pathname: string, state?: unknown): ViewRouteState | null {
  const segments = normalizedSegments(pathname);
  if (!segments) return null;
  if (segments.length === 0 || (segments.length === 1 && segments[0] === "ru")) return { view: "home", phase: "core" };
  if (segments.length === 1 && segments[0] === "tests") return { view: "catalog", phase: "core" };
  if (segments.length === 2 && segments[0] === "tests" && (segments[1] === TEST_DETAIL_SLUG || LEGACY_TEST_DETAIL_SLUGS.has(segments[1]))) return { view: "detail", phase: "core" };
  if (segments.length === 2 && segments[0] === "checkout" && (segments[1] === CHECKOUT_SLUG || LEGACY_TEST_DETAIL_SLUGS.has(segments[1]))) return { view: "checkout", phase: "core" };
  if (segments.length === 1 && segments[0] === "account") return { view: "account", phase: "core" };
  if (segments.length === 2 && segments[0] === "account" && (segments[1] === "purchases" || segments[1] === "reports")) return { view: "account", phase: "core" };
  if (segments.length === 1 && segments[0] === "admin") return { view: "admin", phase: "core" };
  if (segments.length === 1 && segments[0] === "methodology") return { view: "methodology", phase: "core" };
  if (segments.length === 1 && segments[0] === "privacy") return { view: "privacy", phase: "core" };
  if (segments.length === 1 && segments[0] === "terms") return { view: "terms", phase: "core" };
  if (segments.length === 1 && segments[0] === "faq") return { view: "faq", phase: "core" };
  if (segments.length === 1 && segments[0] === "support") return { view: "support", phase: "core" };
  if (segments.length === 2 && segments[0] === "assessment") {
    const preferredView = historyView(state);
    const view = preferredView === "consent" || preferredView === "assessment" ? preferredView : "consent";
    return { view, phase: historyPhase(state) ?? "core", sessionId: segments[1] };
  }
  if (segments.length === 3 && segments[0] === "assessment") {
    if (segments[2] === "break") return { view: "break", phase: "core", sessionId: segments[1] };
    if (segments[2] === "adaptive") return { view: "break", phase: "adaptive", sessionId: segments[1] };
    if (segments[2] === "processing") return { view: "processing", phase: "adaptive", sessionId: segments[1] };
    return null;
  }
  if (segments.length === 2 && segments[0] === "results") return { view: "results", phase: "adaptive", reportId: segments[1] };
  return null;
}

const VIEW_METADATA: Record<View, ViewMetadata> = {
  home: {
    title: "T-Skills · Профиль ваших сильных сторон",
    description: "Развивающая оценка устойчивых поведенческих предпочтений и сильных сторон.",
  },
  catalog: {
    title: "Оценки · T-Skills",
    description: "Выберите доступную развивающую оценку T-Skills.",
  },
  detail: {
    title: "Тест T-Skills",
    description: "Описание теста T-Skills: формат, ограничения интерпретации и результат.",
  },
  checkout: {
    title: "Оформление доступа · T-Skills",
    description: "Безопасное оформление доступа к оценке T-Skills.",
  },
  consent: {
    title: "Перед началом · T-Skills",
    description: "Ознакомьтесь с условиями и политикой конфиденциальности перед началом оценки.",
  },
  assessment: {
    title: "Оценка · T-Skills",
    description: "Продолжение защищённой сессии развивающей оценки T-Skills.",
  },
  break: {
    title: "Пауза · T-Skills",
    description: "Пауза в вашей сессии T-Skills.",
  },
  processing: {
    title: "Формирование отчёта · T-Skills",
    description: "Подготовка вашего персонального отчёта T-Skills.",
  },
  results: {
    title: "Результаты · T-Skills",
    description: "Ваш персональный отчёт T-Skills.",
  },
  account: {
    title: "Личный кабинет · T-Skills",
    description: "Ваши сессии, отчёты и настройки данных T-Skills.",
  },
  methodology: {
    title: "Методология · T-Skills",
    description: "Как устроена развивающая оценка T-Skills и как читать её результаты.",
  },
  privacy: {
    title: "Политика конфиденциальности · T-Skills",
    description: "Как T-Skills собирает, использует и защищает персональные данные.",
  },
  terms: {
    title: "Условия использования · T-Skills",
    description: "Правила использования сервиса T-Skills и доступа к оценке.",
  },
  faq: {
    title: "Частые вопросы · T-Skills",
    description: "Ответы на частые вопросы об оценке, отчёте и сохранении данных T-Skills.",
  },
  support: {
    title: "Поддержка · T-Skills",
    description: "Помощь с доступом, сессией, оплатой и отчётом T-Skills.",
  },
  admin: {
    title: "Администрирование · T-Skills",
    description: "Защищённая панель операционных метрик T-Skills.",
  },
};

export function metadataForView(view: View, phase: Phase = "core") {
  if (view === "break" && phase === "adaptive") {
    return {
      title: "Уточняющие вопросы · T-Skills",
      description: "Пауза перед персональными уточняющими вопросами T-Skills.",
    };
  }
  return VIEW_METADATA[view];
}
