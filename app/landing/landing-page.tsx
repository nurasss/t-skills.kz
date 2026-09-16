"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { View } from "@/app/orbita-view-types";
import "./landing.css";

const DOMAIN_COLORS = ["#8FA888", "#7C93A8", "#C79A5B", "#C1836F", "#B78D97", "#9B93B5"];

const DOMAIN_LABELS = [
  "Мышление и анализ",
  "Создание и адаптация",
  "Исполнение и качество",
  "Влияние и движение",
  "Связи и сотрудничество",
  "Самоуправление",
];

const DOMAIN_VALUES = [87, 82, 78, 74, 80, 76];

const FINGERPRINT_DATA = [
  88, 76, 94, 70, 82, 65, 91, 74, 80, 69, 78, 60, 85, 72, 88, 55, 73, 66, 81, 62, 85, 71, 79,
  64, 90, 68, 77, 60, 84, 73,
];

const TOP5_STRENGTHS = [
  { name: "Системное мышление", score: 94 },
  { name: "Генерация идей", score: 91 },
  { name: "Стратегический фокус", score: 88 },
  { name: "Взаимодействие с людьми", score: 85 },
  { name: "Адаптивность", score: 82 },
];

export type LandingPageProps = {
  onNavigate: (view: View) => void;
  onDemo: () => void;
  requestError?: string | null;
  onDismissError?: () => void;
};

export function LandingPage({ onNavigate, onDemo, requestError, onDismissError }: LandingPageProps) {
  useScrollReveal();
  return (
    <div className="orbita-landing">
      {requestError ? <ErrorBanner message={requestError} onDismiss={onDismissError} /> : null}
      <a href="#main" className="sr-only">
        Перейти к содержимому
      </a>
      <LandingHeader onNavigate={onNavigate} />
      <LandingDrawer onNavigate={onNavigate} />
      <main id="main">
        <LandingHero onNavigate={onNavigate} />
        <SocialProof />
        <Benefits />
        <Testimonials />
        <HowItWorks onNavigate={onNavigate} onDemo={onDemo} />
        <FinalCta onNavigate={onNavigate} />
      </main>
      <LandingFooter onNavigate={onNavigate} />
    </div>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="l-error" role="alert">
      <span>{message}</span>
      <button onClick={onDismiss} type="button" aria-label="Закрыть">
        ×
      </button>
    </div>
  );
}

function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      className="l-logo-mark"
      width={size}
      height={size}
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="13" cy="13" r="11.5" stroke="#173D32" strokeWidth="1.3" />
      <circle cx="13" cy="13" r="4.5" stroke="#173D32" strokeWidth="1.3" />
      <line x1="13" y1="1.5" x2="13" y2="6.2" stroke="#173D32" strokeWidth="1.3" />
    </svg>
  );
}

function ArrowRight({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="arrow"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function LandingHeader({ onNavigate }: { onNavigate: (view: View) => void }) {
  const headerRef = useRef<HTMLElement>(null);
  const menuOpenRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const onScroll = () => {
      if (window.scrollY > 8) header.classList.add("scrolled");
      else header.classList.remove("scrolled");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openDrawer = useCallback(() => {
    window.dispatchEvent(new CustomEvent("orbita-landing-drawer", { detail: "open" }));
    setTimeout(() => {
      const close = document.getElementById("menuClose");
      close?.focus();
    }, 50);
  }, []);

  const handleNav = useCallback(
    (view: View) => () => onNavigate(view),
    [onNavigate],
  );

  return (
    <header className="l-header" id="siteHeader" ref={headerRef}>
      <div className="landing-container l-header-inner">
        <button
          className="l-logo"
          onClick={handleNav("home")}
          type="button"
          aria-label="ORBITA-30, на главную"
        >
          <LogoMark />
          ORBITA-30
        </button>

        <nav className="l-main-nav" aria-label="Основная навигация">
          <a href="#benefits">Для вас</a>
          <a href="#how-it-works">Как это работает</a>
          <a href="#report">Что вы узнаете</a>
          <a href="#testimonials">Примеры результатов</a>
          <a href="#footer">Ресурсы</a>
        </nav>

        <div className="l-header-actions">
          <div className="l-lang-select" aria-label="Выбор языка">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a14 14 0 010 18 14 14 0 010-18z" />
            </svg>
            RU
          </div>
          <button className="l-login-link" onClick={handleNav("account")} type="button">
            Войти
          </button>
          <button
            className="l-btn l-btn-primary l-header-cta"
            onClick={handleNav("detail")}
            type="button"
          >
            Начать
          </button>
        </div>

        <button
          className="l-menu-toggle"
          onClick={openDrawer}
          type="button"
          aria-label="Открыть меню"
          aria-expanded="false"
          aria-controls="drawer"
          ref={menuOpenRef}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>
    </header>
  );
}

function LandingDrawer({ onNavigate }: { onNavigate: (view: View) => void }) {
  const drawerRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const openBtnRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const closeDrawer = useCallback(() => {
    setOpen(false);
    document.body.style.overflow = "";
    openBtnRef.current?.focus();
  }, []);

  const openDrawer = useCallback(() => {
    setOpen(true);
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      const close = document.getElementById("menuClose");
      close?.focus();
    }, 50);
  }, []);

  useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === "open") openDrawer();
    };
    window.addEventListener("orbita-landing-drawer", onEvent);
    openBtnRef.current = document.querySelector(".l-menu-toggle");
    return () => window.removeEventListener("orbita-landing-drawer", onEvent);
  }, [openDrawer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeDrawer]);

  const handleNavAndClose = useCallback(
    (view: View) => () => {
      closeDrawer();
      onNavigate(view);
    },
    [closeDrawer, onNavigate],
  );

  return (
    <>
      <div
        className={`l-drawer-overlay${open ? " open" : ""}`}
        onClick={closeDrawer}
        ref={overlayRef}
      />
      <aside
        className={`l-drawer${open ? " open" : ""}`}
        id="drawer"
        aria-hidden={open ? "false" : "true"}
        ref={drawerRef}
      >
        <div className="l-drawer-top">
          <span className="l-logo" style={{ fontSize: 18 }}>
            <LogoMark size={22} />
            ORBITA-30
          </span>
          <button
            className="l-drawer-close"
            onClick={closeDrawer}
            type="button"
            aria-label="Закрыть меню"
            id="menuClose"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>
        <nav>
          <a href="#benefits" onClick={closeDrawer}>
            Для вас
          </a>
          <a href="#how-it-works" onClick={closeDrawer}>
            Как это работает
          </a>
          <a href="#report" onClick={closeDrawer}>
            Что вы узнаете
          </a>
          <a href="#testimonials" onClick={closeDrawer}>
            Пример результата
          </a>
          <a href="#footer" onClick={closeDrawer}>
            Методология
          </a>
        </nav>
        <button className="l-login-link" onClick={handleNavAndClose("account")} type="button">
          Войти
        </button>
        <button className="l-btn l-btn-primary" onClick={handleNavAndClose("detail")} type="button">
          Начать оценку
        </button>
      </aside>
    </>
  );
}

function LandingHero({ onNavigate }: { onNavigate: (view: View) => void }) {
  const handleNav = useCallback(
    (view: View) => () => onNavigate(view),
    [onNavigate],
  );

  return (
    <section className="l-hero">
      <div className="landing-container l-hero-grid">
        <div className="l-hero-copy">
          <span className="eyebrow">Глубже, чем тест. Ближе к вам.</span>
          <h1>
            Поймите свои
            <br />
            естественные
            <br />
            сильные стороны
          </h1>
          <p className="lede">
            ORBITA-30 — это научно обоснованная оценка, которая помогает вам лучше понять, как вы
            мыслите, действуете, взаимодействуете и достигаете результатов.
          </p>
          <div className="l-cta-row">
            <button
              className="l-btn l-btn-primary"
              id="start"
              onClick={handleNav("detail")}
              type="button"
            >
              Начать оценку
              <ArrowRight />
            </button>
            <button
              className="l-btn l-btn-secondary"
              onClick={() => {
                const el = document.getElementById("report");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              type="button"
            >
              Посмотреть пример отчёта
            </button>
          </div>
          <div className="l-benefit-row">
            <div className="item">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path d="M4 19V9M12 19V5M20 19v-7" />
              </svg>
              30 ключевых качеств
            </div>
            <div className="item">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" />
              </svg>
              Персональный профиль
            </div>
            <div className="item">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M8 12.5l2.5 2.5L16 9.5" />
              </svg>
              Практические рекомендации
            </div>
          </div>
        </div>

        <div
          className="l-hero-visual"
          role="img"
          aria-label="Превью карточки профиля ORBITA-30 с диаграммой сильных сторон и списком топ-5 качеств"
        >
          <div className="l-hv-texture" aria-hidden="true">
            <svg viewBox="0 0 400 560" preserveAspectRatio="xMidYMid slice">
              <polygon
                points="0,560 90,300 160,420 230,220 300,380 400,180 400,560"
                fill="rgba(0,0,0,0.18)"
              />
              <polygon
                points="0,560 60,380 140,460 210,300 280,440 360,260 400,320 400,560"
                fill="rgba(255,255,255,0.06)"
              />
            </svg>
          </div>

          <div className="l-hv-card-nav" aria-hidden="true">
            <div>Понимание</div>
            <div className="active">Вдохновляет</div>
            <div>Развитие</div>
            <div>Двигает вперёд</div>
          </div>

          <div className="l-hv-card-main">
            <div className="row-top">
              <h3>Ваш профиль</h3>
              <div className="l-hv-card-actions">
                <span className="l-hv-chip">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <circle cx="18" cy="5" r="2.4" />
                    <circle cx="6" cy="12" r="2.4" />
                    <circle cx="18" cy="19" r="2.4" />
                    <path d="M8.2 10.8L15.8 6.2M8.2 13.2l7.6 4.6" />
                  </svg>
                  Поделиться
                </span>
                <span className="l-hv-chip filled">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 19h16" />
                  </svg>
                  PDF
                </span>
              </div>
            </div>

            <div className="l-fingerprint-wrap">
              <FingerprintSvg />
              <div className="l-fp-legend">
                {DOMAIN_LABELS.map((label, i) => (
                  <span key={label}>
                    <i style={{ background: DOMAIN_COLORS[i] }} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="l-hv-list-title">Топ&nbsp;5 сильных сторон</div>
            <ul className="l-hv-list">
              {TOP5_STRENGTHS.map((item, i) => (
                <li key={item.name}>
                  <span className="num">{i + 1}</span>
                  <span className="name">{item.name}</span>
                  <span className="score">{item.score}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="l-hv-card-small" aria-hidden="true">
            <div className="quote-mark">&ldquo;</div>
            <p>
              Чем лучше вы понимаете свои сильные стороны, тем больше возможностей вы создаёте для
              себя и окружающих.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FingerprintSvg() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const size = 220;
    const cx = size / 2;
    const cy = size / 2;
    const innerR = 26;
    const outerR = 100;
    const n = FINGERPRINT_DATA.length;
    const anglePer = (Math.PI * 2) / n;
    const startOffset = -Math.PI / 2;
    const ns = "http://www.w3.org/2000/svg";

    const pt = (r: number, angle: number): [number, number] => [
      cx + r * Math.cos(angle),
      cy + r * Math.sin(angle),
    ];

    const frag = document.createDocumentFragment();

    for (let i = 0; i < n; i++) {
      const domain = Math.floor(i / 5);
      const val = FINGERPRINT_DATA[i];
      const r = innerR + (outerR - innerR) * (val / 100);
      const a0 = startOffset + i * anglePer;
      const a1 = startOffset + (i + 1) * anglePer - 0.018;

      const p1 = pt(innerR, a0);
      const p2 = pt(r, a0);
      const p3 = pt(r, a1);
      const p4 = pt(innerR, a1);

      const d = [
        "M",
        p1[0].toFixed(2),
        p1[1].toFixed(2),
        "L",
        p2[0].toFixed(2),
        p2[1].toFixed(2),
        "A",
        r.toFixed(2),
        r.toFixed(2),
        0,
        0,
        1,
        p3[0].toFixed(2),
        p3[1].toFixed(2),
        "L",
        p4[0].toFixed(2),
        p4[1].toFixed(2),
        "A",
        innerR.toFixed(2),
        innerR.toFixed(2),
        0,
        0,
        0,
        p1[0].toFixed(2),
        p1[1].toFixed(2),
        "Z",
      ].join(" ");

      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", DOMAIN_COLORS[domain]);
      path.setAttribute("opacity", (0.62 + 0.38 * (val / 100)).toFixed(2));
      frag.appendChild(path);
    }

    const centerCircle = document.createElementNS(ns, "circle");
    centerCircle.setAttribute("cx", String(cx));
    centerCircle.setAttribute("cy", String(cy));
    centerCircle.setAttribute("r", String(innerR - 4));
    centerCircle.setAttribute("fill", "#FCFBF8");
    centerCircle.setAttribute("stroke", "rgba(23,26,24,0.12)");
    frag.appendChild(centerCircle);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(cx));
    label.setAttribute("y", String(cy - 2));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-family", "'Instrument Serif', serif");
    label.setAttribute("font-size", "13");
    label.setAttribute("fill", "#171A18");
    label.textContent = "ORBITA";
    frag.appendChild(label);

    const label2 = document.createElementNS(ns, "text");
    label2.setAttribute("x", String(cx));
    label2.setAttribute("y", String(cy + 14));
    label2.setAttribute("text-anchor", "middle");
    label2.setAttribute("font-family", "'Instrument Serif', serif");
    label2.setAttribute("font-size", "13");
    label2.setAttribute("fill", "#171A18");
    label2.textContent = "30";
    frag.appendChild(label2);

    svg.appendChild(frag);
  }, []);

  return (
    <svg
      className="l-fingerprint-svg"
      id="fingerprint"
      viewBox="0 0 220 220"
      ref={svgRef}
      aria-hidden="true"
    />
  );
}

function SocialProof() {
  return (
    <section className="l-social-proof">
      <div className="landing-container l-sp-inner">
        <div className="l-sp-number">
          <strong>120,000+</strong>
          <span>людей уже используют ORBITA-30 для роста в работе и жизни</span>
        </div>
        <div
          className="l-sp-logos"
          aria-label="Категории специалистов, использующих ORBITA-30"
        >
          <span>Company</span>
          <span>Studio</span>
          <span>Team</span>
          <span>Agency</span>
          <span>Research Lab</span>
        </div>
      </div>
    </section>
  );
}

function Benefits() {
  const items = [
    {
      bg: "var(--primary-soft)",
      color: "var(--primary)",
      title: "Лучшее понимание себя",
      body: "Узнайте, что даёт вам энергию и в чём состоит ваша естественная сила.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      ),
    },
    {
      bg: "#E7ECF0",
      color: "var(--blue)",
      title: "Более сильные отношения",
      body: "Поймите, как вы взаимодействуете с другими и влияете на них.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="9" cy="8" r="3.4" />
          <path d="M3.5 19c1-3.4 3-5 5.5-5s4.5 1.6 5.5 5" />
          <circle cx="17.5" cy="9.5" r="2.4" />
          <path d="M15.5 19c.5-2.4 1.7-3.6 3.2-4" />
        </svg>
      ),
    },
    {
      bg: "#EDE7F2",
      color: "var(--lavender)",
      title: "Больше возможностей",
      body: "Принимайте решения, которые соответствуют вашим сильным сторонам.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M4 19V11M11 19V5M18 19v-7" />
        </svg>
      ),
    },
    {
      bg: "#F3E9E0",
      color: "var(--amber)",
      title: "Реальное развитие",
      body: "Получите конкретные рекомендации для личного и профессионального роста.",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" strokeLinejoin="round" />
        </svg>
      ),
    },
  ];

  return (
    <section className="l-section" id="benefits">
      <div className="landing-container">
        <div className="l-section-head l-reveal">
          <span className="eyebrow">Больше, чем результат</span>
          <h2>Ясность для более осознанной жизни</h2>
          <p>
            Понимание своих сильных сторон помогает принимать более уверенные решения, строить
            более глубокие отношения и раскрывать свой потенциал.
          </p>
        </div>

        <div className="l-benefits-grid">
          {items.map((item) => (
            <div className="l-benefit-col l-reveal" key={item.title}>
              <div className="l-benefit-icon" style={{ background: item.bg, color: item.color }}>
                {item.icon}
              </div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  const items = [
    {
      quote:
        "Этот отчёт помог мне лучше понять, почему я всегда чувствовала себя по-другому. Теперь у меня есть язык, чтобы объяснить это.",
      name: "Алина С.",
      role: "Продукт-менеджер",
      avatar: "А",
      color: "var(--rose)",
    },
    {
      quote:
        "Я лучше понимаю себя и свою команду. Это настоящий прорыв в том, как мы распределяем задачи.",
      name: "Нурсултан А.",
      role: "Предприниматель",
      avatar: "Н",
      color: "var(--blue)",
    },
    {
      quote:
        "Практичные инсайты, которые действительно работают. Я постоянно возвращаюсь к своему отчёту.",
      name: "Диана К.",
      role: "Маркетинг-лид",
      avatar: "Д",
      color: "var(--sage)",
    },
  ];

  return (
    <section className="l-section" id="testimonials" style={{ paddingTop: 0 }}>
      <div className="landing-container">
        <div className="l-testimonials-grid">
          {items.map((item) => (
            <div className="l-t-card l-reveal" key={item.name}>
              <p className="quote">{item.quote}</p>
              <div className="l-t-person">
                <div className="l-t-avatar" style={{ background: item.color }}>
                  {item.avatar}
                </div>
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.role}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks({
  onNavigate,
  onDemo,
}: {
  onNavigate: (view: View) => void;
  onDemo: () => void;
}) {
  const steps = [
    {
      title: "Пройдите оценку ORBITA-30",
      body: "Ответьте на серию продуманных утверждений о вашем естественном поведении. Вы можете делать перерывы и продолжать позже.",
    },
    {
      title: "Получите персональные результаты",
      body: "Узнайте свои топ‑5 сильных сторон, полный профиль из 30 качеств и подробные инсайты.",
    },
    {
      title: "Применяйте в жизни",
      body: "Используйте практические рекомендации и инструменты, чтобы раскрывать свой потенциал в работе, отношениях и личном развитии.",
    },
  ];

  const handleNav = useCallback(
    (view: View) => () => onNavigate(view),
    [onNavigate],
  );

  return (
    <section className="l-section" id="how-it-works">
      <div className="landing-container l-how-grid">
        <div>
          <div className="l-section-head l-reveal" style={{ marginBottom: 0 }}>
            <span className="eyebrow">Простой и понятный процесс</span>
            <h2>Три шага к глубоким инсайтам</h2>
          </div>

          <div className="l-steps-list">
            {steps.map((step, i) => (
              <div className="l-step l-reveal" key={step.title}>
                <span className="num">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>

          <div className="l-steps-cta">
            <button
              className="l-btn l-btn-primary"
              onClick={handleNav("detail")}
              type="button"
            >
              Начать оценку
              <ArrowRight />
            </button>
            <button className="l-link-underline" onClick={onDemo} type="button">
              Посмотреть пример отчёта
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <div
          className="l-report-visual l-reveal"
          id="report"
          role="img"
          aria-label="Превью персонального отчёта ORBITA-30 с оценками по шести доменам"
        >
          <div className="l-rv-cover">
            <span className="l-rv-eyebrow">Ваш персональный отчёт</span>
            <h3>
              Понимание.
              <br />
              Фокус.
              <br />
              Развитие.
            </h3>
            <span className="l-rv-tag">
              «Осознанность сегодня — больше возможностей завтра.»
            </span>
            <span className="l-rv-brand">ORBITA-30</span>
          </div>

          <DomainCard />

          <div className="l-rv-quote" aria-hidden="true">
            <div className="quote-mark">&ldquo;</div>
            <p>Осознанность сегодня — больше возможностей завтра.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function DomainCard() {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const bars = card.querySelectorAll<HTMLElement>(".l-dr-bar span");
    const values = Array.from(card.querySelectorAll<HTMLElement>(".l-domain-row")).map((r) =>
      r.dataset.value,
    );

    const animateBars = () => {
      bars.forEach((bar, i) => {
        bar.style.width = `${values[i] ?? 0}%`;
      });
    };

    if (reduceMotion || !("IntersectionObserver" in window)) {
      animateBars();
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animateBars();
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.3 },
    );
    io.observe(card);
    return () => io.disconnect();
  }, []);

  return (
    <div className="l-rv-domains" id="domainCard" ref={cardRef}>
      <h4>Ваши домены</h4>
      {DOMAIN_LABELS.map((label, i) => (
        <div className="l-domain-row" data-value={DOMAIN_VALUES[i]} key={label}>
          <div className="dr-top">
            <span className="name">
              <span className="dot" style={{ background: DOMAIN_COLORS[i] }} />
              {label}
            </span>
            <span className="val">{DOMAIN_VALUES[i]}</span>
          </div>
          <div className="l-dr-bar">
            <span style={{ background: DOMAIN_COLORS[i] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FinalCta({ onNavigate }: { onNavigate: (view: View) => void }) {
  const handleNav = useCallback(
    (view: View) => () => onNavigate(view),
    [onNavigate],
  );

  return (
    <div className="l-final-cta-wrap">
      <div className="landing-container">
        <div className="l-final-cta l-reveal">
          <div className="l-final-cta-inner">
            <div className="l-final-cta-copy">
              <span className="eyebrow">Готовы узнать больше?</span>
              <h2>Инвестируйте в лучшее понимание себя</h2>
              <p>
                Тысячи людей используют ORBITA-30, чтобы принимать более осознанные решения и
                создавать жизнь, которая действительно им подходит.
              </p>
              <button
                className="l-btn l-btn-primary"
                onClick={handleNav("detail")}
                type="button"
              >
                Начать сейчас
                <ArrowRight />
              </button>
            </div>
            <div className="l-final-cta-side">
              больше осознанности
              <br />
              больше возможностей
              <br />
              больше вас
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LandingFooter({ onNavigate }: { onNavigate: (view: View) => void }) {
  const handleAnchor = useCallback(
    (id: string) => () => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    },
    [],
  );

  const handleNav = useCallback(
    (view: View) => () => onNavigate(view),
    [onNavigate],
  );

  return (
    <footer className="l-footer" id="footer">
      <div className="landing-container">
        <div className="l-footer-grid">
          <div className="l-footer-brand">
            <span className="l-logo">
              <LogoMark />
              ORBITA-30
            </span>
            <p>
              Научно обоснованная оценка сильных сторон для более осознанной работы и жизни.
            </p>
          </div>
          <div className="l-footer-col">
            <h4>Продукт</h4>
            <ul>
              <li>
                <button onClick={handleAnchor("benefits")} type="button">
                  О тесте
                </button>
              </li>
              <li>
                <button onClick={handleAnchor("how-it-works")} type="button">
                  Как это работает
                </button>
              </li>
              <li>
                <button onClick={handleAnchor("report")} type="button">
                  Пример результата
                </button>
              </li>
            </ul>
          </div>
          <div className="l-footer-col">
            <h4>Ресурсы</h4>
            <ul>
              <li>
                <button onClick={handleNav("methodology")} type="button">
                  Методология
                </button>
              </li>
              <li>
                <button onClick={handleNav("faq")} type="button">
                  FAQ
                </button>
              </li>
              <li>
                <button onClick={handleNav("support")} type="button">
                  Поддержка
                </button>
              </li>
            </ul>
          </div>
          <div className="l-footer-col">
            <h4>Компания</h4>
            <ul>
              <li>
                <button type="button">О нас</button>
              </li>
              <li>
                <button type="button">Контакты</button>
              </li>
            </ul>
          </div>
          <div className="l-footer-col">
            <h4>Правовое</h4>
            <ul>
              <li>
                <button onClick={handleNav("privacy")} type="button">
                  Privacy
                </button>
              </li>
              <li>
                <button onClick={handleNav("terms")} type="button">
                  Terms
                </button>
              </li>
            </ul>
          </div>
        </div>
        <div className="l-footer-bottom">
          <span>© 2026 ORBITA-30</span>
          <span>RU / KZ / EN</span>
        </div>
      </div>
    </footer>
  );
}

export function useScrollReveal() {
  useEffect(() => {
    const root = document.querySelector(".orbita-landing");
    if (!root) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elements = root.querySelectorAll<HTMLElement>(".l-reveal");

    if (reduceMotion || !("IntersectionObserver" in window)) {
      elements.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    elements.forEach((el) => io.observe(el));

    return () => io.disconnect();
  }, []);
}
