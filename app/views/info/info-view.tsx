"use client";

import { useEffect } from "react";
import { ArrowRight } from "@/app/views/shared/section-heading";
import type { View } from "@/app/orbita-view-types";

const FAQ_BLOCKS: Array<[string, string]> = [
  [
    "Сколько длится тест?",
    "60 основных вопросов. После предварительного профиля система задаёт ещё 10–15 персональных уточняющих вопросов. Между частями можно делать паузы.",
  ],
  [
    "Что если я закрою браузер?",
    "Введённый ответ сохраняется сразу, а session продолжает с последнего подтверждённого item. Уже принятые adaptive-вопросы не меняются при reload.",
  ],
  [
    "Почему вопросы разные?",
    "В тесте нет хороших и плохих сильных сторон. Mercury уточняет зоны неопределённости, а сервер проверяет каждый новый вопрос и оставляет scoring детерминированным.",
  ],
  [
    "Можно ли сравнивать людей?",
    "В MVP нет. Пилотный индекс профиля и ранг предназначены для чтения собственного среза и не являются межличностной шкалой.",
  ],
];

const SUPPORT_BLOCKS: Array<[string, string]> = [
  [
    "Проблема с оплатой",
    "Статус order проверяется по provider event. Support может повторно выдать entitlement после проверки, без повторной оплаты.",
  ],
  [
    "Проблема с PDF",
    "Отчёт можно безопасно регенерировать без пересчёта frozen score JSON.",
  ],
  [
    "Контакт",
    "support@example.com · укажите session ID, локаль и описание шага, на котором остановились.",
  ],
];

export type InfoViewKind = "privacy" | "terms" | "faq" | "support";

export type InfoViewProps = {
  kind: InfoViewKind;
  onNavigate: (view: View) => void;
  supportContact?: string | null;
  title: string;
  blocks: Array<{ title: string; body: string }>;
  version?: string;
  updatedAt?: string;
  reviewStatus?: string;
};

export function InfoView({ kind, onNavigate, title, blocks, version, updatedAt, reviewStatus }: InfoViewProps) {
  useRevealOnScroll();
  const isLegal = kind === "privacy" || kind === "terms";

  return (
    <div className="orbita-view ov-info">
      <div className="ov-container">
        <button className="ov-back-link" onClick={() => onNavigate("home")} type="button">
          ← На главную
        </button>

        <div className="ov-info-head ov-reveal">
          <span className="ov-eyebrow">{kind === "privacy" ? "PRIVACY" : kind === "terms" ? "TERMS" : kind === "faq" ? "FAQ" : "SUPPORT"}</span>
          <h1>{title}</h1>
          {version && updatedAt ? (
            <p className="ov-info-meta">
              Версия {version} · обновлено {updatedAt}
            </p>
          ) : null}
        </div>

        <div className="ov-info-blocks">
          {blocks.map((block, index) => (
            <article className="ov-info-block ov-reveal" key={block.title}>
              <span className="ov-info-index">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h2>{block.title}</h2>
                <p>{block.body}</p>
              </div>
            </article>
          ))}
        </div>

        {isLegal && reviewStatus ? <p className="ov-info-review">{reviewStatus}</p> : null}

        {kind === "faq" ? (
          <div className="ov-info-cta">
            <button className="ov-btn ov-btn-primary" onClick={() => onNavigate("detail")} type="button">
              Посмотреть тест
              <ArrowRight />
            </button>
          </div>
        ) : null}

        {kind === "support" ? (
          <div className="ov-info-cta">
            <button className="ov-btn ov-btn-secondary" onClick={() => onNavigate("account")} type="button">
              Открыть личный кабинет
              <ArrowRight />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function InfoViewLegal({
  kind,
  onNavigate,
  title,
  blocks,
  version,
  updatedAt,
  reviewStatus,
}: Omit<InfoViewProps, "kind"> & { kind: "privacy" | "terms" }) {
  return (
    <InfoView
      kind={kind}
      onNavigate={onNavigate}
      title={title}
      blocks={blocks}
      version={version}
      updatedAt={updatedAt}
      reviewStatus={reviewStatus}
    />
  );
}

export function InfoViewFAQ({ onNavigate }: { onNavigate: (view: View) => void }) {
  return (
    <InfoView
      kind="faq"
      onNavigate={onNavigate}
      title="Вопросы, которые обычно задают."
      blocks={FAQ_BLOCKS.map(([title, body]) => ({ title, body }))}
    />
  );
}

export function InfoViewSupport({ onNavigate, supportContact }: { onNavigate: (view: View) => void; supportContact?: string | null }) {
  const blocks = SUPPORT_BLOCKS.map(([title, body]) => {
    if (title === "Контакт") {
      return {
        title,
        body: supportContact
          ? `${supportContact} · укажите session ID, локаль и описание шага, на котором остановились.`
          : "Контакт поддержки ещё не настроен. Укажите session ID, локаль и описание шага только через утверждённый канал поддержки.",
      };
    }
    return { title, body };
  });

  return <InfoView kind="support" onNavigate={onNavigate} title="Нужна помощь?" blocks={blocks} />;
}

function useRevealOnScroll() {
  useEffect(() => {
    const root = document.querySelector(".orbita-view");
    if (!root) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const elements = root.querySelectorAll<HTMLElement>(".ov-reveal");

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
