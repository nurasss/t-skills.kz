"use client";

import type { JSX } from "react";

/**
 * Пиктограммы 25 качеств T-Skills для карточек pairwise-вопроса.
 * Каждая сторона сравнения показывает знак своего трейта (по leftTraitId/rightTraitId).
 * Единый стиль: контур 1.5px, круглые концы, viewBox 30×30, currentColor.
 * Все иконки декоративные (aria-hidden) — смысл дублируется текстом утверждения.
 */

type IconProps = { size?: number };

function Base({ size = 30, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 30 30"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function AnalyticalIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="13" cy="13" r="7" />
      <path d="M18.5 18.5L25 25" />
    </Base>
  );
}

function CreativityIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M15 4l2.1 6.9L24 13l-6.9 2.1L15 22l-2.1-6.9L6 13l6.9-2.1L15 4z" />
      <path d="M22.5 19v4M20.5 21h4" />
    </Base>
  );
}

function CommunicationIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M6 7h18v10H14l-4.5 4v-4H6V7z" />
      <circle cx="11.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="19.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </Base>
  );
}

function EmpathyIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M15 25.5C10 20.5 5 16.5 5 11.8c0-2.9 2.2-4.8 4.6-4.8 2 0 3.9 1.2 5.4 3.4 1.5-2.2 3.4-3.4 5.4-3.4 2.4 0 4.6 1.9 4.6 4.8 0 4.7-5 8.7-10 13.7z" />
    </Base>
  );
}

function LeadershipIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M10 26V5" />
      <path d="M10 6h12l-3 4 3 4H10" />
    </Base>
  );
}

function DisciplineIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x="6" y="6" width="18" height="18" rx="4" />
      <path d="M11 15l3.5 3.5L20 12" />
    </Base>
  );
}

function AdaptabilityIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M25 15a10 10 0 1 1-3-7.1" />
      <path d="M25 3.5V9h-5.5" />
    </Base>
  );
}

function StrategicIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="15" cy="15" r="9.5" />
      <circle cx="15" cy="15" r="4.5" />
      <circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" />
    </Base>
  );
}

function AttentionToDetailIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="15" cy="15" r="7.5" />
      <path d="M15 3.5V7M15 23v3.5M3.5 15H7M23 15h3.5" />
      <circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" />
    </Base>
  );
}

function InitiativeIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="15" cy="15" r="10" />
      <path d="M12.5 10.5l7.5 4.5-7.5 4.5v-9z" />
    </Base>
  );
}

function TeamworkIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="11" cy="14" r="6.5" />
      <circle cx="19" cy="14" r="6.5" />
    </Base>
  );
}

function IndependenceIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="15" cy="15" r="10.5" />
      <path d="M19.5 10.5l-3.2 5.8-5.8 3.2 3.2-5.8 5.8-3.2z" />
    </Base>
  );
}

function PersistenceIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 24L11 12l4.5 7 3-4.5L26 24" />
      <path d="M18.5 7.5v-3m0 3H16m2.5 0H21" />
    </Base>
  );
}

function OrganizationIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M6 8.5h18M6 15h18M6 21.5h11" />
    </Base>
  );
}

function CuriosityIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="15" cy="15" r="10" />
      <path d="M12.3 11.2a2.9 2.9 0 1 1 3.8 2.8c-.9.7-1.1 1.3-1.1 2.4" />
      <circle cx="15" cy="21" r="1.2" fill="currentColor" stroke="none" />
    </Base>
  );
}

function RiskToleranceIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M16.5 3.5L8 17h6.5L13.5 26.5l9-14.5h-6.5l.5-8.5z" />
    </Base>
  );
}

function LearningIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M15 7.5C13 6 10 5.5 6 5.5v16c4 0 7 .5 9 2 2-1.5 5-2 9-2v-16c-4 0-7 .5-9 2z" />
      <path d="M15 7.5v16" />
    </Base>
  );
}

function PracticalityIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="15" cy="15" r="3.8" />
      <path d="M15 4.5v2.8M15 22.7V25.5M4.5 15h2.8M22.7 15h2.8M7.6 7.6l2 2M20.4 20.4l2 2M22.4 7.6l-2 2M9.6 20.4l-2 2" />
    </Base>
  );
}

function PersuasionIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 12.5v6h4.5L20 23V8.5L8.5 12.5H4z" />
      <path d="M23 12.5a4.5 4.5 0 0 1 0 6.5" />
    </Base>
  );
}

function PlanningIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x="5" y="7" width="20" height="17" rx="3" />
      <path d="M5 12.5h20M10 4v4.5M20 4v4.5" />
    </Base>
  );
}

function DecisivenessIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M15 27V4" />
      <path d="M15 8H8l-2.5 2.5L8 13h7" />
      <path d="M15 16h7l2.5 2.5-2.5 2.5h-7" />
    </Base>
  );
}

function ObservationIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M3 15c3.5-5 7.5-7.5 12-7.5s8.5 2.5 12 7.5c-3.5 5-7.5 7.5-12 7.5S6.5 20 3 15z" />
      <circle cx="15" cy="15" r="3" />
    </Base>
  );
}

function ResponsibilityIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M15 3.5l7.5 2.8v6.4c0 4.8-3.3 8.1-7.5 9.8-4.2-1.7-7.5-5-7.5-9.8V6.3L15 3.5z" />
      <path d="M11.5 14.5l2.5 2.5 4.5-5" />
    </Base>
  );
}

function SystemsThinkingIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M9.5 10.5l11-1M9.5 10.5L14 20.5M20.5 9.5L16 20" />
      <circle cx="8" cy="11" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="22" cy="9" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="22" r="2.4" fill="currentColor" stroke="none" />
    </Base>
  );
}

function StressResilienceIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="15" cy="5.8" r="2.3" />
      <path d="M15 8.5V25M11.5 13h7" />
      <path d="M6.5 19.5c0 3.3 3.8 5.5 8.5 5.5s8.5-2.2 8.5-5.5" />
    </Base>
  );
}

function FallbackIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="15" cy="15" r="9" />
      <circle cx="15" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </Base>
  );
}

const ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  analytical: AnalyticalIcon,
  creativity: CreativityIcon,
  communication: CommunicationIcon,
  empathy: EmpathyIcon,
  leadership: LeadershipIcon,
  discipline: DisciplineIcon,
  adaptability: AdaptabilityIcon,
  strategic: StrategicIcon,
  "attention-to-detail": AttentionToDetailIcon,
  initiative: InitiativeIcon,
  teamwork: TeamworkIcon,
  independence: IndependenceIcon,
  persistence: PersistenceIcon,
  organization: OrganizationIcon,
  curiosity: CuriosityIcon,
  "risk-tolerance": RiskToleranceIcon,
  learning: LearningIcon,
  practicality: PracticalityIcon,
  persuasion: PersuasionIcon,
  planning: PlanningIcon,
  decisiveness: DecisivenessIcon,
  observation: ObservationIcon,
  responsibility: ResponsibilityIcon,
  "systems-thinking": SystemsThinkingIcon,
  "stress-resilience": StressResilienceIcon,
};

/** Иконка трейта по его stable id (см. T_SKILLS_TRAIT_IDS). Неизвестный id — нейтральная заглушка. */
export function TraitIcon({ traitId, size }: { traitId: string; size?: number }) {
  const Icon = ICONS[traitId] ?? FallbackIcon;
  return <Icon size={size} />;
}
