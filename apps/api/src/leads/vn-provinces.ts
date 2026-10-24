/**
 * Vietnam's provincial-level units after the 2025 reform: 34 units (28 provinces + 6 centrally run cities),
 * district level abolished, new local governments operating from 1 July 2025.
 *
 * Source: Nghị quyết số 202/2025/QH15 "về việc sắp xếp đơn vị hành chính cấp tỉnh" (Resolution on the
 * rearrangement of provincial-level administrative units), issued by the Quốc hội (National Assembly),
 * adopted 12 June 2025; units operate in the new form from 1 July 2025.
 * Official record: https://vanban.chinhphu.vn/?pageid=27160&docid=213930
 * Official Gazette: https://congbao.chinhphu.vn/van-ban/nghi-quyet-so-202-2025-qh15-45050/56708.htm
 * Unit and merger list cross-checked against two government-portal / press summaries of Article 1:
 *   https://xaydungchinhsach.chinhphu.vn/chi-tiet-34-don-vi-hanh-chinh-cap-tinh-tu-12-6-2025-119250612141845533.htm
 *   https://baolaocai.vn/nghi-quyet-cua-quoc-hoi-ve-sap-xep-don-vi-hanh-chinh-cap-tinh-post403219.html
 * Accessed: 2026-10-25
 * Note: the Gazette text itself was not fetched (blocked in the build environment); the list above was read from
 * the two summaries, which agree with each other (23 merged units, 11 unchanged). Re-check against the Gazette.
 *
 * Names are stored without the "Tỉnh " / "Thành phố " prefix, in Unicode NFC.
 */
export const PROVINCES_VN: readonly string[] = [
  // 11 units not rearranged
  "Cao Bằng", "Điện Biên", "Hà Tĩnh", "Lai Châu", "Lạng Sơn", "Nghệ An", "Quảng Ninh", "Thanh Hóa", "Sơn La", "Hà Nội", "Huế",
  // 23 units formed by merger
  "Tuyên Quang", "Lào Cai", "Thái Nguyên", "Phú Thọ", "Bắc Ninh", "Hưng Yên", "Ninh Bình", "Quảng Trị", "Quảng Ngãi",
  "Gia Lai", "Khánh Hòa", "Lâm Đồng", "Đắk Lắk", "Đồng Nai", "Tây Ninh", "Vĩnh Long", "Đồng Tháp", "Cà Mau", "An Giang",
  "Hải Phòng", "Đà Nẵng", "Hồ Chí Minh", "Cần Thơ",
].map((s) => s.normalize("NFC"));

/** Pre-merger province (as OpenStreetMap may still name it) -> current unit, from the same Article 1. */
const MERGED: Record<string, string[]> = {
  "Tuyên Quang": ["Hà Giang"],
  "Lào Cai": ["Yên Bái"],
  "Thái Nguyên": ["Bắc Kạn"],
  "Phú Thọ": ["Vĩnh Phúc", "Hòa Bình"],
  "Bắc Ninh": ["Bắc Giang"],
  "Hưng Yên": ["Thái Bình"],
  "Ninh Bình": ["Hà Nam", "Nam Định"],
  "Quảng Trị": ["Quảng Bình"],
  "Quảng Ngãi": ["Kon Tum"],
  "Gia Lai": ["Bình Định"],
  "Khánh Hòa": ["Ninh Thuận"],
  "Lâm Đồng": ["Đắk Nông", "Bình Thuận"],
  "Đắk Lắk": ["Phú Yên"],
  "Đồng Nai": ["Bình Phước"],
  "Tây Ninh": ["Long An"],
  "Vĩnh Long": ["Bến Tre", "Trà Vinh"],
  "Đồng Tháp": ["Tiền Giang"],
  "Cà Mau": ["Bạc Liêu"],
  "An Giang": ["Kiên Giang"],
  "Hải Phòng": ["Hải Dương"],
  "Đà Nẵng": ["Quảng Nam"],
  "Hồ Chí Minh": ["Bà Rịa - Vũng Tàu", "Bình Dương"],
  "Cần Thơ": ["Sóc Trăng", "Hậu Giang"],
};

export const PRE_MERGER_VN: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(MERGED).flatMap(([to, froms]) => froms.map((f) => [f.normalize("NFC"), to.normalize("NFC")])),
);

const key = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s*-\s*/g, " - ");
const LOOKUP = new Map<string, string>([
  ...PROVINCES_VN.map((p) => [key(p), p] as const),
  ...Object.entries(PRE_MERGER_VN).map(([f, t]) => [key(f), t] as const),
]);

/** Strips "Thành phố " / "Tỉnh ", then maps through the dataset; a name not in it is kept as returned. */
export function normalizeProvinceVN(name: string | null): string | null {
  if (!name) return null;
  const bare = name.normalize("NFC").replace(/^\s*(thành phố|tỉnh)\s+/i, "").trim();
  if (!bare) return null;
  return LOOKUP.get(key(bare)) ?? bare;
}
