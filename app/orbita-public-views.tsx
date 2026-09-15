"use client";

import { ArrowRight } from "lucide-react";

import { DEFAULT_LEGAL_CONFIG, getLegalDocument } from "@/lib/legal-documents";
import type { View } from "@/app/orbita-view-types";

function PublicSectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="section-heading">
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      <p>{body}</p>
    </div>
  );
}

export function InfoView({ kind, onNavigate, supportContact }: { kind: "privacy" | "terms" | "faq" | "support"; onNavigate: (view: View) => void; supportContact?: string | null }) {
  const legal = kind === "privacy" || kind === "terms"
    ? getLegalDocument(kind, { ...DEFAULT_LEGAL_CONFIG, supportContact: supportContact || DEFAULT_LEGAL_CONFIG.supportContact })
    : null;
  const fallbackContent = kind === "faq"
    ? { eyebrow: "FAQ", title: "Вопросы, которые обычно задают.", body: "Коротко о формате, времени и смысле результата.", blocks: [["Сколько длится тест?", "250 вопросов разбиты на 5 блоков по 50. Между блоками можно делать паузы. После основной части — 10–15 уточнений."], ["Что если я закрою браузер?", "Введённый ответ сохраняется сразу, а session продолжает с последнего подтверждённого item."], ["Почему вопросы разные?", "В тесте нет хороших и плохих сильных сторон. Adaptive selector уточняет зоны неопределённости, а не «балансирует» ваш профиль."], ["Можно ли сравнивать людей?", "В MVP нет. Пилотный индекс профиля и ранг предназначены для чтения собственного среза и не являются межличностной шкалой."]] }
    : { eyebrow: "SUPPORT", title: "Нужна помощь?", body: "Сохраняем контекст сессии, но не просим присылать полный набор ответов в обычное обращение.", blocks: [["Проблема с оплатой", "Статус order проверяется по provider event. Support может повторно выдать entitlement после проверки, без повторной оплаты."], ["Проблема с PDF", "Отчёт можно безопасно регенерировать без пересчёта frozen score JSON."], ["Контакт", supportContact ? `${supportContact} · укажите session ID, локаль и описание шага, на котором остановились.` : "Контакт поддержки ещё не настроен. Укажите session ID, локаль и описание шага только через утверждённый канал поддержки."]] };
  const content = legal
    ? { eyebrow: kind === "privacy" ? "PRIVACY" : "TERMS", title: legal.title, body: `Версия ${legal.version} · обновлено ${legal.updatedAt}. ${legal.blocks[0]?.body ?? ""}`, blocks: legal.blocks.map((block) => [block.title, block.body] as [string, string]) }
    : fallbackContent;
  return (
    <div className="page-wrap info-page">
      <PublicSectionHeading eyebrow={content.eyebrow} title={content.title} body={content.body} />
      <div className="info-blocks">{content.blocks.map(([title, body], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><div><h2>{title}</h2><p>{body}</p></div></article>)}</div>
      {kind === "privacy" || kind === "terms" ? <p className="legal-review-note">{DEFAULT_LEGAL_CONFIG.reviewStatus}</p> : null}
      {kind === "faq" ? <button className="text-link" onClick={() => onNavigate("detail")} type="button">Посмотреть тест <ArrowRight size={15} /></button> : null}
    </div>
  );
}

