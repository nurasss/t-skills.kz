import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Спасибо за оплату · T-Skills",
  description: "Платёж получен. Проверьте доступ к оценке в личном кабинете.",
  alternates: { canonical: "/thank-you" },
  robots: { index: false, follow: false },
};

const THANK_T = {
  ru: { eyebrow: "ОПЛАТА ПОЛУЧЕНА", h1: "Спасибо. Следующий шаг — личный кабинет.", body: "Платёжный провайдер ещё может подтверждать событие. Доступ появится после серверной проверки webhook.", open: "Открыть кабинет", help: "Нужна помощь?" },
  kk: { eyebrow: "ТӨЛЕМ АЛЫНДЫ", h1: "Рақмет. Келесі қадам — жеке кабинет.", body: "Төлем провайдері оқиғаны әлі растап жатқан болуы мүмкін. Қолжетімділік webhook серверлік тексеруден кейін пайда болады.", open: "Кабинетті ашу", help: "Көмек керек пе?" },
} as const;

export default function ThankYouPage({ searchParams }: { searchParams?: { lang?: string } }) {
  const t = (searchParams?.lang === "kk" ? THANK_T.kk : THANK_T.ru);
  return (
    <main className="not-found-page">
      <div className="not-found-card">
        <span className="eyebrow">{t.eyebrow}</span>
        <h1>{t.h1}</h1>
        <p>{t.body}</p>
        <div className="not-found-actions">
          <Link className="not-found-primary" href="/account">{t.open}</Link>
          <Link href="/support">{t.help}</Link>
        </div>
      </div>
    </main>
  );
}
