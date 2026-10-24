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
