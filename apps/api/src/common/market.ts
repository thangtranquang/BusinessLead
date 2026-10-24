import { applyDecorators } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import { IsIn, ValidateIf } from "class-validator";

/**
 * The one definition of "the country a campaign sells in". Everything that differs between countries (phone calling code,
 * Google Maps locale, time zone, cities, region name) is read from the profile of the campaign's market, never from a
 * string literal elsewhere. This file imports nothing from scraper, leads or messaging, so any of them may import it.
 */
export const MARKETS = Object.freeze(["ID", "VN"] as const);
export type Market = (typeof MARKETS)[number];

export const DEFAULT_MARKET: Market = "ID";

/**
 * Turns whatever is stored or received into a supported market. Strict: only the exact string "VN" gives Vietnam;
 * everything else (null, "vn", padded text, objects, injection text) gives Indonesia. No trim, no upper-casing, no String().
 */
export function normalizeMarket(value: unknown): Market {
  return value === "VN" ? "VN" : "ID";
}

/** For a write: the two exact values pass, everything else throws. The message never echoes the value. */
export function toMarket(value: unknown): Market {
  if (value === "ID" || value === "VN") return value;
  throw new Error(`market must be one of: ${MARKETS.join(", ")}`);
}

/**
 * DTO decorator for every request field named `market`: optional, but an explicit null, "", wrong case or any other value
 * is a 400 (a plain @IsOptional() would skip the check for null). The message names the allowed values, never the input.
 */
export function IsMarket(): PropertyDecorator {
  return applyDecorators(
    ValidateIf((_object: unknown, value: unknown) => value !== undefined),
    IsIn(MARKETS, { message: ({ property }) => `${property} must be one of: ${MARKETS.join(", ")}` }),
    ApiProperty({ enum: [...MARKETS], required: false, default: DEFAULT_MARKET }),
  );
}

export interface MarketProfile {
  /** International calling code without "+". */
  callingCode: string;
  /** A national number written without its leading zero that still starts a mobile number (Indonesia: 8...). Null when no such rule applies. */
  bareMobileLead: RegExp | null;
  /** Locale and time zone of the browser that searches Google Maps. */
  mapsLocale: string;
  timezone: string;
  /** Where the leads map opens when no lead has coordinates. */
  mapCenter: Readonly<{ lat: number; lng: number }>;
  /** ISO 3166-1 alpha-2 code, lower case, as the geocoder reports it. */
  nominatimCountry: string;
  /** Appended to an area so Google Maps searches the right country. */
  regionSuffix: string;
  /** Cities for a nationwide campaign, biggest markets first. */
  cities: readonly string[];
  /** Lower-case phrases that mean "the whole country". */
  nationwideTerms: readonly string[];
}

const ID_CITIES = Object.freeze([
  "Jakarta", "Surabaya", "Bandung", "Medan", "Semarang", "Makassar", "Palembang", "Tangerang", "Depok", "Bekasi",
  "Bogor", "Yogyakarta", "Malang", "Denpasar", "Batam", "Pekanbaru", "Bandar Lampung", "Padang", "Balikpapan", "Samarinda",
  "Banjarmasin", "Pontianak", "Surakarta", "Manado", "Cirebon", "Jambi", "Sidoarjo", "Serang", "Mataram", "Kediri",
  "Jember", "Purwokerto", "Tasikmalaya", "Sukabumi", "Cilegon", "Karawang", "Magelang", "Pekalongan", "Tegal", "Kudus",
  "Banyuwangi", "Madiun", "Probolinggo", "Pasuruan", "Mojokerto", "Blitar", "Salatiga", "Gresik", "Lampung", "Palu",
  "Kendari", "Ambon", "Jayapura", "Kupang", "Bengkulu", "Pangkalpinang", "Tanjungpinang", "Banda Aceh", "Lhokseumawe", "Pematangsiantar",
  "Binjai", "Padang Panjang", "Bukittinggi", "Dumai", "Palangkaraya", "Tarakan", "Singaraja", "Gianyar", "Klaten", "Sleman",
]);

/** Roughly by market size. Real cities and provinces; the order decides which ones a smaller campaign uses. */
const VN_CITIES = Object.freeze([
  "Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Hải Phòng", "Cần Thơ", "Biên Hòa", "Thủ Dầu Một", "Vũng Tàu", "Nha Trang", "Huế",
  "Buôn Ma Thuột", "Đà Lạt", "Thái Nguyên", "Nam Định", "Vinh", "Hải Dương", "Thanh Hóa", "Quy Nhơn", "Rạch Giá", "Long Xuyên",
  "Mỹ Tho", "Thái Bình", "Bắc Ninh", "Hạ Long", "Pleiku", "Phan Thiết", "Cà Mau", "Bắc Giang", "Việt Trì", "Tuy Hòa",
].map((c) => c.normalize("NFC")));

export const MARKET = Object.freeze({
  ID: Object.freeze({
    callingCode: "62",
    bareMobileLead: /^8/,
    mapsLocale: "id-ID",
    timezone: "Asia/Jakarta",
    mapCenter: Object.freeze({ lat: -6.2088, lng: 106.8456 }),
    nominatimCountry: "id",
    regionSuffix: "Indonesia",
    cities: ID_CITIES,
    nationwideTerms: Object.freeze(["seluruh indonesia", "semua indonesia", "indonesia", "nasional", "nationwide"]),
  }),
  VN: Object.freeze({
    callingCode: "84",
    bareMobileLead: null,
    mapsLocale: "vi-VN",
    timezone: "Asia/Ho_Chi_Minh",
    mapCenter: Object.freeze({ lat: 10.7769, lng: 106.7009 }),
    nominatimCountry: "vn",
    regionSuffix: "Việt Nam",
    cities: VN_CITIES,
    nationwideTerms: Object.freeze(["toàn quốc", "việt nam", "cả nước", "viet nam", "toan quoc", "ca nuoc"].map((t) => t.normalize("NFC"))),
  }),
} satisfies Record<Market, MarketProfile>);

/** The `hl` (interface language) parameter of a Google Maps URL for the market. */
export function mapsHl(market: Market): string {
  return market === "VN" ? "vi" : "id";
}

/** The time zone a new outbox account starts with: from the latest campaign's market, Jakarta when unknown. */
export function initialTimezone(latestMarket: unknown): string {
  return MARKET[normalizeMarket(latestMarket)].timezone;
}

/** Longest phone text the Vietnamese rules read. Longer input is rejected before any pattern runs. */
export const VN_PHONE_MAX_CHARS = 64;

export type PhoneKind = "mobile" | "landline" | "service" | "unknown";

interface VnParsed { e164: string | null; service: boolean }

/** One pass over a Vietnamese phone text. Every pattern is anchored or a single run of one class, so it is linear. */
function vnParse(raw: unknown): VnParsed {
  const none: VnParsed = { e164: null, service: false };
  if (typeof raw !== "string" || raw.length > VN_PHONE_MAX_CHARS) return none;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D+/g, "");
  if (!digits) return none;
  const international = trimmed.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00") && !trimmed.startsWith("+")) digits = digits.slice(2);
  if (international) {
    // "+84 (0) 90 ..." and "+84 090 ...": the trunk zero is dropped after the country code
    if (digits.startsWith("84") && digits[2] === "0") digits = "84" + digits.slice(3);
  } else if (digits.startsWith("0")) {
    digits = "84" + digits.slice(1);
  } else if (digits.startsWith("84") && digits.length >= 10) {
    if (digits[2] === "0") digits = "84" + digits.slice(3);
  } else if (/^[35789]\d{8}$/.test(digits)) {
    digits = "84" + digits;
  } else if (digits.startsWith("1")) {
    // a national number starting with 1 (1800, 1900) is a service number, not a WhatsApp number
    return { e164: null, service: /^1[89]00/.test(digits) };
  }
  if (digits.startsWith("84") && digits[2] === "1") return { e164: null, service: /^1[89]00/.test(digits.slice(2)) };
  return digits.length >= 8 && digits.length <= 15 ? { e164: digits, service: false } : none;
}

/**
 * Digits of a Vietnamese phone text with the country code (84...), or null when it is not a usable number: longer than 64
 * characters, a service number (1800/1900), or outside 8 to 15 digits. International numbers written with "+" or "00" keep
 * their own code. Pure and linear; shared by messaging/phone.ts.
 */
export function vnDigits(raw: string): string | null {
  return vnParse(raw).e164;
}

/**
 * What kind of line an E.164 number (digits with country code) is. Indonesia has no rule, so always "unknown". For Vietnam:
 * 84 + 9 digits starting 3/5/7/8/9 is mobile, 84 + 2 + 8 or 9 digits is landline, 84 + 1800/1900 is service; anything else
 * (other countries, odd lengths, other prefixes) is "unknown".
 */
export function phoneKind(e164: string, market: Market): PhoneKind {
  if (market !== "VN" || typeof e164 !== "string" || e164.length > 15 || !e164.startsWith("84")) return "unknown";
  const n = e164.slice(2);
  if (/^[35789]\d{8}$/.test(n)) return "mobile";
  if (/^2\d{8,9}$/.test(n)) return "landline";
  if (/^1[89]00/.test(n)) return "service";
  return "unknown";
}

/**
 * Classifies a phone as typed. "invalid" when it cannot be a number at all (empty, too long, too short). Under Vietnam a
 * 1800/1900 number is "service" even though no stored number may carry that kind (it normalises to null).
 */
export function classifyRawPhone(raw: string, market: Market): PhoneKind | "invalid" {
  if (market !== "VN") {
    // Indonesia has no kinds: a text with 8 to 15 digits is "unknown", anything else "invalid" (the exact rules live in messaging/phone.ts)
    const count = typeof raw === "string" ? raw.replace(/\D+/g, "").length : 0;
    return count >= 8 && count <= 15 ? "unknown" : "invalid";
  }
  const parsed = vnParse(raw);
  if (parsed.e164) return phoneKind(parsed.e164, "VN");
  return parsed.service ? "service" : "invalid";
}
