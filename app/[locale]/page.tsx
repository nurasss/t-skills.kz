import { notFound } from "next/navigation";

import { OrbitaApp } from "@/app/orbita-app";
import { canPublishLocale, resolveLocaleInput } from "@/lib/i18n";

export default async function LocalizedHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  const resolved = resolveLocaleInput(rawLocale);
  if (resolved.requested !== "ru" || !canPublishLocale(resolved.locale)) notFound();
  return <OrbitaApp initialView="home" />;
}
