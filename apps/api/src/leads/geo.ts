import { normalizeProvinceVN } from "./vn-provinces";

/** Where a business is: province, kabupaten/kota and kecamatan, read from an OpenStreetMap (Nominatim) reverse-geocode answer. */
export interface Region {
  province: string | null;
  regency: string | null;
  district: string | null;
}

export interface NominatimAddress {
  state?: string;
  province?: string;
  city?: string;
  county?: string;
  municipality?: string;
  town?: string;
  regency?: string;
  district?: string;
  city_district?: string;
  suburb?: string;
  quarter?: string;
  village?: string;
  country_code?: string;
}

const clean = (v: string | undefined) => v?.replace(/\s+/g, " ").trim().slice(0, 80) || null;

/** OSM names Jakarta's province in several ways; the list should show one. */
export function normalizeProvince(name: string | null): string | null {
  if (!name) return null;
  if (/jakarta/i.test(name)) return "DKI Jakarta";
  if (/yogyakarta/i.test(name)) return "DI Yogyakarta";
  return name.replace(/^provinsi\s+/i, "");
}

/**
 * Vietnam (country_code "vn"). Checked against the live Nominatim for Ho Chi Minh City: the answer has NO `state` key;
 * the province-level unit comes as `city` ("Thành phố Hồ Chí Minh") and the ward as `suburb`. So the province is
 * `state`, else `province`, else `city`. Other regions of Vietnam are not yet checked against the live service.
 */
export function regionFromNominatimVN(a: NominatimAddress | undefined): Region | null {
  if (!a || typeof a !== "object") return null;
  const str = (v: unknown) => (typeof v === "string" ? clean(v) : null);
  const province = normalizeProvinceVN(str(a.state) ?? str(a.province) ?? str(a.city));
  const regency = str(a.city_district) ?? str(a.county);
  const district = str(a.suburb) ?? str(a.quarter) ?? str(a.village);
  if (!province && !regency && !district) return null;
  return { province: province ? province.slice(0, 80) : null, regency, district };
}

/** The geocoder entry point: dispatches on country_code ("vn" -> Vietnam; "id" or missing -> regionFromNominatim; other -> null). */
export function regionFromAddress(a: NominatimAddress | undefined): Region | null {
  if (a && a.country_code === "vn") return regionFromNominatimVN(a);
  return regionFromNominatim(a);
}

/** Indonesia's path, unchanged; the S1 snapshot pins that it rejects any other country (vn included). */
export function regionFromNominatim(a: NominatimAddress | undefined): Region | null {
  if (!a || (a.country_code && a.country_code.toLowerCase() !== "id")) return null;
  const isJakarta = [a.state, a.province, a.city].some((v) => v && /jakarta/i.test(v));
  const province = normalizeProvince(clean(a.state ?? a.province) ?? (isJakarta ? "DKI Jakarta" : null));
  // Jakarta has no kabupaten: its kota administrasi (Jakarta Timur...) comes as city_district and the kecamatan as suburb
  if (province === "DKI Jakarta") {
    const regency = clean(a.city_district ?? a.county ?? a.district);
    return { province, regency, district: clean(a.suburb ?? a.district) === regency ? null : clean(a.suburb ?? a.district) };
  }
  const regency = clean(a.city ?? a.county ?? a.regency ?? a.municipality ?? a.town);
  const district = clean(a.district ?? a.city_district);
  if (!province && !regency && !district) return null;
  return { province, regency, district };
}

/** About 550 m: leads this close share one lookup, so a few hundred leads need far fewer than a few hundred requests. */
export function cellKey(lat: number, lng: number): string {
  return `${(Math.round(lat / 0.005) * 0.005).toFixed(3)},${(Math.round(lng / 0.005) * 0.005).toFixed(3)}`;
}
