import type { MetadataRoute } from "next";

import { configuredAppOrigin, publicIndexingEnabled } from "@/lib/seo-config";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const indexing = publicIndexingEnabled();
  const origin = configuredAppOrigin();
  if (!indexing || !origin) {
    return { rules: [{ userAgent: "*", disallow: ["/"] }] };
  }
  return {
    rules: [{ userAgent: "*", allow: ["/", "/tests", "/faq", "/methodology", "/support", "/privacy", "/terms", "/cookies", "/refunds", "/contact"], disallow: ["/account", "/assessment/", "/results/", "/admin", "/api/", "/internal/"] }],
    sitemap: `${origin}/sitemap.xml`,
  };
}
