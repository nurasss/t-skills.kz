import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/db";
import { itemTranslationMetadata, resolveLocaleInput } from "@/lib/i18n";
import { getPublicTestConfig } from "@/lib/payment-provider";

export async function GET(request: Request) {
  const supportContact = getRuntimeEnv().SUPPORT_CONTACT?.trim() || null;
  const locale = resolveLocaleInput(new URL(request.url).searchParams.get("locale"));
  const translation = itemTranslationMetadata(locale.locale);
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    supportContact,
    locale: {
      requested: locale.requested,
      canonical: locale.locale,
      legacyAlias: locale.legacyAlias,
      status: translation.status,
      translationVersion: translation.translationVersion,
    },
    test: getPublicTestConfig(),
  }, { headers: { "Cache-Control": "public, max-age=60" } });
}
