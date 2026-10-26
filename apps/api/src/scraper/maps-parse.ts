/** Pure helpers for reading Google Maps result cards, kept apart from the browser code so they can be tested. */
import { normalizeMarket, type Market } from "../common/market";
import { fold, nfc, wordRegex, wordRegexFromSource } from "../common/text";

/** Longest text a Vietnamese-market matcher reads. A card line is never longer; this keeps every pass bounded. */
const VN_CAP = 300;
const clip = (s: string, n = VN_CAP) => (s.length > n ? s.slice(0, n) : s);

/**
 * Maps shows "4,6" in Indonesian and Vietnamese and "4.6" in English; scoring needs a plain number.
 * For VN the text may also read "4,6 sao" or "(4,6)"; the Indonesian rules are unchanged.
 */
export function normalizeRating(raw: string | null | undefined, market: Market = "ID"): string {
  if (!raw) return "";
  let t = raw;
  if (normalizeMarket(market) === "VN") t = clip(t, 40).trim().replace(/^\(/, "").replace(/\)$/, "");
  const m = t.trim().replace(",", ".").match(/^\d(?:\.\d)?/);
  return m ? m[0] : "";
}

/**
 * The phone number as a lead stores it. Indonesia: digits, 62 written as 0 (exactly what the page used to do inside the
 * browser). Vietnam: digits only, the raw number (no country rewrite; keys and sending decide that later).
 */
export function toLeadPhone(raw: string | null | undefined, market: Market = "ID"): string {
  const text = typeof raw === "string" ? raw : "";
  if (normalizeMarket(market) === "VN") return text.slice(0, 64).replace(/\D/g, "");
  return text.replace(/\D/g, "").replace(/^62/, "0").replace(/^0+/, "0");
}

const VN_COUNT_IN_BRACKETS = /^\((\d{1,3}(?:[.,]\d{3})+|\d{1,9})\)$/;
const VN_COUNT_WORDS = /^(\d{1,3}(?:[.,]\d{3})+|\d{1,9})\s{1,3}(?:bài\s{1,3})?đánh\s{1,3}giá$/iu;

/** Reads "(1.234)", "(1,234)", "1.234 bài đánh giá" as 1234. A bare one-digit decimal "(4,6)" is a rating, never a count (VN). */
export function parseReviewCount(raw: string | null | undefined, market: Market = "ID"): number | null {
  if (typeof raw !== "string") return null;
  if (normalizeMarket(market) !== "VN") {
    const m = raw.match(/^\(([\d.,]+)\)$/);
    return m ? parseInt(m[1].replace(/[.,]/g, ""), 10) : null;
  }
  const t = clip(raw).trim();
  if (/^\(\d[.,]\d\)$/.test(t)) return null;
  const m = t.match(VN_COUNT_IN_BRACKETS) ?? t.match(VN_COUNT_WORDS);
  return m ? parseInt(m[1].replace(/[.,]/g, ""), 10) : null;
}

/** A line that is only a rating in brackets, "(4,6)": the rating when the card gives no other (VN). */
export function parseBareRating(raw: string | null | undefined): string {
  const t = typeof raw === "string" ? clip(raw, 20).trim() : "";
  const m = t.match(/^\((\d[.,]\d)\)$/);
  return m ? normalizeRating(m[1], "VN") : "";
}

const NOT_CATEGORY = /^(\d[.,]\d|\(?\d[\d.,]*\)?$|buka|tutup|open|closed|opens|closes|sementara tutup|permanently|buka 24|24 jam|sponsor|iklan)/i;
const ADDRESS_LIKE = /^(jl\.?|jalan|gg\.?|gang|street|st\.|rd\.|road|ruko|komplek|no\.?\s*\d)/i;
// SIMULATED: Vietnamese interface wording, written from documentation, not checked against a real Vietnamese Maps page.
// Verified against a real hl=vi results page: the row before the info row can read "Chưa có bài đánh giá" (no reviews yet),
// and a 24-hour place shows "Mở cả ngày". Neither is a category.
const VN_NOT_CATEGORY = /^(mo cua|mo ca ngay|dong cua|tam thoi dong cua|dang mo cua|dang dong cua|quang cao|dia chi|dien thoai|trang web|chua co bai danh gia)(?![a-z])/;
const VN_ADDRESS_LIKE = /^(?:(?:đường|phố|phường|quận|huyện|xã|ngõ|hẻm|kcn)(?![\p{L}\p{M}])|(?:số|tổ)\s{1,3}\d)/iu;

/**
 * The category on a result card is the first segment of the line "Category · Address".
 * `rows` are the text of the card's info rows. Returns "" when nothing looks like a category.
 * Vietnamese state, hours and address words are skipped only for the VN market.
 */
export function pickCategory(rows: string[], market: Market = "ID"): string {
  const vn = normalizeMarket(market) === "VN";
  const skipVn = (s: string) => vn && (VN_NOT_CATEGORY.test(fold(clip(s, 80)).trim()) || VN_ADDRESS_LIKE.test(clip(nfc(s), 80)));
  for (const row of rows) {
    const t = row.trim();
    if (!t || NOT_CATEGORY.test(t) || skipVn(t)) continue;
    const first = t.split("·")[0].trim();
    if (!first || first.length > 60 || NOT_CATEGORY.test(first) || ADDRESS_LIKE.test(first) || /\d{3,}/.test(first) || skipVn(first)) continue;
    return first;
  }
  return "";
}

/**
 * Vietnamese cards (verified on a real hl=vi page) show "Category · Address", and the address usually has NO street word
 * ("· Điện Biên Phủ", "· 311 D5 Khu Xyz", a plus code), so words like "đường" cannot find it. The address is the second
 * segment of the info row whose first segment is the category. Hours and phone segments are never an address.
 */
export function vnAddressFromRows(rows: string[], category: string): string {
  if (!category) return "";
  const cat = fold(clip(category, 80)).trim();
  for (const row of rows) {
    const segs = clip(nfc(row ?? ""), 200).split("·").map((s) => s.trim());
    if (segs.length !== 2 || !segs[1]) continue;
    if (fold(segs[0]).trim() !== cat) continue;
    // Maps draws icons with private-use glyphs (seen as "" in a real answer): drop them, and ignore a segment that is only an icon
    const addr = segs[1].replace(/\p{Co}/gu, "").trim();
    if (!/[\p{L}\p{N}]/u.test(addr)) continue;
    if (addr.length > 120 || VN_NOT_CATEGORY.test(fold(addr).trim()) || looksLikePhone(addr, "VN")) continue;
    return addr;
  }
  return "";
}

const ID_ADDRESS = /\bJl\.|\bJalan\b|\bStreet\b|\bSt\.|\bRd\.|\bNo\.\s*\d/i;
const VN_ADDRESS_WORDS = wordRegex(["đường", "phố", "phường", "quận", "huyện", "xã", "ngõ", "hẻm", "kcn", "thị trấn"]);
const VN_ADDRESS_NUMBERED = wordRegexFromSource("(?:số|tổ)\\s{1,3}\\d");

/** Does this card line read as a street address? VN also accepts the Indonesian words ("Jl.", "No. 3"). */
export function looksLikeAddress(text: string, market: Market = "ID"): boolean {
  if (normalizeMarket(market) !== "VN") return ID_ADDRESS.test(text);
  const t = clip(nfc(text));
  return ID_ADDRESS.test(t) || VN_ADDRESS_WORDS.test(t) || VN_ADDRESS_NUMBERED.test(t);
}

/** Does this card line read as a phone number? The page hands over the raw text; digits are cleaned in Node. */
export function looksLikePhone(text: string, market: Market = "ID"): boolean {
  if (normalizeMarket(market) !== "VN") {
    return /^[+\d]/.test(text) && text.replace(/\D/g, "").length >= 7 && (text.includes("+62") || text.includes("08") || /^\d{3}[\s-]\d/.test(text));
  }
  const t = text.trim();
  if (t.length > 30 || !/^[+(\d]/.test(t) || !/^[\d\s().+-]+$/.test(t)) return false;
  const digits = t.replace(/\D/g, "").length;
  return digits >= 9 && digits <= 13;
}

/** Interface wording of the end of a results list: Indonesian, English, and (SIMULATED) Vietnamese. Market-independent on purpose. */
export function isEndOfList(pageText: string): boolean {
  return /Anda telah mencapai akhir|You've reached the end|Bạn đã xem hết danh sách/i.test(clip(pageText, 200000));
}

/** Selectors for the results list and the search box. SIMULATED for Vietnamese: wording from documentation, not a real page. */
export const FEED_FALLBACK_SELECTOR = '.m6QErb.DxyBCb, .m6QErb, [aria-label*="Results"], [aria-label*="Hasil"], [aria-label*="Kết quả"]';
export const SEARCH_BOX_SELECTOR = '#searchboxinput, input[name="q"], [aria-label="Search Google Maps"], [aria-label="Tìm kiếm trên Google Maps"]';

/** What the page hands over for one card: raw text only, nothing interpreted. */
export interface RawCard {
  name: string;
  /** aria-label of the first element whose label mentions "star" / the first mentioning "sao" (Vietnamese). */
  ariaStar: string;
  ariaSao: string;
  /** Text of the element that shows the rating number. */
  ratingText: string;
  spans: string[];
  rows: string[];
  hrefs: string[];
}

export interface ParsedCard {
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: string;
  reviewCount: number | null;
  category: string;
  hasWebsite: boolean;
  referenceLink: string;
}

/** Reads one raw card for the market. Missing fields stay empty or null; nothing is invented. */
export function parseCard(raw: RawCard, market: Market = "ID"): ParsedCard {
  const vn = normalizeMarket(market) === "VN";
  const aria = vn ? clip(raw.ariaSao ?? "") : raw.ariaStar ?? "";
  let rating = "";
  let reviewCount: number | null = null;
  const ratingMatch = vn ? aria.match(/(\d[\d.,]{0,6})\s{0,3}sao/i) : aria.match(/([\d.]+)\s*star/i);
  const reviewMatch = vn ? aria.match(/(\d[\d.,]{0,12})\s{0,3}(?:bài\s{1,3})?đánh\s{1,3}giá/iu) : aria.match(/([\d.,]+)\s*review/i);
  if (ratingMatch) rating = ratingMatch[1];
  if (reviewMatch) reviewCount = parseInt(reviewMatch[1].replace(/[.,]/g, ""), 10);
  if (!rating) rating = (raw.ratingText ?? "").trim();

  let address = "";
  let phone = "";
  for (const span of raw.spans ?? []) {
    const t = (span ?? "").trim();
    if (!t || t.length < 3) continue;
    if (!phone && looksLikePhone(t, market)) {
      phone = t;
      continue;
    }
    // ID keeps the street-word reading. VN takes the address from the info row below (a street word can match a name such
    // as "thành phố" or "KCN"); a span is only a last resort and must START with the street word.
    if (!address && !vn && looksLikeAddress(t, market)) address = t.replace(/^[·•–]\s*/, "").trim();
    if (reviewCount === null) reviewCount = parseReviewCount(t, market);
    if (vn && !rating) rating = parseBareRating(t);
  }

  const category = pickCategory(raw.rows ?? [], market);
  if (vn && !address) address = vnAddressFromRows(raw.rows ?? [], category);

  let website = "";
  let referenceLink = "";
  for (const href of raw.hrefs ?? []) {
    if (href.includes("google.com/maps/place") && !referenceLink) referenceLink = href;
    else if (!website && /https?:\/\//.test(href) && !href.includes("google.com")) website = href;
  }

  return {
    name: raw.name,
    address,
    phone: toLeadPhone(phone, market),
    website,
    rating: rating ? normalizeRating(rating, market) || "N/A" : "N/A",
    reviewCount,
    category,
    hasWebsite: !!website,
    referenceLink,
  };
}
