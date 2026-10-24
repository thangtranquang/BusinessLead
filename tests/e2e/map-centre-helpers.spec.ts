/**
 * Browser-less checks for apps/web/src/lib/map-centre.ts (TC-VM-14.5). Relative imports only.
 */
import { test, expect } from "@playwright/test";
import { mapCenterFor } from "../../apps/web/src/lib/map-centre";

const HCMC: [number, number] = [10.7769, 106.7009];
const JAKARTA: [number, number] = [-6.2088, 106.8456];

test("mapCenterFor: VN only when no coordinates and latest market is VN", () => {
  expect(mapCenterFor(false, "VN")).toEqual(HCMC);
  expect(mapCenterFor(false, "ID")).toEqual(JAKARTA);
  expect(mapCenterFor(false, undefined)).toEqual(JAKARTA);
  expect(mapCenterFor(false, null)).toEqual(JAKARTA);
  expect(mapCenterFor(false, "vn")).toEqual(JAKARTA);
  expect(mapCenterFor(false, 42)).toEqual(JAKARTA);
  expect(mapCenterFor(true, "VN")).toEqual(JAKARTA); // the map recentres on the first lead; fallback stays Jakarta
  expect(mapCenterFor(true, "ID")).toEqual(JAKARTA);
});
