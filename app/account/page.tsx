import type { Metadata } from "next";

import { OrbitaApp } from "../orbita-app";
import { requireAppUser } from "../app-auth";

export const metadata: Metadata = {
  title: "Личный кабинет · T-Skills",
  description: "Ваши сессии, отчёты, экспорт и управление данными T-Skills.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  await requireAppUser("/account");
  return <OrbitaApp initialView="account" />;
}
