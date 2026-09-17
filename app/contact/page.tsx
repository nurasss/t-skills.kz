import type { Metadata } from "next";
import Link from "next/link";

import { getLegalConfig } from "@/lib/legal-config";

export const metadata: Metadata = {
  title: "Контакты · T-Skills",
  description: "Контактные данные оператора и каналы поддержки T-Skills.",
  alternates: { canonical: "/contact" },
};

export const dynamic = "force-dynamic";

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function ContactPage() {
  const config = getLegalConfig();
  return (
    <main className="legal-contact-page">
      <div className="legal-contact-card">
        <Link href="/" className="legal-contact-brand">T-Skills</Link>
        <p className="eyebrow">КОНТАКТЫ</p>
        <h1>Связаться с оператором.</h1>
        <dl>
          <div><dt>Оператор</dt><dd>{config.entityName}</dd></div>
          <div><dt>E-mail</dt><dd>{isEmail(config.supportContact) ? <a href={`mailto:${config.supportContact}`}>{config.supportContact}</a> : config.supportContact}</dd></div>
          <div><dt>Адрес</dt><dd>{config.contactAddress}</dd></div>
          <div><dt>Телефон</dt><dd>{config.contactPhone}</dd></div>
        </dl>
        <p className="legal-contact-note">Для обращения по аккаунту достаточно указать e-mail и идентификатор заказа или сессии. Пароль и полный набор ответов отправлять не нужно.</p>
        <p><Link href="/privacy">Политика конфиденциальности</Link> · <Link href="/terms">Условия использования</Link></p>
      </div>
    </main>
  );
}
