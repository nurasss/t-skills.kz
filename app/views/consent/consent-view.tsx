"use client";

import { ArrowRight, SectionHeading } from "@/app/views/shared/section-heading";

export type ConsentRow = {
  key: "terms" | "privacy" | "research" | "marketing";
  title: string;
  description: string;
  required: boolean;
  checked: boolean;
};

export type ConsentViewProps = {
  consents: { terms: boolean; privacy: boolean; research: boolean; marketing: boolean };
  onConsentChange: (key: "terms" | "privacy" | "research" | "marketing", value: boolean) => void;
  onBegin: () => void;
  onBack: () => void;
  onPrivacy: () => void;
};

export function ConsentView({ consents, onConsentChange, onBegin, onBack, onPrivacy }: ConsentViewProps) {
  const required = consents.terms && consents.privacy;

  const rows: ConsentRow[] = [
    {
      key: "terms",
      title: "Условия использования",
      description: "Я принимаю Terms и понимаю ограничения развивающего продукта.",
      required: true,
      checked: consents.terms,
    },
    {
      key: "privacy",
      title: "Обработка данных",
      description: "Я принимаю Privacy и минимизацию response data.",
      required: true,
      checked: consents.privacy,
    },
    {
      key: "research",
      title: "Research opt-in",
      description: "Разрешить использовать обезличенные данные для пилота.",
      required: false,
      checked: consents.research,
    },
    {
      key: "marketing",
      title: "Новости продукта",
      description: "Получать редкие обновления о новых версиях и исследованиях.",
      required: false,
      checked: consents.marketing,
    },
  ];

  return (
    <div className="orbita-view ov-consent">
      <div className="ov-container">
        <button className="ov-back-link" onClick={onBack} type="button">
          ← Вернуться
        </button>

        <SectionHeading
          eyebrow="Перед началом"
          title="Сначала — правила игры."
          body="Прочитайте, как используется оценка, и выберите отдельные согласия. Исследовательское и маркетинговое согласие не нужны для покупки."
        />

        <div className="ov-two-col ov-consent-grid">
          <article className="ov-card ov-consent-card">
            <header className="ov-card-header">
              <h2 className="ov-card-title">Согласия</h2>
              <p className="ov-card-desc">Версия текста: privacy-2026-09</p>
            </header>

            <div className="ov-consent-list">
              {rows.map((row) => (
                <label className="ov-consent-row" key={row.key}>
                  <ConsentCheckbox
                    checked={row.checked}
                    onChange={(v) => onConsentChange(row.key, v)}
                  />
                  <div className="ov-consent-row-text">
                    <strong>{row.title}</strong>
                    <p>{row.description}</p>
                  </div>
                  <span className={`ov-badge ${row.required ? "ov-badge-primary" : "ov-badge-outline"}`}>
                    {row.required ? "обязательно" : "необязательно"}
                  </span>
                </label>
              ))}
            </div>

            <button
              className="ov-btn ov-btn-primary ov-btn-block"
              disabled={!required}
              onClick={onBegin}
              type="button"
            >
              Открыть первый блок
              <ArrowRight />
            </button>

            {!required ? (
              <p className="ov-note">Отметьте два обязательных согласия, чтобы продолжить.</p>
            ) : null}
          </article>

          <aside className="ov-consent-side">
            <span className="ov-catalog-note-num">01</span>
            <h3>Ваш профиль строится из ответов, а не из догадок.</h3>
            <p>
              Имена, контакты и payment refs не передаются adaptive/report engine. После завершения
              доступен запрос на экспорт или удаление.
            </p>
            <button className="ov-link" onClick={onPrivacy} type="button">
              Открыть Privacy
              <ArrowRight size={14} />
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ConsentCheckbox({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={`ov-checkbox${checked ? " checked" : ""}`}
      onClick={() => onChange(!checked)}
    >
      {checked ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
          <polyline points="4 12 10 18 20 6" />
        </svg>
      ) : null}
    </button>
  );
}
