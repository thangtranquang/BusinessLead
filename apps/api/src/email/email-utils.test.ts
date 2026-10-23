import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFooter, FOOTER_LINE, headerLine, isPermanentSmtpError, signUnsubscribe, verifyUnsubscribe } from "./email-utils";
import { HOSTILE_MS_LARGE } from "../common/hostile-limits";
import { nfc } from "../common/text";

test("unsubscribe token round-trips and lowercases the address", () => {
  const t = signUnsubscribe("ws1", "Halo@Toko.ID", "secret-secret-1234");
  assert.deepEqual(verifyUnsubscribe(t, "secret-secret-1234"), { workspaceId: "ws1", email: "halo@toko.id" });
});

test("unsubscribe token rejects tampering, another secret and junk", () => {
  const t = signUnsubscribe("ws1", "a@b.id", "secret-secret-1234");
  const [p, m] = t.split(".");
  const forged = Buffer.from("ws2|a@b.id").toString("base64url") + "." + m;
  assert.equal(verifyUnsubscribe(forged, "secret-secret-1234"), null);
  assert.equal(verifyUnsubscribe(t, "another-secret-9999"), null);
  assert.equal(verifyUnsubscribe(p, "secret-secret-1234"), null);
  assert.equal(verifyUnsubscribe(`${t}.x`, "secret-secret-1234"), null);
  assert.equal(verifyUnsubscribe("x".repeat(1000), "secret-secret-1234"), null);
  assert.equal(verifyUnsubscribe("", "secret-secret-1234"), null);
});

test("headerLine removes line breaks so a subject cannot inject headers", () => {
  assert.equal(headerLine("Halo\r\nBcc: x@y.z"), "Halo Bcc: x@y.z");
  assert.equal(headerLine("a".repeat(500)).length, 200);
});

test("footer carries the sender, the address and the unsubscribe link", () => {
  const f = buildFooter({ language: "vietnamese", url: "https://x.id/u/abc", fromName: "Công ty Mẫu", postalAddress: "Jl. Contoh 1, Boyolali" });
  assert.match(f, /Công ty Mẫu/);
  assert.match(f, /Jl\. Contoh 1, Boyolali/);
  assert.match(f, /https:\/\/x\.id\/u\/abc/);
  assert.match(buildFooter({ language: "english", url: "u", fromName: "A", postalAddress: "B" }), /Don't want emails/);
});

test("TC-23.3 / 23.12: the Vietnamese footer line is natural Vietnamese with exactly one link; English is unchanged", () => {
  const url = "https://x.example.com/u/abc";
  const vi = buildFooter({ language: "vietnamese", url, fromName: "Minh Anh", postalAddress: "1 Phố Mẫu, Hà Nội" });
  assert.equal(vi, ["--", "Minh Anh", "1 Phố Mẫu, Hà Nội", `Nếu anh/chị không muốn nhận email từ chúng tôi nữa, bấm vào đây: ${url}`].join("\n"));
  assert.equal(vi.split(url).length - 1, 1);
  assert.doesNotMatch(vi, /Tidak ingin|Klik/);
  const en = buildFooter({ language: "english", url, fromName: "A", postalAddress: "B" });
  assert.equal(en, ["--", "A", "B", `Don't want emails from us anymore? Click: ${url}`].join("\n"));
  assert.equal(en.split(url).length - 1, 1);
});

test("FOOTER_LINE is a frozen table with one entry per output language and NFC text", () => {
  assert.ok(Object.isFrozen(FOOTER_LINE));
  assert.deepEqual(Object.keys(FOOTER_LINE).sort(), ["english", "vietnamese"]);
  for (const f of Object.values(FOOTER_LINE)) assert.equal(nfc(f("u")), f("u"));
  assert.equal(FOOTER_LINE.english("U"), "Don't want emails from us anymore? Click: U");
  assert.equal(Reflect.set(FOOTER_LINE, "vietnamese", () => "x"), false);
  assert.match(FOOTER_LINE.vietnamese("U"), /^Nếu anh/);
});

test("buildFooter reads an odd language value as English and never throws", () => {
  for (const language of ["indonesian", "__proto__", "VIETNAMESE", undefined, null, 5] as unknown[]) {
    const f = buildFooter({ language: language as never, url: "U", fromName: "A", postalAddress: "B" });
    assert.ok(f.endsWith("Don't want emails from us anymore? Click: U"), String(language));
  }
});

test("TC-23.8: a missing sender name or address does not break the footer structure", () => {
  const f = buildFooter({ language: "vietnamese", url: "U", fromName: "", postalAddress: "" });
  assert.ok(f.startsWith("--\n") && f.endsWith("U"));
  assert.equal(f.split("\n").length, 4);
});

test("S7: headerLine keeps diacritics, strips control and Unicode line separators", () => {
  const c = (...codes: number[]) => String.fromCharCode(...codes);
  assert.equal(headerLine("Hợp tác về hệ thống"), "Hợp tác về hệ thống");
  assert.equal(headerLine(`Minh${c(0x85)}Bcc: x@example.com`), "Minh Bcc: x@example.com");
  assert.equal(headerLine(`a${c(0x2028)}b${c(0x2029)}c`), "a b c");
  assert.equal(headerLine(`a${c(0)}b${c(7)}c${c(27)}d${c(127)}e`), "a b c d e");
  assert.equal(headerLine(`  a ${c(9, 9)} b  `), "a b");
});

test("TC-25.10 / FR-44.8: headerLine normalises to NFC; a cut never splits a surrogate pair or a tone mark", () => {
  const cut = headerLine("a".repeat(199) + "😀" + "b");
  assert.equal([...cut].length, 200);
  assert.ok(cut.endsWith("😀"));
  const viet = "Việt Nam Hợp Tác ".repeat(30);
  const fromNfd = headerLine(viet.normalize("NFD"), 61);
  assert.equal(fromNfd, headerLine(viet.normalize("NFC"), 61));
  assert.equal(fromNfd, nfc(fromNfd), "the result is NFC");
  assert.doesNotMatch(fromNfd, /^\p{M}|[^\p{L}\p{N}\p{P}\s]/u, "no bare combining mark");
  const name = "ạ".repeat(119) + "😀" + "z".repeat(10);
  assert.equal([...headerLine(name, 120)].length, 120);
  assert.equal(headerLine(null as never), "");
});

test("headerLine stays fast on a hostile 10 MB input", () => {
  const input = "a\r\n".repeat(3_000_000) + "x".repeat(1_000_000);
  const t0 = performance.now();
  const out = headerLine(input);
  assert.ok(performance.now() - t0 < HOSTILE_MS_LARGE, "within HOSTILE_MS_LARGE");
  assert.ok(out.length <= 200);
});

test("only 5xx SMTP replies are permanent", () => {
  assert.equal(isPermanentSmtpError({ responseCode: 550 }), true);
  assert.equal(isPermanentSmtpError({ responseCode: 451 }), false);
  assert.equal(isPermanentSmtpError(new Error("ETIMEDOUT")), false);
});

import { isPublicUnsubscribeBase } from "./email-utils";

test("unsubscribe links must be public https addresses", () => {
  assert.equal(isPublicUnsubscribeBase("http://localhost:3001/api", {}), false);
  assert.equal(isPublicUnsubscribeBase("https://api.example.com/api", {}), true);
  assert.equal(isPublicUnsubscribeBase("http://api.example.com/api", {}), false);
  assert.equal(isPublicUnsubscribeBase("https://192.168.1.5/api", {}), false);
  assert.equal(isPublicUnsubscribeBase("http://localhost:3001/api", { ALLOW_LOCAL_UNSUBSCRIBE: "true" }), true);
});
