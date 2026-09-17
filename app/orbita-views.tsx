"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { View } from "@/app/orbita-view-types";

export function AppHeader({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = (next: View) => {
    setMobileMenuOpen(false);
    onNavigate(next);
  };
  return (
    <header className="ov-shell-header" aria-label="Навигация T-Skills">
      <button className="ov-shell-brand" onClick={() => navigate("home")} type="button">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <circle cx="13" cy="13" r="11.5" stroke="#173D32" strokeWidth="1.3" />
          <circle cx="13" cy="13" r="4.5" stroke="#173D32" strokeWidth="1.3" />
          <line x1="13" y1="1.5" x2="13" y2="6.2" stroke="#173D32" strokeWidth="1.3" />
        </svg>
        <span className="ov-shell-brand-text">T-Skills</span>
      </button>

      <nav className="ov-shell-nav" aria-label="Основная навигация">
        <button className={view === "catalog" || view === "detail" || view === "checkout" ? "ov-shell-nav-link active" : "ov-shell-nav-link"} onClick={() => navigate("catalog")} type="button">
          Тест
        </button>
        <button className={view === "methodology" ? "ov-shell-nav-link active" : "ov-shell-nav-link"} onClick={() => navigate("methodology")} type="button">
          Методология
        </button>
        <button className={view === "faq" ? "ov-shell-nav-link active" : "ov-shell-nav-link"} onClick={() => navigate("faq")} type="button">
          FAQ
        </button>
      </nav>

      <div className="ov-shell-actions">
        <span className="ov-shell-locale">RU</span>
        <button className={view === "account" ? "ov-shell-account active" : "ov-shell-account"} onClick={() => navigate("account")} type="button">
          <span className="ov-shell-avatar">М</span>
          <span className="ov-shell-account-name">Мой профиль</span>
        </button>
        <button className="ov-shell-mobile-menu" aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"} aria-expanded={mobileMenuOpen} aria-controls="shell-mobile-nav" onClick={() => setMobileMenuOpen((open) => !open)} type="button">
          <Menu size={18} aria-hidden="true" />
        </button>
      </div>
      {mobileMenuOpen ? (
        <nav className="ov-shell-mobile-nav" id="shell-mobile-nav" aria-label="Мобильная навигация">
          <button type="button" onClick={() => navigate("catalog")}>Тест</button>
          <button type="button" onClick={() => navigate("methodology")}>Методология</button>
          <button type="button" onClick={() => navigate("faq")}>FAQ</button>
          <Link href="/privacy" onClick={() => setMobileMenuOpen(false)}>Конфиденциальность</Link>
          <Link href="/terms" onClick={() => setMobileMenuOpen(false)}>Условия</Link>
          <Link href="/contact" onClick={() => setMobileMenuOpen(false)}>Контакты</Link>
        </nav>
      ) : null}
    </header>
  );
}

export function Footer({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <footer className="ov-shell-footer">
      <div className="ov-shell-footer-brand">
        <span className="ov-shell-footer-name">T-Skills</span>
        <small className="ov-shell-footer-note">Развивающий профиль, не диагноз</small>
      </div>
      <div className="ov-shell-footer-links">
        <button onClick={() => onNavigate("methodology")} type="button">
          Методология
        </button>
        <Link href="/privacy">Конфиденциальность</Link>
        <Link href="/terms">Условия</Link>
        <Link href="/cookies">Cookies</Link>
        <Link href="/refunds">Возвраты</Link>
        <Link href="/contact">Контакты</Link>
        <button onClick={() => onNavigate("support")} type="button">
          Поддержка
        </button>
      </div>
      <span className="ov-shell-footer-version">v1 · draft for pilot</span>
    </footer>
  );
}
