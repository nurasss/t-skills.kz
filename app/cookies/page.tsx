import type { Metadata } from "next";

import { CookiePreferences } from "../cookie-banner";
import LegalDocumentPage from "../legal-document";

export const metadata: Metadata = {
  title: "Политика cookies · T-Skills",
  description: "Какие необходимые и необязательные cookies используются T-Skills и как изменить согласие.",
  alternates: { canonical: "/cookies" },
};

export const dynamic = "force-dynamic";

export default function CookiesPage() {
  return (
    <>
      <LegalDocumentPage kind="cookies" />
      <CookiePreferences />
    </>
  );
}
