"use client";

import { ArrowRight } from "@/app/views/shared/section-heading";
import { SectionHeading } from "@/app/views/shared/section-heading";
import type { View } from "@/app/orbita-view-types";

export type CatalogViewProps = {
  onNavigate: (view: View) => void;
};

export function CatalogView({ onNavigate }: CatalogViewProps) {
  return (
    <div className="orbita-view ov-catalog">
      <div className="ov-container wide">
        <SectionHeading
          eyebrow="КАТАЛОГ"
          title="Один тест. Полная карта."
          body="Выберите оценку, которая помогает увидеть устойчивый способ действовать — в работе и повседневных ситуациях."
        />

        <div className="ov-catalog-grid">
          <article className="ov-catalog-card ov-catalog-featured">
            <header className="ov-catalog-card-head">
              <div className="ov-catalog-tags">
                <span className="ov-badge ov-badge-primary">Основной тест</span>
                <span className="ov-badge ov-badge-outline">orbita30_ru_v2</span>
              </div>
              <h3>ORBITA—30</h3>
              <p>Профиль сильных сторон и рабочих предпочтений</p>
            </header>

            <div className="ov-catalog-visual">
              <CatalogOrbitaGraphic />
              <div className="ov-catalog-stats">
                <div>
                  <strong>30</strong>
                  <span>шкал<br />в профиле</span>
                </div>
                <div>
                  <strong>6</strong>
                  <span>доменов<br />действия</span>
                </div>
              </div>
            </div>

            <ul className="ov-catalog-meta">
              <li><CatalogIcon name="time" /> 35–50 минут с паузами</li>
              <li><CatalogIcon name="doc" /> интерактивный отчёт + PDF</li>
              <li><CatalogIcon name="shield" /> развивающий формат</li>
            </ul>

            <button className="ov-btn ov-btn-primary ov-btn-block" onClick={() => onNavigate("detail")} type="button">
              Открыть тест
              <ArrowRight />
            </button>
          </article>

          <aside className="ov-catalog-notes">
            <article className="ov-catalog-note ov-reveal">
              <span className="ov-catalog-note-num">01</span>
              <h4>Сейчас доступна одна версия</h4>
              <p>
                Она помечена как draft for pilot. Психометрическая валидация и нормы публикуются
                отдельными версиями.
              </p>
            </article>
            <article className="ov-catalog-note ov-reveal">
              <span className="ov-catalog-note-num">02</span>
              <h4>Цена фиксируется в заказе</h4>
              <p>
                Изменение цены теста не изменит уже созданный order или entitlement.
              </p>
            </article>
            <article className="ov-catalog-note ov-reveal">
              <span className="ov-catalog-note-num">03</span>
              <h4>Доступ — одноразовый</h4>
              <p>
                Каждый entitlement привязан к одному assessment, к одной версии и к одному
                пользователю.
              </p>
            </article>
          </aside>
        </div>
      </div>
    </div>
  );
}

function CatalogIcon({ name }: { name: "time" | "doc" | "shield" }) {
  const path =
    name === "time"
      ? "M12 7v5l3 3"
      : name === "doc"
        ? "M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6"
        : "M12 3l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z";
  const circle = name === "time" ? <circle cx="12" cy="12" r="9" /> : null;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      {circle}
      {name !== "time" ? <path d={path} /> : null}
      {name === "time" ? <path d={path} /> : null}
    </svg>
  );
}

function CatalogOrbitaGraphic() {
  return (
    <svg viewBox="0 0 200 200" width="180" height="180" aria-hidden="true">
      <defs>
        <radialGradient id="catalogGradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FCFBF8" />
          <stop offset="100%" stopColor="#F1EEE6" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="92" fill="url(#catalogGradient)" stroke="rgba(23,26,24,0.12)" />
      {[68, 88].map((r, i) => (
        <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="rgba(23,26,24,0.12)" strokeDasharray={i === 0 ? "3 4" : "none"} />
      ))}
      {[
        { angle: 0, color: "#8FA888", label: "T01" },
        { angle: 60, color: "#7C93A8", label: "T07" },
        { angle: 120, color: "#C79A5B", label: "T14" },
        { angle: 180, color: "#C1836F", label: "T19" },
        { angle: 240, color: "#B78D97", label: "T22" },
        { angle: 300, color: "#9B93B5", label: "T28" },
      ].map(({ angle, color, label }) => {
        const rad = (angle * Math.PI) / 180;
        const r = 75;
        const x = 100 + r * Math.cos(rad);
        const y = 100 + r * Math.sin(rad);
        return <circle key={label} cx={x} cy={y} r="10" fill={color} opacity="0.85" />;
      })}
      <circle cx="100" cy="100" r="22" fill="#FCFBF8" stroke="rgba(23,26,24,0.18)" />
      <text x="100" y="97" textAnchor="middle" fontFamily="serif" fontSize="13" fill="#171A18">
        ORBITA
      </text>
      <text x="100" y="113" textAnchor="middle" fontFamily="serif" fontSize="13" fill="#171A18">
        30
      </text>
    </svg>
  );
}
