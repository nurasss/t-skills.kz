import Link from "next/link";

import { getLegalConfig } from "@/lib/legal-config";
import { getLegalDocument, type LegalKind } from "@/lib/legal-documents";

export default function LegalDocumentPage({ kind }: { kind: LegalKind }) {
  const document = getLegalDocument(kind, getLegalConfig());
  return (
    <main className="orbita-app legal-document-page">
      <header className="orbita-header">
        <Link className="orbita-brand" href="/">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span><span className="brand-name">ORBITA<span>—</span>30</span><span className="brand-caption">профиль способа действовать</span></span>
        </Link>
        <Link className="nav-link" href="/">На главную</Link>
      </header>
      <div className="page-wrap info-page">
        <div className="section-heading">
          <div className="eyebrow">{kind === "privacy" ? "PRIVACY" : "TERMS"}</div>
          <h1>{document.title}</h1>
          <p>Версия {document.version} · обновлено {document.updatedAt}. {document.blocks[0]?.body.includes("ТРЕБУЕТСЯ") ? "Часть полей ожидает утверждения оператора." : ""}</p>
        </div>
        <div className="info-blocks">
          {document.blocks.map((block, index) => (
            <article key={block.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><h2>{block.title}</h2><p>{block.body}</p></div>
            </article>
          ))}
        </div>
        <p className="legal-review-note">{getLegalConfig().reviewStatus}</p>
      </div>
    </main>
  );
}
