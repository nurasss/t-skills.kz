"use client";

import type { AdaptiveSelection } from "@/lib/assessment-engine";
import type { View } from "@/app/orbita-view-types";
import { ArrowRight } from "@/app/views/shared/section-heading";

export type BreakViewProps = {
  adaptiveReady: boolean;
  onContinue: () => void;
  onExit: (view: View) => void;
  selection?: AdaptiveSelection;
};

export function BreakView({ adaptiveReady, onContinue, onExit, selection }: BreakViewProps) {
  return (
    <div className="orbita-view ov-break">
      <div className="ov-container ov-container-narrow">
        <div className="ov-break-visual" aria-hidden="true">
          <BreakOrbita />
        </div>

        <div className="ov-break-copy">
          <span className="ov-eyebrow">
            <span className="ov-status-dot" />
            {adaptiveReady ? "CORE COMPLETE" : "BLOCK SAVED"}
          </span>
          <h1>{adaptiveReady ? "Основной сигнал собран." : "Пауза — часть процесса."}</h1>
          <p>
            {adaptiveReady
              ? "Осталось несколько уточняющих вопросов, подобранных по вашим предыдущим ответам."
              : "Ваши ответы сохранены. Можно сделать паузу и вернуться к следующему блоку, когда будет удобно."}
          </p>

          <ul className="ov-break-status">
            <li>
              <BreakCheck />
              <span>{adaptiveReady ? "60 основных вопросов сохранены" : "Промежуточный блок сохранён"}</span>
            </li>
            <li>
              <BreakCheck />
              <span>{adaptiveReady ? "Профиль неопределённости рассчитан" : "Можно закрыть браузер и продолжить"}</span>
            </li>
            {adaptiveReady && selection ? (
              <li>
                <BreakSparkle />
                <span>
                  {selection.selectedItemIds.length} вопросов готовы ·{" "}
                  {selection.mode === "mercury"
                    ? "Mercury 2.5"
                    : selection.mode === "approved-fallback"
                      ? "approved fallback"
                      : selection.mode === "ai-openai"
                        ? "AI selector"
                        : "deterministic fallback"}
                </span>
              </li>
            ) : null}
          </ul>

          <div className="ov-break-actions">
            <button className="ov-btn ov-btn-primary" onClick={onContinue} type="button">
              {adaptiveReady ? "Ответить на уточнения" : "Продолжить"}
              <ArrowRight />
            </button>
            <button className="ov-btn ov-btn-secondary" onClick={() => onExit("account")} type="button">
              Выйти и вернуться позже
            </button>
          </div>

          <p className="ov-break-note">
            Прогресс подтверждается сервером после каждого ответа; при временном обрыве браузер
            хранит только очередь повтора.
          </p>
        </div>
      </div>
    </div>
  );
}

function BreakCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}

function BreakSparkle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" strokeLinejoin="round" />
    </svg>
  );
}

function BreakOrbita() {
  return (
    <svg viewBox="0 0 220 220" width="180" height="180" aria-hidden="true">
      <defs>
        <radialGradient id="breakGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FCFBF8" />
          <stop offset="100%" stopColor="#F1EEE6" />
        </radialGradient>
      </defs>
      <circle cx="110" cy="110" r="100" fill="url(#breakGrad)" stroke="rgba(23,26,24,0.12)" />
      <circle cx="110" cy="110" r="78" fill="none" stroke="rgba(23,26,24,0.12)" />
      <circle cx="110" cy="110" r="56" fill="none" stroke="rgba(23,26,24,0.12)" strokeDasharray="3 4" />
      {[
        { angle: 0, color: "#8FA888" },
        { angle: 60, color: "#7C93A8" },
        { angle: 120, color: "#C79A5B" },
        { angle: 180, color: "#C1836F" },
        { angle: 240, color: "#B78D97" },
        { angle: 300, color: "#9B93B5" },
      ].map(({ angle, color }) => {
        const rad = (angle * Math.PI) / 180;
        const r = 72;
        const x = 110 + r * Math.cos(rad);
        const y = 110 + r * Math.sin(rad);
        return <circle key={angle} cx={x} cy={y} r="9" fill={color} opacity="0.85" />;
      })}
      <circle cx="110" cy="110" r="22" fill="#FCFBF8" stroke="rgba(23,26,24,0.18)" />
      <text x="110" y="107" textAnchor="middle" fontFamily="serif" fontSize="13" fill="#171A18">
        ORBITA
      </text>
      <text x="110" y="123" textAnchor="middle" fontFamily="serif" fontSize="13" fill="#171A18">
        30
      </text>
    </svg>
  );
}
