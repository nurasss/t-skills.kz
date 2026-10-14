import type { Metadata } from "next";

import { OrbitaApp } from "../orbita-app";

export const metadata: Metadata = {
  title: "Частые вопросы · T-Skills",
  description: "Ответы о формате, сохранении прогресса и ограничениях T-Skills.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  return <OrbitaApp initialView="faq" />;
}
