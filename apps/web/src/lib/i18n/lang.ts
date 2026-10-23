/**
 * Server-safe pieces of i18n (no "use client", no imports): the root layout reads them on the server and the
 * client hooks wrap them. The web keeps its own two-value output-language union; the contract with the API is
 * enforced by the API's DTOs, not by a shared import.
 */
export type Lang = "en" | "vi";
export const LANG_COOKIE = "prospex_lang";

/** The language a campaign, brief or template is written in (the API's values). */
export type OutputLanguage = "vietnamese" | "english";

/** "vi" only for the exact string vi; the legacy cookie value, any other string and a missing cookie read as English. */
export function parseLang(value: unknown): Lang {
  return value === "vi" ? "vi" : "en";
}

export function localeOf(lang: Lang): "en-US" | "vi-VN" {
  return lang === "vi" ? "vi-VN" : "en-US";
}

/** The UI language as the API value (what brief, template and style-draft requests send). */
export function toApiLanguage(lang: Lang): OutputLanguage {
  return lang === "vi" ? "vietnamese" : "english";
}

/**
 * The language the system will actually write in for a stored value: vietnamese only for the exact value,
 * english for everything else (the value legacy rows may still hold, null, unknown strings). Mirror of the API normaliser.
 */
export function effectiveOutputLanguage(value: unknown): OutputLanguage {
  return value === "vietnamese" ? "vietnamese" : "english";
}

/** The raw (not decoded, not validated) value of the language cookie in a `document.cookie` string, or null when absent. */
export function rawLangCookie(cookieString: string | null | undefined): string | null {
  if (!cookieString) return null;
  const prefix = `${LANG_COOKIE}=`;
  for (const part of cookieString.split(";")) {
    const p = part.trim();
    if (p.startsWith(prefix)) return p.slice(prefix.length);
  }
  return null;
}

/**
 * Toggle click rule: clicking the already-active option is a no-op only when the raw cookie already equals it.
 * With a stale, invalid or missing cookie the page shows English, and a click on EN replaces the cookie.
 */
export function shouldWriteLangCookie(rawCookie: string | null | undefined, next: Lang, current: Lang): boolean {
  return !(rawCookie === next && next === current);
}

export interface Format {
  /** Date in the language's locale; "" for a missing or invalid date. `opts` default to the locale's short numeric date. */
  date: (value: Date | string | number | null | undefined, opts?: Intl.DateTimeFormatOptions) => string;
  /** Date and time (default: medium date, short time); "" for a missing or invalid date. */
  dateTime: (value: Date | string | number | null | undefined, opts?: Intl.DateTimeFormatOptions) => string;
  /** Number with the language's grouping; "" for a missing or non-finite number. */
  number: (value: number | null | undefined, opts?: Intl.NumberFormatOptions) => string;
  /** "2 days ago" / "in 3 days" (value is negative for the past); "" for a non-finite value. */
  relative: (value: number, unit: Intl.RelativeTimeFormatUnit, opts?: Intl.RelativeTimeFormatOptions) => string;
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Pure formatting bound to a language: always the language's own locale, never the browser's. */
export function makeFormat(lang: Lang): Format {
  const locale = localeOf(lang);
  const relativeLocale = lang === "vi" ? "vi" : "en";
  return {
    date(value, opts) {
      const d = toDate(value);
      return d ? d.toLocaleDateString(locale, opts) : "";
    },
    dateTime(value, opts) {
      const d = toDate(value);
      return d ? d.toLocaleString(locale, opts ?? { dateStyle: "medium", timeStyle: "short" }) : "";
    },
    number(value, opts) {
      return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(locale, opts) : "";
    },
    relative(value, unit, opts) {
      if (typeof value !== "number" || !Number.isFinite(value)) return "";
      // "always" gives "2 days ago" in both languages; zero keeps the idiomatic "now" wording.
      return new Intl.RelativeTimeFormat(relativeLocale, { numeric: value === 0 ? "auto" : "always", ...opts }).format(value, unit);
    },
  };
}
