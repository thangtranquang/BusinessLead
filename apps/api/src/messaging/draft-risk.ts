/**
 * Second line of defence after the prompt: look at what the model actually wrote.
 * A draft that introduces links, contact details, prices, discounts or bank details that the knowledge base does not contain
 * is not blocked (a person still reviews it) but it is flagged so the reviewer looks twice.
 */
import { toOutputLanguage, type OutputLanguage } from "../common/language";
import { nfc, wordRegexFromSource } from "../common/text";
import { hasGuessedHonorific } from "./plain-text";
import { viMatcher } from "./vi-match";

/**
 * One way a draft can be risky. `find` returns the text that made it risky, or null. A risk with `known` is excused when the
 * knowledge base contains that very text (the model may repeat a price the owner wrote down); one without it never is.
 * The `id` is what the reviewer's screen maps to a label, so the ids are the same in every language.
 */
export interface RiskRule {
  readonly id: string;
  readonly known: boolean;
  find(text: string): string | null;
}

const regexRule = (id: string, re: RegExp): RiskRule => ({ id, known: true, find: (t) => re.exec(t)?.[0] ?? null });
const matcherRule = (id: string, sources: { marked: readonly string[]; plain?: readonly string[] }): RiskRule => {
  const m = viMatcher(sources);
  return { id, known: true, find: (t) => m.match(t) };
};

// language-neutral: a link, an email address and a percentage mean the same thing in every language
const LINK = regexRule("link", /https?:\/\/|www\./i);
// bounded parts: a long run of word characters without an "@" costs linear time, not quadratic
const EMAIL = regexRule("email", /[\w.+-]{1,64}@[\w-]{1,63}\.[\w.]{1,63}/);
const PERCENTAGE = regexRule("percentage", /\b\d{1,3}\s?%/);

/** Impolite pronouns ("mày", "tao"): never used to someone we write to for the first time. Matched as whole words, as written. */
const IMPOLITE = wordRegexFromSource("mày|mầy|tao|tụi bây|bọn mày|thằng");
const HONORIFIC_VI: RiskRule = { id: "honorific", known: false, find: (t) => IMPOLITE.exec(t)?.[0] ?? (hasGuessedHonorific(t) ? "anh/chị" : null) };

const AMOUNT_UNITS = "đ|₫|vnd|vnđ|triệu|nghìn|ngàn|k|tr|đồng";

/** Risk rules per output language (FR-25.2, FR-49). Index with a value that went through toOutputLanguage. */
export const RISK_RULES: Readonly<Record<OutputLanguage, readonly RiskRule[]>> = Object.freeze({
  vietnamese: Object.freeze([
    LINK,
    EMAIL,
    PERCENTAGE,
    matcherRule("discount", { marked: ["giảm giá|khuyến mãi|khuyến mại|ưu đãi|miễn phí|hoàn tiền|tặng kèm|chiết khấu|mã giảm|voucher|cashback|discount|promo|free"] }),
    matcherRule("bank details", { marked: ["số tài khoản|chuyển khoản|tài khoản ngân hàng|stk|vietcombank|techcombank|bidv|vietinbank|agribank|mbbank|mb bank|sacombank|vpbank|tpbank|momo|zalopay|virtual account"] }),
    matcherRule("price", {
      marked: [`\\d{1,9}(?:[.,]\\d{1,3}){0,4} ?(?:${AMOUNT_UNITS})`, "(?:vnd|vnđ|usd|đ|₫) ?\\d{1,9}(?:[.,]\\d{1,3}){0,4}"],
      plain: ["\\d{1,9}(?:[.,]\\d{1,3}){0,4} ?(?:vnd|trieu|nghin|ngan|k|tr|dong)", "(?:vnd|usd) ?\\d{1,9}(?:[.,]\\d{1,3}){0,4}"],
    }),
    // reading meaning into a rating or a review count is a claim about the recipient that the data does not support
    matcherRule("assumption", {
      marked: ["(?:cho thấy|chứng tỏ|thể hiện|phản ánh|có nghĩa là|nghĩa là|chắc chắn|chắc|hẳn là|hẳn|rõ ràng)[^.!?\\n]{0,60}(?:tin tưởng|hài lòng|tốt|tuyệt vời|đông khách|đông|đắt khách|nổi tiếng|phổ biến|cao|chất lượng|chuyên nghiệp|ưa chuộng|yêu thích)"],
    }),
    HONORIFIC_VI,
  ]),
  english: Object.freeze([
    LINK,
    EMAIL,
    PERCENTAGE,
    regexRule("discount", /\b(discount|free of charge|refund|cashback|promo)\b/i),
    regexRule("bank details", /\b(bank account|account number|bank transfer|wire transfer|iban|swift code|routing number|virtual account)\b/i),
    regexRule("price", /(?:\b(?:usd|eur|gbp)\s?|[$£€]\s?)\d/i),
    regexRule("assumption", /\b(shows?|proves?|reflects?|means|suggests|indicates)\b[^.!?\n]{0,60}\b(trust|satisf\w{1,12}|good|great|busy|popular|high|quality|professional)/i),
  ]),
});

export function draftRisks(draft: string, knowledge: string[], language: OutputLanguage): string[] {
  const text = nfc(draft);
  const known = nfc(knowledge.join("\n")).toLowerCase();
  const found: string[] = [];
  for (const rule of RISK_RULES[toOutputLanguage(language)]) {
    const hit = rule.find(text);
    if (hit && (!rule.known || !known.includes(hit.toLowerCase()))) found.push(rule.id);
  }
  return [...new Set(found)];
}
