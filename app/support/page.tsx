import type { Metadata } from "next";

import { OrbitaApp } from "../orbita-app";

export const metadata: Metadata = {
  title: "Поддержка · T-Skills",
  description: "Помощь с оплатой, сессией, отчётом и запросами на экспорт или удаление данных.",
  alternates: { canonical: "/support" },
};

export default function SupportPage() {
  return <OrbitaApp initialView="support" />;
}
