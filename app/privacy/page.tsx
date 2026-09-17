import type { Metadata } from "next";

import LegalDocumentPage from "../legal-document";

export const metadata: Metadata = {
  title: "Политика конфиденциальности · T-Skills",
  description: "Как T-Skills собирает, использует, хранит и удаляет пользовательские данные.",
  alternates: { canonical: "/privacy" },
};

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return <LegalDocumentPage kind="privacy" />;
}
