import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { CookieBanner } from "./cookie-banner";
import "./views/view-base.css";
import "./views/views.css";
import { configuredAppOrigin, publicIndexingEnabled } from "@/lib/seo-config";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-landing-sans",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-landing-serif",
  display: "swap",
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const origin = configuredAppOrigin();
  const indexing = publicIndexingEnabled();
  return {
    metadataBase: origin ? new URL(origin) : undefined,
    title: "T-Skills · Профиль ваших сильных сторон",
    description: "Развивающая оценка устойчивых поведенческих предпочтений и сильных сторон.",
    robots: indexing ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: "T-Skills",
      title: "T-Skills · Профиль ваших сильных сторон",
      description: "Развивающая оценка устойчивых поведенческих предпочтений и сильных сторон.",
      images: [{ url: "/og.svg", width: 1200, height: 630, alt: "T-Skills · Профиль ваших сильных сторон" }],
    },
    twitter: { card: "summary_large_image", title: "T-Skills", description: "Развивающая оценка для рефлексии и развития.", images: ["/og.svg"] },
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${inter.variable} ${instrumentSerif.variable}`}>
      <body className="antialiased">
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
