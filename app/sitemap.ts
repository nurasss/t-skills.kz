import type { MetadataRoute } from "next";

import { configuredAppOrigin, publicIndexingEnabled } from "@/lib/seo-config";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = configuredAppOrigin();
  if (!publicIndexingEnabled() || !origin) return [];
  const routes = ["/", "/tests", "/tests/t-skills", "/faq", "/methodology", "/support", "/privacy", "/terms", "/cookies", "/refunds", "/contact"];
  return routes.map((route) => ({ url: `${origin}${route}`, lastModified: new Date("2026-09-17"), changeFrequency: "monthly", priority: route === "/" ? 1 : 0.6 }));
}
