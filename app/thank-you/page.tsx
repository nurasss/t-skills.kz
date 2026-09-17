import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Спасибо за оплату · T-Skills",
  description: "Платёж получен. Проверьте доступ к оценке в личном кабинете.",
  alternates: { canonical: "/thank-you" },
  robots: { index: false, follow: false },
};

export default function ThankYouPage() {
  return (
    <main className="not-found-page">
      <div className="not-found-card">
        <span className="eyebrow">ОПЛАТА ПОЛУЧЕНА</span>
        <h1>Спасибо. Следующий шаг — личный кабинет.</h1>
        <p>Платёжный провайдер ещё может подтверждать событие. Доступ появится после серверной проверки webhook.</p>
        <div className="not-found-actions">
          <Link className="not-found-primary" href="/account">Открыть кабинет</Link>
          <Link href="/support">Нужна помощь?</Link>
        </div>
      </div>
    </main>
  );
}
