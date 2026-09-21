"use client";

import { ArrowRight, SectionHeading } from "@/app/views/shared/section-heading";
import { useSiteLang, SiteLangToggle } from "@/lib/site-lang";
import { CONSENT_STRINGS } from "@/lib/site-strings";

type ConsentRow = {
  key: "terms" | "privacy" | "research" | "marketing";
  title: string;
  description: string;
  required: boolean;
  checked: boolean;
};

export type ConsentViewProps = {
  consents: { terms: boolean; privacy: boolean; research: boolean; marketing: boolean };
  onConsentChange: (key: "terms" | "privacy" | "research" | "marketing", value: boolean) => void;
  onBegin: () => void;
  onBack: () => void;
  onPrivacy: () => void;
};

export function ConsentView({ consents, onConsentChange, onBegin, onBack, onPrivacy }: ConsentViewProps) {
  const [lang, setLang] = useSiteLang();
  const t = CONSENT_STRINGS[lang];
  const required = consents.terms && consents.privacy;

  const rows: ConsentRow[] = [
    { key: "terms", title: t.terms, description: t.termsD, required: true, checked: consents.terms },
    { key: "privacy", title: t.privacy, description: t.privacyD, required: true, checked: consents.privacy },
    { key: "research", title: t.research, description: t.researchD, required: false, checked: consents.research },
    { key: "marketing", title: t.marketing, description: t.marketingD, required: false, checked: consents.marketing },
  ];

  return (
    <div className="orbita-view ov-consent">
      <div className="ov-container">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button className="ov-back-link" onClick={onBack} type="button">
            {t.back}
          </button>
          <SiteLangToggle lang={lang} onLang={setLang} />
        </div>

        <SectionHeading
          eyebrow={t.eyebrow}
          title={t.title}
          body={t.body}
        />

        <div className="ov-two-col ov-consent-grid">
          <article className="ov-card ov-consent-card">
            <header className="ov-card-header">
              <h2 className="ov-card-title">{t.cardTitle}</h2>
              <p className="ov-card-desc">{t.version}</p>
            </header>

            <div className="ov-consent-list">
              {rows.map((row) => (
                <div className="ov-consent-row" key={row.key}>
                  <ConsentCheckbox
                    checked={row.checked}
                    label={row.title}
                    onChange={(v) => onConsentChange(row.key, v)}
                  />
                  <div className="ov-consent-row-text">
                    <strong>{row.title}</strong>
                    <p>{row.description}</p>
                  </div>
                  <span className={`ov-badge ${row.required ? "ov-badge-primary" : "ov-badge-outline"}`}>
                    {row.required ? t.required : t.optional}
                  </span>
                </div>
              ))}
            </div>

            <button
              className="ov-btn ov-btn-primary ov-btn-block"
              disabled={!required}
              onClick={onBegin}
              type="button"
            >
              {t.begin}
              <ArrowRight />
            </button>

            {!required ? (
              <p className="ov-note">{t.needBoth}</p>
            ) : null}
          </article>

          <aside className="ov-consent-side">
            <span className="ov-catalog-note-num">01</span>
            <h3>{t.sideTitle}</h3>
            <p>
              {t.sideBody}
            </p>
            <button className="ov-link" onClick={onPrivacy} type="button">
              {t.openPrivacy}
              <ArrowRight size={14} />
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ConsentCheckbox({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return (
    <label className="ov-checkbox-control">
      <input className="ov-checkbox-input" type="checkbox" checked={checked} aria-label={label} onChange={(event) => onChange(event.target.checked)} />
      <span className={`ov-checkbox${checked ? " checked" : ""}`} aria-hidden="true">
        {checked ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="4 12 10 18 20 6" />
          </svg>
        ) : null}
      </span>
    </label>
  );
}
