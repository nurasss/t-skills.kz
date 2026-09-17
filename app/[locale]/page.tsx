import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { OrbitaApp } from "@/app/orbita-app";
import { canPublishLocale, resolveLocaleInput } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const resolved = resolveLocaleInput(locale);
  return {
    title: resolved.locale === "ru" ? "T-Skills · Профиль ваших сильных сторон" : `T-Skills · ${resolved.locale.toUpperCase()}`,
    description: "Развивающая оценка устойчивых поведенческих предпочтений и сильных сторон.",
    alternates: { canonical: `/${resolved.locale}` },
  };
}

export default async function LocalizedHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const resolved = resolveLocaleInput(rawLocale);
  if (resolved.requested !== "ru" || !canPublishLocale(resolved.locale)) notFound();
  return <OrbitaApp initialView="home" />;
}
