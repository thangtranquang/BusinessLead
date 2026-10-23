/**
 * Rules a first message must pass before it is shown. The prompt asks for these too, but a model ignores a prompt now and then;
 * a check in code does not. A draft that fails is written again with the reasons.
 *
 * The rules are a table per output language (`OUTREACH_RULES`, FR-26, FR-49). English drafts are judged by the language-neutral
 * rules only (length, a client named from the brief); no Indonesian or Vietnamese rule is applied to them. Every Vietnamese
 * pattern is built from literal words (or a bounded constant source) with the shared Unicode word boundaries of
 * `common/text.ts`, never an ASCII `\b`, so it behaves the same on NFC and NFD text.
 *
 * Reasons are fixed English sentences (the instruction language of the retry prompt): rule based, never quoting the draft,
 * so text from a customer or a scraped listing cannot reach the retry prompt through them.
 */
import { toOutputLanguage, type OutputLanguage } from "../common/language";
import { WORD_AFTER, WORD_BEFORE, escapeRegExp, lacksVietnameseDiacritics, nfc, wordRegex, wordRegexFromSource } from "../common/text";

/**
 * Phrases that contain a slang or pronoun word but are fine (G-16): the brand "VS Code", and the compounds "ông chủ"
 * (the boss), "bà chủ", "ông bà" (grandparents) whose first word would otherwise read as "you". Removed before the checks.
 * (A number plus k, as in "5k", needs no entry: a digit is a word character, so a standalone "k" does not match inside it.)
 */
export const SLANG_ALLOW_LIST: readonly string[] = Object.freeze(["VS Code", "ông chủ", "bà chủ", "ông bà"]);

type PatternKey = "url" | "allowList" | "questionWord" | "questionWordExact" | "slang" | "rude" | "rudeExact" | "bareTitle" | "jargon" | "intro" | "productPitch";

export interface OutreachRules {
  readonly minLength: number;
  /** A Vietnamese draft without diacritics is a defect (FR-22.1). */
  readonly requireDiacritics: boolean;
  readonly patterns: Readonly<Partial<Record<PatternKey, RegExp>>>;
}

const INTRO_SOURCE = [
  "xin\\s{1,3}giới\\s{1,3}thiệu",
  "(?:em|tôi|mình|con)\\s{1,3}là\\s{1,3}[^\\n.!?]{1,60}?\\s{1,3}(?:đến\\s{1,3}từ|của|ở|tại)",
  "(?:em|tôi|mình)\\s{1,3}đến\\s{1,3}từ",
  "(?:chúng\\s{1,3}tôi|chúng\\s{1,3}em|bên\\s{1,3}em|bên\\s{1,3}mình)\\s{1,3}(?:là|đến\\s{1,3}từ)",
].join("|");

const VIETNAMESE: OutreachRules = Object.freeze({
  minLength: 60,
  requireDiacritics: true,
  patterns: Object.freeze({
    url: /(?:https?:\/\/|www\.)\S{1,300}/giu,
    allowList: wordRegex(SLANG_ALLOW_LIST, "giu"),
    // a question needs a question word or a final particle; "ai" and "à" are case sensitive so the technology "AI" is not "who"
    questionWord: wordRegex(["có", "không", "chưa", "liệu", "gì", "nào", "đâu", "sao", "nhỉ", "hả", "bao giờ", "khi nào", "bao nhiêu", "như thế nào", "thế nào", "tại sao", "vì sao", "làm sao", "xin hỏi"], "iu"),
    questionWordExact: wordRegex(["ai", "Ai", "à", "À"], "u"),
    slang: wordRegex(["ko", "k", "kh", "khg", "hok", "hông", "dc", "đc", "dk", "vs", "mn", "mng", "mik", "mk", "j", "ntn", "bn", "sdt", "ae"], "iu"),
    rude: wordRegex(["mày", "tao", "tụi mày", "bọn mày", "tụi tao", "bọn tao"], "iu"),
    // "mi" and "tau" are also names and syllables: only the lower-case word is the rude pronoun
    rudeExact: wordRegex(["mi", "tau"], "u"),
    // a bare "ông" / "bà" is "you"; before a capitalised name ("ông Tư") it is a respectful title
    bareTitle: wordRegexFromSource("(?:[ôÔ]ng|[bB]à)(?!\\s{1,3}\\p{Lu})", "u"),
    jargon: wordRegex(["RAG", "pipeline", "tech stack", "stack", "engineering", "production", "backend", "frontend", "LLM", "API", "machine learning", "microservice"], "iu"),
    intro: wordRegexFromSource(INTRO_SOURCE, "iu"),
    productPitch: wordRegex(
      ["demo", "bản demo", "dùng thử", "dùng thử miễn phí", "trải nghiệm miễn phí", "ứng dụng của chúng tôi", "ứng dụng của bên em", "nền tảng của chúng tôi", "nền tảng của bên em", "hệ thống của chúng tôi", "giao diện mẫu", "mẫu giao diện"],
      "iu",
    ),
  }),
});

const ENGLISH: OutreachRules = Object.freeze({ minLength: 60, requireDiacritics: false, patterns: Object.freeze({}) });

export const OUTREACH_RULES: Readonly<Record<OutputLanguage, OutreachRules>> = Object.freeze({ vietnamese: VIETNAMESE, english: ENGLISH });

const REASON = Object.freeze({
  short: "too short: write a complete message of at least 60 characters",
  question: "a sentence ends with a question mark but has no question word or final question particle",
  slang: "slang or text-speak abbreviations: write the full words",
  pronoun: "an impolite or guessed pronoun for \"you\": address the person politely",
  jargon: "technical jargon the business owner does not understand",
  introduction: "no introduction of the sender: say who is writing and which company they are from",
  productPitch: "product pitch (a demo, a free trial or a finished app) although this is a custom service",
  diacritics: "Vietnamese written without diacritics: write it with all its tone marks",
  caseStudy: "names a client or case study that is not related to the recipient",
});

const MAX_CASE_STUDIES = 12;
const MAX_CASE_STUDY_LENGTH = 120;

/**
 * `caseStudies`: names of clients and case studies in the owner's own brief. A first message to a stranger must not name them, unless the
 * stranger is that business (the name is in their own name or category).
 */
export function outreachProblems(text: string, o: { language: OutputLanguage; service: boolean; category?: string | null; caseStudies?: string[] }): string[] {
  const rules = OUTREACH_RULES[toOutputLanguage(o.language)];
  const p = rules.patterns;
  const problems: string[] = [];
  const t = nfc(text).trim();
  if (t.length < rules.minLength) problems.push(REASON.short);
  if (rules.requireDiacritics && lacksVietnameseDiacritics(t)) problems.push(REASON.diacritics);

  if (p.questionWord) {
    // every sentence that ends in "?" needs a question word: "Quan tâm dịch vụ này?" reads like a statement with a mark
    const sentences = t.split(/(?<=[.!?])\s+|\n+/);
    const bad = sentences.find((s) => s.trim().endsWith("?") && !p.questionWord!.test(s) && !(p.questionWordExact?.test(s) ?? false));
    if (bad) problems.push(REASON.question);
  }

  // slang and pronouns are read on the text without links and allow-listed phrases ("5k", "VS Code", "ông chủ", an address with /dc/)
  let plain = t;
  if (p.url) plain = plain.replace(p.url, " ");
  if (p.allowList) plain = plain.replace(p.allowList, " ");
  if (p.slang?.test(plain)) problems.push(REASON.slang);
  if (p.rude?.test(plain) || p.rudeExact?.test(plain) || p.bareTitle?.test(plain)) problems.push(REASON.pronoun);

  if (o.service) {
    if (p.jargon?.test(t)) problems.push(REASON.jargon);
    if (p.intro && !p.intro.test(t)) problems.push(REASON.introduction);
    if (p.productPitch?.test(t)) problems.push(REASON.productPitch);
  }

  const category = nfc(o.category ?? "");
  for (const raw of (o.caseStudies ?? []).filter((n): n is string => typeof n === "string").slice(0, MAX_CASE_STUDIES)) {
    const name = nfc(raw).trim().slice(0, MAX_CASE_STUDY_LENGTH);
    if (name.length < 3) continue;
    const re = new RegExp(`${WORD_BEFORE.source}${escapeRegExp(name)}${WORD_AFTER.source}`, "iu");
    if (re.test(t) && !re.test(category)) problems.push(`${REASON.caseStudy}: "${name}"`);
  }
  return problems;
}
