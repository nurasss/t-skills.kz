"use client";

import { useState } from "react";
import { ArrowRight, SectionHeading } from "@/app/views/shared/section-heading";
import type { PublicCatalog, View } from "@/app/orbita-view-types";
import { useSiteLang } from "@/lib/site-lang";
import { CHECKOUT_STRINGS } from "@/lib/site-strings";
import { ApiClientError, apiJson } from "@/app/orbita-api";

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
  const [lang] = useSiteLang();
  const t = CHECKOUT_STRINGS[lang];
  const test = catalog?.test;
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [promoStatus, setPromoStatus] = useState<{ valid: boolean; message: string; freeAccess?: boolean } | null>(null);

  const displayedPrice =
    test?.amountMinor !== null && test?.amountMinor !== undefined
      ? new Intl.NumberFormat(lang === "kk" ? "kk-KZ" : "ru-RU", { style: "currency", currency: test.currency }).format(test.amountMinor / 100)
      : t.noPrice;
  const checkoutAvailable = Boolean(test?.availableForCheckout);
  const betaFree = test?.accessMode === "beta-free";

  const handleApplyPromo = async () => {
    const trimmed = promoCode.trim();
    if (!trimmed) {
      setPromoStatus(null);
      return;
    }
    setValidatingPromo(true);
    setPromoStatus(null);
    try {
      const res = await apiJson<{
        valid: boolean;
        code: string;
        name: string;
        discountType: string;
        discountValue: number;
        freeAccess: boolean;
        message: string;
      }>("/api/checkout/validate-promo", {
        method: "POST",
        body: JSON.stringify({ code: trimmed, test_id: test?.id ?? "t-skills" }),
      });
      setPromoStatus({
        valid: true,
        message: res.message || (lang === "kk" ? "Промокод жарамды" : "Промокод действителен"),
        freeAccess: res.freeAccess,
      });
    } catch (err) {
      setPromoStatus({
        valid: false,
        message: err instanceof ApiClientError ? err.message : (lang === "kk" ? "Промокод жарамсыз" : "Промокод не найден или недействителен"),
      });
    } finally {
      setValidatingPromo(false);
    }
  };

  return (
    <main className="orbita-view ov-checkout">
      <div className="ov-container">
        <button className="ov-back-link" onClick={() => onNavigate("detail")} type="button">
          {t.back}
        </button>

        <SectionHeading
          level={1}
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
              <span>{betaFree || promoStatus?.freeAccess ? t.tCost : t.tToPay(test?.currency ?? "—")}</span>
              <strong>{betaFree || promoStatus?.freeAccess ? t.vFree : displayedPrice}</strong>
            </div>

            <button
              className="ov-btn ov-btn-primary ov-btn-block"
              disabled={busy || (!betaFree && !checkoutAvailable && !promoStatus?.freeAccess)}
              onClick={onCheckout}
              type="button"
            >
              {busy ? t.btnBusy : (betaFree || promoStatus?.freeAccess) ? t.btnBeta : checkoutAvailable ? t.btnPay : t.btnOff}
              <ArrowRight />
            </button>

            <div className="ov-checkout-promo-box">
              <label className="ov-form-field" style={{ marginBottom: 0 }}>
                <div className="ov-checkout-promo-head">
                  <span>{t.promoLabel}</span>
                  {promoStatus?.valid && (
                    <span className="ov-checkout-promo-applied">
                      <CheckIcon /> {t.promoApplied}
                    </span>
                  )}
                </div>
                <div className="ov-checkout-promo-row">
                  <input
                    id="checkout-promo-code"
                    name="promo_code"
                    className="ov-form-input"
                    autoComplete="off"
                    maxLength={64}
                    placeholder={t.promoPlaceholder}
                    value={promoCode}
                    onChange={(event) => {
                      onPromoCodeChange(event.target.value.toUpperCase());
                      if (promoStatus) setPromoStatus(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleApplyPromo();
                      }
                    }}
                    disabled={busy || validatingPromo}
                  />
                  <button
                    type="button"
                    className="ov-btn ov-btn-secondary ov-checkout-promo-btn"
                    onClick={handleApplyPromo}
                    disabled={busy || validatingPromo || !promoCode.trim()}
                  >
                    {validatingPromo ? "…" : t.promoApply}
                  </button>
                </div>
                {promoStatus?.message ? (
                  <p className={`ov-checkout-promo-msg ${promoStatus.valid ? "is-success" : "is-error"}`}>
                    {promoStatus.valid ? <CheckIcon /> : <AlertCircleIcon />}
                    <span>{promoStatus.message}</span>
                  </p>
                ) : (
                  <small className="ov-checkout-promo-hint">{t.promoHelp}</small>
                )}
              </label>
            </div>

            {!catalog ? (
              <p className="ov-note">{t.checking}</p>
            ) : !betaFree && !checkoutAvailable && !promoStatus?.freeAccess ? (
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
    </main>
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

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function AlertCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
