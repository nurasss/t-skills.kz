import Link from "next/link";

import { BrandIcon } from "@/app/brand/brand-icon";
import { getLegalConfig } from "@/lib/legal-config";
import { getLegalDocument, type LegalKind } from "@/lib/legal-documents";

function eyebrow(kind: LegalKind) {
  return kind === "privacy" ? "PRIVACY" : kind === "terms" ? "TERMS" : kind === "cookies" ? "COOKIES" : "REFUNDS";
}

const CHROME = {
  ru: {
    caption: "Профиль ваших сильных сторон",
    home: "На главную",
    version: (v: string, u: string) => `Версия ${v} · обновлено ${u}.`,
    docsAria: "Правовые документы",
    privacy: "Конфиденциальность",
    terms: "Условия",
    cookies: "Cookies",
    refunds: "Возвраты",
    contact: "Контакты",
  },
  kk: {
    caption: "Мықты жақтарыңыздың бейіні",
    home: "Басты бетке",
    version: (v: string, u: string) => `${v} нұсқа · ${u} жаңартылған.`,
    docsAria: "Құқықтық құжаттар",
    privacy: "Құпиялылық",
    terms: "Шарттар",
    cookies: "Cookies",
    refunds: "Қайтарулар",
    contact: "Байланыстар",
  },
} as const;

export default function LegalDocumentPage({
  kind,
  searchParams,
}: {
  kind: LegalKind;
  searchParams?: { lang?: string };
}) {
  const kk = searchParams?.lang === "kk";
  const t = kk ? CHROME.kk : CHROME.ru;
  const config = getLegalConfig();
  const document = getLegalDocument(kind, config, kk ? "kk" : "ru");
  const withLang = (href: string) => (kk ? `${href}?lang=kk` : href);
  const toggleLang = kk ? `?lang=ru` : `?lang=kk`;
  return (
    <main className="orbita-app legal-document-page">
      <header className="orbita-header">
        <Link className="orbita-brand" href="/">
          <BrandIcon size={30} />
          <span><span className="brand-name">T-Skills</span><span className="brand-caption">{t.caption}</span></span>
        </Link>
        <span style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
          <Link className="nav-link" href={toggleLang}>{kk ? "RU" : "ҚЗ"}</Link>
          <Link className="nav-link" href="/">{t.home}</Link>
        </span>
      </header>
      <div className="page-wrap info-page">
        <div className="section-heading">
          <div className="eyebrow">{eyebrow(kind)}</div>
          <h1>{document.title}</h1>
          <p>{t.version(document.version, document.updatedAt)}</p>
        </div>
        <div className="info-blocks">
          {document.blocks.map((block, index) => (
            <article key={block.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><h2>{block.title}</h2><p>{block.body}</p></div>
            </article>
          ))}
        </div>
        <p className="legal-review-note">{config.reviewStatus}</p>
        <nav className="legal-document-links" aria-label={t.docsAria}>
          <Link href={withLang("/privacy")}>{t.privacy}</Link>
          <Link href={withLang("/terms")}>{t.terms}</Link>
          <Link href={withLang("/cookies")}>{t.cookies}</Link>
          <Link href={withLang("/refunds")}>{t.refunds}</Link>
          <Link href="/contact">{t.contact}</Link>
        </nav>
      </div>
    </main>
  );
}
