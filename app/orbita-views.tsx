"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { BrandIcon } from "@/app/brand/brand-icon";
import type { View } from "@/app/orbita-view-types";
import { useSiteLang, SiteLangToggle } from "@/lib/site-lang";
import { SHELL_STRINGS } from "@/lib/site-strings";

/**
 * Настоящие href + SPA-переход: обычный клик — мгновенно без перезагрузки,
 * Cmd/Ctrl/колесо — новая вкладка, поисковики видят ссылки.
 */
function useSpaNavigate(onNavigate: (view: View) => void, onDone?: () => void) {
  return (next: View) => (event: ReactMouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onDone?.();
    onNavigate(next);
  };
}

export function AppHeader({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  const [lang, setLang] = useSiteLang();
  const t = SHELL_STRINGS[lang];
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const spa = useSpaNavigate(onNavigate, () => setMobileMenuOpen(false));
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileMenuOpen]);
  const activeTest = view === "catalog" || view === "detail" || view === "checkout";
  return (
    <header className="ov-shell-header" aria-label={t.navAria}>
      <Link className="ov-shell-brand" href="/" onClick={spa("home")} aria-label={t.brandAria}>
        <BrandIcon size={27} />
        <span className="ov-shell-brand-text">T-Skills</span>
      </Link>

      <nav className="ov-shell-nav" aria-label={t.navMain}>
        <Link className={activeTest ? "ov-shell-nav-link active" : "ov-shell-nav-link"} href="/tests" onClick={spa("catalog")}>
          {t.test}
        </Link>
        <Link className={view === "methodology" ? "ov-shell-nav-link active" : "ov-shell-nav-link"} href="/methodology" onClick={spa("methodology")}>
          {t.methodology}
        </Link>
        <Link className={view === "faq" ? "ov-shell-nav-link active" : "ov-shell-nav-link"} href="/faq" onClick={spa("faq")}>
          {t.faq}
        </Link>
      </nav>

      <div className="ov-shell-actions">
        <SiteLangToggle lang={lang} onLang={setLang} />
        <Link className={view === "account" ? "ov-shell-account active" : "ov-shell-account"} href="/account" onClick={spa("account")}>
          <span className="ov-shell-avatar">М</span>
          <span className="ov-shell-account-name">{t.profile}</span>
        </Link>
        <button className="ov-shell-mobile-menu" aria-label={mobileMenuOpen ? t.closeMenu : t.openMenu} aria-expanded={mobileMenuOpen} aria-controls="shell-mobile-nav" onClick={() => setMobileMenuOpen((open) => !open)} type="button">
          <Menu size={18} aria-hidden="true" />
        </button>
      </div>
      {mobileMenuOpen ? (
        <>
          <button
            className="ov-shell-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
          />
          <nav className="ov-shell-mobile-nav" id="shell-mobile-nav" aria-label={t.mobileNav}>
          <Link href="/tests" onClick={spa("catalog")}>{t.test}</Link>
          <Link href="/methodology" onClick={spa("methodology")}>{t.methodology}</Link>
          <Link href="/faq" onClick={spa("faq")}>{t.faq}</Link>
          <Link href="/privacy" onClick={() => setMobileMenuOpen(false)}>{t.privacy}</Link>
          <Link href="/terms" onClick={() => setMobileMenuOpen(false)}>{t.terms}</Link>
          <Link href="/contact" onClick={() => setMobileMenuOpen(false)}>{t.contact}</Link>
        </nav>
        </>
      ) : null}
    </header>
  );
}

export function Footer({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [lang] = useSiteLang();
  const t = SHELL_STRINGS[lang];
  const spa = useSpaNavigate(onNavigate);
  const withLang = (href: string) => (lang === "kk" ? `${href}?lang=kk` : href);
  return (
    <footer className="ov-shell-footer">
      <div className="ov-shell-footer-brand">
        <span className="ov-shell-footer-name">T-Skills</span>
        <small className="ov-shell-footer-note">{t.footNote}</small>
      </div>
      <div className="ov-shell-footer-links">
        <Link href="/methodology" onClick={spa("methodology")}>
          {t.methodology}
        </Link>
        <Link href={withLang("/privacy")}>{t.privacy}</Link>
        <Link href={withLang("/terms")}>{t.terms}</Link>
        <Link href={withLang("/cookies")}>{t.cookies}</Link>
        <Link href={withLang("/refunds")}>{t.refunds}</Link>
        <Link href={withLang("/contact")}>{t.contact}</Link>
        <Link href="/support" onClick={spa("support")}>
          {t.support}
        </Link>
      </div>
    </footer>
  );
}
