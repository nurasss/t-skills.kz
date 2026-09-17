import type { Metadata } from "next";

import { OrbitaApp } from "../orbita-app";

export const metadata: Metadata = {
  title: "Оценки · T-Skills",
  description: "Выберите доступную развивающую оценку T-Skills.",
  alternates: { canonical: "/tests" },
};

export default function TestsPage() {
  return <OrbitaApp initialView="catalog" />;
}
