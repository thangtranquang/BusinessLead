/**
 * Is the owner selling a finished product (an app that exists, can be demoed, has a trial) or a custom service
 * (an agency that builds software to order: nothing exists yet to show)? The two need different first messages:
 * a product pitch says "here is a system"; an agency intro says "we can build what you need, let's talk".
 *
 * Cues exist in English and Indonesian (as before) and in Vietnamese (FR-40). The Vietnamese cues are literal phrases
 * matched between Unicode word boundaries (common/text.ts), so they work on NFC and NFD text and never match inside a longer word.
 */
import { capThenNfc, wordRegex } from "../../common/text";

export type OfferKind = "product" | "service";

const SERVICE = /\b(custom|kustom|outsourc\w*|agency|agensi|software\s+house|jasa|pembuatan|pengembangan|konsultan|consult\w*|we\s+build|kami\s+(membangun|mengembangkan|menerima|menyediakan\s+(jasa|tim)))\b/gi;
const PRODUCT = /\b(langganan|subscription|saas|free\s+trial|masa\s+coba|uji\s+coba|coba\s+gratis|paket\s+(harian|bulanan|tahunan)|kasir|dashboard\s+siap|siap\s+pakai|ready[\s-]?to[\s-]?use)\b/gi;

const SERVICE_VI = wordRegex(["dịch vụ", "theo yêu cầu", "thiết kế", "phát triển", "gia công", "tư vấn"], "giu");
const PRODUCT_VI = wordRegex(["gói tháng", "gói năm", "gói tuần", "dùng thử", "dùng thử miễn phí", "phần mềm có sẵn", "đăng ký tháng", "thuê bao"], "giu");

const MAX_CHARS = 4000;

const count = (re: RegExp, text: string) => (text.match(re) ?? []).length;

/** Service wins unless the text clearly describes a ready product: an agency's brief often says "sistem" and "aplikasi" too. */
export function detectOfferKind(...texts: (string | null | undefined)[]): OfferKind {
  const text = capThenNfc(texts.filter(Boolean).join("\n"), MAX_CHARS);
  const service = count(SERVICE, text) + count(SERVICE_VI, text);
  const product = count(PRODUCT, text) + count(PRODUCT_VI, text);
  return service > product ? "service" : "product";
}
