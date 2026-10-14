import type { Metadata } from "next";

import { OrbitaApp } from "../orbita-app";

export const metadata: Metadata = {
  title: "Тесты сильных сторон и профориентации · T-Skills",
  description: "Онлайн-оценка сильных сторон T-Skills: формат теста, 25 качеств, карьерные направления и персональный отчёт.",
  alternates: { canonical: "/tests" },
};

export default function TestsPage() {
  return <OrbitaApp initialView="catalog" />;
}
