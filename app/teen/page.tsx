import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { OrbitaApp } from "../orbita-app";

export const metadata: Metadata = {
  title: "Тест для подростков · T-Skills",
  description: "Развивающая оценка для подростков: 75 сравнений, уточнение и подбор направлений.",
  alternates: { canonical: "/teen" },
};

export default function TeenPage() {
  if (process.env.TEEN_BANK_ENABLED !== "1" && process.env.TEEN_BANK_ENABLED !== "true") notFound();
  return <OrbitaApp initialView="teen" />;
}
