// S7a: the phone factor under the Vietnam market (TC-VM-10.13-10.17). Indonesian values are pinned by scoring.snapshot.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LeadIntelligenceService } from "./lead-intelligence.service";

const svc = new LeadIntelligenceService();
const base = { name: "Quán Mẫu", address: "1 Đường Mẫu, Quận 1", rating: "4.6", reviewCount: 210 };

test("a Vietnamese landline scores 15 less than a mobile and says why", () => {
  const mobile = svc.scoreLead({ ...base, phone: "0901234567" }, undefined, "VN");
  const landline = svc.scoreLead({ ...base, phone: "(028) 3822 1234" }, undefined, "VN");
  assert.equal(mobile.score - landline.score, 15);
  assert.equal(landline.factors[0], "Landline: cannot be reached on WhatsApp");
  assert.equal(mobile.factors[0], "Has a phone number");
});

test("a Vietnamese service number gets no phone points; unknown and international numbers keep them", () => {
  const mobile = svc.scoreLead({ ...base, phone: "0901234567" }, undefined, "VN").score;
  assert.equal(svc.scoreLead({ ...base, phone: "1900 1234" }, undefined, "VN").score, mobile - 15);
  assert.equal(svc.scoreLead({ ...base, phone: "+84 90 123 4567" }, undefined, "VN").score, mobile);
  assert.equal(svc.scoreLead({ ...base, phone: "+1 415 555 0100" }, undefined, "VN").score, mobile);
  assert.equal(svc.scoreLead({ ...base, phone: "12" }, undefined, "VN").score, mobile, "unparseable text counts as today");
});

test("under ID every non-empty phone keeps +15, whatever it looks like (equals the default)", () => {
  for (const phone of ["02838221234", "842838221234", "628123456789", "+84 28 3822 1234", "1900 1234"]) {
    assert.deepEqual(svc.scoreLead({ ...base, phone }, undefined, "ID"), svc.scoreLead({ ...base, phone }));
    assert.equal(svc.scoreLead({ ...base, phone }).factors[0], "Has a phone number");
  }
});

test("scoreLeads passes the market to every lead and re-sorts", () => {
  const input = [{ ...base, name: "A", phone: "02838221234" }, { ...base, name: "B", phone: "0901234567" }];
  assert.deepEqual(svc.scoreLeads(input, [], "VN").map((l) => l.name), ["B", "A"]);
  const id = svc.scoreLeads(input);
  assert.equal(id[0].score, id[1].score);
});

test("a VN lead without a phone is scored the same as under ID", () => {
  assert.deepEqual(svc.scoreLead({ ...base }, undefined, "VN"), svc.scoreLead({ ...base }, undefined, "ID"));
});
