"use client";

import { useEffect, useState } from "react";

type ClientDateProps = {
  /** ISO-строка/метка. Без значения — текущая дата. */
  value?: string | number | Date;
  /** Только дата без времени. */
  dateOnly?: boolean;
};

/**
 * Локализованная дата без ошибок гидратации: сервер и первый рендер
 * клиента отдают одинаковый плейсхолдер, форматирование — только после mount.
 * (toLocale* зависит от часового пояса/ICU и иначе расходится с SSR.)
 */
export function ClientDate({ value, dateOnly = false }: ClientDateProps) {
  const [render, setRender] = useState<{ iso: string; text: string } | null>(null);

  // Намеренно: форматирование только на клиенте, SSR и первый рендер отдают плейсхолдер.
  useEffect(() => {
    const date = value === undefined ? new Date() : new Date(value);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRender({
      iso: date.toISOString(),
      text: dateOnly ? date.toLocaleDateString("ru-RU") : date.toLocaleString("ru-RU"),
    });
  }, [value, dateOnly]);

  if (render === null) return <span aria-hidden="true">…</span>;
  return <time dateTime={render.iso}>{render.text}</time>;
}
