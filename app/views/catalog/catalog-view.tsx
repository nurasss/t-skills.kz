"use client";

import { ArrowRight } from "@/app/views/shared/section-heading";
import { SectionHeading } from "@/app/views/shared/section-heading";
import type { View } from "@/app/orbita-view-types";
import { useSiteLang } from "@/lib/site-lang";
import { CATALOG_STRINGS } from "@/lib/site-strings";
import { T_SKILLS_TEEN_V5_VERSION_IDS } from "@/lib/t-skills/versions";
import { traitDomainHex } from "@/lib/trait-domains";

export type CatalogViewProps = {
  onNavigate: (view: View) => void;
};

export function CatalogView({ onNavigate }: CatalogViewProps) {
  const [lang] = useSiteLang();
  const t = CATALOG_STRINGS[lang];
  return (
    <main className="orbita-view ov-catalog">
      <div className="ov-container wide">
        <SectionHeading
          eyebrow={t.eyebrow}
          title={t.title}
          body={t.body}
          level={1}
        />

        <div className="ov-catalog-grid">
          <article className="ov-catalog-card ov-catalog-featured">
            <header className="ov-catalog-card-head">
              <div className="ov-catalog-tags">
                <span className="ov-badge ov-badge-primary">{t.mainTest}</span>
                <span className="ov-badge ov-badge-outline">{T_SKILLS_TEEN_V5_VERSION_IDS.assessment}</span>
              </div>
              <h2>T-Skills</h2>
              <p>{t.profile}</p>
            </header>

            <div className="ov-catalog-visual">
              <CatalogMarkGraphic />
              <div className="ov-catalog-stats">
                <div>
                  <strong>25</strong>
                  <span dangerouslySetInnerHTML={{ __html: t.statTraits }} />
                </div>
                <div>
                  <strong>75 + 8</strong>
                  <span dangerouslySetInnerHTML={{ __html: t.statQuestions }} />
                </div>
              </div>
            </div>

            <ul className="ov-catalog-meta">
              <li><CatalogIcon name="time" /> {t.time}</li>
              <li><CatalogIcon name="doc" /> {t.report}</li>
              <li><CatalogIcon name="shield" /> {t.format}</li>
            </ul>

            <button className="ov-btn ov-btn-primary ov-btn-block" onClick={() => onNavigate("detail")} type="button">
              {t.open}
              <ArrowRight />
            </button>
          </article>

          <aside className="ov-catalog-notes">
            <article className="ov-catalog-note">
              <span className="ov-catalog-note-num">01</span>
              <h3>{t.note1t}</h3>
              <p>
                {t.note1b}
              </p>
            </article>
            <article className="ov-catalog-note">
              <span className="ov-catalog-note-num">02</span>
              <h3>{t.note2t}</h3>
              <p>
                {t.note2b}
              </p>
            </article>
            <article className="ov-catalog-note">
              <span className="ov-catalog-note-num">03</span>
              <h3>{t.note3t}</h3>
              <p>
                {t.note3b}
              </p>
            </article>
          </aside>
        </div>
      </div>
    </main>
  );
}

function CatalogIcon({ name }: { name: "time" | "doc" | "shield" }) {
  const path =
    name === "time"
      ? "M12 7v5l3 3"
      : name === "doc"
        ? "M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6"
        : "M12 3l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z";
  const circle = name === "time" ? <circle cx="12" cy="12" r="9" /> : null;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {circle}
      {name !== "time" ? <path d={path} /> : null}
      {name === "time" ? <path d={path} /> : null}
    </svg>
  );
}

function CatalogMarkGraphic() {
  return (
    <svg viewBox="0 0 200 200" width="180" height="180" aria-hidden="true">
      <defs>
        <radialGradient id="catalogGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f6f6f6" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="92" fill="url(#catalogGradient)" stroke="rgba(17,17,17,0.12)" />
      {[68, 88].map((r, i) => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="rgba(17,17,17,0.12)" strokeDasharray={i === 0 ? "3 4" : "none"} />
      ))}
      {[
        { angle: 0, code: "T01", label: "T01" },
        { angle: 60, code: "T07", label: "T07" },
        { angle: 120, code: "T14", label: "T14" },
        { angle: 180, code: "T19", label: "T19" },
        { angle: 240, code: "T22", label: "T22" },
        { angle: 300, code: "T28", label: "T28" },
      ].map(({ angle, code, label }) => {
        const rad = (angle * Math.PI) / 180;
        const r = 75;
        const x = 100 + r * Math.cos(rad);
        const y = 100 + r * Math.sin(rad);
        return <circle key={label} cx={x} cy={y} r="10" fill={traitDomainHex(code, "legacy")} opacity="0.85" />;
      })}
      <circle cx="100" cy="100" r="22" fill="#ffffff" stroke="rgba(17,17,17,0.18)" />
      <text x="100" y="104" textAnchor="middle" fontFamily="serif" fontSize="11" fill="#111111">
        T-Skills
      </text>
    </svg>
  );
}
