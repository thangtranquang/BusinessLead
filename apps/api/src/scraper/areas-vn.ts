/**
 * Vietnam's side of area planning: place aliases, prefixes, separators and the nationwide terms. Everything here is built
 * from constants written in this file or the market profile; typed text is only ever compared or escaped as a literal,
 * never turned into a pattern, and is capped at VN_AREA_CAP characters first.
 */
import { MARKET } from "../common/market";
import { capThenNfc, escapeRegExp, fold, nfc } from "../common/text";

export const VN_AREA_CAP = 400;

const collapse = (s: string) => fold(s).replace(/\s+/g, " ").trim();
/** The text as a lower-case, accent-free line with single spaces: for comparison only. */
export const vnFolded = (s: string) => collapse(capThenNfc(s, VN_AREA_CAP));
/** The same with every non-alphanumeric character gone, so "TP.HCM", "TP. HCM" and "tphcm" are one key. */
const key = (s: string) => fold(s).replace(/[^a-z0-9]/g, "");

const NATIONWIDE_EXTRA = ["vietnam", "nationwide", "all vietnam", "whole vietnam", "toan viet nam"];
export const VN_NATIONWIDE: ReadonlySet<string> = new Set([...MARKET.VN.nationwideTerms.map(collapse), ...NATIONWIDE_EXTRA]);

/** Other ways to write a city, mapped to the spelling in MARKET.VN.cities. SIMULATED coverage: the owner reviews the list. */
const ALIASES: ReadonlyArray<readonly [canonical: string, aliases: readonly string[]]> = [
  ["Hồ Chí Minh", ["Ho Chi Minh", "Ho Chi Minh City", "HCM", "HCMC", "TPHCM", "TP.HCM", "Sài Gòn", "Sai Gon", "Saigon", "Sài Gòn"]],
  ["Hà Nội", ["Ha Noi", "Hanoi", "HN"]],
  ["Đà Nẵng", ["Da Nang", "Danang"]],
  ["Huế", ["Thừa Thiên Huế", "Thua Thien Hue"]],
];

const PLACE_KEYS: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of MARKET.VN.cities) m.set(key(c), c);
  for (const [canonical, list] of ALIASES) {
    const city = MARKET.VN.cities.find((c) => key(c) === key(canonical)) ?? canonical;
    for (const a of list) m.set(key(a), city);
  }
  return m;
})();

// Prefixes people write before a place. Constant patterns, anchored, bounded.
const PREFIX = /^(?:thành\s{1,3}phố|thanh\s{1,3}pho|tp\.?|tỉnh|tinh|tại|tai|ở)\s{1,3}/iu;
const SEPARATORS = /[,;\n\r|/+]|\s&\s|\s+(?:và|va|hoặc|hoac|cùng\s{1,3}với|cung\s{1,3}voi)\s+/iu;

/** One typed place: prefixes removed (up to 3), then the list's spelling when it is a known city or alias, else as typed. */
export function resolveVnPlace(text: string): string {
  let x = capThenNfc(text, VN_AREA_CAP).trim();
  for (let i = 0; i < 3; i++) x = x.replace(PREFIX, "").trim();
  return PLACE_KEYS.get(key(x)) ?? x;
}

export function splitAreasVn(location: string): string[] {
  const parts = capThenNfc(location, VN_AREA_CAP).split(SEPARATORS).map(resolveVnPlace).filter((a) => a.length > 1);
  const seen = new Set<string>();
  return parts.filter((a) => (seen.has(collapse(a)) ? false : (seen.add(collapse(a)), true)));
}

/** Every spelling stripPlacesVn removes: the list, its accent-free forms, the aliases, longest first. */
const KNOWN_PLACES: readonly string[] = (() => {
  const all = new Set<string>();
  for (const c of MARKET.VN.cities) { all.add(c); all.add(fold(c)); }
  for (const [canonical, list] of ALIASES) { all.add(canonical); all.add(fold(canonical)); for (const a of list) all.add(a); }
  for (const t of MARKET.VN.nationwideTerms) all.add(t);
  return [...all].filter((p) => p.length > 1).sort((a, b) => b.length - a.length);
})();

/** Removes place names from a search phrase so the campaign's areas decide where to look (see stripPlaces). */
export function stripPlacesVn(query: string, typedAreas: string[] = []): string {
  const original = capThenNfc(query, VN_AREA_CAP);
  const typed = typedAreas.map((p) => nfc(p).trim()).filter((p) => p.length > 1 && p.length <= VN_AREA_CAP);
  let out = original;
  for (const p of [...typed.sort((a, b) => b.length - a.length), ...KNOWN_PLACES]) {
    out = out.replace(new RegExp(`(^|\\s)(?:(?:tại|tai|ở|in)\\s+)?${escapeRegExp(p)}(?=\\s|$)`, "giu"), " ");
  }
  out = out.replace(/\s+(tại|tai|ở|in)$/iu, "").replace(/\s+/g, " ").trim();
  return out.length >= 3 ? out : original.trim();
}
