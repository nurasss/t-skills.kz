"use client";

import { useEffect } from "react";
import { ArrowRight } from "@/app/views/shared/section-heading";
import type { View } from "@/app/orbita-view-types";
import { useSiteLang, SiteLangToggle } from "@/lib/site-lang";
import { INFO_STRINGS } from "@/lib/site-strings";

type InfoViewKind = "privacy" | "terms" | "faq" | "support";

export type InfoViewProps = {
  kind: InfoViewKind;
  onNavigate: (view: View) => void;
  supportContact?: string | null;
  title: string;
  blocks: Array<{ title: string; body: string }>;
  version?: string;
  updatedAt?: string;
  reviewStatus?: string;
};

export function InfoView({ kind, onNavigate, title, blocks, version, updatedAt, reviewStatus }: InfoViewProps) {
  const [lang, setLang] = useSiteLang();
  const t = INFO_STRINGS[lang];
  useRevealOnScroll();
  const isLegal = kind === "privacy" || kind === "terms";

  return (
    <div className="orbita-view ov-info">
      <div className="ov-container">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button className="ov-back-link" onClick={() => onNavigate("home")} type="button">
            {t.back}
          </button>
          <SiteLangToggle lang={lang} onLang={setLang} />
        </div>

        <div className="ov-info-head ov-reveal">
          <span className="ov-eyebrow">{kind === "privacy" ? "PRIVACY" : kind === "terms" ? "TERMS" : kind === "faq" ? "FAQ" : "SUPPORT"}</span>
          <h1>{title}</h1>
          {version && updatedAt ? (
            <p className="ov-info-meta">
              {t.version(version, updatedAt)}
            </p>
          ) : null}
        </div>

        <div className="ov-info-blocks">
          {blocks.map((block, index) => (
            <article className="ov-info-block ov-reveal" key={block.title}>
              <span className="ov-info-index">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{block.title}</h2>
                <p>{block.body}</p>
              </div>
            </article>
          ))}
        </div>

        {isLegal && reviewStatus ? <p className="ov-info-review">{reviewStatus}</p> : null}

        {kind === "faq" ? (
          <div className="ov-info-cta">
            <button className="ov-btn ov-btn-primary" onClick={() => onNavigate("detail")} type="button">
              {t.faqCta}
              <ArrowRight />
            </button>
          </div>
        ) : null}

        {kind === "support" ? (
          <div className="ov-info-cta">
            <button className="ov-btn ov-btn-secondary" onClick={() => onNavigate("account")} type="button">
              {t.supportCta}
              <ArrowRight />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function InfoViewFAQ({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [lang] = useSiteLang();
  const t = INFO_STRINGS[lang];
  return (
    <InfoView
      kind="faq"
      onNavigate={onNavigate}
      title={t.faqTitle}
      blocks={t.faq.map(([title, body]) => ({ title, body }))}
    />
  );
}

export function InfoViewSupport({ onNavigate, supportContact }: { onNavigate: (view: View) => void; supportContact?: string | null }) {
  const [lang] = useSiteLang();
  const t = INFO_STRINGS[lang];
  const blocks = t.support.map(([title, body]) => {
    if (body === "") {
      return {
        title,
        body: supportContact ? `${supportContact} · ${t.supportContact}` : t.supportContactOff,
      };
    }
    return { title, body };
  });

  return <InfoView kind="support" onNavigate={onNavigate} title={t.supportTitle} blocks={blocks} />;
}

function useRevealOnScroll() {
  useEffect(() => {
    const root = document.querySelector(".orbita-view");
    if (!root) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elements = root.querySelectorAll<HTMLElement>(".ov-reveal");

    if (reduceMotion || !("IntersectionObserver" in window)) {
      elements.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    elements.forEach((el) => io.observe(el));

    return () => io.disconnect();
  }, []);
}
