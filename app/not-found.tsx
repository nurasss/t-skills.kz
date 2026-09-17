import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Страница не найдена · T-Skills",
  description: "Запрошенная страница T-Skills не найдена.",
};

export default function NotFound() {
  return (
    <main className="not-found-page">
      <div className="not-found-card">
        <span className="eyebrow">404 · НЕ НАЙДЕНО</span>
        <h1>Эта страница ушла за горизонт.</h1>
        <p>Проверьте адрес или вернитесь к доступным разделам T-Skills.</p>
        <div className="not-found-actions">
          <Link className="not-found-primary" href="/">На главную</Link>
          <Link href="/tests">Открыть оценки</Link>
          <Link href="/support">Получить помощь</Link>
        </div>
      </div>
    </main>
  );
}
