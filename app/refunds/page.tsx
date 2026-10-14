import type { Metadata } from "next";

import LegalDocumentPage from "../legal-document";

export const metadata: Metadata = {
  title: "Правила возврата средств · T-Skills",
  description: "Условия обращения за возвратом оплаты T-Skills.",
  alternates: { canonical: "/refunds" },
};

export const dynamic = "force-dynamic";

export default function RefundsPage({ searchParams }: { searchParams?: { lang?: string } }) {
  return <LegalDocumentPage kind="refunds" searchParams={searchParams} />;
}
