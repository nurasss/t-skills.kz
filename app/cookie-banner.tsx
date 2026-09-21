"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { readCookiePreference, saveCookiePreference, type CookiePreference } from "@/lib/client-analytics";
import { useSiteLang } from "@/lib/site-lang";
import { COOKIE_STRINGS } from "@/lib/site-strings";

import "./cookie-banner.css";

export function CookieBanner() {
  const [lang] = useSiteLang();
  const t = COOKIE_STRINGS[lang];
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
    <aside className="cookie-banner" aria-label={t.aria}>
      <div className="cookie-banner-copy">
        <strong>{t.title}</strong>
        <p>
          {t.body}
        </p>
        <Link href="/cookies">{t.more}</Link>
      </div>
      <div className="cookie-banner-actions">
        <button type="button" className="cookie-banner-secondary" onClick={() => choose("necessary")}>
          {t.necessary}
        </button>
        <button type="button" className="cookie-banner-primary" onClick={() => choose("analytics")}>
          {t.allow}
        </button>
      </div>
    </aside>
  );
}

export function CookiePreferences() {
  const [lang] = useSiteLang();
  const t = COOKIE_STRINGS[lang];
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
      <h2 id="cookie-preferences-title">{t.prefTitle}</h2>
      <p>
        {t.prefBody}
      </p>
      <div className="cookie-preferences-actions">
        <button type="button" className="cookie-banner-secondary" onClick={() => choose("necessary")}>
          {t.necessary}
        </button>
        <button type="button" className="cookie-banner-primary" onClick={() => choose("analytics")}>
          {t.allow}
        </button>
      </div>
      <p className="cookie-preferences-status" role="status">
        {preference ? `${t.statusPrefix}: ${preference === "necessary" ? t.statusOff : t.statusOn}.` : t.statusNone}
      </p>
    </section>
  );
}
