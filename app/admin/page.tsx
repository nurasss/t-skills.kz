import type { Metadata } from "next";

import { OrbitaApp } from "../orbita-app";
import { requireAppAdmin } from "../app-auth";

export const metadata: Metadata = {
  title: "Администрирование · T-Skills",
  description: "Защищённая внутренняя панель T-Skills.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAppAdmin();
  return <OrbitaApp initialView="admin" />;
}
