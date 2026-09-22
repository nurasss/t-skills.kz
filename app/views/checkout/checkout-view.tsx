"use client";

import { ArrowRight, SectionHeading } from "@/app/views/shared/section-heading";
import type { PublicCatalog, View } from "@/app/orbita-view-types";
import { useSiteLang, SiteLangToggle } from "@/lib/site-lang";
import { CHECKOUT_STRINGS } from "@/lib/site-strings";

export type CheckoutViewProps = {
  onNavigate: (view: View) => void;
  onCheckout: () => void;
  promoCode: string;
  onPromoCodeChange: (value: string) => void;
  busy: boolean;
  error?: string;
  catalog?: PublicCatalog;
};

export function CheckoutView({ onNavigate, onCheckout, promoCode, onPromoCodeChange, busy, error, catalog }: CheckoutViewProps) {
  const [lang, setLang] = useSiteLang();
  const t = CHECKOUT_STRINGS[lang];
  const test = catalog?.test;
  const displayedPrice =
    test?.amountMinor !== null && test?.amountMinor !== undefined
      ? new Intl.NumberFormat(lang === "kk" ? "kk-KZ" : "ru-RU", { style: "currency", currency: test.currency }).format(test.amountMinor / 100)
      : t.noPrice;
  const checkoutAvailable = Boolean(test?.availableForCheckout);
  const betaFree = test?.accessMode === "beta-free";

  return (
    <div className="orbita-view ov-checkout">
      <div className="ov-container">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button className="ov-back-link" onClick={() => onNavigate("detail")} type="button">
            {t.back}
          </button>
          <SiteLangToggle lang={lang} onLang={setLang} />
        </div>

        <SectionHeading
          eyebrow={betaFree ? t.eBeta : t.ePay}
          title={betaFree ? t.tBeta : t.tPay}
          body={
            betaFree ? t.bBeta : t.bPay
          }
        />

        <div className="ov-two-col ov-checkout-grid">
          <article className="ov-card ov-checkout-card">
            <header className="ov-card-header">
              <h2 className="ov-card-title">T-Skills</h2>
              <p className="ov-card-desc">{test?.assessmentVersion ?? "orbita30_ru_v2"} · pilot / unvalidated</p>
            </header>

            <ul className="ov-checkout-lines">
              <li><span>{t.lAssess}</span><strong>{t.vAccess}</strong></li>
              <li><span>{t.lResult}</span><strong>{t.vResult}</strong></li>
              <li><span>{betaFree ? t.lMode : t.lPayType}</span><strong>{betaFree ? t.vPilot : t.vOnce}</strong></li>
            </ul>

            <div className="ov-checkout-total">
              <span>{betaFree ? t.tCost : t.tToPay(test?.currency ?? "—")}</span>
              <strong>{betaFree ? t.vFree : displayedPrice}</strong>
            </div>

            {!betaFree ? (
              <label className="ov-form-field" style={{ marginBottom: 18 }}>
                <span>{t.promoLabel}</span>
                <input
                  className="ov-form-input"
                  autoComplete="off"
                  maxLength={64}
                  placeholder={t.promoPlaceholder}
                  value={promoCode}
                  onChange={(event) => onPromoCodeChange(event.target.value.toUpperCase())}
                />
                <small>{t.promoHelp}</small>
              </label>
            ) : null}

            <button
              className="ov-btn ov-btn-primary ov-btn-block"
              disabled={busy || (!betaFree && !checkoutAvailable)}
              onClick={onCheckout}
              type="button"
            >
              {busy ? t.btnBusy : betaFree ? t.btnBeta : checkoutAvailable ? t.btnPay : t.btnOff}
              <ArrowRight />
            </button>

            {!catalog ? (
              <p className="ov-note">{t.checking}</p>
            ) : !betaFree && !checkoutAvailable ? (
              <p className="ov-note">
                {t.paySoon}
              </p>
            ) : null}

            {error ? <p className="ov-note ov-note-error">{error}</p> : null}

            <p className="ov-checkout-micro">
              <CheckoutLockIcon /> {betaFree ? t.microBeta : t.microPay}
            </p>
          </article>

          <aside className="ov-checkout-guardrails">
            <article className="ov-checkout-guardrail">
              <CheckoutIconShield />
              <div>
                <strong>{betaFree ? t.g1tBeta : t.g1tPay}</strong>
                <p>{betaFree ? t.g1bBeta : t.g1bPay}</p>
              </div>
            </article>
            <article className="ov-checkout-guardrail">
              <CheckoutIconRefresh />
              <div>
                <strong>{betaFree ? t.g2tBeta : t.g2tPay}</strong>
                <p>{betaFree ? t.g2bBeta : t.g2bPay}</p>
              </div>
            </article>
            <article className="ov-checkout-guardrail">
              <CheckoutIconDoc />
              <div>
                <strong>{betaFree ? t.g3tBeta : t.g3tPay}</strong>
                <p>{betaFree ? t.g3bBeta : t.g3bPay}</p>
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
