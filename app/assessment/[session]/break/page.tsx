import type { Metadata } from "next";

import { OrbitaApp } from "../../../orbita-app";
import { requireAppUser } from "../../../app-auth";

export const metadata: Metadata = { title: "Оценка · T-Skills", description: "Продолжение защищённой сессии T-Skills.", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function AssessmentBreakPage({ params }: { params: Promise<{ session: string }> }) {
  const { session } = await params;
  await requireAppUser(`/assessment/${session}/break`);
  return <OrbitaApp initialView="assessment" initialSessionId={session} />;
}
