"use client";

import { ArrowRight, SectionHeading } from "@/app/views/shared/section-heading";
import type { View } from "@/app/orbita-view-types";
import { TRAITS } from "@/lib/item-bank";

const SCORING_FORMULA: Array<[string, string, string]> = [
  ["Primary evidence", "1 Likert / trait", "базовое измерение"],
  ["Discrimination", "30 forced-choice", "по два cross-trait сигнала"],
  ["Adaptive", "bounded correction", "только refinement и снижение uncertainty"],
];

const QUALITY_LIST: Array<[string, string]> = [
  ["Attention check", "В v2 используются только проверки, совместимые с Core60 scoring."],
  ["Too fast", "Исследовательский threshold до пилотной калибровки."],
  ["Straight-lining", "Модальная частота одинаковых Likert ответов, а не только первый ответ."],
  ["Contradiction", "Дополнительный приоритет адаптивным уточнениям."],
  ["Legacy v1 markers", "Q243/Q246/Q249/Q250 сохранены только для исторических v1 snapshots и не входят в v2 trait score."],
];

const VALIDATION_LIST = [
  "Экспертный review и cognitive interviews",
  "Pilot ≈500+ и item analysis",
  "EFA/CFA и reliability / SE",
  "Measurement invariance и DIF",
  "Нормы 1500–3000+ и cross-validation",
  "Visual regression PDF и accessibility e2e",
];

const DOMAIN_COLORS = ["sage", "blue", "amber", "coral", "rose", "lavender"];

export type MethodologyViewProps = {
  onNavigate: (view: View) => void;
};

export function MethodologyView({ onNavigate }: MethodologyViewProps) {
  return (
    <div className="orbita-view ov-method">
      <div className="ov-container wide">
        <SectionHeading
          eyebrow="Methodology"
          title="Прозрачно — значит проверяемо."
          body="ORBITA—30 отделяет конструкт, raw responses, scoring, adaptive selection и report layer. Эта версия предназначена для пилота, а не для доказанных межличностных норм."
        />

        <div className="ov-method-layout">
          <aside className="ov-method-index">
            <span className="ov-eyebrow">Содержание</span>
            <nav>
              <a href="#model">Модель</a>
              <a href="#scoring">Scoring</a>
              <a href="#adaptive">Adaptive</a>
              <a href="#quality">Quality</a>
              <a href="#validation">Валидация</a>
              <a href="#limits">Ограничения</a>
            </nav>
          </aside>

          <div className="ov-method-content">
            <section className="ov-method-block" id="model">
              <header className="ov-method-block-head">
                <span className="ov-method-num">01</span>
                <h2>Модель конструкта</h2>
              </header>
              <p>
                Шесть доменов, по пять оригинальных шкал в каждом. Шкалы описывают предпочтительный
                способ действия; низкое значение не является дефектом.
              </p>
              <div className="ov-method-traits">
                {TRAITS.map((trait, index) => (
                  <article className="ov-method-trait" key={trait.code}>
                    <span className={`ov-method-trait-code ov-tag-${DOMAIN_COLORS[Math.floor(index / 5)]}`}>{trait.code}</span>
                    <strong>{trait.name}</strong>
                    <p>{trait.definition}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="ov-method-block" id="scoring">
              <header className="ov-method-block-head">
                <span className="ov-method-num">02</span>
                <h2>Детерминированный scoring</h2>
              </header>
              <p>
                Одинаковый набор raw responses при одинаковых версиях даёт одинаковый score JSON.
                Mercury не имеет права менять баллы, веса, ранги или Top 5.
              </p>
              <div className="ov-method-formula">
                {SCORING_FORMULA.map(([label, value, hint]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>{hint}</small>
                  </div>
                ))}
              </div>
              <div className="ov-method-versions">
                <span className="ov-badge ov-badge-outline">assessment orbita30_ru_v2</span>
                <span className="ov-badge ov-badge-outline">items core60-v1</span>
                <span className="ov-badge ov-badge-outline">scoring mvp-0.5-core60</span>
                <span className="ov-badge ov-badge-outline">norm unvalidated-v2</span>
              </div>
              <p className="ov-method-warning">
                Статус normStatus: unvalidated. Пилотный индекс профиля не является долей людей и не
                используется для межличностного сравнения.
              </p>
            </section>

            <section className="ov-method-block" id="adaptive">
              <header className="ov-method-block-head">
                <span className="ov-method-num">03</span>
                <h2>Mercury 2.5 adaptive</h2>
              </header>
              <p>
                После Core60 backend отправляет Mercury только обезличенный AdaptiveContext. Mercury
                создаёт новые вопросы, а server-side validator проверяет traits, reason codes, формат,
                safety, дубли и лимит 10–15. При timeout работает approved fallback bank.
              </p>
              <div className="ov-method-adaptive">
                <div>
                  <span>Core</span>
                  <strong>60</strong>
                  <small>30 primary · 30 discrimination</small>
                </div>
                <div>
                  <span>Цель</span>
                  <strong>10–15</strong>
                  <small>по uncertainty</small>
                </div>
                <div>
                  <span>Quota</span>
                  <strong>≤ 3</strong>
                  <small>на trait</small>
                </div>
                <div>
                  <span>Provider</span>
                  <strong>Mercury 2.5</strong>
                  <small>server-only / validated</small>
                </div>
              </div>
            </section>

            <section className="ov-method-block" id="quality">
              <header className="ov-method-block-head">
                <span className="ov-method-num">04</span>
                <h2>Response quality</h2>
              </header>
              <p>
                Флаги качества не обнуляют результат. Они формируют RQI и при необходимости
                предупреждение для внутренней аналитики и отчёта.
              </p>
              <div className="ov-method-quality">
                {QUALITY_LIST.map(([title, body]) => (
                  <div key={title}>
                    <MethodCheck />
                    <div>
                      <strong>{title}</strong>
                      <p>{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="ov-method-block" id="validation">
              <header className="ov-method-block-head">
                <span className="ov-method-num">05</span>
                <h2>Что должно быть проверено до launch</h2>
              </header>
              <div className="ov-method-validation">
                {VALIDATION_LIST.map((item, index) => (
                  <article key={item}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <p>{item}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="ov-method-block ov-method-limits" id="limits">
              <header className="ov-method-block-head">
                <span className="ov-method-num">06</span>
                <h2>Ограничения</h2>
              </header>
              <p>
                Это не лицензированная реализация CliftonStrengths®, StrengthsFinder® или другого
                продукта Gallup. ORBITA—30 использует собственную модель, названия, вопросы,
                scoring и визуальный язык. Вся v2 версия — pilot / unvalidated, не clinical и не
                hiring decision tool; перед production нужен независимый review и юридическое
                подтверждение.
              </p>
              <button className="ov-link" onClick={() => onNavigate("privacy")} type="button">
                Privacy &amp; data rights
                <ArrowRight size={14} />
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function MethodCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}
