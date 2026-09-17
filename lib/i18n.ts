/**
 * Canonical product locales. `kz` is accepted only as a legacy input alias;
 * it must never be persisted or emitted by a new API response.
 */
export type Locale = "ru" | "kk" | "en";

const LEGACY_LOCALE_ALIASES = {
  kz: "kk",
} as const;

export type LocaleResolution = {
  locale: Locale;
  legacyAlias: boolean;
  requested: string | null;
};

type TranslationMetadata = {
  locale: Locale;
  status: "published" | "unpublished";
  sourceVersion: string;
  translationVersion: string | null;
  reviewer: string | null;
  requirements: string[];
};

const ITEM_TRANSLATION_POLICY: Record<Locale, TranslationMetadata> = {
  ru: {
    locale: "ru",
    status: "published",
    sourceVersion: "core60-v1",
    translationVersion: "ru-source-v1",
    reviewer: "source-authored",
    requirements: ["content review before closed pilot"],
  },
  kk: {
    locale: "kk",
    status: "unpublished",
    sourceVersion: "core60-v1",
    translationVersion: null,
    reviewer: null,
    requirements: ["independent translation", "back-translation", "cognitive interviews", "measurement-invariance review"],
  },
  en: {
    locale: "en",
    status: "unpublished",
    sourceVersion: "core60-v1",
    translationVersion: null,
    reviewer: null,
    requirements: ["independent translation", "back-translation", "cognitive interviews", "measurement-invariance review"],
  },
};

export function resolveLocale(value: string | null | undefined): Locale {
  return resolveLocaleInput(value).locale;
}

export function resolveLocaleInput(value: string | null | undefined): LocaleResolution {
  const normalized = value?.trim().toLowerCase() || null;
  if (normalized === "kk" || normalized === "en" || normalized === "ru") {
    return { locale: normalized, legacyAlias: false, requested: normalized };
  }
  if (normalized === "kz") {
    return { locale: LEGACY_LOCALE_ALIASES.kz, legacyAlias: true, requested: normalized };
  }
  return { locale: "ru", legacyAlias: false, requested: normalized };
}

export function itemTranslationMetadata(locale: Locale = "ru") {
  return ITEM_TRANSLATION_POLICY[locale];
}

export function canPublishLocale(locale: Locale) {
  return ITEM_TRANSLATION_POLICY[locale].status === "published";
}
