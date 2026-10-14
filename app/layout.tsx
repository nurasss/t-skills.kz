import type { Metadata } from "next";
import { Newsreader, Inter_Tight, JetBrains_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import { CookieBanner } from "./cookie-banner";
import "./views/view-base.css";
import "./views/views.css";
import "./brand/brand.css";
import { configuredAppOrigin, publicIndexingEnabled } from "@/lib/seo-config";

/**
 * Типографика T-Skills из дизайн-хендоффа:
 * Newsreader (заголовки) + Inter Tight (текст) + JetBrains Mono (метки).
 * Newsreader не имеет кириллического сабсета — русский текст заголовков
 * рендерится фолбэком Georgia (см. --serif в app/landing/landing.css).
 * (Legacy Inter/Instrument Serif удалены: тянули битые preload-URL с
 * абсолютными путями сборки в Link-заголовки.)
 */
const tsSerif = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-ts-serif",
  display: "swap",
  preload: false,
});

const tsSans = Inter_Tight({
  subsets: ["latin", "cyrillic"],
  // 300 нужен лёгким дисплейным заголовкам лендинга: Hanken Grotesk из
  // прототипа не имеет кириллицы, заменён ближайшим гротеском с ней.
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-ts-sans",
  display: "swap",
});

const tsMono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  variable: "--font-ts-mono",
  display: "swap",
});

/** Превью-гарнитура лендинга: Montserrat как ближайший открытый аналог Google Sans. */
const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

export const dynamic = "force-dynamic";

// vinext issue #2007: async generateMetadata resolves AFTER the <head> shell is
// flushed, so its tags land in a hidden <body> outlet (breaks SEO/social scrapers).
// A synchronous static export is hoisted into <head> during SSR.
const origin = configuredAppOrigin();
const indexing = publicIndexingEnabled();

export const metadata: Metadata = {
  metadataBase: origin ? new URL(origin) : undefined,
  title: "T-Skills · Профиль ваших сильных сторон — тест онлайн",
  description: "Тест сильных сторон и профориентации T-Skills: 25 качеств, 75 парных сравнений и 8 ситуативных уточнений. Карьерные направления и персональный PDF-отчёт.",
  robots: indexing ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "T-Skills",
    title: "T-Skills · Профиль ваших сильных сторон — тест онлайн",
    description: "Тест сильных сторон и профориентации: 25 качеств, карьерные направления и персональный PDF-отчёт.",
    images: [{ url: "/og.svg", width: 1200, height: 630, alt: "T-Skills · Профиль ваших сильных сторон" }],
  },
  twitter: { card: "summary_large_image", title: "T-Skills", description: "Развивающая оценка для рефлексии и развития.", images: ["/og.svg"] },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.ico",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${tsSerif.variable} ${tsSans.variable} ${tsMono.variable} ${montserrat.variable}`}>
      <body className="antialiased">
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
