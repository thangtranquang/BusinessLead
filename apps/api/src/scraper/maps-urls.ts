import { MARKET, mapsHl, normalizeMarket, type Market } from "../common/market";

/**
 * The Google Maps addresses and the browser identity for a market. Pure, so they can be tested without a browser.
 * The only caller-supplied text (an area, a search phrase) goes through encodeURIComponent into the path; the region name
 * and the interface language come from the closed market profile, never from the caller.
 */
const ROOT = "https://www.google.com/maps/search/";

/** Where an area is: the search that makes Maps show the place, with the country named so the right one is found. */
export function buildAreaUrl(area: string, market: Market = "ID"): string {
  const m = normalizeMarket(market);
  return `${ROOT}${encodeURIComponent(`${area}, ${MARKET[m].regionSuffix}`)}?hl=${mapsHl(m)}`;
}

/** A search anchored on coordinates. `query` already carries the area ("kopi Bandung"); it is encoded once, as one path segment. */
export function buildSearchUrl(query: string, lat: number, lng: number, market: Market = "ID"): string {
  const m = normalizeMarket(market);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("coordinates must be finite numbers");
  return `${ROOT}${encodeURIComponent(query)}/@${lat},${lng},13z?hl=${mapsHl(m)}`;
}

/** Locale and time zone of the browser context, so listings come back in the market's language whatever the server's locale is. */
export function contextOptions(market: Market = "ID"): { locale: string; timezoneId: string } {
  const p = MARKET[normalizeMarket(market)];
  return { locale: p.mapsLocale, timezoneId: p.timezone };
}
