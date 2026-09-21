"use client";

import { useCallback, useEffect, useState } from "react";

export type SiteLang = "ru" | "kk";

export const SITE_LANG_KEY = "ts_lang";

/** Единый язык сайта (делит ключ с лендингом). SSR всегда RU, KK применяется после хайдрейта. */
export function useSiteLang(): [SiteLang, (next: SiteLang) => void] {
  const [lang, setLangState] = useState<SiteLang>("ru");
  useEffect(() => {
    try {
      if (localStorage.getItem(SITE_LANG_KEY) === "kk") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLangState("kk");
      }
    } catch {
      // ignore
    }
  }, []);
  const setLang = useCallback((next: SiteLang) => {
    setLangState(next);
    try {
      localStorage.setItem(SITE_LANG_KEY, next);
    } catch {
      // ignore
    }
    try {
      document.documentElement.lang = next;
    } catch {
      // ignore
    }
  }, []);
  return [lang, setLang];
}

export function SiteLangToggle({ lang, onLang, className }: { lang: SiteLang; onLang: (next: SiteLang) => void; className?: string }) {
  return (
    <span className={`site-lang${className ? ` ${className}` : ""}`} role="group" aria-label="Тіл / Язык">
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
