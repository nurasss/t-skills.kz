"use client";

import type { CSSProperties } from "react";
import { BrandIcon } from "@/app/brand/brand-icon";
import "./brand.css";

type BrandLockupProps = {
  iconSize?: number;
  wordSize?: number;
  tagSize?: number;
};

/**
 * Полный фирменный локап T-Skills по эталону:
 * знак + прямой serif-вордмарк + двухстрочный теглайн.
 */
export function BrandLockup({ iconSize = 48, wordSize = 42, tagSize = 10.5 }: BrandLockupProps) {
  return (
    <span className="tsb-lockup">
      <BrandIcon size={iconSize} className="tsb-lockup-icon" />
      <span className="tsb-lockup-body">
        <span
          className="tsb-lockup-word"
          style={{ "--tsb-word": `${wordSize}px` } as CSSProperties}
        >
          T-Skills
        </span>
        <span
          className="tsb-lockup-tag"
          style={{ "--tsb-tag": `${tagSize}px` } as CSSProperties}
        >
          KNOW YOUR STRENGTHS
          <br />
          A BRIGHTER TOMORROW
        </span>
      </span>
    </span>
  );
}
