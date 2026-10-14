import type { Metadata } from "next";

import { OrbitaApp } from "./orbita-app";
import { MaintenanceScreen } from "./maintenance-screen";
import { maintenanceModeEnabled } from "@/lib/feature-flags";
import { getMaintenanceMessage } from "@/lib/system-settings";
import { getPublishedContent } from "@/lib/admin-store";

const DEFAULT_METADATA: Metadata = {
  title: "T-Skills · Профиль ваших сильных сторон — тест онлайн",
  description: "Тест сильных сторон и профориентации T-Skills: 25 качеств, 75 парных сравнений и 8 ситуативных уточнений. Карьерные направления и персональный PDF-отчёт.",
  alternates: { canonical: "/" },
};

export async function generateMetadata(): Promise<Metadata> {
  try {
    const seo = await getPublishedContent("seo", "ru");
    if (seo) {
      const title = typeof seo.title === "string" && seo.title ? seo.title : (typeof DEFAULT_METADATA.title === "string" ? DEFAULT_METADATA.title : "T-Skills · Профиль ваших сильных сторон");
      const description = typeof seo.description === "string" && seo.description ? seo.description : (typeof DEFAULT_METADATA.description === "string" ? DEFAULT_METADATA.description : "Развивающая оценка устойчивых поведенческих предпочтений и сильных сторон.");
      const ogTitle = typeof seo.ogTitle === "string" && seo.ogTitle ? seo.ogTitle : (typeof seo.og_title === "string" && seo.og_title ? seo.og_title : title);
      const ogDescription = typeof seo.ogDescription === "string" && seo.ogDescription ? seo.ogDescription : (typeof seo.og_description === "string" && seo.og_description ? seo.og_description : description);
      const noIndex = Boolean(seo.noIndex || seo.noindex);

      return {
        title,
        description,
        alternates: { canonical: "/" },
        openGraph: {
          title: ogTitle,
          description: ogDescription,
        },
        robots: noIndex ? { index: false, follow: false } : undefined,
      };
    }
  } catch {
    // Fall back to default static metadata
  }
  return DEFAULT_METADATA;
}

export default async function Home() {
  if (await maintenanceModeEnabled()) return <MaintenanceScreen message={await getMaintenanceMessage()} />;
  return <OrbitaApp initialView="home" />;
}
