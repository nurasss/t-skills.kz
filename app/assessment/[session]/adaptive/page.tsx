import type { Metadata } from "next";

import { OrbitaApp } from "../../../orbita-app";
import { requireAppUser } from "../../../app-auth";

export const metadata: Metadata = { title: "Уточняющие вопросы · T-Skills", description: "Продолжение защищённой сессии T-Skills.", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function AssessmentAdaptivePage({ params }: { params: Promise<{ session: string }> }) {
  const { session } = await params;
  await requireAppUser(`/assessment/${session}/adaptive`);
  return <OrbitaApp initialView="break" initialSessionId={session} />;
}
