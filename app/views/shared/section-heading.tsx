"use client";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  body?: string;
  align?: "left" | "center";
  /** Уровень заголовка: h1 — один на страницу (каталог, методология). */
  level?: 1 | 2;
};

export function SectionHeading({ eyebrow, title, body, align = "left", level = 2 }: SectionHeadingProps) {
  const Title = level === 1 ? "h1" : "h2";
  return (
    <div className={`ov-section-head${align === "center" ? " centered" : ""}`}>
      {eyebrow ? <span className="ov-eyebrow">{eyebrow}</span> : null}
      <Title>{title}</Title>
      {body ? <p>{body}</p> : null}
    </div>
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
