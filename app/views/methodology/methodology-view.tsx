"use client";

import { ArrowRight, SectionHeading } from "@/app/views/shared/section-heading";
import type { View } from "@/app/orbita-view-types";
import { useSiteLang } from "@/lib/site-lang";
import { METHOD_STRINGS } from "@/lib/site-strings";
import { TEEN_TRAIT_IDS, TEEN_STAGE2_CORRECTION_WEIGHT_V3 } from "@/lib/t-skills/teen/taxonomy";
import { getTeenTraitMeta } from "@/lib/t-skills/teen/trait-interpretations";
import { traitDomainColorKey } from "@/lib/trait-domains";
import { T_SKILLS_TEEN_CLARIFICATION_COUNT, T_SKILLS_TEEN_STATIC_ITEM_COUNT, T_SKILLS_TEEN_V5_VERSION_IDS } from "@/lib/t-skills/versions";

export type MethodologyViewProps = {
  onNavigate: (view: View) => void;
};

export function MethodologyView({ onNavigate }: MethodologyViewProps) {
  const [lang] = useSiteLang();
  const t = METHOD_STRINGS[lang];
  const traits = TEEN_TRAIT_IDS.map((id) => {
    const meta = getTeenTraitMeta(id, lang);
    return { id, name: meta.name, short: meta.short } as { id: string; name: string; short: string };
  });
  return (
    <main className="orbita-view ov-method">
      <div className="ov-container wide">
        <SectionHeading
          eyebrow={t.eyebrow}
          title={t.title}
          body={t.body}
          level={1}
        />

        <div className="ov-method-layout">
          <aside className="ov-method-index">
            <span className="ov-eyebrow">{t.toc}</span>
            <nav>
              <a href="#model">{t.tocModel}</a>
              <a href="#scoring">{t.tocScoring}</a>
              <a href="#adaptive">{t.tocAdaptive}</a>
              <a href="#quality">{t.tocQuality}</a>
              <a href="#validation">{t.tocValid}</a>
              <a href="#limits">{t.tocLimits}</a>
            </nav>
          </aside>

          <div className="ov-method-content">
            <section className="ov-method-block" id="model">
              <header className="ov-method-block-head">
                <span className="ov-method-num">01</span>
                <h2>{t.b1t}</h2>
              </header>
              <p>
                {lang === "kk"
                  ? `Жаңартылатын таксономия ${TEEN_TRAIT_IDS.length} қасиет, нұсқа ${T_SKILLS_TEEN_V5_VERSION_IDS.traitTaxonomy}. ${t.b1b}`
                  : `Живая таксономия ${TEEN_TRAIT_IDS.length} качеств версии ${T_SKILLS_TEEN_V5_VERSION_IDS.traitTaxonomy}. ${t.b1b}`}
              </p>
              <div className="ov-method-traits">
                {traits.map((trait, index) => (
                  <article className="ov-method-trait" key={trait.id}>
                    <span className={`ov-method-trait-code ov-tag-${traitDomainColorKey(trait.id, "teen")}`}>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{trait.name}</strong>
                    <p>{trait.short}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="ov-method-block" id="scoring">
              <header className="ov-method-block-head">
                <span className="ov-method-num">02</span>
                <h2>{t.b2t}</h2>
              </header>
              <p>
                {t.b2b}
              </p>
              <div className="ov-method-formula">
                {t.formula.map(([label, value, hint]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{hint}</small>
                  </div>
                ))}
              </div>
              <div className="ov-method-versions">
                <span className="ov-badge ov-badge-outline">assessment {T_SKILLS_TEEN_V5_VERSION_IDS.assessment}</span>
                <span className="ov-badge ov-badge-outline">items {T_SKILLS_TEEN_V5_VERSION_IDS.itemBank}</span>
                <span className="ov-badge ov-badge-outline">scoring {T_SKILLS_TEEN_V5_VERSION_IDS.scoring}</span>
                <span className="ov-badge ov-badge-outline">norm {T_SKILLS_TEEN_V5_VERSION_IDS.norms}</span>
              </div>
              <p className="ov-method-warning">
                {t.normWarn}
              </p>
            </section>

            <section className="ov-method-block" id="adaptive">
              <header className="ov-method-block-head">
                <span className="ov-method-num">03</span>
                <h2>{t.b3t}</h2>
              </header>
              <p>
                {t.b3pre} {T_SKILLS_TEEN_CLARIFICATION_COUNT} {t.b3b}
              </p>
              <div className="ov-method-adaptive">
                <div>
                  <span>{t.adStatic}</span>
                  <strong>{T_SKILLS_TEEN_STATIC_ITEM_COUNT}</strong>
                  <small>{t.adStaticV}</small>
                </div>
                <div>
                  <span>{t.adGoal}</span>
                  <strong>{T_SKILLS_TEEN_CLARIFICATION_COUNT}</strong>
                  <small>{t.adGoalV(T_SKILLS_TEEN_CLARIFICATION_COUNT)}</small>
                </div>
                <div>
                  <span>{t.adFormat}</span>
                  <strong>A–D</strong>
                  <small>{t.adFormatV}</small>
                </div>
                <div>
                  <span>{t.adScoring}</span>
                  <strong>×{TEEN_STAGE2_CORRECTION_WEIGHT_V3}</strong>
                  <small>{t.adScoringV}</small>
                </div>
              </div>
            </section>

            <section className="ov-method-block" id="quality">
              <header className="ov-method-block-head">
                <span className="ov-method-num">04</span>
                <h2>{t.b4t}</h2>
              </header>
              <p>
                {t.b4b}
              </p>
              <div className="ov-method-quality">
                {t.quality.map(([title, body]) => (
                  <div key={title}>
                    <MethodCheck />
                    <div>
                      <strong>{title}</strong>
                      <p>{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="ov-method-block" id="validation">
              <header className="ov-method-block-head">
                <span className="ov-method-num">05</span>
                <h2>{t.b5t}</h2>
              </header>
              <div className="ov-method-validation">
                {t.validation.map((item, index) => (
                  <article key={item}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <p>{item}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="ov-method-block ov-method-limits" id="limits">
              <header className="ov-method-block-head">
                <span className="ov-method-num">06</span>
                <h2>{t.b6t}</h2>
              </header>
              <p>
                {t.b6b}
              </p>
              <button className="ov-link" onClick={() => onNavigate("privacy")} type="button">
                {t.privacyLink}
                <ArrowRight size={14} />
              </button>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function MethodCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}
