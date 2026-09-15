import type { Phase, View } from "@/app/orbita-view-types";

export function routeForView(view: View, context: { sessionId?: string; reportId?: string; phase: Phase }) {
  if (view === "home") return "/";
  if (view === "catalog") return "/tests";
  if (view === "detail") return "/tests/orbita30";
  if (view === "checkout") return "/checkout/orbita30";
  if ((view === "consent" || view === "assessment") && context.sessionId) return `/assessment/${context.sessionId}`;
  if (view === "break" && context.sessionId) return context.phase === "adaptive" ? `/assessment/${context.sessionId}/adaptive` : `/assessment/${context.sessionId}/break`;
  if (view === "processing" && context.sessionId) return `/assessment/${context.sessionId}/processing`;
  if (view === "results" && context.reportId) return `/results/${context.reportId}`;
  if (view === "account") return "/account";
  if (view === "methodology") return "/methodology";
  if (view === "privacy") return "/privacy";
  if (view === "terms") return "/terms";
  if (view === "faq") return "/faq";
  if (view === "support") return "/support";
  return "/";
}
