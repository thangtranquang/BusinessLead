import type { Lang } from "./i18n/lang";
import type { MessageKey } from "./i18n/messages";

/** The markets the campaign form offers. Mirrors the API's `Market`; the contract is enforced by the API DTO. */
export type UiMarket = "ID" | "VN";
export const UI_MARKETS: readonly UiMarket[] = ["ID", "VN"];

/** The market a new campaign form starts on: from the UI language only, never from earlier campaigns. */
export function defaultMarketForUi(lang: Lang): UiMarket {
  return lang === "vi" ? "VN" : "ID";
}

/** Dictionary key of the location placeholder for a market. */
export function locationPlaceholderKey(market: UiMarket): MessageKey {
  return market === "VN" ? "camp.form.locationPhVN" : "camp.form.locationPh";
}

/** City shown in the search-query preview while the location is empty. */
export function exampleCity(market: UiMarket): string {
  return market === "VN" ? "TP.HCM" : "Jakarta";
}

/** The phrase that makes a campaign search the whole country. */
export function nationwideKeyword(market: UiMarket): string {
  return market === "VN" ? "Toàn quốc" : "Seluruh Indonesia";
}

/** Market names are proper nouns, written the same in every UI language. */
export function marketName(market: UiMarket): string {
  return market === "VN" ? "Việt Nam" : "Indonesia";
}
