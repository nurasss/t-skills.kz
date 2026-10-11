import { getD1 } from "@/db";
import { paymentsFeatureEnabled } from "@/lib/feature-flags";

/**
 * P2.8 — runtime readers for the allowlisted `system_settings` rows.
 *
 * Every read is fail-soft: a missing D1 binding, a missing row, or a corrupt
 * `value_json` payload returns the safe default instead of throwing, so local
 * previews and storage-independent builds keep working. Writes stay in
 * `lib/admin-store.ts` (`updateSetting`, gated on `settings.manage`).
 *
 * Stored shape: `updateSetting` persists `JSON.stringify(input.value)` where
 * `value` is a string, so a healthy row parses back to a string.
 */

export type SystemSettingKey =
  | "support_contact"
  | "public_product_availability"
  | "default_locale"
  | "checkout_enabled"
  | "maintenance_message";

export async function getSystemSetting(key: SystemSettingKey): Promise<unknown> {
  try {
    const row = await getD1()
      .prepare("SELECT value_json FROM system_settings WHERE key = ? LIMIT 1")
      .bind(key)
      .first<{ value_json: string | null }>();
    if (!row || row.value_json === null || row.value_json === undefined) return null;
    try {
      return JSON.parse(row.value_json) as unknown;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Business checkout switch. Defaults to TRUE when unset: an unconfigured
 * switch must never silently kill checkout. Only an explicit off value
 * ("false", "0", "off", "no", "disabled") closes checkout.
 */
export async function isCheckoutEnabled(): Promise<boolean> {
  const raw = await getSystemSetting("checkout_enabled");
  if (raw === null || raw === undefined) return true;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") {
    const normalized = raw.trim().toLowerCase();
    if (["false", "0", "off", "no", "disabled"].includes(normalized)) return false;
    return true;
  }
  return true;
}

/**
 * Checkout is allowed only when BOTH the infra flag and the business switch
 * agree: `paymentsFeatureEnabled() && isCheckoutEnabled()`. Fail-closed on
 * either side; the admin UI surfaces `availableForCheckout` from the same
 * predicate so the button state matches the server gate.
 */
export async function isCheckoutAllowed(): Promise<boolean> {
  const [paymentsOn, checkoutOn] = await Promise.all([paymentsFeatureEnabled(), isCheckoutEnabled()]);
  return paymentsOn && checkoutOn;
}

export async function getMaintenanceMessage(): Promise<string | null> {
  return asText(await getSystemSetting("maintenance_message"));
}

export async function getSupportContact(): Promise<string | null> {
  return asText(await getSystemSetting("support_contact"));
}

/**
 * Default locale used ONLY as a fallback where no user locale exists
 * (assessment creation without an explicit locale, catalog responses without
 * an explicit `?locale=`). Never overrides an explicit user locale.
 */
export async function getDefaultLocale(): Promise<"ru" | "kk" | null> {
  const raw = await getSystemSetting("default_locale");
  return raw === "ru" || raw === "kk" ? raw : null;
}
