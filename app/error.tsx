"use client";

import { useEffect } from "react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("orbita_render_error", { hasReset: Boolean(reset) });
  }, [reset]);
  return (
    <main className="not-found-page">
      <div className="not-found-card">
        <span className="eyebrow">ВРЕМЕННО НЕДОСТУПНО</span>
        <h1>Не удалось открыть этот экран.</h1>
        <p>Попробуйте ещё раз. Сохранённые данные не должны измениться.</p>
        <button className="not-found-primary" type="button" onClick={() => reset()}>Повторить</button>
      </div>
    </main>
  );
}
