import type { Metadata } from "next";

import { OrbitaApp } from "../../orbita-app";
import { requireAppUser } from "../../app-auth";

export const metadata: Metadata = { title: "Результаты · T-Skills", description: "Ваш персональный отчёт T-Skills.", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function ResultsPage({ params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  await requireAppUser(`/results/${report}`);
  return <OrbitaApp initialView="results" initialReportId={report} />;
}
