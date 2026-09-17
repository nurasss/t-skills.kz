import type { Metadata } from "next";

import LegalDocumentPage from "../legal-document";

export const metadata: Metadata = {
  title: "Условия использования · T-Skills",
  description: "Правила использования T-Skills, ограничения результата и условия доступа.",
  alternates: { canonical: "/terms" },
};

export const dynamic = "force-dynamic";

export default function TermsPage() {
  return <LegalDocumentPage kind="terms" />;
}
