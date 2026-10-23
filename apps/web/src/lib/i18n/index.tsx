"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { enAll, viAll, type MessageKey } from "./messages";
import { LANG_COOKIE, rawLangCookie, shouldWriteLangCookie, type Lang } from "./lang";

export type { Lang };

const dictionaries: Record<Lang, Record<MessageKey, string>> = { en: enAll, vi: viAll };

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18n | null>(null);

/** Initial language comes from the cookie on the server, so first paint already matches (no flash). */
export function I18nProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);

  const setLang = useCallback((l: Lang) => {
    // Clicking the active option does nothing only when the RAW cookie already holds it. A legacy, invalid or
    // missing cookie still shows English, and a click on EN must replace it, so compare the raw value, not `lang`.
    let raw: string | null = null;
    try { raw = rawLangCookie(document.cookie); } catch { /* cookies unreadable: treat as missing */ }
    if (!shouldWriteLangCookie(raw, l, lang)) return;
    setLangState(l);
    try {
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    } catch { /* cookies blocked: the choice only lasts for this session */ }
    try {
      document.documentElement.lang = l;
    } catch { /* no document: nothing to update */ }
  }, [lang]);

  const t = useCallback<I18n["t"]>(
    (key, vars) => {
      let s = dictionaries[lang][key] ?? enAll[key] ?? key; // a missing key shows its name instead of crashing the page
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n must be used inside <I18nProvider>");
  return v;
}
