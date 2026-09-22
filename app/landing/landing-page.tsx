"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Menu,
  Scale,
  ShieldCheck,
  X,
} from "lucide-react";
import type { View } from "@/app/orbita-view-types";
import { trackOptionalAnalytics } from "@/app/orbita-api";
import { BrandIcon } from "@/app/brand/brand-icon";
import { LANDING_QUALITIES_RU, LANDING_RU, LANDING_LANG_STORAGE_KEY, MOCK_TOP5, type LandingStrings } from "@/app/landing/content";
import { LANDING_KK, LANDING_QUALITIES_KK, MOCK_TOP5_KK, resolveLandingLang } from "@/app/landing/content-kk";
import "./landing.css";

/**
 * Лендинг Empirical Vanguard: белый канвас, Hanken Grotesk, ботанический
 * зелёный акцент. Копирайт — только проверенные факты продукта.
 */

export type LandingPageProps = {
  onNavigate: (view: View) => void;
  onDemo: () => void;
  requestError?: string | null;
  onDismissError?: () => void;
};

type LandingCmsPayload = Partial<Pick<LandingStrings, "heroPre" | "heroAccent" | "heroPost" | "heroLede" | "heroMeta" | "cta" | "finalH2" | "finalP">>;

function landingCmsPayload(value: unknown): LandingCmsPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set(["heroPre", "heroAccent", "heroPost", "heroLede", "heroMeta", "cta", "finalH2", "finalP"]);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key, item]) => allowed.has(key) && typeof item === "string" && item.trim())) as LandingCmsPayload;
}

export function LandingPage({ onNavigate, onDemo, requestError, onDismissError }: LandingPageProps) {
  useSectionReveal();
  const [lang, setLang] = useState<"ru" | "kk">("ru");
  const [cms, setCms] = useState<LandingCmsPayload>({});
  useEffect(() => {
    // Локаль из localStorage применяется после хайдрейта, иначе SSR RU ≠ клиент KK.
    try {
      const stored = resolveLandingLang(localStorage.getItem(LANDING_LANG_STORAGE_KEY));
      if (stored !== "ru") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLang(stored);
      }
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(LANDING_LANG_STORAGE_KEY, lang);
    } catch {
      // ignore
    }
    document.documentElement.lang = lang === "kk" ? "kk" : "ru";
  }, [lang]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/content?content_key=homepage&locale=${encodeURIComponent(lang)}`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<Array<{ published?: unknown }>> : [])
      .then((rows) => setCms(landingCmsPayload(rows[0]?.published)))
      .catch(() => setCms({}));
    return () => controller.abort();
  }, [lang]);
  const t: LandingStrings = { ...(lang === "kk" ? LANDING_KK : LANDING_RU), ...cms };
  const qualities = lang === "kk" ? LANDING_QUALITIES_KK : LANDING_QUALITIES_RU;
  const mock = lang === "kk" ? MOCK_TOP5_KK : MOCK_TOP5;
  return (
    <div className="ev-landing">
      {requestError ? (
        <div className="ev-error" role="alert">
          <span>{requestError}</span>
          <button onClick={onDismissError} type="button" aria-label={t.close}>
            ×
          </button>
        </div>
      ) : null}
      <a href="#main" className="ev-skip">
        {t.skip}
      </a>
      <TopBar onNavigate={onNavigate} t={t} lang={lang} onLang={setLang} />
      <main id="main">
        <Hero onNavigate={onNavigate} t={t} />
        <StatsStrip t={t} />
        <WhatYouGet t={t} />
        <SampleReport onDemo={onDemo} t={t} mock={mock} />
        <HowItWorks onNavigate={onNavigate} t={t} />
        <Methodology t={t} qualities={qualities} />
        <UseCases t={t} />
        <FinalCta onNavigate={onNavigate} t={t} />
        <Faq t={t} />
      </main>
      <div className="ev-mobile-cta">
        <CtaButton onNavigate={onNavigate} position="mobile" label={t.cta} />
      </div>
      <Footer onNavigate={onNavigate} t={t} lang={lang} onLang={setLang} />
    </div>
  );
}

export function LangToggle({ lang, onLang }: { lang: "ru" | "kk"; onLang: (next: "ru" | "kk") => void }) {
  return (
    <span className="ev-lang" role="group" aria-label="Тіл / Язык">
      {(["ru", "kk"] as const).map((option) => (
        <button
          key={option}
          className={option === lang ? "selected" : ""}
          onClick={() => onLang(option)}
          type="button"
        >
          {option === "ru" ? "РУ" : "ҚЗ"}
        </button>
      ))}
    </span>
  );
}

function CtaButton({ onNavigate, position, label }: { onNavigate: (view: View) => void; position: string; label: string }) {
  return (
    <button
      className="ev-btn ev-btn-primary"
      onClick={() => {
        trackOptionalAnalytics({ name: "landing_cta_click", metadata: { position } });
        onNavigate("detail");
      }}
      type="button"
    >
      {label}
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  );
}

function TopBar({ onNavigate, t, lang, onLang }: { onNavigate: (view: View) => void; t: LandingStrings; lang: "ru" | "kk"; onLang: (next: "ru" | "kk") => void }) {
  const [open, setOpen] = useState(false);
  const go = useCallback(
    (view: View) => () => {
      setOpen(false);
      onNavigate(view);
    },
    [onNavigate],
  );
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open ]);
  return (
    <header className="ev-topbar">
      <div className="ev-container ev-topbar-row">
        <a className="ev-brand" href="#main" aria-label={t.brandTop}>
          <BrandIcon size={30} />
          <span className="ev-brand-word">T-Skills</span>
        </a>
        <nav className="ev-nav" aria-label={t.navMain}>
          <a href="#how">{t.navHow}</a>
          <a href="#get">{t.navGet}</a>
          <a href="#methodology">{t.navMethodology}</a>
          <a href="#faq">{t.navFaq}</a>
        </nav>
        <div className="ev-topbar-actions">
          <LangToggle lang={lang} onLang={onLang} />
          <button className="ev-login" onClick={go("account")} type="button">
            {t.login}
          </button>
          <span className="ev-topbar-cta">
            <CtaButton onNavigate={onNavigate} position="topbar" label={t.cta} />
          </span>
          <button
            className="ev-burger"
            onClick={() => setOpen((v) => !v)}
            type="button"
            aria-expanded={open}
            aria-controls="ev-mobile-nav"
            aria-label={open ? t.closeMenu : t.openMenu}
          >
            {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open ? (
        <>
          <button className="ev-backdrop" onClick={() => setOpen(false)} type="button" tabIndex={-1} aria-hidden="true" />
          <nav className="ev-mobile-nav" id="ev-mobile-nav" aria-label={t.mobileNav}>
            <a href="#how" onClick={() => setOpen(false)}>{t.navHow}</a>
            <a href="#get" onClick={() => setOpen(false)}>{t.navGet}</a>
            <a href="#methodology" onClick={() => setOpen(false)}>{t.navMethodology}</a>
            <a href="#faq" onClick={() => setOpen(false)}>{t.navFaq}</a>
            <button onClick={go("account")} type="button">{t.loginAccount}</button>
            <LangToggle lang={lang} onLang={(next) => { onLang(next); }} />
            <CtaButton onNavigate={(v) => { setOpen(false); onNavigate(v); }} position="menu" label={t.cta} />
          </nav>
        </>
      ) : null}
    </header>
  );
}

function Hero({ onNavigate, t }: { onNavigate: (view: View) => void; t: LandingStrings }) {
  return (
    <section className="ev-hero">
      <div className="ev-container ev-hero-grid">
        <div className="ev-hero-copy">
          <h1>
            {t.heroPre} <span className="ev-accent">{t.heroAccent}</span>{t.heroPost ? ` ${t.heroPost}` : ""}
          </h1>
          <p className="ev-lede">
            {t.heroLede}
          </p>
          <div className="ev-cta-row">
            <CtaButton onNavigate={onNavigate} position="hero" label={t.cta} />
          </div>
          <p className="ev-meta">
            <Clock size={15} aria-hidden="true" />
            {t.heroMeta}
          </p>
        </div>
        <figure className="ev-hero-video">
          <video
            src="/media/t-skills-brag.mp4"
            poster="/media/t-skills-brag.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={t.videoLabel}
          />
          <figcaption>{t.videoCaption}</figcaption>
        </figure>
      </div>
    </section>
  );
}

function StatsStrip({ t }: { t: LandingStrings }) {
  return (
    <section className="ev-strip" aria-label={t.statsAria}>
      <div className="ev-container ev-strip-grid">
        {t.stats.map(([num, label]) => (
          <div key={label}>
            <strong>{num}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHead({ index, title, lead }: { index: string; title: string; lead?: string }) {
  return (
    <div className="ev-section-head">
      <span className="ev-section-index">{index}</span>
      <h2>{title}</h2>
      {lead ? <p>{lead}</p> : null}
    </div>
  );
}

function WhatYouGet({ t }: { t: LandingStrings }) {
  return (
    <section className="ev-section" id="get">
      <div className="ev-container">
        <SectionHead index={t.getIndex} title={t.getTitle} />
        <div className="ev-cards-4">
          {t.getCards.map((item) => (
            <article key={item.n}>
              <span className="ev-card-num">{item.n}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function SampleReport({ onDemo, t, mock }: { onDemo: () => void; t: LandingStrings; mock: { name: string; score: number; text: string }[] }) {
  return (
    <section className="ev-section ev-section-tint" id="sample">
      <div className="ev-container">
        <SectionHead index={t.sampleIndex} title={t.sampleTitle} lead={t.sampleLead} />
        <div className="ev-sample-grid">
          <div className="ev-sample-bars" aria-hidden="true">
            {mock.map((item, i) => (
              <div key={item.name}>
                <span>{i + 1}. {item.name}</span>
                <div className="ev-bar"><span style={{ width: `${item.score}%` }} /></div>
                <strong>{item.score}%</strong>
              </div>
            ))}
          </div>
          <div className="ev-sample-text">
            <h3>{t.sampleH3}</h3>
            <p>
              {t.sampleBody}
            </p>
            <button className="ev-link" onClick={onDemo} type="button">
              {t.sampleLink}
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ onNavigate, t }: { onNavigate: (view: View) => void; t: LandingStrings }) {
  return (
    <section className="ev-section" id="how">
      <div className="ev-container">
        <SectionHead index={t.howIndex} title={t.howTitle} />
        <div className="ev-steps">
          {t.howSteps.map((step) => (
            <article key={step.n}>
              <span className="ev-card-num">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <span className="ev-step-meta">{step.meta}</span>
            </article>
          ))}
        </div>
        <QuestionMock t={t} />
        <div className="ev-steps-cta">
          <button
            className="ev-link"
            onClick={() => {
              trackOptionalAnalytics({ name: "landing_cta_click", metadata: { position: "how" } });
              onNavigate("detail");
            }}
            type="button"
          >
            {t.howCta}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

function QuestionMock({ t }: { t: LandingStrings }) {
  return (
    <div className="ev-qmock" role="img" aria-label={t.qmockAria}>
      <span className="ev-eyebrow">{t.qmockEyebrow}</span>
      <h3>{t.qmockH3}</h3>
      <div className="ev-qmock-cards">
        <div>
          <span className="ev-qmock-tag">{t.qmockA}</span>
          <p>{t.qmockAText}</p>
          <small>{t.qmockAFocus}</small>
        </div>
        <div>
          <span className="ev-qmock-tag">{t.qmockB}</span>
          <p>{t.qmockBText}</p>
          <small>{t.qmockBFocus}</small>
        </div>
      </div>
      <div className="ev-qmock-scale" aria-hidden="true">
        {t.qmockScale.map((label, i) => (
          <span key={label} className={i === 2 ? "on" : ""} title={label} />
        ))}
      </div>
      <p className="ev-qmock-note">{t.qmockNote}</p>
    </div>
  );
}

function Methodology({ t, qualities }: { t: LandingStrings; qualities: readonly { name: string; description: string }[] }) {
  const badgeIcons = [
    <Scale key="forced" size={20} aria-hidden="true" />,
    <ShieldCheck key="det" size={20} aria-hidden="true" />,
    <ShieldCheck key="traits" size={20} aria-hidden="true" />,
  ];
  return (
    <section className="ev-section ev-section-tint" id="methodology">
      <div className="ev-container">
        <SectionHead index={t.methIndex} title={t.methTitle} lead={t.methLead} />
        <div className="ev-badges">
          {t.methBadges.map((badge, i) => (
            <article key={badge.title}>
              <span className="ev-badge-icon">{badgeIcons[i]}</span>
              <h3>{badge.title}</h3>
              <p>{badge.body}</p>
            </article>
          ))}
        </div>
        <div className="ev-qualities">
          <h3>{t.methQualities}</h3>
          <ul>
            {qualities.map((q, i) => (
              <li key={q.name} title={q.description}>
                <span>{String(i + 1).padStart(2, "0")}</span> {q.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function UseCases({ t }: { t: LandingStrings }) {
  return (
    <section className="ev-section">
      <div className="ev-container">
        <SectionHead index={t.useIndex} title={t.useTitle} />
        <div className="ev-cards-3">
          {t.useCases.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <span className="ev-step-meta">{item.meta}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ onNavigate, t }: { onNavigate: (view: View) => void; t: LandingStrings }) {
  return (
    <section className="ev-final">
      <div className="ev-container ev-final-grid">
        <div>
          <span className="ev-eyebrow light">{t.finalEyebrow}</span>
          <h2>{t.finalH2}</h2>
          <p>{t.finalP}</p>
          <CtaButton onNavigate={onNavigate} position="finale" label={t.cta} />
          <p className="ev-final-note">{t.finalNote}</p>
        </div>
      </div>
    </section>
  );
}

function Faq({ t }: { t: LandingStrings }) {
  return (
    <section className="ev-section ev-section-narrow" id="faq">
      <div className="ev-container">
        <SectionHead index={t.faqIndex} title={t.faqTitle} />
        <div className="ev-faq">
          {t.faqItems.map((item, i) => (
            <details key={item.q} open={i === 0}>
              <summary>
                <span>{item.q}</span>
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer({ onNavigate, t, lang, onLang }: { onNavigate: (view: View) => void; t: LandingStrings; lang: "ru" | "kk"; onLang: (next: "ru" | "kk") => void }) {
  return (
    <footer className="ev-footer">
      <div className="ev-container">
        <div className="ev-footer-grid">
          <div>
            <span className="ev-brand">
              <BrandIcon size={28} />
              <span className="ev-brand-word">T-Skills</span>
            </span>
            <p>{t.footerTagline}</p>
          </div>
          <nav aria-label={t.footerProduct}>
            <h4>{t.footerProduct}</h4>
            <a href="#how">{t.navHow}</a>
            <a href="#get">{t.navGet}</a>
            <a href="#faq">{t.navFaq}</a>
          </nav>
          <nav aria-label={t.footerResources}>
            <h4>{t.footerResources}</h4>
            <button onClick={() => onNavigate("methodology")} type="button">{t.footerMethodology}</button>
            <button onClick={() => onNavigate("support")} type="button">{t.footerSupport}</button>
          </nav>
          <nav aria-label={t.footerLegal}>
            <h4>{t.footerLegal}</h4>
            <Link href="/privacy">{t.footerPrivacy}</Link>
            <Link href="/terms">{t.footerTerms}</Link>
            <Link href="/cookies">{t.footerCookies}</Link>
            <Link href="/refunds">{t.footerRefunds}</Link>
            <Link href="/contact">{t.footerContact}</Link>
          </nav>
        </div>
        <div className="ev-footer-bottom">
          <span>{t.footerBottom}</span>
          <LangToggle lang={lang} onLang={onLang} />
        </div>
      </div>
    </footer>
  );
}

function useSectionReveal() {
  useEffect(() => {
    const root = document.querySelector(".ev-landing");
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("main section, .ev-footer"));
    if (reduce || !("IntersectionObserver" in window)) {
      sections.forEach((s) => s.classList.add("is-visible"));
      return;
    }
    sections.forEach((s) => s.classList.add("ev-reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px -24px 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);
}
