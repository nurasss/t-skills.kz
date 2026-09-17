import type { Metadata } from "next";

import { OrbitaApp } from "../orbita-app";

export const metadata: Metadata = {
  title: "Методология · T-Skills",
  description: "Как устроены item bank, scoring, адаптивная часть и ограничения пилотной версии.",
  alternates: { canonical: "/methodology" },
};

export default function MethodologyPage() {
  return <OrbitaApp initialView="methodology" />;
}
