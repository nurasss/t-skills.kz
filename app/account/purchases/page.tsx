import type { Metadata } from "next";

import { OrbitaApp } from "../../orbita-app";
import { requireAppUser } from "../../app-auth";

export const metadata: Metadata = { title: "Покупки · T-Skills", description: "История доступов и покупок T-Skills.", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function AccountPurchasesPage() {
  await requireAppUser("/account/purchases");
  return <OrbitaApp initialView="account" />;
}
