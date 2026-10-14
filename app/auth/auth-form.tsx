"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";

import { apiJson, ApiClientError } from "@/app/orbita-api";
import { BrandIcon } from "@/app/brand/brand-icon";
import { useSiteLang } from "@/lib/site-lang";
import { AUTH_STRINGS } from "@/lib/site-strings";

import "./auth.css";

type Mode = "login" | "register" | "reset-request" | "reset" | "verify";

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/account";
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.pathname !== "/auth" ? `${url.pathname}${url.search}${url.hash}` : "/account";
  } catch {
    return "/account";
  }
}

export function AuthForm() {
  const [lang] = useSiteLang();
  const t = AUTH_STRINGS[lang];
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [token, setToken] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [returnTo, setReturnTo] = useState("/account");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const passwordsMismatch =
    (mode === "register" || mode === "reset") &&
    password.length > 0 &&
    confirmation.length > 0 &&
    password !== confirmation;

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const url = new URL(window.location.href);
      const params = url.searchParams;
      const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
      const requestedMode = params.get("mode") ?? fragment.get("mode");
      const requestedToken = params.get("token") ?? fragment.get("token");
      const requestedInviteToken = params.get("invite_token") ?? fragment.get("invite_token");
      if (requestedMode === "register" || requestedMode === "reset" || requestedMode === "login" || requestedMode === "verify") setMode(requestedMode);
      if (requestedMode === "reset" && requestedToken) setToken(requestedToken);
      if (requestedInviteToken) {
        setInviteToken(requestedInviteToken);
        setMode("register");
      }
      setReturnTo(safeReturnTo(params.get("return_to")));
      if (requestedToken || requestedInviteToken) {
        url.searchParams.delete("token");
        url.searchParams.delete("invite_token");
        url.hash = "";
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
      if (requestedMode === "verify" && requestedToken) {
        setBusy(true);
        void apiJson<{ redirect_to?: string }>("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: requestedToken }) })
          .then((result) => window.location.assign(result.redirect_to ?? "/account"))
          .catch((requestError) => setError(requestError instanceof ApiClientError ? requestError.message : t.verifyFail))
          .finally(() => setBusy(false));
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // URL разбирается один раз при монтировании; t.verifyFail нужен только для редкой ошибки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heading = useMemo(() => {
    if (mode === "register") return t.headingRegister;
    if (mode === "verify") return t.headingVerify;
    if (mode === "reset-request") return t.headingResetRequest;
    if (mode === "reset") return t.headingReset;
    return t.headingLogin;
  }, [mode, t]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    if (mode === "register" && (!termsAccepted || !privacyAccepted)) {
      setError(t.termsError);
      setBusy(false);
      return;
    }
    try {
      if (mode === "login") {
        const result = await apiJson<{ redirect_to?: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password, return_to: returnTo }) });
        window.location.assign(result.redirect_to ?? returnTo);
      } else if (mode === "register") {
        const result = await apiJson<{ message: string }>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, password_confirmation: confirmation, terms_consent: termsAccepted, privacy_consent: privacyAccepted, invite_token: inviteToken || undefined, return_to: returnTo, locale: lang }) });
        setMessage(result.message);
      } else if (mode === "reset-request") {
        const result = await apiJson<{ message: string }>("/api/auth/request-password-reset", { method: "POST", body: JSON.stringify({ email, locale: lang }) });
        setMessage(result.message);
      } else if (mode === "reset") {
        const result = await apiJson<{ message: string }>("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password, password_confirmation: confirmation }) });
        setMessage(result.message);
        setPassword("");
        setConfirmation("");
        setMode("login");
      }
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : t.requestFail);
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiJson<{ message: string }>("/api/auth/request-verification", { method: "POST", body: JSON.stringify({ email, locale: lang }) });
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : t.sendFail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <a className="auth-skip-link" href="#auth-form">{t.skip}</a>
      <div className="auth-shell">
        <Link className="auth-brand" href="/" aria-label={t.brand}>
          <BrandIcon size={28} />
          <span>T-Skills</span>
        </Link>
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-card-head">
            <span className="auth-eyebrow">{t.eyebrow}</span>
            <h1 id="auth-title">{heading}</h1>
            <p>{mode === "register" ? t.subRegister : mode === "reset-request" ? t.subResetRequest : mode === "reset" ? t.subReset : t.subLogin}</p>
          </div>

          <form id="auth-form" onSubmit={submit} noValidate>
            {mode !== "reset" && mode !== "verify" ? (
              <div className="auth-field">
                <label htmlFor="auth-email">E-mail</label>
                <input id="auth-email" type="email" name="email" autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
              </div>
            ) : null}
            {mode !== "reset-request" && mode !== "verify" ? (
              <div className="auth-field">
                <label htmlFor="auth-password">{t.password}</label>
                <div className="auth-password-wrap">
                  <input id="auth-password" type={showPassword ? "text" : "password"} name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={128} aria-describedby={mode !== "login" ? "password-help" : undefined} />
                  <button type="button" className="auth-password-toggle" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} aria-label={showPassword ? t.hide : t.show}>
                    {showPassword ? t.hide : t.show}
                  </button>
                </div>
                {mode !== "login" ? <small id="password-help">{t.min12}</small> : null}
              </div>
            ) : null}
            {mode === "register" || mode === "reset" ? (
              <div className="auth-field">
                <label htmlFor="auth-password-confirmation">{t.repeat}</label>
                <input id="auth-password-confirmation" type={showPassword ? "text" : "password"} name="password_confirmation" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={12} maxLength={128} aria-invalid={passwordsMismatch || undefined} />
                {passwordsMismatch ? <small className="auth-field-warning" role="status">{t.mismatch}</small> : null}
              </div>
            ) : null}
            {mode === "register" ? (
              <div className="auth-field">
                <label htmlFor="auth-invite-token">{t.invite}</label>
                <input id="auth-invite-token" type="text" name="invite_token" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="text" value={inviteToken} onChange={(event) => setInviteToken(event.target.value)} maxLength={256} aria-describedby="invite-help" />
                <small id="invite-help">{t.inviteHelp}</small>
              </div>
            ) : null}
            {mode === "register" ? (
              <fieldset className="auth-consents">
                <legend>{t.consents}</legend>
                <label className="auth-consent-row">
                  <input type="checkbox" name="terms_consent" checked={termsAccepted} required onChange={(event) => setTermsAccepted(event.target.checked)} />
                  <span>{t.termsRow} <Link href="/terms">{t.termsLink}</Link>.</span>
                </label>
                <label className="auth-consent-row">
                  <input type="checkbox" name="privacy_consent" checked={privacyAccepted} required onChange={(event) => setPrivacyAccepted(event.target.checked)} />
                  <span>{t.privacyRow} <Link href="/privacy">{t.privacyLink}</Link>.</span>
                </label>
              </fieldset>
            ) : null}
            {mode === "reset" ? (
              <input type="hidden" name="token" value={token} />
            ) : null}

            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            {message ? <p className="auth-success" role="status">{message}</p> : null}

            {mode !== "verify" ? <button className="auth-submit" type="submit" disabled={busy || passwordsMismatch} aria-busy={busy}>
              {busy ? t.checking : mode === "login" ? t.login : mode === "register" ? t.create : mode === "reset-request" ? t.sendLink : t.savePassword}
            </button> : <p className="auth-success" role="status">{busy ? t.checkingLink : t.invalidLink}</p>}
          </form>

          <div className="auth-links">
            {mode === "login" ? <button type="button" onClick={() => { setMode("reset-request"); setError(null); setMessage(null); }}>{t.forgot}</button> : null}
            {mode !== "login" ? <button type="button" onClick={() => { setMode("login"); setError(null); setMessage(null); }}>{t.backToLogin}</button> : null}
            {mode === "login" ? <button type="button" onClick={() => { setMode("register"); setError(null); setMessage(null); }}>{t.createAccount}</button> : null}
            {mode === "register" && (message || error) ? <button type="button" onClick={() => void resendVerification()} disabled={busy}>{t.resend}</button> : null}
          </div>
        </section>
        <p className="auth-legal">{t.legalPre} <Link href="/terms">{t.legalTerms}</Link> {t.legalMid} <Link href="/privacy">{t.legalPrivacy}</Link>{t.legalPost}</p>
      </div>
    </main>
  );
}
