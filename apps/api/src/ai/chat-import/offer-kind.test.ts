import test from "node:test";
import assert from "node:assert/strict";
import { detectOfferKind } from "./offer-kind";
import { HOSTILE_MS_LARGE, assertLinear } from "../../common/hostile-limits";

const nfd = (s: string) => s.normalize("NFD");

test("an agency that builds to order is a service", () => {
  assert.equal(detectOfferKind("We build custom software solutions for startups and enterprises, web, mobile, AI/ML."), "service");
  assert.equal(detectOfferKind("Kami membangun agen AI, asisten dokumen berbasis RAG, dan sistem ML prediktif. Kami juga menyediakan tim engineer outsourcing."), "service");
  assert.equal(detectOfferKind("Contoh Digital Agency: jasa pembuatan aplikasi, AI automation dan IT outsourcing."), "service");
});

test("a ready product with a trial or subscription is a product", () => {
  assert.equal(detectOfferKind("Kami membuat sistem sewa dan rental terpadu untuk semua jenis usaha. Kasir sewa, pelacakan DP, pengingat WhatsApp. Masa coba gratis, langganan bulanan."), "product");
  assert.equal(detectOfferKind(""), "product");
});

const FX_SVC_VI = "Công ty Mẫu nhận thiết kế website theo yêu cầu, tư vấn và phát triển phần mềm gia công.";
const FX_PRD_VI = "Phần mềm có sẵn, gói tháng, dùng thử 14 ngày.";

test("Vietnamese offers are classified, in NFC and NFD (TC-39.1, 39.2)", () => {
  assert.equal(detectOfferKind(FX_SVC_VI), "service");
  assert.equal(detectOfferKind(FX_PRD_VI), "product");
  assert.equal(detectOfferKind(nfd(FX_SVC_VI)), "service");
  assert.equal(detectOfferKind(nfd(FX_PRD_VI)), "product");
});

test("every Vietnamese service cue and every product cue counts, each with a positive fixture", () => {
  for (const cue of ["dịch vụ", "theo yêu cầu", "thiết kế", "phát triển", "gia công", "tư vấn"]) {
    assert.equal(detectOfferKind(`Chúng tôi chuyên ${cue} cho doanh nghiệp.`), "service", cue);
  }
  // a product cue outweighs one service cue
  for (const cue of ["gói tháng", "gói năm", "dùng thử", "dùng thử miễn phí", "phần mềm có sẵn", "đăng ký tháng", "thuê bao"]) {
    assert.equal(detectOfferKind(`Có ${cue}, dịch vụ hỗ trợ. ${cue}.`), "product", cue);
  }
});

test("cues at the start, after punctuation and ending in a diacritic letter (TC-39.8)", () => {
  assert.equal(detectOfferKind("Thiết kế website."), "service");
  assert.equal(detectOfferKind("Chúng tôi: dịch vụ"), "service");
  assert.equal(detectOfferKind("Thiết kế website theo yêu cầu."), "service");
  assert.equal(detectOfferKind("gói tháng."), "product");
  assert.equal(detectOfferKind("Gói tháng."), "product");
});

test("a cue inside a longer word is not a cue (TC-39.9)", () => {
  assert.equal(detectOfferKind("xdịch vụ"), "product");
  assert.equal(detectOfferKind("dịch vụx"), "product");
  assert.equal(detectOfferKind("thiết kếx và xtư vấn"), "product");
});

test("both cue families: the same kind as the English equivalent (TC-39.6)", () => {
  assert.equal(detectOfferKind("Phần mềm có sẵn và thiết kế theo yêu cầu"), detectOfferKind("Ready-made software and custom design"));
  assert.equal(detectOfferKind("Phần mềm có sẵn và thiết kế theo yêu cầu"), "service");
  // an agency that also sells a trial: the product cue counts against the service cue, as in English
  assert.equal(detectOfferKind("Thiết kế theo yêu cầu. Dùng thử miễn phí, gói tháng."), "product");
});

test("no cue gives the existing default (TC-39.7)", () => {
  assert.equal(detectOfferKind("Công ty Mẫu"), "product");
  assert.equal(detectOfferKind(null, undefined, ""), "product");
});

test("several texts are joined, and a very long text is capped before it is read", () => {
  assert.equal(detectOfferKind("Công ty Mẫu", "thiết kế theo yêu cầu"), "service");
  assert.equal(detectOfferKind("x".repeat(5000) + " thiết kế theo yêu cầu dịch vụ"), "product");
});

test("hostile input stays linear", () => {
  const makers: ((n: number) => string)[] = [
    (n) => "dịch vụ ".repeat(Math.ceil(n / 8)).slice(0, n),
    (n) => "d" + String.fromCharCode(0x300).repeat(n - 1),
    (n) => "<".repeat(n),
    (n) => "Ơ".repeat(n),
    (n) => "thiết ".repeat(Math.ceil(n / 6)).slice(0, n),
  ];
  for (const make of makers) {
    const t0 = Date.now();
    detectOfferKind(make(20_000));
    assert.ok(Date.now() - t0 < HOSTILE_MS_LARGE);
    assertLinear((s) => detectOfferKind(s), make);
  }
});
