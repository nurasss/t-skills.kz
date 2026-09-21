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

const CONTACT_T = {
  ru: {
    eyebrow: "КОНТАКТЫ", h1: "Связаться с оператором.",
    operator: "Оператор", address: "Адрес", phone: "Телефон",
    note: "Для обращения по аккаунту достаточно указать e-mail и идентификатор заказа или сессии. Пароль и полный набор ответов отправлять не нужно.",
    privacy: "Политика конфиденциальности", terms: "Условия использования",
  },
  kk: {
    eyebrow: "БАЙЛАНЫСТАР", h1: "Оператормен байланысу.",
    operator: "Оператор", address: "Мекенжай", phone: "Телефон",
    note: "Аккаунт бойынша өтініш үшін e-mail мен тапсырыс немесе сессия идентификаторын көрсету жеткілікті. Құпиясөз бен жауаптардың толық жинағын жіберудің қажеті жоқ.",
    privacy: "Құпиялылық саясаты", terms: "Пайдалану шарттары",
  },
} as const;

export default function ContactPage({ searchParams }: { searchParams?: { lang?: string } }) {
  const kk = searchParams?.lang === "kk";
  const t = kk ? CONTACT_T.kk : CONTACT_T.ru;
  const config = getLegalConfig();
  return (
    <main className="legal-contact-page">
      <div className="legal-contact-card">
        <Link href="/" className="legal-contact-brand">T-Skills</Link>
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.h1}</h1>
        <dl>
          <div><dt>{t.operator}</dt><dd>{config.entityName}</dd></div>
          <div><dt>E-mail</dt><dd>{isEmail(config.supportContact) ? <a href={`mailto:${config.supportContact}`}>{config.supportContact}</a> : config.supportContact}</dd></div>
          <div><dt>{t.address}</dt><dd>{config.contactAddress}</dd></div>
          <div><dt>{t.phone}</dt><dd>{config.contactPhone}</dd></div>
        </dl>
        <p className="legal-contact-note">{t.note}</p>
        <p><Link href={kk ? "/privacy?lang=kk" : "/privacy"}>{t.privacy}</Link> · <Link href={kk ? "/terms?lang=kk" : "/terms"}>{t.terms}</Link> · <Link href={kk ? "/contact" : "/contact?lang=kk"}>{kk ? "RU" : "ҚЗ"}</Link></p>
      </div>
    </main>
  );
}
