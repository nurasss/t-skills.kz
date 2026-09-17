"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { readCookiePreference, saveCookiePreference, type CookiePreference } from "@/lib/client-analytics";

import "./cookie-banner.css";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setVisible(!readCookiePreference(window.localStorage));
      } catch {
        setVisible(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const choose = (preference: CookiePreference) => {
    saveCookiePreference(preference);
    setVisible(false);
  };

  return (
    <aside className="cookie-banner" aria-label="Настройки файлов cookie">
      <div className="cookie-banner-copy">
        <strong>Файлы cookie</strong>
        <p>
          T-Skills использует необходимые cookies для входа и защиты запросов. Необязательная
          first-party аналитика отправляет только ограниченные события после отдельного выбора;
          сторонние рекламные трекеры не подключены.
        </p>
        <Link href="/cookies">Подробнее о cookies</Link>
      </div>
      <div className="cookie-banner-actions">
        <button type="button" className="cookie-banner-secondary" onClick={() => choose("necessary")}>
          Только необходимые
        </button>
        <button type="button" className="cookie-banner-primary" onClick={() => choose("analytics")}>
          Разрешить аналитику
        </button>
      </div>
    </aside>
  );
}

export function CookiePreferences() {
  const [preference, setPreference] = useState<CookiePreference | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setPreference(readCookiePreference(window.localStorage));
      } catch {
        setPreference(null);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const choose = (next: CookiePreference) => {
    saveCookiePreference(next);
    setPreference(next);
  };

  return (
    <section className="cookie-preferences" aria-labelledby="cookie-preferences-title">
      <h2 id="cookie-preferences-title">Настройки cookies</h2>
      <p>
        Выбор хранится только на этом устройстве. Сторонние cookies и рекламная аналитика не
        подключены. При разрешении first-party аналитики отправляются ограниченные события
        продукта без сырых ответов.
      </p>
      <div className="cookie-preferences-actions">
        <button type="button" className="cookie-banner-secondary" onClick={() => choose("necessary")}>
          Только необходимые
        </button>
        <button type="button" className="cookie-banner-primary" onClick={() => choose("analytics")}>
          Разрешить аналитику
        </button>
      </div>
      <p className="cookie-preferences-status" role="status">
        {preference ? `Текущий выбор: ${preference === "necessary" ? "только необходимые" : "аналитика разрешена"}.` : "Выбор ещё не сделан."}
      </p>
    </section>
  );
}
