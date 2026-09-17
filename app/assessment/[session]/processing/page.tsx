import type { Metadata } from "next";

import { OrbitaApp } from "../../../orbita-app";
import { requireAppUser } from "../../../app-auth";

export const metadata: Metadata = { title: "Формирование отчёта · T-Skills", description: "Подготовка вашего отчёта T-Skills.", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function AssessmentProcessingPage({ params }: { params: Promise<{ session: string }> }) {
  const { session } = await params;
  await requireAppUser(`/assessment/${session}/processing`);
  return <OrbitaApp initialView="processing" initialSessionId={session} />;
}
