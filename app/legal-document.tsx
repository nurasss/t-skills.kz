import Link from "next/link";

import { getLegalConfig } from "@/lib/legal-config";
import { getLegalDocument, type LegalKind } from "@/lib/legal-documents";

function eyebrow(kind: LegalKind) {
  return kind === "privacy" ? "PRIVACY" : kind === "terms" ? "TERMS" : kind === "cookies" ? "COOKIES" : "REFUNDS";
}

export default function LegalDocumentPage({ kind }: { kind: LegalKind }) {
  const config = getLegalConfig();
  const document = getLegalDocument(kind, config);
  return (
    <main className="orbita-app legal-document-page">
      <header className="orbita-header">
        <Link className="orbita-brand" href="/">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span><span className="brand-name">T-Skills</span><span className="brand-caption">Профиль ваших сильных сторон</span></span>
        </Link>
        <Link className="nav-link" href="/">На главную</Link>
      </header>
      <div className="page-wrap info-page">
        <div className="section-heading">
          <div className="eyebrow">{eyebrow(kind)}</div>
          <h1>{document.title}</h1>
          <p>Версия {document.version} · обновлено {document.updatedAt}.</p>
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
        <nav className="legal-document-links" aria-label="Правовые документы">
          <Link href="/privacy">Конфиденциальность</Link>
          <Link href="/terms">Условия</Link>
          <Link href="/cookies">Cookies</Link>
          <Link href="/refunds">Возвраты</Link>
          <Link href="/contact">Контакты</Link>
        </nav>
      </div>
    </main>
  );
}
