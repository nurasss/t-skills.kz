"use client";

import { useId } from "react";

export const BRAND_SAGE = "#8CA78F";
export const BRAND_DEEP = "#2F3A36";

type BrandIconProps = {
  /** Размер в px (и ширина, и высота с сохранением пропорций 210:230). */
  size?: number;
  className?: string;
  /** Подпись для скринридеров. По умолчанию иконка декоративная (рядом есть текстовый вордмарк). */
  title?: string;
};

/**
 * Фирменный знак T-Skills (абстрактный рост/потенциал).
 * Инлайн-SVG: заливки заданы атрибутами, внешних <style> и id нет,
 * поэтому любое число копий на странице безопасно.
 */
export function BrandIcon({ size = 26, className, title }: BrandIconProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `tsb-title-${rawId}`;
  const height = size;
  const width = Math.round((size * 210) / 230);
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 210 230"
      fill="none"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-labelledby={title ? titleId : undefined}
      focusable="false"
      className={className}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <circle fill={BRAND_SAGE} cx="104" cy="35" r="24" />
      <path
        fill={BRAND_SAGE}
        d="M94 83
    C61 52, 21 55, 3 64
    C11 100, 37 127, 72 138
    C83 142, 92 141, 100 139
    C95 115, 91 94, 94 83Z"
      />
      <path
        fill={BRAND_DEEP}
        d="M116 91
    C141 56, 176 52, 206 60
    C200 94, 181 120, 150 132
    C136 137, 123 140, 109 138
    C109 116, 111 103, 116 91Z"
      />
      <path
        fill={BRAND_SAGE}
        d="M88 96
    C96 112, 102 128, 103 147
    L103 220
    C84 215, 69 207, 60 194
    C54 185, 52 175, 52 164
    C52 142, 61 122, 76 108
    C80 103, 84 99, 88 96Z"
      />
      <path
        fill={BRAND_DEEP}
        d="M105 136
    C119 127, 132 120, 145 116
    C139 134, 135 152, 134 170
    L133 220
    C121 216, 111 209, 104 199
    L104 148
    C104 144, 104 140, 105 136Z"
      />
    </svg>
  );
}
