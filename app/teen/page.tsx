import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrbitaApp } from "../orbita-app";
import { isFeatureEnabled } from "@/lib/feature-flags";
import teenBundleRu from "@/lib/t-skills/teen/content.v1.json";
import teenBundleKk from "@/lib/t-skills/teen/content.v1.kk.json";

export const metadata: Metadata = {
  title: "Тест для подростков · T-Skills",
  description: "Развивающая оценка для подростков: 75 сравнений, уточнение и подбор направлений.",
  alternates: { canonical: "/teen" },
};

export default async function TeenPage() {
  const enabled = await isFeatureEnabled("teen_enabled", "TEEN_BANK_ENABLED");
  // A draft bundle must never become public merely because the feature flag
  // was toggled. Publication is an explicit content release decision.
  if (!enabled || teenBundleRu.status !== "PUBLISHED" || teenBundleKk.status !== "PUBLISHED") notFound();
  return <OrbitaApp initialView="teen" />;
}
