"use client";

import { useMemo } from "react";
import { useI18n } from "./index";
import { makeFormat, type Format } from "./lang";

/** Dates, times, numbers and relative times in the active UI language (never the browser's locale). */
export function useFormat(): Format {
  const { lang } = useI18n();
  return useMemo(() => makeFormat(lang), [lang]);
}
