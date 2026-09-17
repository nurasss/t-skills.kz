export const COOKIE_PREFERENCE_KEY = "orbita-cookie-preference-v1";

export type CookiePreference = "necessary" | "analytics";

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function readCookiePreference(storage: Pick<StorageLike, "getItem">): CookiePreference | null {
  const value = storage.getItem(COOKIE_PREFERENCE_KEY);
  return value === "necessary" || value === "analytics" ? value : null;
}

export function saveCookiePreference(preference: CookiePreference) {
  try {
    window.localStorage.setItem(COOKIE_PREFERENCE_KEY, preference);
  } catch {
    // A blocked localStorage must not prevent the site from working.
  }
}

/** Optional analytics is opt-in and respects the browser's global opt-out signal. */
export function optionalAnalyticsAllowed() {
  if (typeof window === "undefined") return false;
  try {
    if (window.navigator.doNotTrack === "1") return false;
    return readCookiePreference(window.localStorage) === "analytics";
  } catch {
    return false;
  }
}
