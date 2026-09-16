"use client";

import { useEffect, useRef } from "react";
import { ArrowRight } from "@/app/views/shared/section-heading";
import { SectionHeading } from "@/app/views/shared/section-heading";
import type { View } from "@/app/orbita-view-types";

const FEATURES: Array<[string, string, string]> = [
  ["01", "6 доменов", "Осмысление, создание, исполнение, влияние, связи и самоуправление."],
  ["02", "60 + 10–15", "Стандартизированный baseline и адаптивное уточнение по uncertainty."],
  ["03", "Top 5 и профиль 30", "Сначала естественный вклад, затем полный контекст и интервалы."],
  ["04", "Отчёт на языке фактов", "Без диагнозов и карьерных предсказаний; числа берутся из score JSON."],
];

const DOMAINS: Array<[string, string, string, string]> = [
  ["D1", "Осмысление и анализ", "Как человек понимает сложность, данные и закономерности.", "sage"],
  ["D2", "Создание и адаптация", "Как человек генерирует варианты и действует в неопределённости.", "blue"],
  ["D3", "Исполнение и качество", "Как человек превращает намерения в устойчивый результат.", "amber"],
  ["D4", "Влияние и движение", "Как человек инициирует, убеждает и мобилизует других.", "coral"],
  ["D5", "Связи и сотрудничество", "Как человек понимает людей и строит продуктивные отношения.", "rose"],
  ["D6", "Самоуправление и устойчивость", "Как человек регулирует себя и держит внутренний курс.", "lavender"],
];

export type DetailViewProps = {
  onNavigate: (view: View) => void;
  onDemo: () => void;
};

export function DetailView({ onNavigate, onDemo }: DetailViewProps) {
  return (
    <div className="orbita-view ov-detail">
      <div className="ov-container wide">
        <button className="ov-back-link" onClick={() => onNavigate("catalog")} type="button">
          ← Каталог тестов
        </button>

        <header className="ov-detail-hero">
          <div className="ov-detail-hero-copy">
            <span className="ov-eyebrow">Оценка сильных сторон</span>
            <h1>ORBITA—30</h1>
            <p>
              Профиль предпочтительного способа действовать: как вы понимаете сложность, создаёте
              варианты, доводите работу, влияете и восстанавливаетесь.
            </p>
            <div className="ov-detail-actions">
              <button className="ov-btn ov-btn-primary" onClick={() => onNavigate("checkout")} type="button">
                Перейти к оформлению
                <ArrowRight />
              </button>
              <button className="ov-btn ov-btn-secondary" onClick={onDemo} type="button">
                Посмотреть результат на демо-данных
              </button>
            </div>
          </div>
          <div className="ov-detail-hero-visual">
            <DetailOrbitaGraphic />
          </div>
        </header>

        <div className="ov-two-col ov-detail-body">
          <section className="ov-detail-main">
            <div className="ov-detail-section">
              <SectionHeading eyebrow="Что внутри" title="Структура оценки" />
              <div className="ov-detail-features">
                {FEATURES.map(([num, title, body]) => (
                  <article className="ov-detail-feature ov-reveal" key={num}>
                    <span className="ov-detail-feature-num">{num}</span>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="ov-detail-section">
              <SectionHeading eyebrow="Домены" title="Шесть зон действия" />
              <div className="ov-detail-domains">
                {DOMAINS.map(([code, name, body, color]) => (
                  <article className="ov-detail-domain ov-reveal" key={code}>
                    <span className={`ov-detail-domain-code ov-tag-${color}`}>{code}</span>
                    <div>
                      <h3>{name}</h3>
                      <p>{body}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <aside className="ov-detail-aside">
            <article className="ov-card ov-detail-card">
              <span className="ov-eyebrow">Для кого</span>
              <h3 className="ov-card-title">Для себя, команды и следующего разговора.</h3>
              <p className="ov-card-desc">
                Результат можно использовать как материал для развития — не как автоматическое
                решение о человеке.
              </p>
              <hr className="ov-divider" />
              <span className="ov-eyebrow">Формат</span>
              <ul className="ov-list ov-detail-checklist">
                <li><DetailCheck /> один вопрос на экран</li>
                <li><DetailCheck /> пауза между блоками</li>
                <li><DetailCheck /> autosave и resume</li>
                <li><DetailCheck /> RU сейчас, KZ/EN позже</li>
              </ul>
            </article>

            <article className="ov-card ov-detail-card">
              <span className="ov-eyebrow">Что вы получите</span>
              <h3 className="ov-card-title">Карта, а не ярлык.</h3>
              <p className="ov-card-desc">
                Top 5, полный профиль из 30 шкал, 6 доменных агрегатов, условия работы и план
                развития на 30 дней. PDF сохраняет frozen score JSON.
              </p>
            </article>
          </aside>
        </div>
      </div>
    </div>
  );
}

function DetailCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}

function DetailOrbitaGraphic() {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;

    const size = 220;
    const cx = size / 2;
    const cy = size / 2;
    const innerR = 24;
    const outerR = 92;
    const n = 30;
    const anglePer = (Math.PI * 2) / n;
    const startOffset = -Math.PI / 2;
    const ns = "http://www.w3.org/2000/svg";
    const colors = ["#8FA888", "#7C93A8", "#C79A5B", "#C1836F", "#B78D97", "#9B93B5"];
    const sample = [82, 76, 89, 70, 79, 75, 84, 72, 88, 73, 80, 78, 86, 71, 83, 74, 81, 77, 85, 72, 79, 83, 76, 88, 74, 82, 78, 85, 73, 80];

    const pt = (r: number, angle: number): [number, number] => [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];

    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const domain = Math.floor(i / 5);
      const val = sample[i];
      const r = innerR + (outerR - innerR) * (val / 100);
      const a0 = startOffset + i * anglePer;
      const a1 = startOffset + (i + 1) * anglePer - 0.02;
      const p1 = pt(innerR, a0);
      const p2 = pt(r, a0);
      const p3 = pt(r, a1);
      const p4 = pt(innerR, a1);
      const d = ["M", p1[0], p1[1], "L", p2[0], p2[1], "A", r, r, 0, 0, 1, p3[0], p3[1], "L", p4[0], p4[1], "A", innerR, innerR, 0, 0, 0, p1[0], p1[1], "Z"].join(" ");
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", colors[domain]);
      path.setAttribute("opacity", String(0.6 + 0.4 * (val / 100)));
      frag.appendChild(path);
    }
    const centerCircle = document.createElementNS(ns, "circle");
    centerCircle.setAttribute("cx", String(cx));
    centerCircle.setAttribute("cy", String(cy));
    centerCircle.setAttribute("r", String(innerR - 4));
    centerCircle.setAttribute("fill", "#FCFBF8");
    centerCircle.setAttribute("stroke", "rgba(23,26,24,0.18)");
    frag.appendChild(centerCircle);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(cx));
    label.setAttribute("y", String(cy + 4));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-family", "'Instrument Serif', serif");
    label.setAttribute("font-size", "14");
    label.setAttribute("fill", "#171A18");
    label.textContent = "ORBITA";
    frag.appendChild(label);

    svg.appendChild(frag);
  }, []);

  return (
    <svg ref={ref} viewBox="0 0 220 220" width="240" height="240" aria-hidden="true">
      <circle cx="110" cy="110" r="106" fill="#FCFBF8" stroke="rgba(23,26,24,0.12)" />
    </svg>
  );
}
