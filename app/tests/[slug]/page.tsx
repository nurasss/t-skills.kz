import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { OrbitaApp } from "../../orbita-app";
import { TEST_DETAIL_SLUG } from "@/lib/view-routing";

export const metadata: Metadata = {
  title: "Тест T-Skills",
  description: "Описание теста T-Skills: формат, ограничения интерпретации и результат.",
  alternates: { canonical: `/tests/${TEST_DETAIL_SLUG}` },
};

export default async function TestDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === TEST_DETAIL_SLUG) return <OrbitaApp initialView="detail" />;
  // Legacy pre-rename slug: permanent redirect, never a broken link.
  if (slug === "orbita30") permanentRedirect("/tests/t-skills");
  notFound();
}
