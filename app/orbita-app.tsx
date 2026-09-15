"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  FileText,
  Fingerprint,
  Gauge,
  LockKeyhole,
  Menu,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ApiClientError, apiJson, readPendingResponses, topLevelNavigate, writePendingResponses } from "@/app/orbita-api";
import { InfoView } from "@/app/orbita-public-views";
import type { AccountOverview, AdminMetrics, PendingResponse, Phase, PublicCatalog, ReportPayload, SessionPayload, View } from "@/app/orbita-view-types";
import {
  buildDemoResponses,
  buildReport,
  getItemById,
  itemCountSummary,
  scoreAssessment,
  selectAdaptiveItems,
  traitName,
  VERSION_IDS,
  type AdaptiveSelection,
  type ReportJSON,
  type ResponseMap,
  type ScoreProfile,
} from "@/lib/assessment-engine";
import { ITEM_BANK, TRAITS, type Item } from "@/lib/item-bank";
import { enqueuePending, findPendingItem, pendingForSession, removePending } from "@/lib/response-retry-queue";
import { routeForView } from "@/lib/view-routing";

const CORE_ITEMS = ITEM_BANK.filter((item) => Number(item.id.slice(1)) <= 250);
const DOMAIN_COLORS = ["coral", "cyan", "lime", "violet", "amber", "blue"];
const RESPONSE_LABELS = [
  "Сильно левое",
  "Скорее левое",
  "Одинаково",
  "Скорее правое",
  "Сильно правое",
];
const LIKERT_LABELS = ["1", "2", "3", "4", "5", "6", "7"];

function isForced(item: Item) {
  return item.type === "forced" || item.type === "adaptive_forced";
}

function scoreBand(score: number) {
  if (score >= 75) return "выраженный диапазон";
  if (score >= 55) return "рабочий диапазон";
  return "менее естественный режим";
}

function AppHeader({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (view: View) => void;
}) {
  return (
    <header className="orbita-header">
      <button className="orbita-brand" onClick={() => onNavigate("home")} type="button">
        <span className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span>
          <span className="brand-name">ORBITA<span>—</span>30</span>
          <span className="brand-caption">профиль способа действовать</span>
        </span>
      </button>

      <nav className="desktop-nav" aria-label="Основная навигация">
        <button className={view === "catalog" || view === "detail" ? "nav-link active" : "nav-link"} onClick={() => onNavigate("catalog")} type="button">
          Тест
        </button>
        <button className={view === "methodology" ? "nav-link active" : "nav-link"} onClick={() => onNavigate("methodology")} type="button">
          Методология
        </button>
        <button className={view === "faq" ? "nav-link active" : "nav-link"} onClick={() => onNavigate("faq")} type="button">
          FAQ
        </button>
      </nav>

      <div className="header-actions">
        <span className="locale-pill">RU</span>
        <button className={view === "account" ? "account-chip active" : "account-chip"} onClick={() => onNavigate("account")} type="button">
          <span className="avatar-dot">М</span>
          <span className="account-name">Мой профиль</span>
        </button>
        <button className="mobile-menu" aria-label="Открыть меню" type="button">
          <Menu size={18} />
        </button>
      </div>
    </header>
  );
}

function Footer({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <footer className="orbita-footer">
      <div className="footer-brand">
        <span className="brand-name">ORBITA<span>—</span>30</span>
        <span className="footer-note">Развивающий профиль, не диагноз</span>
      </div>
      <div className="footer-links">
        <button onClick={() => onNavigate("methodology")} type="button">Методология</button>
        <button onClick={() => onNavigate("privacy")} type="button">Privacy</button>
        <button onClick={() => onNavigate("terms")} type="button">Terms</button>
        <button onClick={() => onNavigate("support")} type="button">Поддержка</button>
      </div>
      <span className="footer-version">v1 · draft for pilot</span>
    </footer>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "section-heading centered" : "section-heading"}>
      {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
      <h1>{title}</h1>
      {body ? <p>{body}</p> : null}
    </div>
  );
}

function OrbitGraphic({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "orbit-graphic compact" : "orbit-graphic"} aria-label="Визуальный fingerprint профиля">
      <div className="orbit-ring ring-one" />
      <div className="orbit-ring ring-two" />
      <div className="orbit-ring ring-three" />
      <span className="orbit-node node-a" />
      <span className="orbit-node node-b" />
      <span className="orbit-node node-c" />
      <span className="orbit-node node-d" />
      <span className="orbit-core">30</span>
      {!compact ? (
        <div className="orbit-legend">
          <span><i className="legend-dot lime" />Top 5</span>
          <span><i className="legend-dot cyan" />6 доменов</span>
        </div>
      ) : null}
    </div>
  );
}

function HomeView({ onNavigate, onDemo }: { onNavigate: (view: View) => void; onDemo: () => void }) {
  return (
    <>
      <section className="home-hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" /> ORBITA—30 / рабочая версия</div>
          <h1>Увидеть свой<br /><em>способ действовать.</em></h1>
          <p className="hero-lede">
            Развивающий профиль устойчивых поведенческих предпочтений —
            чтобы яснее понимать свой вклад, условия работы и следующий шаг.
          </p>
          <div className="hero-actions">
            <Button className="orbita-button primary-button" size="lg" onClick={() => onNavigate("detail")}>
              Начать оценку <ArrowRight size={17} />
            </Button>
            <Button className="orbita-button secondary-button" size="lg" onClick={onDemo}>
              Смотреть демо результата <Play size={16} />
            </Button>
          </div>
          <div className="hero-disclaimer">
            <ShieldCheck size={15} />
            <span>Не диагностика · не прогноз карьеры · не основание для найма</span>
          </div>
        </div>

        <div className="hero-visual">
          <div className="visual-label">Визуальный fingerprint <span>DEMO PROFILE</span></div>
          <OrbitGraphic />
          <div className="visual-score score-one">
            <span>T07</span>
            <strong>91</strong>
            <small>Экспериментальный ход</small>
          </div>
          <div className="visual-score score-two">
            <span>T14</span>
            <strong>88</strong>
            <small>Стандарт качества</small>
          </div>
          <div className="visual-coordinate">43° 15′ N&nbsp;&nbsp; 76° 56′ E</div>
        </div>
      </section>

      <section className="signal-strip">
        <div><strong>30</strong><span>оригинальных<br />шкал</span></div>
        <div><strong>6</strong><span>доменов<br />действия</span></div>
        <div><strong>250<span className="plus">+</span></strong><span>базовых<br />вопросов</span></div>
        <div><strong>10–15</strong><span>уточняющих<br />вопросов</span></div>
        <div className="strip-note"><Fingerprint size={18} /><span>Ваш результат — не ярлык.<br />Это карта для разговора.</span></div>
      </section>

      <section className="how-section">
        <SectionHeading
          eyebrow="КАК ЭТО РАБОТАЕТ"
          title="Сначала сигнал. Потом смысл."
          body="Мы отделяем измерение от интерпретации, чтобы результат оставался прозрачным и воспроизводимым."
        />
        <div className="step-grid">
          {[
            ["01", "Ответить честно", "250 вопросов о типичном поведении. По одному на экран, с паузами между блоками."],
            ["02", "Уточнить профиль", "Ещё 10–15 вопросов выбираются по неопределённости и близким границам рангов."],
            ["03", "Получить карту", "Top 5, полный профиль 30, условия для работы и план развития на 30 дней."],
          ].map(([number, title, body]) => (
            <article className="step-card" key={number}>
              <span className="step-number">{number}</span>
              <h3>{title}</h3>
              <p>{body}</p>
              <ArrowRight size={16} className="step-arrow" />
            </article>
          ))}
        </div>
      </section>

      <section className="boundary-section">
        <div className="boundary-copy">
          <div className="eyebrow">ГРАНИЦЫ ПРОДУКТА</div>
          <h2>Низкий балл — не недостаток.</h2>
          <p>
            ORBITA—30 описывает менее естественные режимы, которые могут требовать
            сознательного усилия или компенсироваться процессом и партнёрством.
            Никаких диагнозов, «правильных» ответов и обещаний найти вам профессию.
          </p>
          <button className="text-link" onClick={() => onNavigate("methodology")} type="button">
            Читать методологию <ArrowRight size={15} />
          </button>
        </div>
        <div className="boundary-list">
          <div><span className="boundary-icon cyan"><LockKeyhole size={17} /></span><span><strong>Ваши ответы под контролем</strong><small>Отдельные согласия и возможность удалить данные.</small></span></div>
          <div><span className="boundary-icon lime"><Gauge size={17} /></span><span><strong>Числа считает engine</strong><small>Интерпретация не меняет score и rank.</small></span></div>
          <div><span className="boundary-icon violet"><CircleHelp size={17} /></span><span><strong>Уверенность видна</strong><small>Близкие места показываются кластером, не ложной точностью.</small></span></div>
        </div>
      </section>
    </>
  );
}

function CatalogView({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <div className="page-wrap">
      <SectionHeading
        eyebrow="КАТАЛОГ"
        title="Один тест. Полная карта."
        body="Выберите оценку, которая помогает увидеть устойчивый способ действовать — в работе и повседневных ситуациях."
      />
      <div className="catalog-grid">
        <Card className="test-card featured-card">
          <CardHeader>
            <div className="card-topline"><Badge className="lime-badge">Основной тест</Badge><span className="card-id">orbita30_ru_v1</span></div>
            <CardTitle>ORBITA—30</CardTitle>
            <CardDescription>Профиль сильных сторон и рабочих предпочтений</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="test-card-visual"><OrbitGraphic compact /><div><strong>30</strong><span>шкал<br />в профиле</span></div></div>
            <div className="test-meta">
              <span><Timer size={15} /> 35–50 минут с паузами</span>
              <span><FileText size={15} /> интерактивный отчёт + PDF</span>
              <span><ShieldCheck size={15} /> развивающий формат</span>
            </div>
            <Button className="orbita-button primary-button full-button" size="lg" onClick={() => onNavigate("detail")}>Открыть тест <ArrowRight size={16} /></Button>
          </CardContent>
        </Card>
        <aside className="catalog-side">
          <div className="catalog-note">
            <div className="note-number">01</div>
            <h3>Сейчас доступна одна версия</h3>
            <p>Она помечена как draft for pilot. Психометрическая валидация и нормы публикуются отдельными версиями.</p>
          </div>
          <div className="catalog-note">
            <div className="note-number">02</div>
            <h3>Цена фиксируется в заказе</h3>
            <p>Изменение цены теста не изменит уже созданный order или entitlement.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function DetailView({ onNavigate, onDemo }: { onNavigate: (view: View) => void; onDemo: () => void }) {
  return (
    <div className="page-wrap detail-page">
      <button className="back-link" onClick={() => onNavigate("catalog")} type="button"><ArrowLeft size={15} /> Каталог тестов</button>
      <div className="detail-hero">
        <div>
          <div className="eyebrow"><span className="status-dot" /> ОЦЕНКА СИЛЬНЫХ СТОРОН</div>
          <h1>ORBITA—30</h1>
          <p>Профиль предпочтительного способа действовать: как вы понимаете сложность, создаёте варианты, доводите работу, влияете и восстанавливаетесь.</p>
          <div className="detail-actions">
            <Button className="orbita-button primary-button" size="lg" onClick={() => onNavigate("checkout")}>Перейти к оформлению <ArrowRight size={16} /></Button>
            <Button className="orbita-button secondary-button" size="lg" onClick={onDemo}>Посмотреть результат на демо-данных</Button>
          </div>
        </div>
        <div className="detail-orbit"><OrbitGraphic /></div>
      </div>

      <div className="detail-columns">
        <section className="detail-main">
          <div className="subsection-label">ЧТО ВНУТРИ</div>
          <div className="detail-feature-grid">
            {[
              ["01", "6 доменов", "Осмысление, создание, исполнение, влияние, связи и самоуправление."],
              ["02", "250 + 10–15", "Фиксированная база и адаптивное уточнение по uncertainty."],
              ["03", "Top 5 и профиль 30", "Сначала естественный вклад, затем полный контекст и интервалы."],
              ["04", "Отчёт на языке фактов", "Без диагнозов и карьерных предсказаний; числа берутся из score JSON."],
            ].map(([number, title, body]) => (
              <div className="detail-feature" key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></div>
            ))}
          </div>
          <div className="subsection-label domain-label">ДОМЕНЫ</div>
          <div className="domain-list">
            {[
              ["D1", "Осмысление и анализ", "Как человек понимает сложность, данные и закономерности."],
              ["D2", "Создание и адаптация", "Как человек генерирует варианты и действует в неопределённости."],
              ["D3", "Исполнение и качество", "Как человек превращает намерения в устойчивый результат."],
              ["D4", "Влияние и движение", "Как человек инициирует, убеждает и мобилизует других."],
              ["D5", "Связи и сотрудничество", "Как человек понимает людей и строит продуктивные отношения."],
              ["D6", "Самоуправление и устойчивость", "Как человек регулирует себя и держит внутренний курс."],
            ].map(([code, name, body], index) => (
              <div className="domain-row" key={code}><span className={"domain-code " + DOMAIN_COLORS[index]}>{code}</span><div><strong>{name}</strong><p>{body}</p></div><ChevronDown size={16} /></div>
            ))}
          </div>
        </section>
        <aside className="detail-aside">
          <div className="aside-panel">
            <span className="aside-kicker">ДЛЯ КОГО</span>
            <h3>Для себя, команды и следующего разговора.</h3>
            <p>Результат можно использовать как материал для развития — не как автоматическое решение о человеке.</p>
            <div className="aside-rule" />
            <span className="aside-kicker">ФОРМАТ</span>
            <ul>
              <li><Check size={15} /> один вопрос на экран</li>
              <li><Check size={15} /> пауза между блоками</li>
              <li><Check size={15} /> autosave и resume</li>
              <li><Check size={15} /> RU сейчас, KZ/EN позже</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CheckoutView({
  onNavigate,
  onCheckout,
  busy,
  error,
  catalog,
}: {
  onNavigate: (view: View) => void;
  onCheckout: () => void;
  busy: boolean;
  error?: string;
  catalog?: PublicCatalog;
}) {
  const test = catalog?.test;
  const displayedPrice = test?.amountMinor !== null && test?.amountMinor !== undefined
    ? new Intl.NumberFormat("ru-RU", { style: "currency", currency: test.currency }).format(test.amountMinor / 100)
    : "Цена ещё не настроена";
  const checkoutAvailable = Boolean(test?.availableForCheckout);
  return (
    <div className="page-wrap narrow-page">
      <button className="back-link" onClick={() => onNavigate("detail")} type="button"><ArrowLeft size={15} /> ORBITA—30</button>
      <SectionHeading eyebrow="CHECKOUT" title="Оформление теста" body="После подтверждения оплаты создаётся одноразовый доступ к конкретной версии оценки." />
      <div className="checkout-grid">
        <Card className="checkout-card">
          <CardHeader><CardTitle>ORBITA—30</CardTitle><CardDescription>{test?.assessmentVersion ?? "orbita30_ru_v1"} · draft for pilot</CardDescription></CardHeader>
          <CardContent>
            <div className="order-line"><span>Оценка</span><strong>1 доступ</strong></div>
            <div className="order-line"><span>Результат</span><strong>Dashboard + PDF</strong></div>
            <div className="order-line"><span>Тип оплаты</span><strong>один раз</strong></div>
            <div className="order-total"><span>К оплате · {test?.currency ?? "—"}</span><strong>{displayedPrice}</strong></div>
            <Button className="orbita-button primary-button full-button" disabled={busy || !checkoutAvailable} size="lg" onClick={onCheckout}>
              {busy ? "Создаём защищённую оплату…" : checkoutAvailable ? "Перейти к защищённой оплате" : "Оплата пока недоступна"} <ArrowRight size={16} />
            </Button>
            {!catalog ? <p className="validation-note">Проверяем цену и доступность оплаты…</p> : !checkoutAvailable ? <p className="validation-note">Оплата станет доступна после настройки цены и Stripe в production.</p> : null}
            {error ? <p className="validation-note">{error}</p> : null}
            <p className="micro-copy"><LockKeyhole size={13} /> Hosted checkout: карточные данные не проходят через backend ORBITA.</p>
          </CardContent>
        </Card>
        <div className="checkout-guardrails">
          <div><ShieldCheck size={18} /><span><strong>Подтверждённый webhook</strong><small>Entitlement создаётся только после signed provider event.</small></span></div>
          <div><RefreshCw size={18} /><span><strong>Идемпотентная оплата</strong><small>Повтор одного события не создаёт второй доступ.</small></span></div>
          <div><FileText size={18} /><span><strong>Order snapshot</strong><small>Версия теста, цена и валюта сохраняются вместе с заказом.</small></span></div>
        </div>
      </div>
    </div>
  );
}

function ConsentView({
  consents,
  onConsentChange,
  onBegin,
  onBack,
  onPrivacy,
}: {
  consents: { terms: boolean; privacy: boolean; research: boolean; marketing: boolean };
  onConsentChange: (key: "terms" | "privacy" | "research" | "marketing", value: boolean) => void;
  onBegin: () => void;
  onBack: () => void;
  onPrivacy: () => void;
}) {
  const required = consents.terms && consents.privacy;
  return (
    <div className="page-wrap narrow-page consent-page">
      <button className="back-link" onClick={onBack} type="button"><ArrowLeft size={15} /> Вернуться</button>
      <SectionHeading eyebrow="ПЕРЕД НАЧАЛОМ" title="Сначала — правила игры." body="Прочитайте, как используется оценка, и выберите отдельные согласия. Исследовательское и маркетинговое согласие не нужны для покупки." />
      <div className="consent-layout">
        <Card className="consent-card">
          <CardHeader><CardTitle>Согласия</CardTitle><CardDescription>Версия текста: privacy-2026-09</CardDescription></CardHeader>
          <CardContent>
            <label className="consent-row">
              <Checkbox checked={consents.terms} onCheckedChange={(value) => onConsentChange("terms", value === true)} />
              <span><strong>Условия использования</strong><small>Я принимаю Terms и понимаю ограничения развивающего продукта.</small></span>
              <Badge variant="outline">обязательно</Badge>
            </label>
            <label className="consent-row">
              <Checkbox checked={consents.privacy} onCheckedChange={(value) => onConsentChange("privacy", value === true)} />
              <span><strong>Обработка данных</strong><small>Я принимаю Privacy и минимизацию response data.</small></span>
              <Badge variant="outline">обязательно</Badge>
            </label>
            <label className="consent-row">
              <Checkbox checked={consents.research} onCheckedChange={(value) => onConsentChange("research", value === true)} />
              <span><strong>Research opt-in</strong><small>Разрешить использовать обезличенные данные для пилота.</small></span>
              <Badge variant="secondary">необязательно</Badge>
            </label>
            <label className="consent-row">
              <Checkbox checked={consents.marketing} onCheckedChange={(value) => onConsentChange("marketing", value === true)} />
              <span><strong>Новости продукта</strong><small>Получать редкие обновления о новых версиях и исследованиях.</small></span>
              <Badge variant="secondary">необязательно</Badge>
            </label>
            <Button className="orbita-button primary-button full-button consent-submit" disabled={!required} size="lg" onClick={onBegin}>
              Открыть первый блок <ArrowRight size={16} />
            </Button>
            {!required ? <p className="validation-note">Отметьте два обязательных согласия, чтобы продолжить.</p> : null}
          </CardContent>
        </Card>
        <div className="consent-side">
          <div className="side-number">01</div>
          <h3>Ваш профиль строится из ответов, а не из догадок.</h3>
          <p>Имена, контакты и payment refs не передаются adaptive/report engine. После завершения доступен запрос на экспорт или удаление.</p>
          <button className="text-link" onClick={onPrivacy} type="button">Открыть Privacy <ArrowRight size={15} /></button>
        </div>
      </div>
    </div>
  );
}

function QuestionScale({
  item,
  value,
  onChange,
}: {
  item: Item;
  value?: number;
  onChange: (value: number) => void;
}) {
  if (isForced(item)) {
    const left = item.left;
    const right = item.right;
    return (
      <div className="forced-answer">
        <div className="statement-grid">
          <div className="statement-card left-statement"><span>ЛЕВЫЙ СТИЛЬ</span><p>{left}</p></div>
          <div className="versus">vs</div>
          <div className="statement-card right-statement"><span>ПРАВЫЙ СТИЛЬ</span><p>{right}</p></div>
        </div>
        <div className="scale-labels"><span>чаще левое</span><span>одинаково</span><span>чаще правое</span></div>
        <div className="response-scale forced-scale" role="radiogroup" aria-label="Выберите, какое утверждение чаще про вас">
          {[-2, -1, 0, 1, 2].map((option, index) => (
            <button
              aria-checked={value === option}
              className={value === option ? "scale-option selected" : "scale-option"}
              key={option}
              onClick={() => onChange(option)}
              role="radio"
              type="button"
            >
              <span className="scale-dot" />
              <small>{RESPONSE_LABELS[index]}</small>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="likert-answer">
      <div className="likert-endpoints"><span>1 · совсем не про меня</span><span>4 · зависит</span><span>7 · полностью про меня</span></div>
      <div className="response-scale likert-scale" role="radiogroup" aria-label="Оцените типичное поведение от 1 до 7">
        {LIKERT_LABELS.map((label, index) => {
          const option = index + 1;
          return (
            <button
              aria-checked={value === option}
              className={value === option ? "likert-option selected" : "likert-option"}
              key={label}
              onClick={() => onChange(option)}
              role="radio"
              type="button"
            >
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <p className="scale-hint">Выбирайте то, что чаще проявляется без внешнего принуждения.</p>
    </div>
  );
}

function AssessmentView({
  phase,
  item,
  currentIndex,
  total,
  blockNumber,
  selectedValue,
  onAnswer,
  onNext,
  onPause,
  autosaveStatus,
  elapsedSeconds,
}: {
  phase: Phase;
  item?: Item;
  currentIndex: number;
  total: number;
  blockNumber: number;
  selectedValue?: number;
  onAnswer: (value: number) => void;
  onNext: () => void;
  onPause: () => void;
  autosaveStatus: string;
  elapsedSeconds: number;
}) {
  if (!item) return null;
  const localQuestion = phase === "core" ? (currentIndex % 50) + 1 : currentIndex + 1;
  const blockLabel = phase === "core" ? "Блок " + blockNumber + " из 5" : "Уточняющий блок";
  const softCue = elapsedSeconds >= 30;
  return (
    <div className="assessment-shell">
      <div className="assessment-topbar">
        <div className="assessment-progress-copy">
          <span className="assessment-kicker">{blockLabel}</span>
          <strong>{phase === "core" ? "Вопрос " + localQuestion + " из 50" : "Вопрос " + localQuestion + " из " + total}</strong>
        </div>
        <div className="assessment-progress-meter"><Progress value={((currentIndex + 1) / total) * 100} /><span>{Math.round(((currentIndex + 1) / total) * 100)}%</span></div>
        <div className="assessment-actions"><span className="autosave-status"><span className="status-dot" />{autosaveStatus}</span><button className="pause-button" onClick={onPause} type="button"><Pause size={15} /> Пауза</button></div>
      </div>

      <main className="question-area">
        <div className="question-meta"><span>{phase === "core" ? "ТИПИЧНОЕ ПОВЕДЕНИЕ" : "УТОЧНЯЮЩИЙ ВОПРОС"}</span><span className="question-id" aria-hidden="true">{item.id}</span></div>
        <h1>{isForced(item) ? item.type === "adaptive_forced" ? item.prompt : "Что чаще описывает вас в сложной ситуации?" : "Насколько это обычно про вас?"}</h1>
        <p className="question-instruction">{isForced(item) ? "Выберите сторону, которая чаще описывает вас. Если обе подходят одинаково — выберите середину." : "Оценивайте типичное поведение за последние 1–2 года, а не идеальный образ себя."}</p>
        <QuestionScale item={item} value={selectedValue} onChange={onAnswer} />
        <div className="question-footer">
          <div className="soft-timer">{softCue ? <><Timer size={15} /><span>Отвечайте скорее по типичному поведению.</span></> : <><Timer size={15} /><span>Мягкий ориентир времени · без автоперехода</span></>}</div>
          <Button className="orbita-button primary-button next-button" disabled={typeof selectedValue !== "number"} onClick={onNext} size="lg">{currentIndex + 1 === total ? "Завершить блок" : "Сохранить и продолжить"} <ArrowRight size={16} /></Button>
        </div>
        <div className="question-privacy"><ShieldCheck size={14} /> Названия шкал и «правильность» ответа не показываются.</div>
      </main>
    </div>
  );
}

function BreakView({
  adaptiveReady,
  onContinue,
  onExit,
  selection,
}: {
  adaptiveReady: boolean;
  onContinue: () => void;
  onExit: () => void;
  selection?: AdaptiveSelection;
}) {
  return (
    <div className="break-page">
      <div className="break-orbit"><OrbitGraphic compact /></div>
      <div className="break-copy">
        <div className="eyebrow"><span className="status-dot" /> {adaptiveReady ? "CORE COMPLETE" : "BLOCK SAVED"}</div>
        <h1>{adaptiveReady ? "Основной сигнал собран." : "Пауза — часть процесса."}</h1>
        <p>{adaptiveReady ? "Осталось несколько уточняющих вопросов, подобранных по вашим предыдущим ответам." : "Ваши ответы сохранены. Можно сделать паузу и вернуться к следующему блоку, когда будет удобно."}</p>
        <div className="break-status">
          <div><Check size={16} /><span>{adaptiveReady ? "250 базовых вопросов сохранены" : "50 вопросов сохранены"}</span></div>
          <div><Check size={16} /><span>{adaptiveReady ? "Профиль неопределённости рассчитан" : "Можно закрыть браузер и продолжить"}</span></div>
          {adaptiveReady && selection ? <div><Sparkles size={16} /><span>{selection.selectedItemIds.length} вопросов выбраны {selection.mode === "ai-openai" ? "AI selector" : "deterministic fallback"}</span></div> : null}
        </div>
        <div className="break-actions">
          <Button className="orbita-button primary-button" size="lg" onClick={onContinue}>{adaptiveReady ? "Ответить на уточнения" : "Продолжить" } <ArrowRight size={16} /></Button>
          <Button className="orbita-button secondary-button" size="lg" onClick={onExit}>Выйти и вернуться позже</Button>
        </div>
        <p className="break-note">Прогресс подтверждается сервером после каждого ответа; при временном обрыве браузер хранит только очередь повтора.</p>
      </div>
    </div>
  );
}

function ProcessingView({
  status,
  onOpenResults,
  onRetry,
  profile,
}: {
  status: "SCORING" | "REPORT_GENERATING" | "REPORT_FAILED_RETRYABLE" | "COMPLETE";
  onOpenResults: () => void;
  onRetry: () => void;
  profile?: ScoreProfile;
}) {
  const stages = [
    ["CORE_COMPLETE", "250 ответов зафиксированы"],
    ["SCORING", "Детерминированный score engine"],
    ["REPORT_GENERATING", "Структурированный отчёт"],
    ["COMPLETE", "Результат готов"],
  ];
  const activeIndex = status === "SCORING" ? 1 : status === "REPORT_GENERATING" ? 2 : 3;
  return (
    <div className="processing-page">
      <div className="processing-visual"><OrbitGraphic compact /><span className="processing-pulse" /></div>
      <div className="processing-copy">
        <div className="eyebrow"><span className="status-dot" /> JOB STATUS · {status}</div>
        <h1>Собираем вашу карту.</h1>
        <p>Баллы считает versioned engine. Report layer получает уже рассчитанные данные и не может изменить числа.</p>
        <div className="job-timeline">
          {stages.map(([name, body], index) => (
            <div className={index <= activeIndex ? "job-row done" : "job-row"} key={name}>
              <span className="job-marker">{index < activeIndex ? <Check size={13} /> : index === activeIndex ? <span className="job-spinner" /> : null}</span>
              <span><strong>{name}</strong><small>{body}</small></span>
            </div>
          ))}
        </div>
        {status === "COMPLETE" ? <Button className="orbita-button primary-button" size="lg" onClick={onOpenResults}>Открыть результат <ArrowRight size={16} /></Button> : status === "REPORT_FAILED_RETRYABLE" ? <Button className="orbita-button primary-button" size="lg" onClick={onRetry}>Повторить генерацию отчёта <RefreshCw size={16} /></Button> : <span className="processing-wait">Статус обновляется автоматически</span>}
        {profile ? <div className="processing-signature">score version · {profile.versions.scoring} · norm · {profile.versions.norms}</div> : null}
      </div>
    </div>
  );
}

function ScoreRow({ trait, index }: { trait: ScoreProfile["traits"][number]; index: number }) {
  const color = DOMAIN_COLORS[Math.floor(index / 5)] ?? "cyan";
  return (
    <div className="score-row">
      <span className={"rank-pill " + color}>{String(trait.rank).padStart(2, "0")}</span>
      <div className="score-name"><strong>{trait.name}</strong><small>{trait.code} · {scoreBand(trait.standardScore)}</small></div>
      <div className="score-bar"><span style={{ width: trait.standardScore + "%" }} /></div>
      <div className="score-number"><strong>{trait.standardScore}</strong><small>индекс {trait.profileIndex}</small></div>
      <div className="score-ci"><small>Диапазон</small><span>{trait.uncertaintyRange[0]}—{trait.uncertaintyRange[1]}</span></div>
    </div>
  );
}

function ResultsView({
  profile,
  report,
  provider,
  onNavigate,
  onPrint,
}: {
  profile: ScoreProfile;
  report: ReportJSON;
  provider?: string;
  onNavigate: (view: View) => void;
  onPrint: () => void;
}) {
  const top = profile.traits.slice(0, 5);
  return (
    <div className="results-page">
      <div className="results-head page-wrap">
        <div><div className="eyebrow"><span className="status-dot" /> ORBITA—30 / ваш результат</div><h1>Карта способа действовать.</h1><p>Срез от 15 сентября 2026 · {profile.versions.assessment} · версия для пилота</p></div>
        <div className="results-head-actions"><Button className="orbita-button secondary-button" onClick={onPrint}><Download size={16} /> Печать / сохранить PDF</Button><Button className="orbita-button ghost-button" onClick={() => onNavigate("account")}>В личный кабинет <ArrowRight size={16} /></Button></div>
      </div>
      <main className="page-wrap">
        <section className="results-overview">
          <div className="overview-fingerprint"><OrbitGraphic compact /><span className="fingerprint-caption">FINGERPRINT<br /><strong>{top.map((trait) => trait.code).join(" · ")}</strong></span></div>
          <div className="overview-summary"><span className="summary-label">КРАТКИЙ СИГНАЛ</span><p>{report.executiveSummary}</p><div className="overview-tags">{top.slice(0, 3).map((trait) => <Badge key={trait.code} className="outline-badge">{trait.name}</Badge>)}</div></div>
          <div className="overview-quality"><span className="summary-label">RESPONSE QUALITY</span><strong>{Math.round(profile.responseQuality.rqi * 100)}<small>%</small></strong><span>{profile.responseQuality.flags.length ? "есть флаги для внимания" : "без критических флагов"}</span></div>
        </section>

        <section className="results-section">
          <div className="results-section-head"><div><span className="section-index">01</span><div><h2>Top 5</h2><p>Наиболее естественные способы действия</p></div></div><span className="section-note">ранги с confidence intervals</span></div>
          <div className="top-five-grid">
            {top.map((trait, index) => (
              <article className={"top-card " + DOMAIN_COLORS[Math.floor(index / 5)]} key={trait.code}>
                <div className="top-card-head"><span>0{index + 1}</span><Badge className="outline-badge">индекс {trait.profileIndex}</Badge></div>
                <h3>{trait.name}</h3>
                <p>{trait.definition}</p>
                <div className="top-score"><strong>{trait.standardScore}</strong><span>standard score<br />диапазон {trait.uncertaintyRange[0]}—{trait.uncertaintyRange[1]}</span></div>
                <div className="top-card-line" />
              </article>
            ))}
          </div>
        </section>

        <section className="results-section profile-section">
          <div className="results-section-head"><div><span className="section-index">02</span><div><h2>Полный профиль 30</h2><p>Контекст важнее одного места</p></div></div><span className="section-note">θ + SE + пилотный индекс</span></div>
          <div className="score-list">{profile.traits.map((trait, index) => <ScoreRow index={index} key={trait.code} trait={trait} />)}</div>
        </section>

        <section className="results-section domains-section">
          <div className="results-section-head"><div><span className="section-index">03</span><div><h2>6 доменов</h2><p>Навигация, не замена профилю шкал</p></div></div></div>
          <div className="domain-score-grid">{profile.domains.map((domain, index) => <div className={"domain-score-card " + DOMAIN_COLORS[index]} key={domain.code}><span>{domain.code}</span><h3>{domain.name}</h3><strong>{domain.score}</strong><small>индекс {domain.profileIndex} · агрегат пяти θ</small><div className="mini-bar"><span style={{ width: domain.score + "%" }} /></div></div>)}</div>
        </section>

        <section className="results-section interpretation-section">
          <div className="results-section-head"><div><span className="section-index">04</span><div><h2>Как это может проявляться</h2><p>{provider === "openai" ? "Интерпретация через защищённый report provider" : "Интерпретация из approved library"}</p></div></div></div>
          <div className="interpretation-grid">
            <div className="interpretation-main">{report.topStrengths.slice(0, 3).map((item, index) => <article className="interpretation-card" key={item.trait}><div className="interpretation-tag">0{index + 1} · {traitName(item.trait)}</div><p>{item.contribution}</p><ul>{item.manifestations.map((line) => <li key={line}><Check size={14} /> {line}</li>)}</ul><div className="overuse"><span>OVERUSE / риск при условиях</span><p>{item.overuseRisk}</p></div></article>)}</div>
            <aside className="interpretation-side"><div className="side-block"><span className="summary-label">РАБОЧИЕ СРЕДЫ</span><ul>{report.workEnvironments.map((line) => <li key={line}><span className="list-marker" />{line}</li>)}</ul></div><div className="side-block"><span className="summary-label">КОМАНДА</span><p><strong>Вы даёте:</strong> {report.teamwork.gives}</p><p><strong>Вам полезно получать:</strong> {report.teamwork.needs}</p></div></aside>
          </div>
        </section>

        <section className="results-section plan-section">
          <div className="results-section-head"><div><span className="section-index">05</span><div><h2>План развития на 30 дней</h2><p>Пять наблюдаемых действий</p></div></div></div>
          <div className="plan-grid">{report.development30Days.map((action, index) => <div className="plan-row" key={action}><span>{String(index + 1).padStart(2, "0")}</span><p>{action}</p><span className="plan-check"><Check size={14} /></span></div>)}</div>
        </section>

        <section className="results-disclaimer"><ShieldCheck size={18} /><div><strong>Как читать уверенность</strong><p>{report.confidenceNote}</p></div></section>
      </main>
    </div>
  );
}

function AccountView({
  onNavigate,
  profile,
  demoMode,
  overview,
  loading,
  actionStatus,
  onStartAssessment,
  onOpenReport,
  onExport,
  onDelete,
  onDeleteAssessment,
}: {
  onNavigate: (view: View) => void;
  profile?: ScoreProfile;
  demoMode: boolean;
  overview?: AccountOverview;
  loading: boolean;
  actionStatus?: string;
  onStartAssessment: () => void;
  onOpenReport: (reportId: string) => void;
  onExport: () => void;
  onDelete: () => void;
  onDeleteAssessment: (assessmentId: string) => void;
}) {
  const counts = itemCountSummary();
  const latestAssessment = overview?.assessments[0];
  const paidOrder = overview?.orders.find((order) => order.status === "PAID");
  const hasWork = Boolean(latestAssessment);
  const displayName = overview?.user.displayName ?? "Ваш профиль";
  const assessmentAction = latestAssessment?.state === "COMPLETE"
    ? "Открыть результат"
    : latestAssessment
      ? "Продолжить оценку"
      : paidOrder
        ? "Начать оценку"
        : "Сначала оформить доступ";
  const profileAction = demoMode
    ? () => onNavigate("results")
    : latestAssessment?.reportId
      ? () => onOpenReport(latestAssessment.reportId as string)
      : latestAssessment
        ? onStartAssessment
        : () => onNavigate("results");
  return (
    <div className="page-wrap account-page">
      <SectionHeading eyebrow="ЛИЧНЫЙ КАБИНЕТ" title="Ваши сессии и результаты." body="Здесь хранятся доступы, прогресс и уже готовые версии отчётов." />
      <div className="account-grid">
        <Card className="account-card profile-account-card"><CardHeader><div className="account-profile-head"><span className="large-avatar">{displayName.slice(0, 1).toUpperCase()}</span><div><CardTitle>{displayName}</CardTitle><CardDescription>RU · данные под вашим контролем</CardDescription></div></div></CardHeader><CardContent><div className="account-setting"><span>Согласия</span><strong>управляются перед началом</strong><ChevronDown size={15} /></div><div className="account-setting"><span>Хранение</span><strong>экспорт и удаление доступны</strong><ChevronDown size={15} /></div><Button className="orbita-button secondary-button full-button" onClick={() => onNavigate("privacy")}>Управлять данными <LockKeyhole size={15} /></Button></CardContent></Card>
        <Card className="account-card"><CardHeader><div className="card-topline"><Badge className={latestAssessment?.state === "COMPLETE" ? "lime-badge" : "outline-badge"}>{loading ? "Загрузка…" : latestAssessment?.state ?? (paidOrder ? "Доступ активен" : "Нет доступа")}</Badge><span className="card-id">orbita30_ru_v1</span></div><CardTitle>ORBITA—30</CardTitle><CardDescription>{demoMode ? "Демо-профиль · не сохранён на сервере" : latestAssessment ? "Сессия сохранена на сервере" : paidOrder ? "Оплата подтверждена · можно начать" : "Оформите доступ, чтобы начать"}</CardDescription></CardHeader><CardContent>
          {profile ? <><div className="account-result-mini"><OrbitGraphic compact /><div><span>{demoMode ? "Демо Top 5" : latestAssessment?.state === "COMPLETE" ? "Top 5" : "Предварительный Top 5"}</span><strong>{profile.traits.slice(0, 3).map((trait) => trait.name).join(" · ")}</strong><small>RQI {Math.round(profile.responseQuality.rqi * 100)}%</small></div></div><Button className="orbita-button primary-button full-button" onClick={profileAction}>{demoMode ? "Открыть демо-результат" : assessmentAction} <ArrowRight size={16} /></Button></> : <><div className="account-empty"><span>{loading ? <RefreshCw size={17} /> : <Play size={17} />}</span><p>{loading ? "Загружаем ваши данные…" : hasWork ? "Сессия готова к продолжению." : paidOrder ? "Оплата подтверждена. Создайте сессию и начните с согласий." : "Пройдите тест или откройте демо, чтобы увидеть, как выглядит результат."}</p></div><Button className="orbita-button primary-button full-button" disabled={loading || (!paidOrder && !latestAssessment)} onClick={latestAssessment?.reportId ? () => onOpenReport(latestAssessment.reportId as string) : onStartAssessment}>{loading ? "Загрузка…" : latestAssessment ? assessmentAction : paidOrder ? "Начать оценку" : "Открыть каталог"} <ArrowRight size={16} /></Button>{!paidOrder && !latestAssessment ? <Button className="orbita-button ghost-button full-button" onClick={() => onNavigate("catalog")}>Посмотреть доступные оценки</Button> : null}</>}
        </CardContent></Card>
      </div>
      <div className="account-history-grid"><Card className="account-card"><CardHeader><CardTitle>Заказы</CardTitle><CardDescription>Цена и валюта зафиксированы в каждом order.</CardDescription></CardHeader><CardContent>{overview?.orders.length ? <div className="account-history-list">{overview.orders.map((order) => <div className="account-history-row" key={order.id}><span><strong>{order.testId}</strong><small>{new Date(order.createdAt).toLocaleString("ru-RU")}</small></span><span><strong>{(order.amountMinor / 100).toLocaleString("ru-RU")} {order.currency}</strong><small>{order.status}</small></span></div>)}</div> : <p className="account-muted">Заказов пока нет.</p>}</CardContent></Card><Card className="account-card"><CardHeader><CardTitle>Сессии</CardTitle><CardDescription>Последнее подтверждённое состояние хранится на сервере.</CardDescription></CardHeader><CardContent>{overview?.assessments.length ? <div className="account-history-list">{overview.assessments.map((assessment) => <div className="account-history-row" key={assessment.id}><span><strong>{assessment.state}</strong><small>{assessment.clientSeq} ответов · {new Date(assessment.updatedAt).toLocaleString("ru-RU")}</small></span><span className="account-row-actions">{assessment.reportId ? <Button className="orbita-button ghost-button" size="sm" onClick={() => onOpenReport(assessment.reportId as string)}>Отчёт</Button> : null}<Button className="orbita-button ghost-button" size="sm" aria-label="Удалить оценку" onClick={() => onDeleteAssessment(assessment.id)}><Trash2 size={14} /></Button></span></div>)}</div> : <p className="account-muted">Сессий пока нет.</p>}</CardContent></Card></div>
      <div className="account-footer-grid"><div className="account-stat"><span>Банк items</span><strong>{counts.total}</strong><small>{counts.forced} FC · {counts.likert} Likert · {counts.adaptiveDirect + counts.adaptiveForced} adaptive</small></div><div className="account-stat"><span>Версия scoring</span><strong>{VERSION_IDS.scoring}</strong><small>deterministic · reproducible</small></div><div className="account-stat"><span>Права данных</span><strong>готовы</strong><small>export · delete</small></div></div>
      <div className="account-data-actions"><Button className="orbita-button secondary-button" onClick={onExport}><Download size={15} /> Запросить экспорт данных</Button><Button className="orbita-button ghost-button" onClick={onDelete}><LockKeyhole size={15} /> Удалить аккаунт</Button>{actionStatus ? <span className="autosave-status"><span className="status-dot" />{actionStatus}</span> : null}</div>
    </div>
  );
}

function MethodologyView({ onNavigate }: { onNavigate: (view: View) => void }) {
  const counts = itemCountSummary();
  return (
    <div className="page-wrap methodology-page">
      <SectionHeading eyebrow="METHODOLOGY" title="Прозрачно — значит проверяемо." body="ORBITA—30 отделяет конструкт, raw responses, scoring, adaptive selection и report layer. Эта версия предназначена для пилота, а не для доказанных межличностных норм." />
      <div className="method-layout">
        <aside className="method-index"><span>СОДЕРЖАНИЕ</span><a href="#model">Модель</a><a href="#scoring">Scoring</a><a href="#adaptive">Adaptive</a><a href="#quality">Quality</a><a href="#validation">Валидация</a><a href="#limits">Ограничения</a></aside>
        <div className="method-content">
          <section className="method-block" id="model"><span className="section-index">01</span><h2>Модель конструкта</h2><p>Шесть доменов, по пять оригинальных шкал в каждом. Шкалы описывают предпочтительный способ действия; низкое значение не является дефектом.</p><div className="method-domain-grid">{TRAITS.map((trait, index) => <div key={trait.code}><span className={"domain-code " + DOMAIN_COLORS[Math.floor(index / 5)]}>{trait.code}</span><strong>{trait.name}</strong><p>{trait.definition}</p></div>)}</div></section>
          <section className="method-block" id="scoring"><span className="section-index">02</span><h2>Детерминированный scoring</h2><p>Одинаковый набор raw responses при одинаковых версиях даёт одинаковый score JSON. LLM не имеет права менять баллы.</p><div className="formula"><span>FC evidence</span><strong>−x / 2&nbsp;&nbsp; +x / 2</strong><span>для левой и правой шкалы</span><span>Base θ</span><strong>0.70 × FC_z + 0.30 × LK_z</strong><span>гибрид MVP до пилотных норм</span><span>Final θ</span><strong>weighted update</strong><span>adaptive evidence снижает SE</span></div><div className="version-row"><Badge variant="outline">assessment { VERSION_IDS.assessment }</Badge><Badge variant="outline">items { VERSION_IDS.itemBank }</Badge><Badge variant="outline">scoring { VERSION_IDS.scoring }</Badge><Badge variant="outline">norm { VERSION_IDS.norms }</Badge></div><p>Статус normStatus: unvalidated. Пилотный индекс профиля не является долей людей и не используется для межличностного сравнения.</p></section>
          <section className="method-block" id="adaptive"><span className="section-index">03</span><h2>Adaptive без выхода за банк</h2><p>Selector получает минимальный структурированный payload и может вернуть только ID из Q251–Q300. Backend валидирует диапазон 10–15, отсутствие дублей и quota per trait. При timeout работает deterministic fallback.</p><div className="adaptive-table"><div><span>Банк</span><strong>Q251–Q300</strong><small>{counts.adaptiveDirect} direct · {counts.adaptiveForced} discriminator</small></div><div><span>Цель</span><strong>10–15</strong><small>12 по умолчанию</small></div><div><span>Quota</span><strong>≤ 3</strong><small>на одну шкалу</small></div><div><span>Mode</span><strong>fallback</strong><small>validation passed</small></div></div></section>
          <section className="method-block" id="quality"><span className="section-index">04</span><h2>Response quality</h2><p>Флаги качества не обнуляют результат. Они формируют RQI и при необходимости предупреждение для внутренней аналитики и отчёта.</p><div className="quality-list"><div><Check size={15} /><span><strong>Attention check</strong><small>2 из 3 instructed-response не выполнены</small></span></div><div><Check size={15} /><span><strong>Too fast</strong><small>Исследовательский threshold до пилотной калибровки</small></span></div><div><Check size={15} /><span><strong>Straight-lining</strong><small>Модальная частота одинаковых Likert ответов, а не только первый ответ</small></span></div><div><Check size={15} /><span><strong>Contradiction</strong><small>Дополнительный приоритет адаптивным уточнениям</small></span></div><div><Check size={15} /><span><strong>Q243/Q246/Q249/Q250</strong><small>Контекстные consistency markers: учитываются в quality telemetry, не входят в trait score и помечены research-only.</small></span></div></div></section>
          <section className="method-block" id="validation"><span className="section-index">05</span><h2>Что должно быть проверено до launch</h2><div className="validation-grid">{["Экспертный review и cognitive interviews", "Pilot ≈500+ и item analysis", "EFA/CFA и reliability / SE", "Measurement invariance и DIF", "Нормы 1500–3000+ и cross-validation", "Visual regression PDF и accessibility e2e"].map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></div>)}</div></section>
          <section className="method-block limit-block" id="limits"><span className="section-index">06</span><h2>Ограничения</h2><p>Это не лицензированная реализация CliftonStrengths®, StrengthsFinder® или другого продукта Gallup. ORBITA—30 использует собственную модель, названия, вопросы, scoring и визуальный язык. Все 300 items имеют статус draft for pilot; перед production нужен независимый similarity review и юридическая проверка.</p><button className="text-link" onClick={() => onNavigate("privacy")} type="button">Privacy & data rights <ArrowRight size={15} /></button></section>
        </div>
      </div>
    </div>
  );
}

function AdminView({ profile, onNavigate, metrics }: { profile?: ScoreProfile; onNavigate: (view: View) => void; metrics?: AdminMetrics }) {
  const counts = itemCountSummary();
  const paidOrders = metrics?.orders.find((item) => item.status === "PAID")?.count ?? 0;
  const completedReports = metrics?.reports.find((item) => item.status === "COMPLETE")?.count ?? 0;
  const failedReports = metrics?.reports.find((item) => item.status === "REPORT_FAILED_RETRYABLE")?.count ?? 0;
  return (
    <div className="page-wrap admin-page">
      <div className="admin-heading"><div><div className="eyebrow">INTERNAL / ADMIN PREVIEW</div><h1>Контроль версии и качества.</h1><p>Лёгкий интерфейс для проверки item bank, scoring configs и telemetry без доступа к ответам по умолчанию.</p></div><Badge className="outline-badge">read-only demo</Badge></div>
      <div className="admin-metrics"><div><span>Item bank</span><strong>{counts.total}</strong><small>Q001–Q300 · draft for pilot</small></div><div><span>Users</span><strong>{metrics?.users ?? "—"}</strong><small>server-side aggregate</small></div><div><span>Paid orders</span><strong>{metrics ? paidOrders : "—"}</strong><small>signed webhook events</small></div><div><span>Reports</span><strong>{metrics ? completedReports : "—"}</strong><small>{metrics ? failedReports + " retryable" : "admin allowlist required"}</small></div><div><span>Pilot sample</span><strong>{metrics?.pilotAnalytics.sampleSize ?? "—"}</strong><small>{metrics?.pilotAnalytics.insufficientData ? `нужно ≥${metrics.pilotAnalytics.minimumSampleForPsychometrics}, stats скрыты` : "descriptive pilot only"}</small></div></div>
      <div className="admin-grid"><Card className="admin-panel"><CardHeader><CardTitle>Item Bank</CardTitle><CardDescription>Структура, необходимая для локального review</CardDescription></CardHeader><CardContent><div className="admin-table"><div className="admin-table-head"><span>ID range</span><span>Тип</span><span>Кол-во</span><span>Статус</span></div>{[["Q001–Q150", "forced-choice", counts.forced, "draft"], ["Q151–Q240", "Likert core", counts.likert, "draft"], ["Q241–Q250", "quality", counts.quality, "research-only"], ["Q251–Q280", "adaptive direct", counts.adaptiveDirect, "pilot pool"], ["Q281–Q300", "discriminator", counts.adaptiveForced, "pilot pool"]].map(([range, type, count, status]) => <div className="admin-table-row" key={range}><span>{range}</span><span>{type}</span><strong>{count}</strong><Badge variant={status === "pilot pool" ? "secondary" : "outline"}>{status}</Badge></div>)}</div></CardContent></Card><Card className="admin-panel"><CardHeader><CardTitle>Последний run</CardTitle><CardDescription>{metrics ? "Сводка доступна только allowlisted admin" : "Для сводки нужен admin allowlist"}</CardDescription></CardHeader><CardContent><div className="audit-list"><div><span className="audit-icon"><Check size={14} /></span><span><strong>Score JSON</strong><small>{profile ? "готов · " + profile.versions.scoring : "ожидает сессию"}</small></span></div><div><span className="audit-icon"><ShieldCheck size={14} /></span><span><strong>Quality flags</strong><small>{profile ? profile.responseQuality.flags.length + " flags" : "не запускался"}</small></span></div><div><span className="audit-icon"><FileText size={14} /></span><span><strong>Report JSON</strong><small>{metrics ? completedReports + " complete" : "protected metrics"}</small></span></div><div><span className="audit-icon"><LockKeyhole size={14} /></span><span><strong>PII boundary</strong><small>{metrics ? "aggregate only" : "payload minimized"}</small></span></div></div><Button className="orbita-button secondary-button full-button" onClick={() => onNavigate("methodology")}>Открыть методологию <ArrowRight size={15} /></Button></CardContent></Card></div>
    </div>
  );
}

export function OrbitaApp({
  initialView = "home",
  initialSessionId,
  initialReportId,
}: {
  initialView?: View;
  initialSessionId?: string;
  initialReportId?: string;
}) {
  const [view, setView] = useState<View>(initialView);
  const [phase, setPhase] = useState<Phase>("core");
  const [reportId, setReportId] = useState<string | undefined>(initialReportId);
  const [responses, setResponses] = useState<ResponseMap>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [adaptiveIndex, setAdaptiveIndex] = useState(0);
  const [selection, setSelection] = useState<AdaptiveSelection>();
  const [profile, setProfile] = useState<ScoreProfile>();
  const [report, setReport] = useState<ReportJSON>();
  const [reportProvider, setReportProvider] = useState<string>();
  const [autosaveStatus, setAutosaveStatus] = useState("готово");
  const [requestError, setRequestError] = useState<string>();
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string>();
  const [publicCatalog, setPublicCatalog] = useState<PublicCatalog>();
  const [accountOverview, setAccountOverview] = useState<AccountOverview>();
  const [accountLoading, setAccountLoading] = useState(initialView === "account");
  const [accountActionStatus, setAccountActionStatus] = useState<string>();
  const [adminMetrics, setAdminMetrics] = useState<AdminMetrics>();
  const [demoMode, setDemoMode] = useState(false);
  const questionStartedAt = useRef(0);
  const sessionIdRef = useRef(initialSessionId);
  const reportIdRef = useRef(initialReportId);
  const pendingRef = useRef<PendingResponse[]>([]);
  const pendingPromisesRef = useRef(new Map<string, Promise<void>>());
  const serverSavedRef = useRef(new Set<string>());
  const webMcpStateRef = useRef({ sessionId: undefined as string | undefined, phase, view, answered: 0, coreAnswered: 0, adaptiveCount: 0, activeItemId: undefined as string | undefined });
  const webMcpActionsRef = useRef<{ start: () => Promise<void>; submit: (value: number) => Promise<void> }>({ start: async () => undefined, submit: async () => undefined });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<"SCORING" | "REPORT_GENERATING" | "REPORT_FAILED_RETRYABLE" | "COMPLETE">("SCORING");
  const [consents, setConsents] = useState({ terms: false, privacy: false, research: false, marketing: false });

  const activateSession = (id?: string) => {
    sessionIdRef.current = id;
  };

  const activateReport = (id?: string) => {
    reportIdRef.current = id;
    setReportId(id);
  };

  const go = (next: View) => {
    setView(next);
    window.history.replaceState({}, "", routeForView(next, { sessionId: sessionIdRef.current, reportId: reportIdRef.current, phase }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const adaptiveItems = useMemo(
    () => (selection?.selectedItemIds ?? []).map((id) => getItemById(id)).filter((item): item is Item => Boolean(item)),
    [selection],
  );
  const activeItem = phase === "core" ? CORE_ITEMS[questionIndex] : adaptiveItems[adaptiveIndex];
  const activeValue = activeItem ? responses[activeItem.id] : undefined;
  const firstUnansweredCore = CORE_ITEMS.findIndex((item) => typeof responses[item.id] !== "number");

  const hydrateSession = (payload: SessionPayload) => {
    const pending = pendingForSession(pendingRef.current, payload.id);
    const pendingResponses = Object.fromEntries(pending.map((item) => [item.itemId, item.response])) as ResponseMap;
    serverSavedRef.current = new Set(Object.keys(payload.responses));
    setResponses({ ...payload.responses, ...pendingResponses });
    if (payload.consents?.length) {
      setConsents((current) => payload.consents!.reduce((next, consent) => ({ ...next, [consent.consentType]: consent.granted }), current));
    }
    if (payload.adaptive_item_ids.length) {
      setSelection({
        selectedItemIds: payload.adaptive_item_ids,
        targetCount: payload.adaptive_item_ids.length,
        mode: payload.selection_mode ?? "deterministic-fallback",
        validation: "passed",
        reasonCodes: {},
      });
    }
    if (payload.profile) setProfile(payload.profile);
    activateSession(payload.id);
    if (payload.report_id) activateReport(payload.report_id);
    setPhase(payload.state.includes("ADAPTIVE") || payload.state === "REPORT_GENERATING" || payload.state === "REPORT_FAILED_RETRYABLE" || payload.state === "COMPLETE" ? "adaptive" : "core");
    const coreIndex = CORE_ITEMS.findIndex((item) => typeof payload.responses[item.id] !== "number");
    setQuestionIndex(coreIndex >= 0 ? coreIndex : CORE_ITEMS.length - 1);
    void apiJson("/api/telemetry", {
      method: "POST",
      body: JSON.stringify({ name: "resume", assessment_id: payload.id, metadata: { status: payload.state, count: Object.keys(payload.responses).length } }),
    }).catch(() => undefined);
  };

  const loadReportData = async (id: string, openWhenReady = false) => {
    try {
      const payload = await apiJson<ReportPayload>(`/api/reports/${encodeURIComponent(id)}`);
      activateReport(payload.id);
      setProfile(payload.score);
      setReportProvider(payload.provider ?? undefined);
      setReport(payload.report ?? undefined);
      if (payload.status === "COMPLETE" && payload.report) {
        setProcessingStatus("COMPLETE");
        if (openWhenReady) {
          setView("results");
          window.history.replaceState({}, "", `/results/${payload.id}`);
        }
      } else if (payload.status === "REPORT_FAILED_RETRYABLE") {
        setProcessingStatus("REPORT_FAILED_RETRYABLE");
      } else {
        setProcessingStatus("REPORT_GENERATING");
      }
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось загрузить отчёт.");
    }
  };

  const loadSessionData = async (id: string) => {
    try {
      const payload = await apiJson<SessionPayload>(`/api/assessments/${encodeURIComponent(id)}`);
      hydrateSession(payload);
      if (payload.report_id) void loadReportData(payload.report_id, initialView === "results");
      if (payload.state === "PAID") setView("consent");
      else if (payload.state === "CONSENTED" || payload.state === "CORE_IN_PROGRESS") setView(initialView === "break" ? "break" : "assessment");
      else if (payload.state === "ADAPTIVE_IN_PROGRESS") setView(initialView === "processing" ? "processing" : "break");
      else if (payload.state === "REPORT_GENERATING" || payload.state === "REPORT_FAILED_RETRYABLE") setView("processing");
      else if (payload.state === "COMPLETE") setView(initialView === "results" ? "results" : "processing");
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось загрузить сессию.");
    }
  };

  const sendPendingResponse = async (pending: PendingResponse) => {
    try {
      await apiJson(`/api/assessments/${encodeURIComponent(pending.sessionId)}/responses`, {
        method: "POST",
        headers: { "Idempotency-Key": pending.idempotencyKey },
        body: JSON.stringify({
          item_id: pending.itemId,
          response: pending.response,
          response_time_ms: pending.responseTimeMs,
          client_seq: pending.clientSeq,
        }),
      });
      serverSavedRef.current.add(pending.itemId);
      pendingRef.current = removePending(pendingRef.current, pending.idempotencyKey);
      writePendingResponses(pendingRef.current);
      setAutosaveStatus("ответ сохранён");
    } catch (error) {
      setAutosaveStatus("ожидает соединения");
      throw error;
    }
  };

  const persistPendingResponse = (pending: PendingResponse) => {
    const existing = pendingPromisesRef.current.get(pending.idempotencyKey);
    if (existing) return existing;
    const request = sendPendingResponse(pending).finally(() => {
      pendingPromisesRef.current.delete(pending.idempotencyKey);
    });
    pendingPromisesRef.current.set(pending.idempotencyKey, request);
    return request;
  };

  const flushPendingResponses = async () => {
    const pending = [...pendingRef.current];
    for (const item of pending) {
      try {
        await persistPendingResponse(item);
      } catch {
        // Keep the remaining queue for the next online event or explicit retry.
      }
    }
  };

  const finishCore = async () => {
    if (!sessionIdRef.current) return;
    setAutosaveStatus("считаем основной сигнал…");
    try {
      const result = await apiJson<{ state: string; preliminary_score: ScoreProfile; adaptive: AdaptiveSelection }>(`/api/assessments/${encodeURIComponent(sessionIdRef.current)}/complete-core`, { method: "POST" });
      setProfile(result.preliminary_score);
      setSelection(result.adaptive);
      setPhase("adaptive");
      setRequestError(undefined);
      go("break");
      void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "adaptive_selected", assessment_id: sessionIdRef.current, metadata: { count: result.adaptive.selectedItemIds.length } }) }).catch(() => undefined);
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось завершить основной блок.");
    }
  };

  const completeAdaptive = async () => {
    if (!sessionIdRef.current) return;
    setProcessingStatus("SCORING");
    setRequestError(undefined);
    go("processing");
    try {
      const result = await apiJson<{ state: string; report_id: string; report_status: string; score: ScoreProfile; report: ReportJSON | null; pdf_available: boolean }>(`/api/assessments/${encodeURIComponent(sessionIdRef.current)}/complete`, { method: "POST" });
      activateReport(result.report_id);
      setProfile(result.score);
      setReport(result.report ?? undefined);
      setProcessingStatus(result.report_status === "COMPLETE" && result.report ? "COMPLETE" : result.report_status === "REPORT_FAILED_RETRYABLE" ? "REPORT_FAILED_RETRYABLE" : "REPORT_GENERATING");
      setReportProvider(undefined);
      void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "report_viewed", assessment_id: sessionIdRef.current }) }).catch(() => undefined);
    } catch (error) {
      setProcessingStatus("REPORT_FAILED_RETRYABLE");
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось сформировать отчёт.");
    }
  };

  const saveResponse = (value: number, waitForServer = false) => {
    if (!activeItem || !sessionIdRef.current || demoMode) return;
    if (serverSavedRef.current.has(activeItem.id)) return;
    const alreadyPending = findPendingItem(pendingRef.current, sessionIdRef.current, activeItem.id);
    if (alreadyPending) {
      setAutosaveStatus("сохраняем первый выбор…");
      if (waitForServer) return persistPendingResponse(alreadyPending);
      return;
    }
    const responseTimeMs = Math.max(0, Date.now() - questionStartedAt.current);
    const pending: PendingResponse = {
      sessionId: sessionIdRef.current,
      itemId: activeItem.id,
      response: value,
      responseTimeMs,
      clientSeq: Object.keys(responses).length + 1,
      idempotencyKey: `${sessionIdRef.current}:${activeItem.id}:${crypto.randomUUID()}`,
    };
    pendingRef.current = enqueuePending(pendingRef.current, pending);
    writePendingResponses(pendingRef.current);
    setResponses((current) => ({ ...current, [activeItem.id]: value }));
    setAutosaveStatus("сохраняем…");
    const request = persistPendingResponse(pending);
    if (waitForServer) return request;
    void request.catch(() => undefined);
  };

  const beginAssessment = async () => {
    if (!sessionIdRef.current) {
      setRequestError("Сначала создайте оплаченный доступ в личном кабинете.");
      return;
    }
    if (!(consents.terms && consents.privacy)) return;
    try {
      await apiJson(`/api/assessments/${encodeURIComponent(sessionIdRef.current)}`, {
        method: "PATCH",
        body: JSON.stringify({ consented: true, consents }),
      });
      setPhase("core");
      setQuestionIndex(firstUnansweredCore >= 0 ? firstUnansweredCore : 0);
      setAdaptiveIndex(0);
      setRequestError(undefined);
      questionStartedAt.current = Date.now();
      setElapsedSeconds(0);
      go("assessment");
      void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "assessment_started", assessment_id: sessionIdRef.current }) }).catch(() => undefined);
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось сохранить согласия.");
    }
  };

  const nextQuestion = async (responseOverride?: number) => {
    const currentResponse = typeof responseOverride === "number" ? responseOverride : activeItem ? responses[activeItem.id] : undefined;
    if (!activeItem || typeof currentResponse !== "number") return;
    const pending = findPendingItem(pendingRef.current, sessionIdRef.current, activeItem.id);
    if (pending) {
      try {
        await persistPendingResponse(pending);
      } catch (error) {
        setRequestError(error instanceof ApiClientError ? error.message : "Ответ ещё не подтверждён сервером.");
        return;
      }
    }
    if (!serverSavedRef.current.has(activeItem.id)) return;
    if (phase === "core") {
      const nextIndex = questionIndex + 1;
      if (nextIndex >= CORE_ITEMS.length) {
        await finishCore();
      } else {
        questionStartedAt.current = Date.now();
        setElapsedSeconds(0);
        setQuestionIndex(nextIndex);
        if (nextIndex % 50 === 0) {
          void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "block_completed", assessment_id: sessionIdRef.current, metadata: { block: nextIndex / 50 } }) }).catch(() => undefined);
          go("break");
        }
      }
    } else {
      const nextIndex = adaptiveIndex + 1;
      if (nextIndex >= adaptiveItems.length) await completeAdaptive();
      else {
        questionStartedAt.current = Date.now();
        setElapsedSeconds(0);
        setAdaptiveIndex(nextIndex);
      }
    }
  };

  const startCheckout = async () => {
    if (!publicCatalog?.test.availableForCheckout) {
      setCheckoutError("Оплата пока недоступна: цена или Stripe ещё не настроены.");
      return;
    }
    setCheckoutBusy(true);
    setCheckoutError(undefined);
    try {
      void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "checkout_started", metadata: { provider: "stripe", mode: "hosted" } }) }).catch(() => undefined);
      const result = await apiJson<{ checkout_url: string }>('/api/checkout', {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ test_id: "orbita30" }),
      });
      if (!result.checkout_url) throw new ApiClientError("CHECKOUT_URL_MISSING", "Платёжная ссылка не была создана.");
      void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "checkout_redirected" }) }).catch(() => undefined);
      window.location.assign(result.checkout_url);
    } catch (error) {
      setCheckoutError(error instanceof ApiClientError ? error.message : "Не удалось открыть оплату.");
    } finally {
      setCheckoutBusy(false);
    }
  };

  const startAssessmentFromAccount = async () => {
    setAccountActionStatus("создаём сессию…");
    try {
      const result = await apiJson<{ id: string }>("/api/assessments", { method: "POST", body: JSON.stringify({ test_id: "orbita30" }) });
      activateSession(result.id);
      setDemoMode(false);
      setProfile(undefined);
      setReport(undefined);
      setSelection(undefined);
      setResponses({});
      serverSavedRef.current = new Set();
      await loadSessionData(result.id);
      setView("consent");
      window.history.replaceState({}, "", `/assessment/${result.id}`);
      setAccountActionStatus("сессия готова");
    } catch (error) {
      setAccountActionStatus(error instanceof ApiClientError ? error.message : "Не удалось создать сессию.");
    }
  };

  const openReport = async (id: string) => {
    activateReport(id);
    setProcessingStatus("REPORT_GENERATING");
    setRequestError(undefined);
    go("processing");
    await loadReportData(id);
  };

  const retryReport = async () => {
    if (!reportIdRef.current) return;
    setProcessingStatus("REPORT_GENERATING");
    setRequestError(undefined);
    try {
      await apiJson(`/api/reports/${encodeURIComponent(reportIdRef.current)}/regenerate`, { method: "POST" });
      await loadReportData(reportIdRef.current);
    } catch (error) {
      setProcessingStatus("REPORT_FAILED_RETRYABLE");
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось повторить генерацию.");
    }
  };

  const downloadReport = async () => {
    if (!reportIdRef.current || demoMode) {
      window.print();
      return;
    }
    try {
      const link = await apiJson<{ download_path: string }>(`/api/reports/${encodeURIComponent(reportIdRef.current)}/download-link`, { method: "POST" });
      const response = await fetch(link.download_path, { credentials: "include" });
      if (!response.ok) throw new ApiClientError("PDF_DOWNLOAD_FAILED", "Не удалось скачать PDF.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `orbita-30-${reportIdRef.current}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setRequestError(error instanceof ApiClientError ? error.message : "Не удалось скачать PDF.");
    }
  };

  const openDemo = () => {
    const demoResponses = buildDemoResponses();
    const demoProfile = scoreAssessment(demoResponses);
    const demoCoreAnswered = Object.keys(demoResponses).filter((id) => Number(id.slice(1)) <= 250);
    const demoSelection = selectAdaptiveItems(demoProfile, demoCoreAnswered, 12);
    activateSession(undefined);
    activateReport(undefined);
    setDemoMode(true);
    setResponses(demoResponses);
    setSelection(demoSelection);
    setProfile(demoProfile);
    setReport(buildReport(demoProfile));
    setPhase("adaptive");
    go("results");
  };

  const setConsent = (key: "terms" | "privacy" | "research" | "marketing", value: boolean) => {
    setConsents((current) => ({ ...current, [key]: value }));
  };

  const continueFromBreak = () => {
    if (phase === "core") {
      setQuestionIndex(firstUnansweredCore >= 0 ? firstUnansweredCore : 0);
      go("assessment");
    } else {
      const nextAdaptive = adaptiveItems.findIndex((item) => typeof responses[item.id] !== "number");
      setAdaptiveIndex(nextAdaptive >= 0 ? nextAdaptive : 0);
      go("assessment");
    }
  };

  useEffect(() => {
    webMcpStateRef.current = {
      sessionId: sessionIdRef.current,
      phase,
      view,
      answered: Object.keys(responses).length,
      coreAnswered: Object.keys(responses).filter((id) => Number(id.slice(1)) <= 250).length,
      adaptiveCount: adaptiveItems.length,
      activeItemId: activeItem?.id,
    };
    webMcpActionsRef.current = {
      start: startAssessmentFromAccount,
      submit: async (value: number) => {
        if (!activeItem) throw new Error("There is no active ORBITA question.");
        if (demoMode) throw new Error("The demo profile cannot accept persisted answers.");
        if (serverSavedRef.current.has(activeItem.id)) throw new Error("The current question is already answered.");
        await saveResponse(value, true);
        await nextQuestion(value);
      },
    };
  // The action functions are intentionally stored in refs for one-time WebMCP registration.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, view, responses, adaptiveItems, activeItem, demoMode]);

  useEffect(() => {
    pendingRef.current = readPendingResponses();
    void flushPendingResponses();
    const onOnline = () => void flushPendingResponses();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  // The listener must be registered once; it reads the mutable retry queue ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (initialSessionId) void loadSessionData(initialSessionId);
      else if (initialReportId) void loadReportData(initialReportId, true);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSessionId, initialReportId]);

  useEffect(() => {
    if (view !== "assessment") return;
    questionStartedAt.current = Date.now();
    const started = questionStartedAt.current;
    const interval = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [view, phase, questionIndex, adaptiveIndex]);

  useEffect(() => {
    if (view !== "checkout" && view !== "support") return;
    let cancelled = false;
    void apiJson<PublicCatalog>("/api/catalog")
      .then((payload) => { if (!cancelled) setPublicCatalog(payload); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [view]);

  useEffect(() => {
    if (view !== "catalog" || demoMode) return;
    void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "catalog_viewed" }) }).catch(() => undefined);
    void apiJson("/api/telemetry", { method: "POST", body: JSON.stringify({ name: "test_view", metadata: { test_id: "orbita30" } }) }).catch(() => undefined);
  }, [view, demoMode]);

  useEffect(() => {
    if (view !== "assessment" || demoMode || !sessionIdRef.current) return;
    const onBeforeUnload = () => {
      const payload = JSON.stringify({ name: "assessment_abandoned", assessment_id: sessionIdRef.current });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/telemetry", new Blob([payload], { type: "application/json" }));
      } else {
        void apiJson("/api/telemetry", { method: "POST", body: payload }).catch(() => undefined);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [view, demoMode, phase]);

  useEffect(() => {
    if (view !== "account") return;
    let cancelled = false;
    let timer: number | undefined;
    const load = async () => {
      setAccountLoading(true);
      try {
        const payload = await apiJson<AccountOverview>("/api/account");
        if (!cancelled) setAccountOverview(payload);
      } catch (error) {
        if (!cancelled) setAccountActionStatus(error instanceof ApiClientError ? error.message : "Не удалось загрузить кабинет.");
      } finally {
        if (!cancelled) setAccountLoading(false);
      }
    };
    void load();
    if (window.location.search.includes("payment=success")) timer = window.setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [view]);

  useEffect(() => {
    if (view !== "admin") return;
    void apiJson<AdminMetrics>("/api/admin/overview")
      .then((payload) => setAdminMetrics(payload))
      .catch(() => undefined);
  }, [view]);

  useEffect(() => {
    if (view !== "processing" || !reportId || processingStatus === "COMPLETE" || processingStatus === "REPORT_FAILED_RETRYABLE") return;
    let cancelled = false;
    let timer: number | undefined;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const payload = await apiJson<ReportPayload>(`/api/reports/${encodeURIComponent(reportId)}`);
        if (cancelled) return;
        setProfile(payload.score);
        setReportProvider(payload.provider ?? undefined);
        setReport(payload.report ?? undefined);
        if (payload.status === "COMPLETE" && payload.report) setProcessingStatus("COMPLETE");
        else if (payload.status === "REPORT_FAILED_RETRYABLE") setProcessingStatus("REPORT_FAILED_RETRYABLE");
        else if (attempts < 40) timer = window.setTimeout(poll, 1500);
        else setProcessingStatus("REPORT_FAILED_RETRYABLE");
      } catch (error) {
        if (!cancelled) setRequestError(error instanceof ApiClientError ? error.message : "Не удалось проверить статус отчёта.");
        if (!cancelled && attempts < 40) timer = window.setTimeout(poll, 2000);
        else if (!cancelled) setProcessingStatus("REPORT_FAILED_RETRYABLE");
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [view, reportId, processingStatus]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: "get_orbita_progress",
        title: "Get ORBITA progress",
        description: "Read the current ORBITA-30 session state and progress without changing it.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: async () => ({ ...webMcpStateRef.current, sessionId: webMcpStateRef.current.sessionId ?? null, activeItemId: webMcpStateRef.current.activeItemId ?? null }),
      },
      {
        name: "start_orbita_assessment",
        title: "Start ORBITA assessment",
        description: "Create or resume the authenticated user's paid ORBITA-30 assessment session.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async () => { await webMcpActionsRef.current.start(); return { sessionId: webMcpStateRef.current.sessionId ?? null, view: "consent" }; },
      },
      {
        name: "submit_orbita_answer",
        title: "Submit ORBITA answer",
        description: "Submit one answer for the currently displayed ORBITA-30 question and persist it.",
        inputSchema: { type: "object", properties: { value: { type: "integer", minimum: -2, maximum: 7 } }, required: ["value"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input: unknown) => {
          const value = input && typeof input === "object" && typeof (input as { value?: unknown }).value === "number" ? (input as { value: number }).value : NaN;
          if (!Number.isInteger(value) || !webMcpStateRef.current.activeItemId) throw new Error("A valid integer answer and active question are required.");
          const itemId = webMcpStateRef.current.activeItemId;
          await webMcpActionsRef.current.submit(value);
          return { itemId, accepted: true, nextView: webMcpStateRef.current.view };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
      } catch {
        // Unsupported or rejected registration must not affect the visible product.
      }
    }
    return () => lifecycle.abort();
  }, []);

  const renderView = () => {
    if (view === "home") return <HomeView onNavigate={go} onDemo={openDemo} />;
    if (view === "catalog") return <CatalogView onNavigate={go} />;
    if (view === "detail") return <DetailView onNavigate={go} onDemo={openDemo} />;
    if (view === "checkout") return <CheckoutView onNavigate={go} onCheckout={startCheckout} busy={checkoutBusy} error={checkoutError} catalog={publicCatalog} />;
    if (view === "consent") return <ConsentView consents={consents} onConsentChange={setConsent} onBegin={beginAssessment} onBack={() => go("account")} onPrivacy={() => go("privacy")} />;
    if (view === "assessment") return <AssessmentView phase={phase} item={activeItem} currentIndex={phase === "core" ? questionIndex % 50 : adaptiveIndex} total={phase === "core" ? 50 : adaptiveItems.length} blockNumber={Math.floor(questionIndex / 50) + 1} selectedValue={activeValue} onAnswer={saveResponse} onNext={nextQuestion} onPause={() => go("break")} autosaveStatus={autosaveStatus} elapsedSeconds={elapsedSeconds} />;
    if (view === "break") return <BreakView adaptiveReady={phase === "adaptive"} selection={selection} onContinue={continueFromBreak} onExit={() => go("account")} />;
    if (view === "processing") return <ProcessingView status={processingStatus} onOpenResults={() => go("results")} onRetry={retryReport} profile={profile} />;
    if (view === "results" && profile && report) return <ResultsView profile={profile} report={report} provider={reportProvider} onNavigate={go} onPrint={downloadReport} />;
    if (view === "account") return <AccountView onNavigate={go} profile={profile} demoMode={demoMode} overview={accountOverview} loading={accountLoading} actionStatus={accountActionStatus} onStartAssessment={startAssessmentFromAccount} onOpenReport={(id) => void openReport(id)} onExport={async () => { try { const result = await apiJson<{ downloadPath: string }>("/api/account/export", { method: "POST" }); setAccountActionStatus("экспорт готов"); topLevelNavigate(result.downloadPath); } catch (error) { setAccountActionStatus(error instanceof ApiClientError ? error.message : "Не удалось подготовить экспорт."); } }} onDelete={async () => { if (!window.confirm("Удалить аккаунт и все сохранённые ответы? Это действие нельзя отменить.")) return; try { await apiJson("/api/account/delete", { method: "POST", body: JSON.stringify({ confirm: "DELETE" }) }); topLevelNavigate("/signout-with-chatgpt?return_to=%2F"); } catch (error) { setAccountActionStatus(error instanceof ApiClientError ? error.message : "Не удалось удалить аккаунт."); } }} onDeleteAssessment={async (assessmentId) => { if (!window.confirm("Удалить эту оценку, ответы и PDF? Это действие нельзя отменить.")) return; try { await apiJson(`/api/assessments/${encodeURIComponent(assessmentId)}`, { method: "DELETE", body: JSON.stringify({ confirm: "DELETE_ASSESSMENT" }) }); setAccountActionStatus("оценка удалена"); const refreshed = await apiJson<AccountOverview>("/api/account"); setAccountActionStatus("оценка удалена"); setAccountOverview(refreshed); } catch (error) { setAccountActionStatus(error instanceof ApiClientError ? error.message : "Не удалось удалить оценку."); } }} />;
    if (view === "methodology") return <MethodologyView onNavigate={go} />;
    if (view === "admin") return <AdminView profile={profile} metrics={adminMetrics} onNavigate={go} />;
    if (view === "privacy" || view === "terms" || view === "faq" || view === "support") return <InfoView kind={view} onNavigate={go} supportContact={publicCatalog?.supportContact} />;
    return <HomeView onNavigate={go} onDemo={openDemo} />;
  };

  const immersive = view === "assessment";
  return (
    <div className={immersive ? "orbita-app immersive" : "orbita-app"}>
      {!immersive ? <AppHeader onNavigate={go} view={view} /> : null}
      {requestError ? <div className="global-error" role="alert">{requestError}<button onClick={() => setRequestError(undefined)} type="button" aria-label="Закрыть">×</button></div> : null}
      {renderView()}
      {!immersive ? <Footer onNavigate={go} /> : null}
      {view !== "admin" && !immersive ? <button className="admin-secret" onClick={() => go("admin")} type="button" aria-label="Открыть внутреннюю панель">⌘</button> : null}
    </div>
  );
}
