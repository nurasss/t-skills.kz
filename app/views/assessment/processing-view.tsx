"use client";

import { ArrowRight } from "@/app/views/shared/section-heading";
import type { ScoreProfile } from "@/lib/assessment-engine";
import { useSiteLang } from "@/lib/site-lang";
import { PROC_STRINGS } from "@/lib/site-strings";

type ProcessingStatus =
  | "ADAPTIVE_GENERATING"
  | "ADAPTIVE_PROVIDER_FAILED"
  | "SCORING"
  | "REPORT_GENERATING"
  | "REPORT_FAILED_RETRYABLE"
  | "COMPLETE";



export type ProcessingViewProps = {
  status: ProcessingStatus;
  onOpenResults: () => void;
  onRetry: () => void;
  profile?: ScoreProfile;
  coreCount?: number;
};

export function ProcessingView({ status, onOpenResults, onRetry, profile, coreCount = 60 }: ProcessingViewProps) {
  const [lang] = useSiteLang();
  const t = PROC_STRINGS[lang];
  const base: Array<[string, string]> = [
    ["CORE_COMPLETE", t.coreDone(coreCount)],
    ["ADAPTIVE_GENERATING", t.gen],
    ["SCORING", t.scoring],
    ["REPORT_GENERATING", t.report],
    ["COMPLETE", t.complete],
  ];
  // Строка сбоя показывается только пока она актуальна, а не как пройденный этап.
  const stages = status === "ADAPTIVE_PROVIDER_FAILED"
    ? [base[0], base[1], ["ADAPTIVE_PROVIDER_FAILED", t.failed], base[2], base[3], base[4]]
    : base;
  const activeIndex =
    status === "ADAPTIVE_GENERATING"
      ? 1
      : status === "ADAPTIVE_PROVIDER_FAILED"
        ? 2
        : status === "SCORING"
          ? stages.indexOf(base[2])
          : status === "REPORT_GENERATING"
            ? stages.indexOf(base[3])
            : stages.indexOf(base[4]);

  return (
    <div className="orbita-view ov-processing">
      <div className="ov-container ov-container-narrow">
        <div className="ov-processing-layout">
          <div className="ov-processing-visual" aria-hidden="true">
            <BreakMarkAnimated />
            <span className="ov-processing-pulse" />
          </div>

          <div className="ov-processing-copy">
            <span className="ov-eyebrow">
              <span className="ov-status-dot" />
              Job status · {status}
            </span>
            <h1>{t.title}</h1>
            <p>
              {t.body}
            </p>

            <ol className="ov-processing-timeline">
              {stages.map(([name, body], index) => (
                <li className={index <= activeIndex ? "done" : ""} key={name}>
                  <span className="ov-processing-marker">
                    {index < activeIndex ? <ProcCheck /> : index === activeIndex ? <span className="ov-processing-spinner" /> : null}
                  </span>
                  <span>
                    <strong>{name}</strong>
                    <small>{body}</small>
                  </span>
                </li>
              ))}
            </ol>

            {status === "COMPLETE" ? (
              <button className="ov-btn ov-btn-primary" onClick={onOpenResults} type="button">
                {t.open}
                <ArrowRight />
              </button>
            ) : status === "REPORT_FAILED_RETRYABLE" ? (
              <button className="ov-btn ov-btn-primary" onClick={onRetry} type="button">
                {t.retryReport}
              </button>
            ) : status === "ADAPTIVE_PROVIDER_FAILED" ? (
              <button className="ov-btn ov-btn-primary" onClick={onRetry} type="button">
                {t.retryAdaptive}
              </button>
            ) : (
              <span className="ov-processing-wait">{t.waiting}</span>
            )}

            {profile ? (
              <div className="ov-processing-signature">
                score version · {profile.versions.scoring} · norm · {profile.versions.norms}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProcCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}

function BreakMarkAnimated() {
  return (
    <svg viewBox="0 0 220 220" width="200" height="200" aria-hidden="true">
      <defs>
        <radialGradient id="procGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f6f6f6" />
        </radialGradient>
      </defs>
      <circle cx="110" cy="110" r="100" fill="url(#procGrad)" stroke="rgba(17,17,17,0.12)" />
      <circle className="ov-processing-ring" cx="110" cy="110" r="78" fill="none" stroke="rgba(17,17,17,0.20)" strokeDasharray="3 6" />
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
      <circle cx="110" cy="110" r="22" fill="#ffffff" stroke="rgba(17,17,17,0.18)" />
      <text x="110" y="114" textAnchor="middle" fontFamily="serif" fontSize="11" fill="#111111">
        T-Skills
      </text>
    </svg>
  );
}
