import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/db";
import { itemTranslationMetadata, resolveLocaleInput } from "@/lib/i18n";
import { getPublicTestConfigAsync } from "@/lib/payment-provider";
import { getLegalConfig } from "@/lib/legal-config";
import { getDefaultLocale, getSupportContact } from "@/lib/system-settings";

export async function GET(request: Request) {
  const runtimeEnv = getRuntimeEnv();
  // support_contact setting wins; SUPPORT_CONTACT env stays as fallback.
  const supportContact = (await getSupportContact()) ?? (runtimeEnv.SUPPORT_CONTACT?.trim() || null);
  const requestedLocale = new URL(request.url).searchParams.get("locale");
  // default_locale applies only when the caller passes no explicit locale.
  const locale = resolveLocaleInput(requestedLocale ?? (await getDefaultLocale()) ?? null);
  const translation = itemTranslationMetadata(locale.locale);
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    supportContact,
    // Env-backed operator/processor facts for privacy/terms/support pages.
    // The client merges over DEFAULT_LEGAL_CONFIG; unset values keep showing
    // the review banner until the owner configures them.
    legal: getLegalConfig(),
    locale: {
      requested: locale.requested,
      canonical: locale.locale,
      legacyAlias: locale.legacyAlias,
      status: translation.status,
      translationVersion: translation.translationVersion,
    },
    test: await getPublicTestConfigAsync(),
  }, { headers: { "Cache-Control": "public, max-age=60" } });
}
