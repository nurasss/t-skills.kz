"use client";

import { ArrowRight, SectionHeading } from "@/app/views/shared/section-heading";
import type { PublicCatalog, View } from "@/app/orbita-view-types";

export type CheckoutViewProps = {
  onNavigate: (view: View) => void;
  onCheckout: () => void;
  busy: boolean;
  error?: string;
  catalog?: PublicCatalog;
};

export function CheckoutView({ onNavigate, onCheckout, busy, error, catalog }: CheckoutViewProps) {
  const test = catalog?.test;
  const displayedPrice =
    test?.amountMinor !== null && test?.amountMinor !== undefined
      ? new Intl.NumberFormat("ru-RU", { style: "currency", currency: test.currency }).format(test.amountMinor / 100)
      : "Цена ещё не настроена";
  const checkoutAvailable = Boolean(test?.availableForCheckout);
  const betaFree = test?.accessMode === "beta-free";

  return (
    <div className="orbita-view ov-checkout">
      <div className="ov-container">
        <button className="ov-back-link" onClick={() => onNavigate("detail")} type="button">
          ← T-Skills
        </button>

        <SectionHeading
          eyebrow={betaFree ? "Закрытая beta" : "Checkout"}
          title={betaFree ? "Бесплатное пилотное тестирование" : "Оформление теста"}
          body={
            betaFree
              ? "Доступ предоставляется участникам закрытой beta без оплаты. Результаты не являются нормативной или диагностической оценкой."
              : "После подтверждения оплаты создаётся одноразовый доступ к конкретной версии оценки."
          }
        />

        <div className="ov-two-col ov-checkout-grid">
          <article className="ov-card ov-checkout-card">
            <header className="ov-card-header">
              <h2 className="ov-card-title">T-Skills</h2>
              <p className="ov-card-desc">{test?.assessmentVersion ?? "orbita30_ru_v2"} · pilot / unvalidated</p>
            </header>

            <ul className="ov-checkout-lines">
              <li><span>Оценка</span><strong>1 доступ</strong></li>
              <li><span>Результат</span><strong>Dashboard + PDF</strong></li>
              <li><span>{betaFree ? "Режим" : "Тип оплаты"}</span><strong>{betaFree ? "пилотная версия" : "один раз"}</strong></li>
            </ul>

            <div className="ov-checkout-total">
              <span>{betaFree ? "Стоимость участия" : `К оплате · ${test?.currency ?? "—"}`}</span>
              <strong>{betaFree ? "Бесплатно" : displayedPrice}</strong>
            </div>

            <button
              className="ov-btn ov-btn-primary ov-btn-block"
              disabled={busy || (!betaFree && !checkoutAvailable)}
              onClick={onCheckout}
              type="button"
            >
              {busy
                ? "Создаём доступ…"
                : betaFree
                  ? "Начать закрытое тестирование"
                  : checkoutAvailable
                    ? "Перейти к защищённой оплате"
                    : "Оплата пока недоступна"}
              <ArrowRight />
            </button>

            {!catalog ? (
              <p className="ov-note">Проверяем доступ…</p>
            ) : !betaFree && !checkoutAvailable ? (
              <p className="ov-note">
                Оплата станет доступна после настройки цены и Stripe в production.
              </p>
            ) : null}

            {error ? <p className="ov-note ov-note-error">{error}</p> : null}

            <p className="ov-checkout-micro">
              <CheckoutLockIcon /> {betaFree
                ? "Доступ только по приглашению. Платёжные данные не требуются."
                : "Hosted checkout: карточные данные не проходят через backend T-Skills."}
            </p>
          </article>

          <aside className="ov-checkout-guardrails">
            <article className="ov-checkout-guardrail">
              <CheckoutIconShield />
              <div>
                <strong>{betaFree ? "Закрытый доступ" : "Подтверждённый webhook"}</strong>
                <p>{betaFree
                  ? "Войти могут только приглашённые участники."
                  : "Entitlement создаётся только после signed provider event."}</p>
              </div>
            </article>
            <article className="ov-checkout-guardrail">
              <CheckoutIconRefresh />
              <div>
                <strong>{betaFree ? "Beta entitlement" : "Идемпотентная оплата"}</strong>
                <p>{betaFree
                  ? "Бесплатный grant хранится отдельно и не считается оплатой."
                  : "Повтор одного события не создаёт второй доступ."}</p>
              </div>
            </article>
            <article className="ov-checkout-guardrail">
              <CheckoutIconDoc />
              <div>
                <strong>{betaFree ? "Пилотные ограничения" : "Order snapshot"}</strong>
                <p>{betaFree
                  ? "Профиль экспериментальный, unvalidated и не содержит percentiles."
                  : "Версия теста, цена и валюта сохраняются вместе с заказом."}</p>
              </div>
            </article>
          </aside>
        </div>
      </div>
    </div>
  );
}

function CheckoutLockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

function CheckoutIconShield() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 3l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z" strokeLinejoin="round" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function CheckoutIconRefresh() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
    </svg>
  );
}

function CheckoutIconDoc() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6" strokeLinejoin="round" />
    </svg>
  );
}
