/** Default map centres, kept free of React and of imports from apps/api so a browser-less test can load it. */
export const JAKARTA_CENTER: [number, number] = [-6.2088, 106.8456];
export const HO_CHI_MINH_CENTER: [number, number] = [10.7769, 106.7009];

/** Ho Chi Minh City only when no lead has coordinates and the latest campaign is Vietnamese; otherwise Jakarta. */
export function mapCenterFor(hasCoords: boolean, latestMarket: unknown): [number, number] {
  if (!hasCoords && latestMarket === "VN") return [...HO_CHI_MINH_CENTER];
  return [...JAKARTA_CENTER];
}
