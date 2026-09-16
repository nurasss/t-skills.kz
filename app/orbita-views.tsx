"use client";

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
import type { AccountOverview, AdminMetrics, AssessmentItem, Phase, PublicCatalog, View } from "@/app/orbita-view-types";
import { traitName, V2_VERSION_IDS, type AdaptiveSelection, type ReportJSON, type ScoreProfile } from "@/lib/assessment-engine";
import { TRAITS } from "@/lib/item-bank";
import { APPROVED_FALLBACK_BANK, CORE60_BANK } from "@/lib/v2-item-bank";

const DOMAIN_COLORS = ["coral", "cyan", "lime", "violet", "amber", "blue"];
const RESPONSE_LABELS = [
  "Сильно левое",
  "Скорее левое",
  "Одинаково",
  "Скорее правое",
  "Сильно правое",
];
const LIKERT_LABELS = ["1", "2", "3", "4", "5", "6", "7"];
const CORE60_LIKERT_COUNT = CORE60_BANK.filter((item) => item.format === "likert").length;
const CORE60_FORCED_COUNT = CORE60_BANK.filter((item) => item.format === "forced_choice").length;

function isForced(item: AssessmentItem) {
  return ("type" in item && (item.type === "forced" || item.type === "adaptive_forced")) || ("format" in item && item.format === "forced_choice");
}

function scoreBand(score: number) {
  if (score >= 75) return "выраженный диапазон";
  if (score >= 55) return "рабочий диапазон";
  return "менее естественный режим";
}

export function AppHeader({
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

export function Footer({ onNavigate }: { onNavigate: (view: View) => void }) {
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

export function HomeView({ onNavigate, onDemo }: { onNavigate: (view: View) => void; onDemo: () => void }) {
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
        <div><strong>60</strong><span>основных<br />вопросов</span></div>
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
            ["01", "Ответить честно", "60 основных вопросов о типичном поведении. По одному на экран, с паузами между блоками."],
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

export function CatalogView({ onNavigate }: { onNavigate: (view: View) => void }) {
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
            <div className="card-topline"><Badge className="lime-badge">Основной тест</Badge><span className="card-id">orbita30_ru_v2</span></div>
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

export function DetailView({ onNavigate, onDemo }: { onNavigate: (view: View) => void; onDemo: () => void }) {
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
              ["02", "60 + 10–15", "Стандартизированный baseline и адаптивное уточнение по uncertainty."],
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

export function CheckoutView({
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
  const betaFree = test?.accessMode === "beta-free";
  return (
    <div className="page-wrap narrow-page">
      <button className="back-link" onClick={() => onNavigate("detail")} type="button"><ArrowLeft size={15} /> ORBITA—30</button>
      <SectionHeading eyebrow={betaFree ? "ЗАКРЫТАЯ BETA" : "CHECKOUT"} title={betaFree ? "Бесплатное пилотное тестирование" : "Оформление теста"} body={betaFree ? "Доступ предоставляется участникам закрытой beta без оплаты. Результаты не являются нормативной или диагностической оценкой." : "После подтверждения оплаты создаётся одноразовый доступ к конкретной версии оценки."} />
      <div className="checkout-grid">
        <Card className="checkout-card">
          <CardHeader><CardTitle>ORBITA—30</CardTitle><CardDescription>{test?.assessmentVersion ?? "orbita30_ru_v2"} · pilot / unvalidated</CardDescription></CardHeader>
          <CardContent>
            <div className="order-line"><span>Оценка</span><strong>1 доступ</strong></div>
            <div className="order-line"><span>Результат</span><strong>Dashboard + PDF</strong></div>
            <div className="order-line"><span>{betaFree ? "Режим" : "Тип оплаты"}</span><strong>{betaFree ? "пилотная версия" : "один раз"}</strong></div>
            <div className="order-total"><span>{betaFree ? "Стоимость участия" : `К оплате · ${test?.currency ?? "—"}`}</span><strong>{betaFree ? "Бесплатно" : displayedPrice}</strong></div>
            <Button className="orbita-button primary-button full-button" disabled={busy || (!betaFree && !checkoutAvailable)} size="lg" onClick={onCheckout}>
              {busy ? "Создаём доступ…" : betaFree ? "Начать закрытое тестирование" : checkoutAvailable ? "Перейти к защищённой оплате" : "Оплата пока недоступна"} <ArrowRight size={16} />
            </Button>
            {!catalog ? <p className="validation-note">Проверяем доступ…</p> : !betaFree && !checkoutAvailable ? <p className="validation-note">Оплата станет доступна после настройки цены и Stripe в production.</p> : null}
            {error ? <p className="validation-note">{error}</p> : null}
            <p className="micro-copy"><LockKeyhole size={13} /> {betaFree ? "Доступ ограничен allowlist Cloudflare Access. Платёжные данные не требуются." : "Hosted checkout: карточные данные не проходят через backend ORBITA."}</p>
          </CardContent>
        </Card>
        <div className="checkout-guardrails">
          <div><ShieldCheck size={18} /><span><strong>{betaFree ? "Закрытый доступ" : "Подтверждённый webhook"}</strong><small>{betaFree ? "Войти могут только приглашённые участники." : "Entitlement создаётся только после signed provider event."}</small></span></div>
          <div><RefreshCw size={18} /><span><strong>{betaFree ? "Beta entitlement" : "Идемпотентная оплата"}</strong><small>{betaFree ? "Бесплатный grant хранится отдельно и не считается оплатой." : "Повтор одного события не создаёт второй доступ."}</small></span></div>
          <div><FileText size={18} /><span><strong>{betaFree ? "Пилотные ограничения" : "Order snapshot"}</strong><small>{betaFree ? "Профиль экспериментальный, unvalidated и не содержит percentiles." : "Версия теста, цена и валюта сохраняются вместе с заказом."}</small></span></div>
        </div>
      </div>
    </div>
  );
}

export function ConsentView({
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
  item: AssessmentItem;
  value?: number;
  onChange: (value: number) => void;
}) {
  if (isForced(item)) {
    const left = "options" in item ? item.options[0]?.text ?? "" : "left" in item ? item.left : "";
    const right = "options" in item ? item.options[1]?.text ?? "" : "right" in item ? item.right : "";
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

export function AssessmentView({
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
  item?: AssessmentItem;
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
  const localCoreQuestion = phase === "core" ? currentIndex + 1 : localQuestion;
  const blockLabel = phase === "core" ? total === 60 ? "Основная часть" : "Блок " + blockNumber + " из 5" : "Уточняющая часть";
  const softCue = elapsedSeconds >= 30;
  return (
    <div className="assessment-shell">
      <div className="assessment-topbar">
        <div className="assessment-progress-copy">
          <span className="assessment-kicker">{blockLabel}</span>
          <strong>{phase === "core" ? "Вопрос " + localCoreQuestion + " из " + total : "Вопрос " + localQuestion + " из " + total}</strong>
        </div>
        <div className="assessment-progress-meter"><Progress value={((currentIndex + 1) / total) * 100} /><span>{Math.round(((currentIndex + 1) / total) * 100)}%</span></div>
        <div className="assessment-actions"><span className="autosave-status"><span className="status-dot" />{autosaveStatus}</span><button className="pause-button" onClick={onPause} type="button"><Pause size={15} /> Пауза</button></div>
      </div>

      <main className="question-area">
        <div className="question-meta"><span>{phase === "core" ? "ТИПИЧНОЕ ПОВЕДЕНИЕ" : "УТОЧНЯЮЩИЙ ВОПРОС"}</span><span className="question-id" aria-hidden="true">{"questionId" in item ? item.questionId : item.id}</span></div>
        <h1>{isForced(item) ? ("format" in item && item.format === "forced_choice" ? item.prompt : "Что чаще описывает вас в сложной ситуации?") : "questionId" in item ? item.prompt : "Насколько это обычно про вас?"}</h1>
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

export function BreakView({
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
          <div><Check size={16} /><span>{adaptiveReady ? "60 основных вопросов сохранены" : "Промежуточный блок сохранён"}</span></div>
          <div><Check size={16} /><span>{adaptiveReady ? "Профиль неопределённости рассчитан" : "Можно закрыть браузер и продолжить"}</span></div>
          {adaptiveReady && selection ? <div><Sparkles size={16} /><span>{selection.selectedItemIds.length} вопросов готовы · {selection.mode === "mercury" ? "Mercury 2.5" : selection.mode === "approved-fallback" ? "approved fallback" : selection.mode === "ai-openai" ? "AI selector" : "deterministic fallback"}</span></div> : null}
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

export function ProcessingView({
  status,
  onOpenResults,
  onRetry,
  profile,
}: {
  status: "ADAPTIVE_GENERATING" | "ADAPTIVE_PROVIDER_FAILED" | "SCORING" | "REPORT_GENERATING" | "REPORT_FAILED_RETRYABLE" | "COMPLETE";
  onOpenResults: () => void;
  onRetry: () => void;
  profile?: ScoreProfile;
}) {
  const stages = [
    ["CORE_COMPLETE", "60 основных ответов зафиксированы"],
    ["ADAPTIVE_GENERATING", "Готовим персональные уточнения"],
    ["ADAPTIVE_PROVIDER_FAILED", "Провайдер временно недоступен — доступен повтор"],
    ["SCORING", "Детерминированный score engine"],
    ["REPORT_GENERATING", "Структурированный отчёт"],
    ["COMPLETE", "Результат готов"],
  ];
  const activeIndex = status === "ADAPTIVE_GENERATING" ? 1 : status === "ADAPTIVE_PROVIDER_FAILED" ? 2 : status === "SCORING" ? 3 : status === "REPORT_GENERATING" ? 4 : 5;
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
        {status === "COMPLETE" ? <Button className="orbita-button primary-button" size="lg" onClick={onOpenResults}>Открыть результат <ArrowRight size={16} /></Button> : status === "REPORT_FAILED_RETRYABLE" ? <Button className="orbita-button primary-button" size="lg" onClick={onRetry}>Повторить генерацию отчёта <RefreshCw size={16} /></Button> : status === "ADAPTIVE_PROVIDER_FAILED" ? <Button className="orbita-button primary-button" size="lg" onClick={onRetry}>Повторить adaptive generation <RefreshCw size={16} /></Button> : <span className="processing-wait">Статус обновляется автоматически</span>}
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

export function ResultsView({
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

export function AccountView({
  onNavigate,
  profile,
  demoMode,
  overview,
  loading,
  actionStatus,
  betaFree,
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
  betaFree: boolean;
  onStartAssessment: () => void;
  onOpenReport: (reportId: string) => void;
  onExport: () => void;
  onDelete: () => void;
  onDeleteAssessment: (assessmentId: string) => void;
}) {
  const latestAssessment = overview?.assessments[0];
  const paidOrder = overview?.orders.find((order) => order.status === "PAID");
  const hasWork = Boolean(latestAssessment);
  const displayName = overview?.user.displayName ?? "Ваш профиль";
  const assessmentAction = latestAssessment?.state === "COMPLETE"
    ? "Открыть результат"
    : latestAssessment
      ? "Продолжить оценку"
      : paidOrder || betaFree
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
        <Card className="account-card"><CardHeader><div className="card-topline"><Badge className={latestAssessment?.state === "COMPLETE" ? "lime-badge" : "outline-badge"}>{loading ? "Загрузка…" : latestAssessment?.state ?? (paidOrder || betaFree ? "Доступ активен" : "Нет доступа")}</Badge><span className="card-id">orbita30_ru_v2</span></div><CardTitle>ORBITA—30</CardTitle><CardDescription>{demoMode ? "Демо-профиль · не сохранён на сервере" : latestAssessment ? "Сессия сохранена на сервере" : betaFree ? "Закрытая бесплатная beta · пилотная версия" : paidOrder ? "Оплата подтверждена · можно начать" : "Оформите доступ, чтобы начать"}</CardDescription></CardHeader><CardContent>
          {profile ? <><div className="account-result-mini"><OrbitGraphic compact /><div><span>{demoMode ? "Демо Top 5" : latestAssessment?.state === "COMPLETE" ? "Top 5" : "Предварительный Top 5"}</span><strong>{profile.traits.slice(0, 3).map((trait) => trait.name).join(" · ")}</strong><small>RQI {Math.round(profile.responseQuality.rqi * 100)}%</small></div></div><Button className="orbita-button primary-button full-button" onClick={profileAction}>{demoMode ? "Открыть демо-результат" : assessmentAction} <ArrowRight size={16} /></Button></> : <><div className="account-empty"><span>{loading ? <RefreshCw size={17} /> : <Play size={17} />}</span><p>{loading ? "Загружаем ваши данные…" : hasWork ? "Сессия готова к продолжению." : betaFree ? "Закрытый beta-доступ активен. Начните с обязательных согласий." : paidOrder ? "Оплата подтверждена. Создайте сессию и начните с согласий." : "Пройдите тест или откройте демо, чтобы увидеть, как выглядит результат."}</p></div><Button className="orbita-button primary-button full-button" disabled={loading || (!betaFree && !paidOrder && !latestAssessment)} onClick={latestAssessment?.reportId ? () => onOpenReport(latestAssessment.reportId as string) : onStartAssessment}>{loading ? "Загрузка…" : latestAssessment ? assessmentAction : betaFree || paidOrder ? "Начать оценку" : "Открыть каталог"} <ArrowRight size={16} /></Button>{!betaFree && !paidOrder && !latestAssessment ? <Button className="orbita-button ghost-button full-button" onClick={() => onNavigate("catalog")}>Посмотреть доступные оценки</Button> : null}</>}
        </CardContent></Card>
      </div>
      <div className="account-history-grid"><Card className="account-card"><CardHeader><CardTitle>Заказы</CardTitle><CardDescription>Цена и валюта зафиксированы в каждом order.</CardDescription></CardHeader><CardContent>{overview?.orders.length ? <div className="account-history-list">{overview.orders.map((order) => <div className="account-history-row" key={order.id}><span><strong>{order.testId}</strong><small>{new Date(order.createdAt).toLocaleString("ru-RU")}</small></span><span><strong>{(order.amountMinor / 100).toLocaleString("ru-RU")} {order.currency}</strong><small>{order.status}</small></span></div>)}</div> : <p className="account-muted">Заказов пока нет.</p>}</CardContent></Card><Card className="account-card"><CardHeader><CardTitle>Сессии</CardTitle><CardDescription>Последнее подтверждённое состояние хранится на сервере.</CardDescription></CardHeader><CardContent>{overview?.assessments.length ? <div className="account-history-list">{overview.assessments.map((assessment) => <div className="account-history-row" key={assessment.id}><span><strong>{assessment.state}</strong><small>{assessment.clientSeq} ответов · {new Date(assessment.updatedAt).toLocaleString("ru-RU")}</small></span><span className="account-row-actions">{assessment.reportId ? <Button className="orbita-button ghost-button" size="sm" onClick={() => onOpenReport(assessment.reportId as string)}>Отчёт</Button> : null}<Button className="orbita-button ghost-button" size="sm" aria-label="Удалить оценку" onClick={() => onDeleteAssessment(assessment.id)}><Trash2 size={14} /></Button></span></div>)}</div> : <p className="account-muted">Сессий пока нет.</p>}</CardContent></Card></div>
      <div className="account-footer-grid"><div className="account-stat"><span>Core item bank</span><strong>{CORE60_BANK.length}</strong><small>{CORE60_LIKERT_COUNT} Likert · {CORE60_FORCED_COUNT} discrimination</small></div><div className="account-stat"><span>Версия scoring</span><strong>{V2_VERSION_IDS.scoring}</strong><small>deterministic · reproducible</small></div><div className="account-stat"><span>Права данных</span><strong>готовы</strong><small>export · delete</small></div></div>
      <div className="account-data-actions"><Button className="orbita-button secondary-button" onClick={onExport}><Download size={15} /> Запросить экспорт данных</Button><Button className="orbita-button ghost-button" onClick={onDelete}><LockKeyhole size={15} /> Удалить аккаунт</Button>{actionStatus ? <span className="autosave-status"><span className="status-dot" />{actionStatus}</span> : null}</div>
    </div>
  );
}

export function MethodologyView({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <div className="page-wrap methodology-page">
      <SectionHeading eyebrow="METHODOLOGY" title="Прозрачно — значит проверяемо." body="ORBITA—30 отделяет конструкт, raw responses, scoring, adaptive selection и report layer. Эта версия предназначена для пилота, а не для доказанных межличностных норм." />
      <div className="method-layout">
        <aside className="method-index"><span>СОДЕРЖАНИЕ</span><a href="#model">Модель</a><a href="#scoring">Scoring</a><a href="#adaptive">Adaptive</a><a href="#quality">Quality</a><a href="#validation">Валидация</a><a href="#limits">Ограничения</a></aside>
        <div className="method-content">
          <section className="method-block" id="model"><span className="section-index">01</span><h2>Модель конструкта</h2><p>Шесть доменов, по пять оригинальных шкал в каждом. Шкалы описывают предпочтительный способ действия; низкое значение не является дефектом.</p><div className="method-domain-grid">{TRAITS.map((trait, index) => <div key={trait.code}><span className={"domain-code " + DOMAIN_COLORS[Math.floor(index / 5)]}>{trait.code}</span><strong>{trait.name}</strong><p>{trait.definition}</p></div>)}</div></section>
          <section className="method-block" id="scoring"><span className="section-index">02</span><h2>Детерминированный scoring</h2><p>Одинаковый набор raw responses при одинаковых версиях даёт одинаковый score JSON. Mercury не имеет права менять баллы, веса, ранги или Top 5.</p><div className="formula"><span>Primary evidence</span><strong>1 Likert / trait</strong><span>базовое измерение</span><span>Discrimination</span><strong>30 forced-choice</strong><span>по два cross-trait сигнала</span><span>Adaptive</span><strong>bounded correction</strong><span>только refinement и снижение uncertainty</span></div><div className="version-row"><Badge variant="outline">assessment { V2_VERSION_IDS.assessment }</Badge><Badge variant="outline">items { V2_VERSION_IDS.itemBank }</Badge><Badge variant="outline">scoring { V2_VERSION_IDS.scoring }</Badge><Badge variant="outline">norm { V2_VERSION_IDS.norm }</Badge></div><p>Статус normStatus: unvalidated. Пилотный индекс профиля не является долей людей и не используется для межличностного сравнения.</p></section>
          <section className="method-block" id="adaptive"><span className="section-index">03</span><h2>Mercury 2.5 adaptive</h2><p>После Core60 backend отправляет Mercury только обезличенный AdaptiveContext. Mercury создаёт новые вопросы, а server-side validator проверяет traits, reason codes, формат, safety, дубли и лимит 10–15. При timeout работает approved fallback bank.</p><div className="adaptive-table"><div><span>Core</span><strong>60</strong><small>30 primary · 30 discrimination</small></div><div><span>Цель</span><strong>10–15</strong><small>по uncertainty</small></div><div><span>Quota</span><strong>≤ 3</strong><small>на trait</small></div><div><span>Provider</span><strong>Mercury 2.5</strong><small>server-only / validated</small></div></div></section>
          <section className="method-block" id="quality"><span className="section-index">04</span><h2>Response quality</h2><p>Флаги качества не обнуляют результат. Они формируют RQI и при необходимости предупреждение для внутренней аналитики и отчёта.</p><div className="quality-list"><div><Check size={15} /><span><strong>Attention check</strong><small>В v2 используются только проверки, совместимые с Core60 scoring.</small></span></div><div><Check size={15} /><span><strong>Too fast</strong><small>Исследовательский threshold до пилотной калибровки</small></span></div><div><Check size={15} /><span><strong>Straight-lining</strong><small>Модальная частота одинаковых Likert ответов, а не только первый ответ</small></span></div><div><Check size={15} /><span><strong>Contradiction</strong><small>Дополнительный приоритет адаптивным уточнениям</small></span></div><div><Check size={15} /><span><strong>Legacy v1 markers</strong><small>Q243/Q246/Q249/Q250 сохранены только для исторических v1 snapshots и не входят в v2 trait score.</small></span></div></div></section>
          <section className="method-block" id="validation"><span className="section-index">05</span><h2>Что должно быть проверено до launch</h2><div className="validation-grid">{["Экспертный review и cognitive interviews", "Pilot ≈500+ и item analysis", "EFA/CFA и reliability / SE", "Measurement invariance и DIF", "Нормы 1500–3000+ и cross-validation", "Visual regression PDF и accessibility e2e"].map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></div>)}</div></section>
          <section className="method-block limit-block" id="limits"><span className="section-index">06</span><h2>Ограничения</h2><p>Это не лицензированная реализация CliftonStrengths®, StrengthsFinder® или другого продукта Gallup. ORBITA—30 использует собственную модель, названия, вопросы, scoring и визуальный язык. Вся v2 версия — pilot / unvalidated, не clinical и не hiring decision tool; перед production нужен независимый review и юридическое подтверждение.</p><button className="text-link" onClick={() => onNavigate("privacy")} type="button">Privacy & data rights <ArrowRight size={15} /></button></section>
        </div>
      </div>
    </div>
  );
}

export function AdminView({ profile, onNavigate, metrics }: { profile?: ScoreProfile; onNavigate: (view: View) => void; metrics?: AdminMetrics }) {
  const paidOrders = metrics?.orders.find((item) => item.status === "PAID")?.count ?? 0;
  const completedReports = metrics?.reports.find((item) => item.status === "COMPLETE")?.count ?? 0;
  const failedReports = metrics?.reports.find((item) => item.status === "REPORT_FAILED_RETRYABLE")?.count ?? 0;
  return (
    <div className="page-wrap admin-page">
      <div className="admin-heading"><div><div className="eyebrow">INTERNAL / ADMIN PREVIEW</div><h1>Контроль версии и качества.</h1><p>Лёгкий интерфейс для проверки item bank, scoring configs и telemetry без доступа к ответам по умолчанию.</p></div><Badge className="outline-badge">read-only demo</Badge></div>
      <div className="admin-metrics"><div><span>Core item bank</span><strong>{CORE60_BANK.length}</strong><small>Core60 v1 · pilot / unvalidated</small></div><div><span>Users</span><strong>{metrics?.users ?? "—"}</strong><small>server-side aggregate</small></div><div><span>Paid orders</span><strong>{metrics ? paidOrders : "—"}</strong><small>signed webhook events</small></div><div><span>Reports</span><strong>{metrics ? completedReports : "—"}</strong><small>{metrics ? failedReports + " retryable" : "admin allowlist required"}</small></div><div><span>Pilot sample</span><strong>{metrics?.pilotAnalytics.sampleSize ?? "—"}</strong><small>{metrics?.pilotAnalytics.insufficientData ? `нужно ≥${metrics.pilotAnalytics.minimumSampleForPsychometrics}, stats скрыты` : "descriptive pilot only"}</small></div></div>
      <div className="admin-grid"><Card className="admin-panel"><CardHeader><CardTitle>Core60 Item Bank</CardTitle><CardDescription>Новая стандартизированная версия; v1 Q001–Q300 сохранён как legacy.</CardDescription></CardHeader><CardContent><div className="admin-table"><div className="admin-table-head"><span>Диапазон</span><span>Тип</span><span>Кол-во</span><span>Статус</span></div>{[["Q001–Q030", "primary Likert", CORE60_LIKERT_COUNT, "core60-v1"], ["Q031–Q060", "discrimination FC", CORE60_FORCED_COUNT, "core60-v1"], ["FB-01–FB-24", "approved fallback", APPROVED_FALLBACK_BANK.length, "fallback"]].map(([range, type, count, status]) => <div className="admin-table-row" key={String(range)}><span>{range}</span><span>{type}</span><strong>{count}</strong><Badge variant={status === "fallback" ? "secondary" : "outline"}>{status}</Badge></div>)}</div></CardContent></Card><Card className="admin-panel"><CardHeader><CardTitle>Последний run</CardTitle><CardDescription>{metrics ? "Сводка доступна только allowlisted admin" : "Для сводки нужен admin allowlist"}</CardDescription></CardHeader><CardContent><div className="audit-list"><div><span className="audit-icon"><Check size={14} /></span><span><strong>Score JSON</strong><small>{profile ? "готов · " + profile.versions.scoring : "ожидает сессию"}</small></span></div><div><span className="audit-icon"><ShieldCheck size={14} /></span><span><strong>Quality flags</strong><small>{profile ? profile.responseQuality.flags.length + " flags" : "не запускался"}</small></span></div><div><span className="audit-icon"><FileText size={14} /></span><span><strong>Report JSON</strong><small>{metrics ? completedReports + " complete" : "protected metrics"}</small></span></div><div><span className="audit-icon"><LockKeyhole size={14} /></span><span><strong>PII boundary</strong><small>{metrics ? "aggregate only" : "payload minimized"}</small></span></div></div><Button className="orbita-button secondary-button full-button" onClick={() => onNavigate("methodology")}>Открыть методологию <ArrowRight size={15} /></Button></CardContent></Card></div>
    </div>
  );
}
