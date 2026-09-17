"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";

import { apiJson, ApiClientError } from "@/app/orbita-api";

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
          .catch((requestError) => setError(requestError instanceof ApiClientError ? requestError.message : "Не удалось подтвердить e-mail."))
          .finally(() => setBusy(false));
      }
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const heading = useMemo(() => {
    if (mode === "register") return "Создайте аккаунт";
    if (mode === "verify") return "Подтверждаем e-mail";
    if (mode === "reset-request") return "Восстановите доступ";
    if (mode === "reset") return "Создайте новый пароль";
    return "С возвращением";
  }, [mode]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    if (mode === "register" && (!termsAccepted || !privacyAccepted)) {
      setError("Чтобы создать аккаунт, примите условия использования и подтвердите ознакомление с политикой конфиденциальности.");
      setBusy(false);
      return;
    }
    try {
      if (mode === "login") {
        const result = await apiJson<{ redirect_to?: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password, return_to: returnTo }) });
        window.location.assign(result.redirect_to ?? returnTo);
      } else if (mode === "register") {
        const result = await apiJson<{ message: string }>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, password_confirmation: confirmation, terms_consent: termsAccepted, privacy_consent: privacyAccepted, invite_token: inviteToken || undefined, return_to: returnTo }) });
        setMessage(result.message);
      } else if (mode === "reset-request") {
        const result = await apiJson<{ message: string }>("/api/auth/request-password-reset", { method: "POST", body: JSON.stringify({ email }) });
        setMessage(result.message);
      } else if (mode === "reset") {
        const result = await apiJson<{ message: string }>("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password, password_confirmation: confirmation }) });
        setMessage(result.message);
        setPassword("");
        setConfirmation("");
        setMode("login");
      }
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : "Не удалось выполнить запрос.");
    } finally {
      setBusy(false);
    }
  };

  const resendVerification = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiJson<{ message: string }>("/api/auth/request-verification", { method: "POST", body: JSON.stringify({ email }) });
      setMessage(result.message);
    } catch (requestError) {
      setError(requestError instanceof ApiClientError ? requestError.message : "Не удалось отправить письмо.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <a className="auth-skip-link" href="#auth-form">Перейти к форме</a>
      <div className="auth-shell">
        <Link className="auth-brand" href="/" aria-label="T-Skills, на главную">
          <span className="auth-brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span>T-Skills</span>
        </Link>
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="auth-card-head">
            <span className="auth-eyebrow">Личный кабинет</span>
            <h1 id="auth-title">{heading}</h1>
            <p>{mode === "register" ? "Сначала подтвердите e-mail. Это защищает доступ к вашему профилю и отчётам." : mode === "reset-request" ? "Мы отправим ссылку на адрес, связанный с аккаунтом." : mode === "reset" ? "Ссылка действует ограниченное время и используется один раз." : "Войдите, чтобы продолжить оценку или открыть свои результаты."}</p>
          </div>

          <form id="auth-form" onSubmit={submit} noValidate>
            {mode !== "reset" && mode !== "verify" ? (
              <div className="auth-field">
                <label htmlFor="auth-email">E-mail</label>
                <input id="auth-email" type="email" name="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} />
              </div>
            ) : null}
            {mode !== "reset-request" && mode !== "verify" ? (
              <div className="auth-field">
                <label htmlFor="auth-password">Пароль</label>
                <input id="auth-password" type="password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={128} aria-describedby={mode !== "login" ? "password-help" : undefined} />
                {mode !== "login" ? <small id="password-help">Минимум 12 символов.</small> : null}
              </div>
            ) : null}
            {mode === "register" || mode === "reset" ? (
              <div className="auth-field">
                <label htmlFor="auth-password-confirmation">Повторите пароль</label>
                <input id="auth-password-confirmation" type="password" name="password_confirmation" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={12} maxLength={128} />
              </div>
            ) : null}
            {mode === "register" ? (
              <div className="auth-field">
                <label htmlFor="auth-invite-token">Код приглашения</label>
                <input id="auth-invite-token" type="text" name="invite_token" autoComplete="off" value={inviteToken} onChange={(event) => setInviteToken(event.target.value)} required maxLength={256} aria-describedby="invite-help" />
                <small id="invite-help">Для beta-регистрации нужен персональный код из приглашения.</small>
              </div>
            ) : null}
            {mode === "register" ? (
              <fieldset className="auth-consents">
                <legend>Согласия для аккаунта</legend>
                <label className="auth-consent-row">
                  <input type="checkbox" name="terms_consent" checked={termsAccepted} required onChange={(event) => setTermsAccepted(event.target.checked)} />
                  <span>Я принимаю <Link href="/terms">условия использования</Link>.</span>
                </label>
                <label className="auth-consent-row">
                  <input type="checkbox" name="privacy_consent" checked={privacyAccepted} required onChange={(event) => setPrivacyAccepted(event.target.checked)} />
                  <span>Я ознакомился(ась) с <Link href="/privacy">политикой конфиденциальности</Link>.</span>
                </label>
              </fieldset>
            ) : null}
            {mode === "reset" ? (
              <input type="hidden" name="token" value={token} />
            ) : null}

            {error ? <p className="auth-error" role="alert">{error}</p> : null}
            {message ? <p className="auth-success" role="status">{message}</p> : null}

            {mode !== "verify" ? <button className="auth-submit" type="submit" disabled={busy} aria-busy={busy}>
              {busy ? "Проверяем…" : mode === "login" ? "Войти" : mode === "register" ? "Создать аккаунт" : mode === "reset-request" ? "Отправить ссылку" : "Сохранить новый пароль"}
            </button> : <p className="auth-success" role="status">{busy ? "Проверяем ссылку…" : "Ссылка недействительна. Запросите новое письмо."}</p>}
          </form>

          <div className="auth-links">
            {mode === "login" ? <button type="button" onClick={() => { setMode("reset-request"); setError(null); setMessage(null); }}>Забыли пароль?</button> : null}
            {mode !== "login" ? <button type="button" onClick={() => { setMode("login"); setError(null); setMessage(null); }}>Вернуться ко входу</button> : null}
            {mode === "login" ? <button type="button" onClick={() => { setMode("register"); setError(null); setMessage(null); }}>Создать аккаунт</button> : null}
            {mode === "register" ? <button type="button" onClick={() => void resendVerification()} disabled={busy}>Отправить письмо ещё раз</button> : null}
          </div>
        </section>
        <p className="auth-legal">Для создания аккаунта потребуется принять <Link href="/terms">условия использования</Link> и подтвердить ознакомление с <Link href="/privacy">политикой конфиденциальности</Link>.</p>
      </div>
    </main>
  );
}
