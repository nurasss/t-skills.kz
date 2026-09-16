"use client";

import { Menu } from "lucide-react";
import type { View } from "@/app/orbita-view-types";

export function AppHeader({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  return (
    <header className="ov-shell-header">
      <button className="ov-shell-brand" onClick={() => onNavigate("home")} type="button">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <circle cx="13" cy="13" r="11.5" stroke="#173D32" strokeWidth="1.3" />
          <circle cx="13" cy="13" r="4.5" stroke="#173D32" strokeWidth="1.3" />
          <line x1="13" y1="1.5" x2="13" y2="6.2" stroke="#173D32" strokeWidth="1.3" />
        </svg>
        <span className="ov-shell-brand-text">ORBITA—30</span>
      </button>

      <nav className="ov-shell-nav" aria-label="Основная навигация">
        <button className={view === "catalog" || view === "detail" || view === "checkout" ? "ov-shell-nav-link active" : "ov-shell-nav-link"} onClick={() => onNavigate("catalog")} type="button">
          Тест
        </button>
        <button className={view === "methodology" ? "ov-shell-nav-link active" : "ov-shell-nav-link"} onClick={() => onNavigate("methodology")} type="button">
          Методология
        </button>
        <button className={view === "faq" ? "ov-shell-nav-link active" : "ov-shell-nav-link"} onClick={() => onNavigate("faq")} type="button">
          FAQ
        </button>
      </nav>

      <div className="ov-shell-actions">
        <span className="ov-shell-locale">RU</span>
        <button className={view === "account" ? "ov-shell-account active" : "ov-shell-account"} onClick={() => onNavigate("account")} type="button">
          <span className="ov-shell-avatar">М</span>
          <span className="ov-shell-account-name">Мой профиль</span>
        </button>
        <button className="ov-shell-mobile-menu" aria-label="Открыть меню" type="button">
          <Menu size={18} />
        </button>
      </div>
    </header>
  );
}

export function Footer({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <footer className="ov-shell-footer">
      <div className="ov-shell-footer-brand">
        <span className="ov-shell-footer-name">ORBITA—30</span>
        <small className="ov-shell-footer-note">Развивающий профиль, не диагноз</small>
      </div>
      <div className="ov-shell-footer-links">
        <button onClick={() => onNavigate("methodology")} type="button">
          Методология
        </button>
        <button onClick={() => onNavigate("privacy")} type="button">
          Privacy
        </button>
        <button onClick={() => onNavigate("terms")} type="button">
          Terms
        </button>
        <button onClick={() => onNavigate("support")} type="button">
          Поддержка
        </button>
      </div>
      <span className="ov-shell-footer-version">v1 · draft for pilot</span>
    </footer>
  );
}
