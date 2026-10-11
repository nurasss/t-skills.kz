"use client";

import { useCallback, useEffect, useState } from "react";

export type SiteLang = "ru" | "kk";

export const SITE_LANG_KEY = "ts_lang";

const LANG_EVENT = "site-lang-change";

/** Единый язык сайта (делит ключ с лендингом). SSR всегда RU, KK применяется после хайдрейта. */
export function useSiteLang(): [SiteLang, (next: SiteLang) => void] {
  const [lang, setLangState] = useState<SiteLang>("ru");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SITE_LANG_KEY);
      if (saved === "kk" || saved === "ru") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLangState(saved);
        if (typeof document !== "undefined") {
          document.documentElement.lang = saved;
          if (saved === "kk" && document.title.includes("Профиль ваших сильных сторон")) {
            document.title = "T-Skills · Сіздің мықты жақтарыңыздың бейіні";
          }
        }
      }
    } catch {
      // ignore
    }

    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<SiteLang>).detail;
      if (detail === "ru" || detail === "kk") {
        setLangState(detail);
        if (typeof document !== "undefined") {
          document.documentElement.lang = detail;
          if (detail === "kk" && document.title.includes("Профиль ваших сильных сторон")) {
            document.title = "T-Skills · Сіздің мықты жақтарыңыздың бейіні";
          } else if (detail === "ru" && document.title.includes("мықты жақтарыңыздың бейіні")) {
            document.title = "T-Skills · Профиль ваших сильных сторон";
          }
        }
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === SITE_LANG_KEY && (e.newValue === "ru" || e.newValue === "kk")) {
        setLangState(e.newValue);
        if (typeof document !== "undefined") {
          document.documentElement.lang = e.newValue;
          if (e.newValue === "kk" && document.title.includes("Профиль ваших сильных сторон")) {
            document.title = "T-Skills · Сіздің мықты жақтарыңыздың бейіні";
          } else if (e.newValue === "ru" && document.title.includes("мықты жақтарыңыздың бейіні")) {
            document.title = "T-Skills · Профиль ваших сильных сторон";
          }
        }
      }
    };

    window.addEventListener(LANG_EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(LANG_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
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
      if (next === "kk" && document.title.includes("Профиль ваших сильных сторон")) {
        document.title = "T-Skills · Сіздің мықты жақтарыңыздың бейіні";
      } else if (next === "ru" && document.title.includes("мықты жақтарыңыздың бейіні")) {
        document.title = "T-Skills · Профиль ваших сильных сторон";
      }
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: next }));
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
