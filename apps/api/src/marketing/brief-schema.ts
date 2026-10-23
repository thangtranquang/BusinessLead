import { clip } from "../ai/chat-import/style-prompt";
import { DEFAULT_OUTPUT_LANGUAGE, toOutputLanguage, type OutputLanguage } from "../common/language";
import { capThenNfc, hasVietnameseMarks, nfc, wordRegex } from "../common/text";

/**
 * The Marketing Brief follows the structure of the `product-marketing` skill (overview, audience, problems,
 * differentiation, objections, proof, voice) plus the offer and a few outreach angles. Facts must come from the
 * user's sources: whatever is missing is listed in `gaps` as "[NEED: ...]" instead of being invented.
 */
export interface BriefContent {
  overview: { oneLiner: string; whatItDoes: string; category: string; businessModel: string };
  audience: { targetCustomers: string; decisionMakers: string; primaryUseCase: string; jobsToBeDone: string[] };
  problems: { coreProblem: string; whyAlternativesFallShort: string[]; cost: string };
  differentiation: { keyDifferentiators: string[]; whyBetter: string };
  objections: { objection: string; response: string }[];
  proof: { metrics: string[]; customers: string[]; testimonials: string[] };
  offer: { pricing: string; callToAction: string };
  voice: { tone: string; wordsToUse: string[]; wordsToAvoid: string[] };
  /** Hypotheses to test per segment, not facts. */
  angles: { segment: string; pain: string; hook: string; benefit: string }[];
  gaps: string[];
}

/** Pre-filled campaign settings, for the user to correct. `target` describes the businesses to look for, not the user's own company. */
export interface CampaignSuggestion {
  name: string;
  target: string;
  location: string;
  searchQueries: string[];
  contentStyle: "professional" | "friendly" | "balanced" | "casual";
  language: OutputLanguage;
}

export interface ParsedBrief {
  summary: string;
  content: BriefContent;
  campaign: CampaignSuggestion;
}

const SUMMARY_MAX = 450;

/**
 * The notes that the code itself adds to `gaps` and that the owner reads on the brief page, in the brief's language. They keep
 * the `[NEED: ...]` marker (internal protocol, the same in every language). Vietnamese wording: native-speaker review (NFR-9).
 */
const GAP_TEXT = Object.freeze({
  vietnamese: Object.freeze({
    noCustomerType: "[NEED: loại hình doanh nghiệp khách hàng cần tìm chưa rõ từ nguồn, hãy tự điền từ khóa tìm kiếm]",
    noLocation: "[NEED: địa điểm mục tiêu (thành phố hoặc khu vực) chưa rõ, hãy tự điền trong biểu mẫu chiến dịch]",
    passFailed: (pass: string) => `[NEED: phần "${pass}" tạo không thành công, hãy chạy tạo lại]`,
    noDiacritics: (pass: string) => `[NEED: phần "${pass}" thiếu dấu tiếng Việt, hãy kiểm tra và sửa hoặc chạy tạo lại]`,
    notInSources: (label: string, item: string) => `[NEED: ${label} "${item}" không có trong nguồn, hãy bổ sung bằng chứng hoặc xóa]`,
    labels: Object.freeze({ number: "con số", customer: "khách hàng", testimonial: "lời nhận xét" }),
    price: "[NEED: giá không có trong nguồn, hãy điền giá đúng]",
    summaryNumbers: "[NEED: bản tóm tắt có con số không có trong nguồn, các con số đó đã bị xóa]",
  }),
  english: Object.freeze({
    noCustomerType: "[NEED: the customer business type to search for is not clear from the sources, fill in the search terms yourself]",
    noLocation: "[NEED: target location (city or area) is not clear from the sources, fill it in on the campaign form]",
    passFailed: (pass: string) => `[NEED: the "${pass}" part could not be written, generate again]`,
    noDiacritics: (pass: string) => `[NEED: the "${pass}" part lacks Vietnamese diacritics, check and fix it or generate again]`,
    notInSources: (label: string, item: string) => `[NEED: ${label} "${item}" was not found in the sources, add the evidence or remove it]`,
    labels: Object.freeze({ number: "figure", customer: "customer", testimonial: "testimonial" }),
    price: "[NEED: the price was not found in the sources, fill in the right price]",
    summaryNumbers: "[NEED: the summary had figures that are not in the sources, those figures were removed]",
  }),
});

/** A pass whose Vietnamese text came back without diacritics twice (kept, but flagged). */
export function noDiacriticsGap(language: unknown, pass: string): string {
  return GAP_TEXT[toOutputLanguage(language)].noDiacritics(pass);
}

/** The string values of a parsed model answer, joined (bounded depth and size), for language checks. */
export function proseOf(raw: unknown, depth = 0): string {
  if (typeof raw === "string") return raw;
  if (depth > 5 || raw === null || typeof raw !== "object") return "";
  return Object.values(raw as object).slice(0, 50).map((v) => proseOf(v, depth + 1)).join(" ").slice(0, 20_000);
}

/** A failed generation pass, as a gap in the brief's language (used by the brief service). */
export function passFailedGap(language: unknown, pass: string): string {
  return GAP_TEXT[toOutputLanguage(language)].passFailed(pass);
}

// a gap about the same thing written earlier, in any language the app has used, is not repeated
const SEEN_CUSTOMER_TYPE = /jenis bisnis|business type|loại hình/i;
const SEEN_LOCATION = /lokasi|location|địa điểm/i;

/** Words that mark a job title or the seller's own kind of service: neither is a business you can search for on Google Maps. */
const NOT_A_CUSTOMER_BUSINESS = /\b(manajer|manager|direktur|director|pemilik|owner|ceo|cto|kepala|staf|staff|karyawan|pengambil keputusan|manajemen|pengelolaan|inventaris|pelatihan|konsultasi|solusi|otomatisasi|otomasi|automasi|automation|digitalisasi|software|perangkat lunak|aplikasi|sistem|system|platform|jasa|layanan|outsourc\w*|konsultan it|chatbot|ai|asisten|ai agent|machine learning|pengembangan|pembuatan website)\b/i;

/**
 * The Vietnamese counterpart (FR-39): job titles and the seller's own services, as whole words or phrases between Unicode word
 * boundaries (never an ASCII word boundary, which splits "đ" and any letter with a mark). "tư vấn" and "thiết kế" alone are not
 * listed: "công ty tư vấn" and "tiệm thiết kế nội thất" are real kinds of place.
 */
export const NOT_A_CUSTOMER_BUSINESS_WORDS: readonly string[] = Object.freeze([
  "giám đốc", "trưởng phòng", "nhân viên", "chủ doanh nghiệp", "chủ sở hữu", "chủ cửa hàng", "chủ quán", "chủ shop", "người quản lý", "nhà quản lý",
  "lãnh đạo", "người ra quyết định", "người quyết định", "phần mềm", "dịch vụ", "ứng dụng", "hệ thống", "nền tảng", "giải pháp", "tự động hóa",
  "chuyển đổi số", "số hóa", "trí tuệ nhân tạo", "trợ lý ảo", "lập trình", "thiết kế website", "thiết kế web", "quy trình",
]);
const NOT_A_CUSTOMER_BUSINESS_VI = wordRegex(NOT_A_CUSTOMER_BUSINESS_WORDS, "iu");

const TERM_MAX_RAW = 400;

/** A search term that names a kind of place ("toko handphone", "klinik gigi", "tiệm cắt tóc"), not a role, a service or a sentence. */
export function isCustomerBusinessTerm(term: string): boolean {
  if (typeof term !== "string" || term.length > TERM_MAX_RAW) return false;
  const t = nfc(term).trim();
  // a Vietnamese kind of place is written in more words ("cửa hàng điện thoại di động"): every syllable is a word
  const maxWords = hasVietnameseMarks(t) ? 6 : 4;
  return t.length >= 3 && t.length <= 40 && t.split(/\s+/).length <= maxWords && !NOT_A_CUSTOMER_BUSINESS.test(t) && !NOT_A_CUSTOMER_BUSINESS_VI.test(t) && !/[.!?:;]/.test(t);
}
/** Text from a model or a person, as NFC (FR-44.2): capped before it is normalised, then clipped. */
const str = (v: unknown, max = 600): string => (typeof v === "string" ? clip(capThenNfc(v, max * 4), max) : typeof v === "number" ? String(v) : "");
const list = (v: unknown, n: number, max = 300): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : []).map((x) => str(x, max)).filter(Boolean).slice(0, n);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function emptyBrief(): BriefContent {
  return {
    overview: { oneLiner: "", whatItDoes: "", category: "", businessModel: "" },
    audience: { targetCustomers: "", decisionMakers: "", primaryUseCase: "", jobsToBeDone: [] },
    problems: { coreProblem: "", whyAlternativesFallShort: [], cost: "" },
    differentiation: { keyDifferentiators: [], whyBetter: "" },
    objections: [],
    proof: { metrics: [], customers: [], testimonials: [] },
    offer: { pricing: "", callToAction: "" },
    voice: { tone: "", wordsToUse: [], wordsToAvoid: [] },
    angles: [],
    gaps: [],
  };
}

/** Pulls the JSON object out of a model reply that may be wrapped in code fences or prose. */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in the reply");
  const body = t.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    // small local models often slip on one quote or comma in a long answer: repair rather than discard two minutes of work
    return JSON.parse(repairJson(t.slice(start)));
  }
}

/**
 * Fixes the usual slips of small models in a long JSON reply: raw line breaks and unescaped quotes inside strings,
 * missing or trailing commas, smart quotes, and an answer cut off before its closing brackets.
 * A quote ends a string only when what follows is structure (`,` `}` `]` `:`); otherwise it is text.
 */
export function repairJson(input: string): string {
  const src = input.replace(/[\u201C\u201D]/g, '"');
  let out = "";
  const stack: string[] = [];
  let inStr = false;
  const nextSig = (i: number) => {
    let j = i;
    while (j < src.length && /\s/.test(src[j])) j++;
    return src[j];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") {
        out += c + (src[i + 1] ?? "");
        i++;
      } else if (c === '"') {
        const n = nextSig(i + 1);
        if (n === undefined || n === "," || n === "}" || n === "]" || n === ":") {
          inStr = false;
          out += c;
        } else out += '\\"';
      } else if (c === "\n") out += "\\n";
      else if (c === "\r") out += "";
      else if (c === "\t") out += "\\t";
      else out += c;
      continue;
    }
    if (c === '"') {
      // a value or key starting right after another value: a comma is missing
      if (/[}\]"\d el]$/.test(out.trimEnd().slice(-1)) && /[}\]"]$|\d$|true$|false$|null$/.test(out.trimEnd())) out = out.trimEnd() + ",";
      inStr = true;
      out += c;
    } else if (c === "{" || c === "[") {
      if (/[}\]"]$|\d$|true$|false$|null$/.test(out.trimEnd())) out = out.trimEnd() + ",";
      stack.push(c === "{" ? "}" : "]");
      out += c;
    } else if (c === "}" || c === "]") {
      out = out.trimEnd().replace(/,$/, "");
      if (stack.length) stack.pop();
      out += c;
      if (stack.length === 0) break;
    } else out += c;
  }
  if (inStr) out += '"';
  out = out.trimEnd().replace(/[,:]$/, "");
  while (stack.length) out += stack.pop();
  return out;
}

/** Finds a key anywhere in a (small) object tree: models sometimes nest a section inside another one. */
function deepFind(v: unknown, key: string, depth = 0): unknown {
  if (!v || typeof v !== "object" || depth > 4) return undefined;
  const o = v as Record<string, unknown>;
  if (key in o) return o[key];
  for (const child of Object.values(o)) {
    const found = deepFind(child, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Merges the JSON of several passes: later keys win for sections, `gaps` are concatenated. */
export function mergeRaw(parts: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const gaps: unknown[] = [];
  for (const p of parts) {
    const o = obj(p);
    for (const [k, v] of Object.entries(o)) {
      if (k === "gaps") gaps.push(...(Array.isArray(v) ? v : typeof v === "string" ? [v] : []));
      else out[k] = v;
    }
  }
  out.gaps = gaps;
  return out;
}

/** Coerces anything the model returned into the brief shape, with length caps. Never throws on missing fields. */
export function coerceBrief(raw: unknown, language: OutputLanguage = DEFAULT_OUTPUT_LANGUAGE): ParsedBrief {
  const r = obj(raw);
  const sec = (k: string) => obj(r[k] ?? deepFind(r, k));
  const o = sec("overview"), a = sec("audience"), p = sec("problems"), d = sec("differentiation"), pr = sec("proof"), of = sec("offer"), v = sec("voice");
  const content: BriefContent = {
    overview: { oneLiner: str(o.oneLiner, 240), whatItDoes: str(o.whatItDoes, 500), category: str(o.category, 120), businessModel: str(o.businessModel, 300) },
    audience: { targetCustomers: str(a.targetCustomers, 400), decisionMakers: str(a.decisionMakers, 300), primaryUseCase: str(a.primaryUseCase, 400), jobsToBeDone: list(a.jobsToBeDone, 4) },
    problems: { coreProblem: str(p.coreProblem, 500), whyAlternativesFallShort: list(p.whyAlternativesFallShort, 4), cost: str(p.cost, 400) },
    differentiation: { keyDifferentiators: list(d.keyDifferentiators, 5), whyBetter: str(d.whyBetter, 500) },
    objections: (Array.isArray(r.objections ?? deepFind(r, "objections")) ? ((r.objections ?? deepFind(r, "objections")) as unknown[]) : []).map((x) => ({ objection: str(obj(x).objection, 200), response: str(obj(x).response, 400) })).filter((x) => x.objection && x.response).slice(0, 6),
    proof: { metrics: list(pr.metrics, 6), customers: list(pr.customers, 8, 120), testimonials: list(pr.testimonials, 4, 400) },
    offer: { pricing: str(of.pricing, 400), callToAction: str(of.callToAction, 200) },
    voice: { tone: str(v.tone, 300), wordsToUse: list(v.wordsToUse, 10, 60), wordsToAvoid: list(v.wordsToAvoid, 10, 60) },
    angles: (Array.isArray(r.angles ?? deepFind(r, "angles")) ? ((r.angles ?? deepFind(r, "angles")) as unknown[]) : [])
      .map((x) => ({ segment: str(obj(x).segment, 120), pain: str(obj(x).pain, 300), hook: str(obj(x).hook, 300), benefit: str(obj(x).benefit, 300) }))
      .filter((x) => x.segment && x.hook)
      .slice(0, 6),
    gaps: list(r.gaps, 12, 240).map((g) => (/^\[NEED:/i.test(g) ? g : `[NEED: ${g.replace(/^\[|\]$/g, "")}]`)),
  };
  const c = sec("campaign");
  const style = typeof c.contentStyle === "string" ? c.contentStyle.toLowerCase() : "";
  let queries = [...new Set(list(c.searchQueries, 8, 60).map((q) => q.split("/")[0].replace(/\s+/g, " ").trim()))].filter(isCustomerBusinessTerm).slice(0, 6);
  // the model sometimes lists its own services or job titles; the outreach segments are a better source of business types
  if (queries.length < 2) {
    const fromAngles = content.angles.map((a) => a.segment.replace(/\s+/g, " ").trim()).filter(isCustomerBusinessTerm);
    queries = [...new Set([...queries, ...fromAngles])].slice(0, 6);
  }
  const rawTarget = str(c.target, 80).split("/")[0].trim();
  // a "[NEED: ...]" written into a field is a gap, not a value
  const needs: string[] = [];
  const clean = <T extends Record<string, unknown>>(o: T): T => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string" && /^\s*\[NEED:/i.test(v)) { needs.push(v.trim()); (o as Record<string, unknown>)[k] = ""; }
      else if (Array.isArray(v)) (o as Record<string, unknown>)[k] = v.filter((x) => (typeof x === "string" && /^\s*\[NEED:/i.test(x) ? (needs.push(x.trim()), false) : true));
    }
    return o;
  };
  [content.overview, content.audience, content.problems, content.differentiation, content.proof, content.offer, content.voice].forEach(clean);
  content.gaps = dedupeGaps([...content.gaps, ...needs]);
  const campaign: CampaignSuggestion = {
    name: str(c.name, 80),
    target: isCustomerBusinessTerm(rawTarget) ? rawTarget : queries[0] ?? "",
    location: str(c.location, 80),
    searchQueries: queries,
    contentStyle: (["professional", "friendly", "balanced", "casual"] as const).find((x) => x === style) ?? "balanced",
    // the language the user asked for wins over whatever the model wrote (G-7): a model value is never trusted
    language: toOutputLanguage(language),
  };
  const gapText = GAP_TEXT[campaign.language];
  if (campaign.searchQueries.length === 0 && !content.gaps.some((g) => SEEN_CUSTOMER_TYPE.test(g))) content.gaps.push(gapText.noCustomerType);
  // the form needs a place to search; when the sources do not say, the user has to fill it in
  if (!campaign.location && !content.gaps.some((g) => SEEN_LOCATION.test(g))) content.gaps.push(gapText.noLocation);
  let summary = str(r.summary, SUMMARY_MAX);
  if (!summary) summary = clip([content.overview.oneLiner, content.overview.whatItDoes].filter(Boolean).join(" "), SUMMARY_MAX);
  if (!summary) throw new Error("the model did not return a usable brief");
  return { summary, content, campaign };
}

/** Drops a gap that repeats an earlier one in other words (more than 60% of its significant words already seen). */
export function dedupeGaps(gaps: string[]): string[] {
  const words = (g: string) => new Set(g.toLowerCase().replace(/^\[need:\s*|\]$/g, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4));
  const kept: { gap: string; w: Set<string> }[] = [];
  for (const g of gaps) {
    const w = words(g);
    const dup = kept.some((k) => {
      const common = [...w].filter((x) => k.w.has(x)).length;
      return w.size > 0 && common / w.size > 0.6;
    });
    if (!dup) kept.push({ gap: g, w });
  }
  return kept.map((k) => k.gap);
}

const isGroup = (part: string) => part.length === 3;
/** A leading group of one to three digits (no leading zero) followed by groups of exactly three digits: "2.000.000", "1,234". */
const isGroupedInteger = (parts: string[]) => parts[0].length >= 1 && parts[0].length <= 3 && !parts[0].startsWith("0") && parts.slice(1).every(isGroup);

/**
 * One form for a number written with dots or commas (G-8, FR-23): the digits only, so "2.000.000", "2,000,000" and "2000000" are
 * the same number. A separator followed by exactly three digits is a grouping and is dropped; a decimal part of one or two digits
 * (or more than three) stays a decimal, so "2,5" is 2.5 and never "25", and "4,5" equals "4.5". Anything that reads both ways
 * ("1.5.2", "1,2,3") falls back to digits only. A separator ending a sentence ("2.000.000.") is ignored.
 */
export function normalizeNumber(token: string): string {
  const t = String(token).replace(/[.,]+$/, "");
  const parts = t.split(/[.,]/);
  if (parts.length === 1) return t;
  if (isGroupedInteger(parts)) return parts.join("");
  const integer = parts.slice(0, -1);
  if (integer.length === 1 || isGroupedInteger(integer)) {
    const fraction = parts[parts.length - 1].replace(/0+$/, "");
    return fraction ? `${integer.join("")}.${fraction}` : integer.join("");
  }
  return parts.join("");
}

const numbersIn = (s: string) => (s.match(/\d[\d.,]*/g) ?? []).map(normalizeNumber).filter((n) => n.length >= 1);

/**
 * Anything presented as evidence must be traceable to the sources: numbers must occur in them, and customer names
 * and testimonials must (mostly) occur too. Items that are not are removed and reported as gaps, so a model that
 * invents "trusted by 500 businesses" cannot put it into a brief. Numbers match by `normalizeNumber`, so the grouping
 * separator (Vietnamese dots, English commas) does not matter. The notes follow the brief's language.
 */
export function groundBrief(brief: ParsedBrief, sourceText: string): ParsedBrief {
  const gapText = GAP_TEXT[toOutputLanguage(brief.campaign?.language)];
  const sources = nfc(sourceText);
  const corpus = sources.toLowerCase();
  const corpusNumbers = new Set(numbersIn(sources));
  const numbersOk = (item: string) => numbersIn(nfc(item)).every((n) => corpusNumbers.has(n));
  const wordsOk = (item: string) => {
    const lower = nfc(item).toLowerCase();
    if (corpus.includes(lower)) return true;
    const words = lower.split(/\s+/).filter((w) => w.length >= 4);
    return words.length > 0 && words.filter((w) => corpus.includes(w)).length / words.length >= 0.6;
  };
  const dropped: string[] = [];
  const keep = (items: string[], label: string, ok: (s: string) => boolean) =>
    items.filter((i) => {
      if (ok(i)) return true;
      dropped.push(gapText.notInSources(label, i.slice(0, 80)));
      return false;
    });
  const c = brief.content;
  const proof = {
    metrics: keep(c.proof.metrics, gapText.labels.number, (i) => numbersIn(nfc(i)).length > 0 && numbersOk(i)),
    customers: keep(c.proof.customers, gapText.labels.customer, wordsOk),
    testimonials: keep(c.proof.testimonials, gapText.labels.testimonial, wordsOk),
  };
  let pricing = c.offer.pricing;
  if (pricing && !(numbersIn(nfc(pricing)).length === 0 || numbersOk(pricing))) {
    dropped.push(gapText.price);
    pricing = "";
  }
  // numbers in the summary follow the same rule
  const summaryNumbersOk = numbersOk(brief.summary);
  const summary = summaryNumbersOk
    ? brief.summary
    : clip(brief.summary.replace(/\b\d[\d.,]*\s?(%|persen|x|kali|tahun|bulan|klien|pelanggan|phần trăm|lần|năm|tháng|khách hàng|khách|đối tác|doanh nghiệp|cửa hàng)?(?=\s|$|[.,])/giu, "").replace(/\s{2,}/g, " "), SUMMARY_MAX);
  if (!summaryNumbersOk) dropped.push(gapText.summaryNumbers);
  return {
    summary,
    campaign: brief.campaign,
    content: { ...c, proof, offer: { ...c.offer, pricing }, gaps: [...new Set([...c.gaps, ...dropped])].slice(0, 16) }, // c.gaps were already de-duplicated; the dropped-evidence notes share boilerplate on purpose
  };
}
