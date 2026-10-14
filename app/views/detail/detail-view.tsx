"use client";

import { useEffect, useRef } from "react";
import { ArrowRight } from "@/app/views/shared/section-heading";
import { SectionHeading } from "@/app/views/shared/section-heading";
import type { View } from "@/app/orbita-view-types";
import { useSiteLang } from "@/lib/site-lang";
import { DETAIL_STRINGS } from "@/lib/site-strings";

const DOMAIN_COLORS = ["sage", "blue", "amber", "coral", "rose", "lavender"];

export type DetailViewProps = {
  onNavigate: (view: View) => void;
  onDemo?: () => void;
};

export function DetailView({ onNavigate }: DetailViewProps) {
  const [lang] = useSiteLang();
  const t = DETAIL_STRINGS[lang];
  return (
    <main className="orbita-view ov-detail">
      <div className="ov-container wide">
        <button className="ov-back-link" onClick={() => onNavigate("catalog")} type="button">
          {t.back}
        </button>

        <header className="ov-detail-hero">
          <div className="ov-detail-hero-copy">
            <span className="ov-eyebrow">{t.eyebrow}</span>
            <h1>{t.h1}</h1>
            <p>
              {t.lead}
            </p>
            <div className="ov-detail-actions">
              <button className="ov-btn ov-btn-primary" onClick={() => onNavigate("checkout")} type="button">
                {t.checkout}
                <ArrowRight />
              </button>
            </div>
          </div>
          <div className="ov-detail-hero-visual">
            <DetailMarkGraphic />
          </div>
        </header>

        <div className="ov-two-col ov-detail-body">
          <section className="ov-detail-main">
            <div className="ov-detail-section">
              <SectionHeading eyebrow={t.featE} title={t.featT} />
              <div className="ov-detail-features">
                {t.features.map(([num, title, body]) => (
                  <article className="ov-detail-feature" key={num}>
                    <span className="ov-detail-feature-num">{num}</span>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="ov-detail-section">
              <SectionHeading eyebrow={t.domE} title={t.domT} />
              <div className="ov-detail-domains">
                {t.domains.map(([code, name, body], i) => (
                  <article className="ov-detail-domain" key={code}>
                    <span className={`ov-detail-domain-code ov-tag-${DOMAIN_COLORS[i % DOMAIN_COLORS.length]}`}>{code}</span>
                    <div>
                      <h3>{name}</h3>
                      <p>{body}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <aside className="ov-detail-aside">
            <article className="ov-card ov-detail-card">
              <span className="ov-eyebrow">{t.forWhom}</span>
              <h3 className="ov-card-title">{t.forWhomT}</h3>
              <p className="ov-card-desc">
                {t.forWhomB}
              </p>
              <hr className="ov-divider" />
              <span className="ov-eyebrow">{t.format}</span>
              <ul className="ov-list ov-detail-checklist">
                {t.checks.map((check) => (
                  <li key={check}><DetailCheck /> {check}</li>
                ))}
              </ul>
            </article>

            <article className="ov-card ov-detail-card">
              <span className="ov-eyebrow">{t.getE}</span>
              <h3 className="ov-card-title">{t.getT}</h3>
              <p className="ov-card-desc">
                {t.getB}
              </p>
            </article>
          </aside>
        </div>
      </div>
    </main>
  );
}

function DetailCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}

function DetailMarkGraphic() {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;

    const size = 220;
    const cx = size / 2;
    const cy = size / 2;
    const innerR = 24;
    const outerR = 92;
    const n = 25;
    const anglePer = (Math.PI * 2) / n;
    const startOffset = -Math.PI / 2;
    const ns = "http://www.w3.org/2000/svg";
    const colors = ["#8FA888", "#7C93A8", "#C79A5B", "#C1836F", "#B78D97", "#9B93B5"];
    const sample = [82, 76, 89, 70, 79, 75, 84, 72, 88, 73, 80, 78, 86, 71, 83, 74, 81, 77, 85, 72, 79, 83, 76, 88, 74, 82, 78, 85, 73, 80];

    const pt = (r: number, angle: number): [number, number] => [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];

    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const domain = Math.floor(i / 5);
      const val = sample[i];
      const r = innerR + (outerR - innerR) * (val / 100);
      const a0 = startOffset + i * anglePer;
      const a1 = startOffset + (i + 1) * anglePer - 0.02;
      const p1 = pt(innerR, a0);
      const p2 = pt(r, a0);
      const p3 = pt(r, a1);
      const p4 = pt(innerR, a1);
      const d = ["M", p1[0], p1[1], "L", p2[0], p2[1], "A", r, r, 0, 0, 1, p3[0], p3[1], "L", p4[0], p4[1], "A", innerR, innerR, 0, 0, 0, p1[0], p1[1], "Z"].join(" ");
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", colors[domain]);
      path.setAttribute("opacity", String(0.6 + 0.4 * (val / 100)));
      frag.appendChild(path);
    }
    const centerCircle = document.createElementNS(ns, "circle");
    centerCircle.setAttribute("cx", String(cx));
    centerCircle.setAttribute("cy", String(cy));
    centerCircle.setAttribute("r", String(innerR - 4));
    centerCircle.setAttribute("fill", "#ffffff");
    centerCircle.setAttribute("stroke", "rgba(17,17,17,0.18)");
    frag.appendChild(centerCircle);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(cx));
    label.setAttribute("y", String(cy + 4));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-family", "'Newsreader', Georgia, serif");
    label.setAttribute("font-size", "11");
    label.setAttribute("fill", "#111111");
    label.textContent = "T-Skills";
    frag.appendChild(label);

    svg.appendChild(frag);
  }, []);

  return (
    <svg ref={ref} viewBox="0 0 220 220" width="240" height="240" aria-hidden="true">
      <circle cx="110" cy="110" r="106" fill="#ffffff" stroke="rgba(17,17,17,0.12)" />
    </svg>
  );
}
