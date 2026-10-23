import type { BriefContent } from "./brief-schema";
import { WORD_BEFORE, capThenNfc, hasVietnameseMarks, nfc, sliceChars, wordRegex } from "../common/text";

/** What the draft writer takes from the Marketing Brief, kept small so the prompt stays focused. */
export interface BriefForDraft {
  summary: string;
  angle?: { segment: string; pain: string; hook: string; benefit: string };
  /** Only items that passed the grounding check when the brief was made. */
  proof: string[];
  wordsToAvoid: string[];
  /** Who the seller is, from the brief: the only source for "what we do" in an introduction. */
  profile?: { category: string; oneLiner: string; whatItDoes: string; callToAction: string };
}

const MAX_TOKEN_TEXT = 200_000;
const VIETNAMESE_VOWELS = "aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵ";
/** One Vietnamese syllable: optional onset, one to three vowel letters, optional final consonant. Linear, on a lower-case NFC word. */
const VIETNAMESE_SYLLABLE = new RegExp(`^(?:ngh|gh|gi|kh|ng|nh|ph|qu|th|tr|ch|[bcdđghklmnpqrstvx])?[${VIETNAMESE_VOWELS}]{1,3}(?:ng|nh|ch|[cmnpt])?$`, "u");
const MAX_SYLLABLE_LENGTH = 8;
const WORD_OR_MARK = /[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}\s]/gu;

function pushRun(run: string[], out: string[]): void {
  if (run.length === 1) {
    if (run[0].length >= 4) out.push(run[0]);
  } else for (let i = 0; i + 1 < run.length; i++) out.push(`${run[i]} ${run[i + 1]}`);
}

/**
 * Words of a text for matching. English and Indonesian: lower-case words of at least 4 letters (unchanged). Text with Vietnamese
 * marks (FR-41): consecutive Vietnamese syllables become syllable bigrams ("công ty", "ty mẫu"), with no minimum length because
 * most syllables have two to four letters; a comma, slash or other punctuation ends a run; any other word keeps the old rule.
 * Works on NFC text, so a decomposed input gives the same tokens (FR-44.5). `vietnamese` forces the mode: a phrase typed without
 * marks ("xe tay ga") is Vietnamese when the brief around it is, so callers that compare several texts decide once (`anyVietnamese`).
 */
export function tokens(s: string, vietnamese?: boolean): string[] {
  const text = capThenNfc(s, MAX_TOKEN_TEXT).toLowerCase();
  vietnamese ??= hasVietnameseMarks(text);
  const out: string[] = [];
  let run: string[] = [];
  for (const m of text.matchAll(WORD_OR_MARK)) {
    const w = m[0];
    if (vietnamese && w.length <= MAX_SYLLABLE_LENGTH && VIETNAMESE_SYLLABLE.test(w)) {
      run.push(w);
      continue;
    }
    pushRun(run, out);
    run = [];
    if (w.length >= 4 && /[\p{L}\p{N}]/u.test(w[0])) out.push(w);
  }
  pushRun(run, out);
  return out;
}

/** True when any of the texts has a Vietnamese mark: the whole comparison then uses Vietnamese tokens. */
const anyVietnamese = (...texts: (string | null | undefined)[]) => texts.some((t) => !!t && hasVietnameseMarks(t));

/** The angle whose segment shares the most words with the business's name and real Maps category; none when nothing overlaps. */
export function pickAngle(angles: BriefContent["angles"], name: string, category?: string | null) {
  const vi = anyVietnamese(name, category, ...angles.map((a) => a.segment));
  const target = new Set(tokens(`${name}. ${category ?? ""}`, vi));
  let best: { a: BriefContent["angles"][number]; score: number } | undefined;
  for (const a of angles) {
    const score = tokens(a.segment, vi).filter((w) => target.has(w) || [...target].some((t) => t.startsWith(w) || w.startsWith(t))).length;
    if (score > 0 && (!best || score > best.score)) best = { a, score };
  }
  return best?.a;
}

export function briefForDraft(summary: string, content: BriefContent, lead: { name: string; category?: string | null }): BriefForDraft {
  return {
    summary,
    angle: pickAngle(content.angles ?? [], lead.name, lead.category),
    proof: [...(content.proof?.customers ?? []).slice(0, 3), ...(content.proof?.metrics ?? []).slice(0, 2)],
    wordsToAvoid: content.voice?.wordsToAvoid ?? [],
    profile: content.overview?.oneLiner || content.overview?.whatItDoes
      ? { category: content.overview.category ?? "", oneLiner: content.overview.oneLiner ?? "", whatItDoes: content.overview.whatItDoes ?? "", callToAction: content.offer?.callToAction ?? "" }
      : undefined,
  };
}

/** Nouns in an enumeration after "seperti / mulai dari / misalnya / antara lain / yaitu" (Vietnamese: "như / ví dụ / bao gồm / gồm / chẳng hạn"). */
const LIST_MARKER = /(?:seperti|misalnya|mulai\s+dari|antara\s+lain|yaitu)\s+([^.;:\n]{4,160})/gi;
const LIST_MARKER_VI = new RegExp(`${WORD_BEFORE.source}(?:(?:ví\\s{1,3}dụ|chẳng\\s{1,3}hạn)(?:\\s{1,3}như)?|bao\\s{1,3}gồm|gồm|như)\\s{1,3}([^.;:\\n]{4,160})`, "giu");
/** Where an enumeration is cut into items: a comma or dash, and "dan / hingga / sampai / atau / serta" (Vietnamese: "và / hoặc / hay / đến / tới / cũng như / cùng với"). */
const LIST_SEPARATOR = new RegExp(`[,—]|${wordRegex(["dan", "hingga", "sampai", "atau", "serta", "và", "hoặc", "hay", "đến", "tới", "cũng như", "cùng với"]).source}`, "iu");
const LIST_TEXT_MAX = 3000;

/** Split on commas and the list words, as the nouns of a sentence listing kinds of business. Generic words are not counted. */
export function offerListWords(texts: (string | null | undefined)[], vietnamese?: boolean): string[] {
  const out = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    const t = sliceChars(nfc(text), LIST_TEXT_MAX);
    const vi = vietnamese ?? hasVietnameseMarks(t);
    for (const marker of [LIST_MARKER, LIST_MARKER_VI]) {
      for (const m of t.matchAll(marker)) {
        if (!m[1].includes(",")) continue; // one item is not a list
        for (const part of m[1].split(LIST_SEPARATOR)) for (const w of tokens(part, vi)) if (!GENERIC_WORDS.has(w)) out.add(w);
      }
    }
  }
  return [...out];
}

const GENERIC_WORDS = new Set([
  "rental", "sewa", "penyewaan", "persewaan", "usaha", "bisnis", "alat", "peralatan", "layanan", "toko", "jasa", "agen", "service", "shop", "store", "perlengkapan", "barang",
  // Vietnamese (FR-41): bigrams, because that is what `tokens` returns for Vietnamese text
  "cửa hàng", "dịch vụ", "công ty", "cho thuê", "doanh nghiệp", "kinh doanh", "thiết bị", "đồ dùng", "quán", "tiệm",
]);

/**
 * Words that belong to ANOTHER kind of business in the brief (say "kebaya" for a costume shop) but appear in a draft.
 * A word counts as another business's when it is in exactly one brief segment and not in this lead's own name or category.
 */
export function foreignVerticalWords(draft: string, lead: { name: string; category?: string | null }, angles: BriefContent["angles"], offerTexts: (string | null | undefined)[] = []): string[] {
  const vi = anyVietnamese(draft, lead.name, lead.category, ...(angles ?? []).map((a) => a.segment), ...offerTexts);
  const own = new Set(tokens(`${lead.name}. ${lead.category ?? ""}`, vi));
  const mine = pickAngle(angles ?? [], lead.name, lead.category);
  const count = new Map<string, number>();
  for (const a of angles ?? []) for (const w of new Set(tokens(a.segment, vi))) count.set(w, (count.get(w) ?? 0) + 1);
  const mineWords = new Set(mine ? tokens(mine.segment, vi) : []);
  const wanted = new Set([...count].filter(([w, n]) => n === 1 && !GENERIC_WORDS.has(w) && !mineWords.has(w) && !own.has(w) && ![...own].some((o) => o.startsWith(w) || w.startsWith(o))).map(([w]) => w));
  // kinds of business named in a list inside the offer ("kamera, kebaya, alat event, hingga mobil dan motor") that are not this lead's own
  for (const w of offerListWords(offerTexts, vi)) {
    if (!GENERIC_WORDS.has(w) && !own.has(w) && ![...own].some((o) => o.startsWith(w) || w.startsWith(o)) && !mineWords.has(w)) wanted.add(w);
  }
  const said = new Set(tokens(draft, vi));
  return [...wanted].filter((w) => said.has(w));
}
