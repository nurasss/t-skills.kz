"use client";

import type { View } from "@/app/orbita-view-types";

export type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  body?: string;
  align?: "left" | "center";
};

export function SectionHeading({ eyebrow, title, body, align = "left" }: SectionHeadingProps) {
  return (
    <div className={`ov-section-head${align === "center" ? " centered" : ""}`}>
      {eyebrow ? <span className="ov-eyebrow">{eyebrow}</span> : null}
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
    </div>
  );
}

export function BackLink({ onNavigate, to, label }: { onNavigate: (view: View) => void; to: View; label: string }) {
  return (
    <button className="ov-back-link" onClick={() => onNavigate(to)} type="button">
      ← {label}
    </button>
  );
}

export function ArrowRight({ size = 16 }: { size?: number }) {
  return (
    <svg className="arrow" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

export function PageEyebrow({ children }: { children: React.ReactNode }) {
  return <span className="ov-eyebrow">{children}</span>;
}
