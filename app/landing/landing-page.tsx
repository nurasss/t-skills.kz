"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Menu,
  Scale,
  ShieldCheck,
  X,
} from "lucide-react";
import type { View } from "@/app/orbita-view-types";
import { trackOptionalAnalytics } from "@/app/orbita-api";
import { BrandIcon } from "@/app/brand/brand-icon";
import { LANDING_QUALITIES_RU, MOCK_TOP5 } from "@/app/landing/content";
import "./landing.css";

/**
 * Лендинг Empirical Vanguard: белый канвас, Hanken Grotesk, ботанический
 * зелёный акцент. Копирайт — только проверенные факты продукта.
 */

export type LandingPageProps = {
  onNavigate: (view: View) => void;
  onDemo: () => void;
  requestError?: string | null;
  onDismissError?: () => void;
};

export function LandingPage({ onNavigate, onDemo, requestError, onDismissError }: LandingPageProps) {
  useSectionReveal();
  return (
    <div className="ev-landing">
      {requestError ? (
        <div className="ev-error" role="alert">
          <span>{requestError}</span>
          <button onClick={onDismissError} type="button" aria-label="Закрыть">
            ×
          </button>
        </div>
      ) : null}
      <a href="#main" className="ev-skip">
        Перейти к содержимому
      </a>
      <TopBar onNavigate={onNavigate} />
      <main id="main">
        <Hero onNavigate={onNavigate} onDemo={onDemo} />
        <StatsStrip />
        <WhatYouGet />
        <SampleReport onDemo={onDemo} />
        <HowItWorks onNavigate={onNavigate} />
        <Methodology />
        <UseCases />
        <FinalCta onNavigate={onNavigate} />
        <Faq />
      </main>
      <div className="ev-mobile-cta">
        <CtaButton onNavigate={onNavigate} position="mobile" />
      </div>
      <Footer onNavigate={onNavigate} />
    </div>
  );
}

function CtaButton({ onNavigate, position }: { onNavigate: (view: View) => void; position: string }) {
  return (
    <button
      className="ev-btn ev-btn-primary"
      onClick={() => {
        trackOptionalAnalytics({ name: "landing_cta_click", metadata: { position } });
        onNavigate("detail");
      }}
      type="button"
    >
      Пройти T-Skills
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  );
}

function TopBar({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [open, setOpen] = useState(false);
  const go = useCallback(
    (view: View) => () => {
      setOpen(false);
      onNavigate(view);
    },
    [onNavigate],
  );
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open ]);
  return (
    <header className="ev-topbar">
      <div className="ev-container ev-topbar-row">
        <a className="ev-brand" href="#main" aria-label="T-Skills — наверх">
          <BrandIcon size={30} />
          <span className="ev-brand-word">T-Skills</span>
        </a>
        <nav className="ev-nav" aria-label="Основная навигация">
          <a href="#how">Как это работает</a>
          <a href="#get">Что вы получите</a>
          <a href="#methodology">Методология</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="ev-topbar-actions">
          <button className="ev-login" onClick={go("account")} type="button">
            Войти
          </button>
          <span className="ev-topbar-cta">
            <CtaButton onNavigate={onNavigate} position="topbar" />
          </span>
          <button
            className="ev-burger"
            onClick={() => setOpen((v) => !v)}
            type="button"
            aria-expanded={open}
            aria-controls="ev-mobile-nav"
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
          >
            {open ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open ? (
        <>
          <button className="ev-backdrop" onClick={() => setOpen(false)} type="button" tabIndex={-1} aria-hidden="true" />
          <nav className="ev-mobile-nav" id="ev-mobile-nav" aria-label="Мобильная навигация">
            <a href="#how" onClick={() => setOpen(false)}>Как это работает</a>
            <a href="#get" onClick={() => setOpen(false)}>Что вы получите</a>
            <a href="#methodology" onClick={() => setOpen(false)}>Методология</a>
            <a href="#faq" onClick={() => setOpen(false)}>FAQ</a>
            <button onClick={go("account")} type="button">Войти в аккаунт</button>
            <CtaButton onNavigate={(v) => { setOpen(false); onNavigate(v); }} position="menu" />
          </nav>
        </>
      ) : null}
    </header>
  );
}

function Hero({ onNavigate, onDemo }: { onNavigate: (view: View) => void; onDemo: () => void }) {
  return (
    <section className="ev-hero">
      <div className="ev-container ev-hero-grid">
        <div className="ev-hero-copy">
          <h1>
            Поймите, в чём вы действительно <span className="ev-accent">сильны</span>
          </h1>
          <p className="ev-lede">
            T-Skills оценивает 25 качеств через 75 парных сравнений и показывает ваш индивидуальный
            профиль. Расчёт детерминирован; интерпретация — материал для рефлексии, а не диагноз.
          </p>
          <div className="ev-cta-row">
            <CtaButton onNavigate={onNavigate} position="hero" />
          </div>
          <p className="ev-meta">
            <Clock size={15} aria-hidden="true" />
            ≈ 15–20 минут / 75 вопросов / Web и PDF-отчёт
          </p>
        </div>
        <figure className="ev-hero-video">
          <video
            src="/media/t-skills-brag.mp4"
            poster="/media/t-skills-brag.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="Презентационное видео T-Skills: профиль сильных сторон за 20 секунд"
          />
          <figcaption>20 секунд о том, как это работает · пример данных вымышлен</figcaption>
        </figure>
      </div>
    </section>
  );
}

function StatsStrip() {
  const stats = [
    ["25", "Качеств в модели — полный профиль без сокращений"],
    ["75", "Вопросов: 67 сравнений и до 8 уточнений"],
    ["0", "Влияния ИИ на баллы: расчёт детерминирован"],
    ["24", "Страницы в PDF-отчёте полиграфического качества"],
  ];
  return (
    <section className="ev-strip" aria-label="Ключевые параметры">
      <div className="ev-container ev-strip-grid">
        {stats.map(([num, label]) => (
          <div key={label}>
            <strong>{num}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHead({ index, title, lead }: { index: string; title: string; lead?: string }) {
  return (
    <div className="ev-section-head">
      <span className="ev-section-index">{index}</span>
      <h2>{title}</h2>
      {lead ? <p>{lead}</p> : null}
    </div>
  );
}

function WhatYouGet() {
  const items = [
    {
      n: "01",
      title: "Ваш индивидуальный профиль",
      body: "Ранжирование всех 25 качеств: от ведущих драйверов, на которые стоит опираться, до нейтральных зон.",
    },
    {
      n: "02",
      title: "Детальная интерпретация",
      body: "Как каждое ведущее качество проявляется в решениях, стрессе и команде — и где возможна перегрузка.",
    },
    {
      n: "03",
      title: "Фокус и направления роста",
      body: "Рабочие контексты, в которых качества раскрываются, и наблюдаемые шаги на 30 дней.",
    },
    {
      n: "04",
      title: "Доступ к отчёту",
      body: "Интерактивная веб-версия в кабинете и PDF для разговора с руководителем, ментором или коучем.",
    },
  ];
  return (
    <section className="ev-section" id="get">
      <div className="ev-container">
        <SectionHead index="Что вы получите" title="Не просто результат теста, а рабочий инструмент" />
        <div className="ev-cards-4">
          {items.map((item) => (
            <article key={item.n}>
              <span className="ev-card-num">{item.n}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function SampleReport({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="ev-section ev-section-tint" id="sample">
      <div className="ev-container">
        <SectionHead index="Пример отчёта" title="Как выглядит ваш результат" lead="Фрагмент персонального досье: ведущие качества, интерпретация и план. Пример вымышлен." />
        <div className="ev-sample-grid">
          <div className="ev-sample-bars" aria-hidden="true">
            {MOCK_TOP5.map((item, i) => (
              <div key={item.name}>
                <span>{i + 1}. {item.name}</span>
                <div className="ev-bar"><span style={{ width: `${item.score}%` }} /></div>
                <strong>{item.score}%</strong>
              </div>
            ))}
          </div>
          <div className="ev-sample-text">
            <h3>Разбор без ярлыков</h3>
            <p>
              Каждое ведущее качество описывается через наблюдаемое поведение: как проявляется,
              где помогает и где может мешать. Без диагнозов и прогнозов судьбы.
            </p>
            <button className="ev-link" onClick={onDemo} type="button">
              Открыть живой пример результата
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks({ onNavigate }: { onNavigate: (view: View) => void }) {
  const steps = [
    { n: "01", title: "Отвечаете на вопросы", body: "Парные сравнения без правильных ответов. Выбираете то, как поступаете на самом деле.", meta: "≈ 15 минут, можно с паузой" },
    { n: "02", title: "Алгоритм считает", body: "Фиксированная модель взвешивает выборы. Одинаковые ответы всегда дают одинаковый расчёт.", meta: "Детерминировано" },
    { n: "03", title: "Получаете профиль", body: "Интерактивный отчёт в кабинете и PDF. Результаты сохраняются, доступны экспорт и удаление.", meta: "Web и PDF" },
  ];
  return (
    <section className="ev-section" id="how">
      <div className="ev-container">
        <SectionHead index="Как это работает" title="Три шага к пониманию своих сил" />
        <div className="ev-steps">
          {steps.map((step) => (
            <article key={step.n}>
              <span className="ev-card-num">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <span className="ev-step-meta">{step.meta}</span>
            </article>
          ))}
        </div>
        <QuestionMock />
        <div className="ev-steps-cta">
          <button
            className="ev-link"
            onClick={() => {
              trackOptionalAnalytics({ name: "landing_cta_click", metadata: { position: "how" } });
              onNavigate("detail");
            }}
            type="button"
          >
            Пройти T-Skills
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

function QuestionMock() {
  return (
    <div className="ev-qmock" role="img" aria-label="Пример парного вопроса T-Skills">
      <span className="ev-eyebrow">Пример вопроса · пара 14 из 75</span>
      <h3>Что вам ближе в рабочей ситуации?</h3>
      <div className="ev-qmock-cards">
        <div>
          <span className="ev-qmock-tag">Вариант А</span>
          <p>«Мне важно заранее составить подробный пошаговый план и следовать ему.»</p>
          <small>Фокус: структурирование процессов</small>
        </div>
        <div>
          <span className="ev-qmock-tag">Вариант Б</span>
          <p>«Мне комфортнее действовать по ситуации, быстро адаптируясь к обстоятельствам.»</p>
          <small>Фокус: динамическая адаптивность</small>
        </div>
      </div>
      <div className="ev-qmock-scale" aria-hidden="true">
        {["Намного ближе А", "Скорее А", "Одинаково", "Скорее Б", "Намного ближе Б"].map((label, i) => (
          <span key={label} className={i === 2 ? "on" : ""} title={label} />
        ))}
      </div>
      <p className="ev-qmock-note">Верных и неверных ответов нет — оценивается естественное рабочее поведение.</p>
    </div>
  );
}

function Methodology() {
  const badges = [
    { icon: <Scale size={20} aria-hidden="true" />, title: "Forced-choice методика", body: "Выбор между двумя равноценными утверждениями снижает влияние социальной желательности по сравнению со шкалой Ликерта." },
    { icon: <ShieldCheck size={20} aria-hidden="true" />, title: "Детерминированный расчёт", body: "Веса и формулы фиксированы. Одинаковые ответы всегда дают одинаковый результат — без магии и случайности." },
    { icon: <ShieldCheck size={20} aria-hidden="true" />, title: "25 измеряемых качеств", body: "Когнитивный, коммуникативный, творческий и волевой контуры. Ни одно качество не «лучше» другого." },
  ];
  return (
    <section className="ev-section ev-section-tint" id="methodology">
      <div className="ev-container">
        <SectionHead index="Методология" title="Методика, а не генерация выводов" lead="Платформа опирается на методику вынужденного выбора. Все веса зафиксированы." />
        <div className="ev-badges">
          {badges.map((badge) => (
            <article key={badge.title}>
              <span className="ev-badge-icon">{badge.icon}</span>
              <h3>{badge.title}</h3>
              <p>{badge.body}</p>
            </article>
          ))}
        </div>
        <div className="ev-qualities">
          <h3>25 качеств модели</h3>
          <ul>
            {LANDING_QUALITIES_RU.map((q, i) => (
              <li key={q.name} title={q.description}>
                <span>{String(i + 1).padStart(2, "0")}</span> {q.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function UseCases() {
  const cases = [
    { title: "Выбираю направление", body: "Для старта карьеры или смены специализации: увидеть драйверы и трек, где сильные стороны станут преимуществом.", meta: "Старт · смена трека" },
    { title: "Хочу понять себя", body: "Инвентаризация опыта и условий, в которых вы работаете лучше всего.", meta: "Mid / Senior" },
    { title: "Готовлюсь к шагу", body: "Оценка готовности к руководству и масштабированию: делегирование, баланс команды.", meta: "Рост роли" },
  ];
  return (
    <section className="ev-section">
      <div className="ev-container">
        <SectionHead index="Применение" title="В каких ситуациях помогает" />
        <div className="ev-cards-3">
          {cases.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <span className="ev-step-meta">{item.meta}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <section className="ev-final">
      <div className="ev-container ev-final-grid">
        <div>
          <span className="ev-eyebrow light">Прямой доступ</span>
          <h2>Увидьте свой профиль целиком</h2>
          <p>75 вопросов. 25 качеств. Один результат для карьерных решений — без подписок и автосписаний.</p>
          <CtaButton onNavigate={onNavigate} position="finale" />
          <p className="ev-final-note">Понадобится аккаунт — регистрация займёт минуту.</p>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const items = [
    {
      q: "Сколько времени занимает прохождение?",
      a: "В среднем 15–20 минут в спокойном темпе. Можно делать паузы: каждый ответ сохраняется сразу, продолжение — с того же места.",
    },
    {
      q: "Сколько вопросов и какой они формы?",
      a: "75 вопросов: 67 парных сравнений («что вам ближе») и до 8 карьерных уточнений с вариантами. Правильных и неправильных ответов нет.",
    },
    {
      q: "Можно ли вернуться к результату позже?",
      a: "Да. Отчёт хранится в личном кабинете согласно политике хранения; доступны экспорт и удаление данных. PDF можно скачать в любой момент.",
    },
    {
      q: "Что входит в итоговый отчёт?",
      a: "Ранжирование всех 25 качеств, разбор ведущих качеств с примерами поведения, рабочие условия, команда и план на 30 дней, плюс 24-страничный PDF.",
    },
    {
      q: "Как рассчитывается результат?",
      a: "Детерминированный алгоритм: одинаковые ответы всегда дают одинаковый расчёт. Баллы считает математика, ИИ используется только для объяснения результата человеческим языком — и никогда не выбирает за вас.",
    },
    {
      q: "Что происходит с моими данными?",
      a: "Ответы привязаны к вашему аккаунту и используются только для расчёта профиля. Экспорт и удаление — в личном кабинете. Данные не передаются работодателям.",
    },
  ];
  return (
    <section className="ev-section ev-section-narrow" id="faq">
      <div className="ev-container">
        <SectionHead index="FAQ" title="Часто задаваемые вопросы" />
        <div className="ev-faq">
          {items.map((item, i) => (
            <details key={item.q} open={i === 0}>
              <summary>
                <span>{item.q}</span>
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <footer className="ev-footer">
      <div className="ev-container">
        <div className="ev-footer-grid">
          <div>
            <span className="ev-brand">
              <BrandIcon size={28} />
              <span className="ev-brand-word">T-Skills</span>
            </span>
            <p>Развивающая оценка для рефлексии и разговора о рабочих условиях.</p>
          </div>
          <nav aria-label="Продукт">
            <h4>Продукт</h4>
            <a href="#how">Как это работает</a>
            <a href="#get">Что вы получите</a>
            <a href="#faq">FAQ</a>
          </nav>
          <nav aria-label="Ресурсы">
            <h4>Ресурсы</h4>
            <button onClick={() => onNavigate("methodology")} type="button">Методология</button>
            <button onClick={() => onNavigate("support")} type="button">Поддержка</button>
          </nav>
          <nav aria-label="Правовое">
            <h4>Правовое</h4>
            <Link href="/privacy">Конфиденциальность</Link>
            <Link href="/terms">Условия</Link>
            <Link href="/cookies">Cookies</Link>
            <Link href="/refunds">Возвраты</Link>
            <Link href="/contact">Контакты</Link>
          </nav>
        </div>
        <div className="ev-footer-bottom">
          <span>© 2026 T-Skills · draft for pilot</span>
          <span>RU</span>
        </div>
      </div>
    </footer>
  );
}

function useSectionReveal() {
  useEffect(() => {
    const root = document.querySelector(".ev-landing");
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("main section, .ev-footer"));
    if (reduce || !("IntersectionObserver" in window)) {
      sections.forEach((s) => s.classList.add("is-visible"));
      return;
    }
    sections.forEach((s) => s.classList.add("ev-reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.06, rootMargin: "0px 0px -24px 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);
}
