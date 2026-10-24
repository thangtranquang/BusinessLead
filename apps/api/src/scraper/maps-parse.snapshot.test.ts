// Indonesian regression snapshot — must not change in the Vietnam market feature.
// Expected values were recorded by running the code as it was BEFORE any market change; invented data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRating, pickCategory } from "./maps-parse";

test("normalizeRating (TC-VM-5.9, TC-VM-5.15 old arity)", () => {
  const rows: Array<[string, string]> = [
  ["4,6", "4.6"],
  ["4.6", "4.6"],
  ["5", "5"],
  ["0", "0"],
  ["", ""],
  ["abc", ""],
  ["4,67", "4.6"],
  ["4.67", "4.6"],
  [" 4,6 ", "4.6"],
  ["4,6 bintang", "4.6"],
  ["10", "1"],
  ["3,5", "3.5"],
  ["0,5", "0.5"],
  ["5,0", "5.0"],
  ["4,", "4"],
  [",6", ""],
  ["-4.6", ""],
  ["\u0664\u066b\u0666", ""],
  ];
  for (const [input, expected] of rows) assert.equal(normalizeRating(input), expected, JSON.stringify(input));
  assert.equal(normalizeRating(null), "");
  assert.equal(normalizeRating(undefined), "");
});

test("pickCategory (TC-VM-5.9)", () => {
  const rows: Array<[string, string[], string]> = [
  ["Buka", ["Buka \u22c5 Tutup pukul 21.00"], ""],
  ["Tutup", ["Tutup \u22c5 Buka pukul 08.00"], ""],
  ["Open", ["Open 24 hours"], ""],
  ["Closed", ["Closed \u22c5 Opens 9 am"], ""],
  ["Opens", ["Opens 9 am"], ""],
  ["Closes", ["Closes 5 pm"], ""],
  ["Sementara tutup", ["Sementara tutup"], ""],
  ["24 jam", ["24 jam"], ""],
  ["Sponsor", ["Sponsor"], ""],
  ["Iklan", ["Iklan"], ""],
  ["Jl.", ["Jl. Melati No. 2"], ""],
  ["Jalan", ["Jalan Kenanga 3"], ""],
  ["Gg", ["Gg. Mawar 4"], ""],
  ["Gang", ["Gang Anggrek 5"], ""],
  ["Street", ["Street 12"], ""],
  ["Ruko", ["Ruko Blok A"], ""],
  ["Komplek", ["Komplek Indah 7"], ""],
  ["real category", ["Toko kopi"], "Toko kopi"],
  ["category with address", ["Toko kopi \u00b7 Jl. Melati No. 2"], "Toko kopi"],
  ["empty list", [], ""],
  ["rating row first", ["4,6(210)", "Toko kopi \u00b7 Jl. Melati"], "Toko kopi"],
  ["skip hours then category", ["Buka 24 jam", "Kafe \u00b7 Jl. A"], "Kafe"],
  ["address-like first segment then category", ["Jl. Melati \u00b7 Kafe", "Kafe \u00b7 Jl. A"], "Kafe"],
  ["phone-like segment", ["0812 3456", "Bengkel \u00b7 Jl. B"], "Bengkel"],
  ["too long", ["xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"], ""],
  ["blank rows", ["", "   ", "Warung"], "Warung"],
  ["open spelled lower", ["open now", "Warung"], "Warung"],
  ["no. address", ["No. 12 \u00b7 Warung", "Warung"], "Warung"],
  ["middle dot only", ["\u00b7"], ""],
  ["Open 24 jam english", ["Buka 24 jam", "Toko Kamera \u22c5 Jl. X"], "Toko Kamera \u22c5 Jl. X"],
  ];
  for (const [label, input, expected] of rows) assert.equal(pickCategory(input), expected, label);
});
