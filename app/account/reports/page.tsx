import type { Metadata } from "next";

import { OrbitaApp } from "../../orbita-app";
import { requireAppUser } from "../../app-auth";

export const metadata: Metadata = { title: "Мои отчёты · T-Skills", description: "Сохранённые отчёты T-Skills.", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function AccountReportsPage() {
  await requireAppUser("/account/reports");
  return <OrbitaApp initialView="account" />;
}
