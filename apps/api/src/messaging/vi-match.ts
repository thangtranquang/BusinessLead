import { fold, hasVietnameseMarks, nfc, wordRegexFromSource } from "../common/text";

/**
 * Vietnamese pattern sets for inbound and draft text (FR-30, FR-31, FR-44). A customer can type with diacritics or without
 * them (a phone with no Vietnamese keyboard), and "dung", "dat", "gia" or "nham" without diacritics collide with other
 * words, so the two cases are matched by two separate lists:
 *
 * - a text WITH a Vietnamese mark (`hasVietnameseMarks`, `đ` included) is matched against the `marked` sources on its NFC form;
 * - a text WITHOUT any mark is matched against the `plain` sources on its folded form (no marks, lower case). `plain`
 *   defaults to the folded `marked` sources; give it explicitly where the folded word would collide with another one.
 *
 * Sources are CONSTANTS written in the code (never built from data), lower case, with single spaces between words (runs of
 * white space are collapsed before matching), and bounded: no `*`, no `+`, no `{n,}` (checked when a matcher is built), so
 * every match costs time linear in the text. Word boundaries are Unicode ones (`wordRegexFromSource`), never ASCII `\b`.
 */
export interface ViSources {
  readonly marked: readonly string[];
  readonly plain?: readonly string[];
}

export interface ViMatcher {
  test(text: string): boolean;
  /** The first match (as written in the text), or null. */
  match(text: string): string | null;
}

const UNBOUNDED = /(?<!\\)(?:[*+]|\{\d+,\})/;

function assertBounded(source: string): void {
  // an escaped star or plus (`\*`) is a literal and fine; a bare one is a quantifier
  const stripped = source.replace(/\\[\s\S]/g, "");
  if (UNBOUNDED.test(stripped)) throw new Error(`unbounded quantifier in pattern: ${source}`);
}

function compile(sources: readonly string[]): RegExp | null {
  if (sources.length === 0) return null;
  for (const s of sources) assertBounded(s);
  return wordRegexFromSource(sources.map((s) => `(?:${s})`).join("|"));
}

/** Collapses every run of white space into one space and trims, so a source can use single spaces between words. */
const squash = (s: string): string => s.replace(/\s{2,}/gu, " ").trim();

export function viMatcher(sources: ViSources): ViMatcher {
  const marked = compile(sources.marked);
  const plain = compile(sources.plain ?? sources.marked.map((s) => fold(s)));
  const run = (text: string): RegExpExecArray | null => {
    const t = squash(nfc(text));
    if (!t) return null;
    if (hasVietnameseMarks(t)) return marked ? marked.exec(t) : null;
    return plain ? plain.exec(fold(t)) : null;
  };
  return {
    test: (text) => run(text) !== null,
    match: (text) => run(text)?.[0] ?? null,
  };
}
