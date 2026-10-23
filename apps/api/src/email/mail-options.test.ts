import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodemailer from "nodemailer";
import { activityNote, buildFooter, buildMailOptions, emailLanguage, FOOTER_LINE, type MailAccountInput, type MailMessageInput } from "./email-utils";
import { sliceChars } from "../common/text";

// QA DT-20 / TC-23.x / TC-25.x / TC-52.x. Every address, name and text below is invented. The options are rendered by the
// real nodemailer stream transport (no hand-written fake), so the assertions are on the MIME bytes a mail server would get.

const URL = "https://api.example.com/api/unsubscribe/abc.def";
const ACCOUNT: MailAccountInput = { fromName: "Minh Anh", fromEmail: "minh@example.com", replyTo: null, postalAddress: "1 Phố Mẫu, Quận Mẫu, Hà Nội" };
const SUBJECT = "Hợp tác về hệ thống quản lý đặt lịch";
const BODY = "Xin chào anh/chị,\nEm gửi anh/chị thông tin về dịch vụ ạ. Cảm ơn anh/chị nhiều!";
const msg = (over: Partial<MailMessageInput> = {}): MailMessageInput => ({ toEmail: "Khach.Mau@Example.com", subject: SUBJECT, body: BODY, context: { language: "vietnamese" }, ...over });

interface Mime { headers: Map<string, string>; rawHeaders: string; text: string; raw: Buffer }

/** Decodes RFC 2047 encoded words ("=?UTF-8?B|Q?...?=") in a header value. Adjacent words are joined as bytes before decoding. */
function decodeWords(value: string): string {
  const joined = value.replace(/(\?=)\s+(?==\?)/g, "$1");
  const chunks: Buffer[] = [];
  let last = 0;
  for (const m of joined.matchAll(/=\?UTF-8\?([BQ])\?([^?]*)\?=/gi)) {
    chunks.push(Buffer.from(joined.slice(last, m.index), "utf8"));
    chunks.push(m[1].toUpperCase() === "B"
      ? Buffer.from(m[2], "base64")
      : Buffer.from(m[2].replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1"));
    last = (m.index ?? 0) + m[0].length;
  }
  chunks.push(Buffer.from(joined.slice(last), "utf8"));
  return Buffer.concat(chunks).toString("utf8");
}

async function render(options: ReturnType<typeof buildMailOptions>): Promise<Mime> {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const info = (await transport.sendMail(options)) as unknown as { message: Buffer };
  const raw = info.message;
  const split = raw.toString("latin1").search(/\r?\n\r?\n/);
  const rawHeaders = raw.subarray(0, split).toString("latin1");
  const bodyRaw = raw.subarray(split).toString("latin1").replace(/^\r?\n\r?\n/, "");
  const headers = new Map<string, string>();
  for (const line of rawHeaders.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) headers.set(line.slice(0, i).toLowerCase(), decodeWords(line.slice(i + 1).trim()));
  }
  const enc = (headers.get("content-transfer-encoding") ?? "7bit").toLowerCase();
  const text = (enc === "base64" ? Buffer.from(bodyRaw, "base64")
    : enc === "quoted-printable" ? Buffer.from(bodyRaw.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1")
    : Buffer.from(bodyRaw, "latin1")).toString("utf8").replace(/\r\n/g, "\n").replace(/\n$/, ""); // the library ends the text part with one line break
  return { headers, rawHeaders, text, raw };
}

const footerOf = (language: "vietnamese" | "english", account = ACCOUNT) => buildFooter({ language, url: URL, fromName: account.fromName, postalAddress: account.postalAddress });

test("TC-23.1 / 25.1 / 52.2: a Vietnamese message is RFC 2047 encoded, UTF-8, with the footer and both List headers", async () => {
  const mime = await render(buildMailOptions(msg(), ACCOUNT, URL));
  assert.match(mime.rawHeaders, /^Subject: =\?UTF-8\?[BQ]\?/mi, "the subject header is encoded, not raw 8-bit");
  assert.equal(mime.headers.get("subject"), SUBJECT);
  assert.match(mime.headers.get("from") ?? "", /Minh Anh/);
  assert.match(mime.headers.get("content-type") ?? "", /text\/plain;\s*charset=utf-8/i);
  assert.equal(mime.text, `${BODY}\n\n${footerOf("vietnamese")}`);
  assert.ok(mime.text.includes(FOOTER_LINE.vietnamese(URL)));
  assert.equal(mime.headers.get("list-unsubscribe"), `<${URL}>`);
  assert.equal(mime.headers.get("list-unsubscribe-post"), "List-Unsubscribe=One-Click");
  assert.equal(mime.headers.get("to"), "khach.mau@example.com");
  for (const byte of Buffer.from(mime.rawHeaders, "latin1")) assert.ok(byte <= 0x7f, "no raw byte above 0x7F in any header");
});

test("TC-23.2: an English message gets the English footer line and both headers", async () => {
  const mime = await render(buildMailOptions(msg({ subject: "Booking software", body: "Hello,\nA short note.", context: { language: "english" } }), ACCOUNT, URL));
  assert.ok(mime.text.endsWith(`Don't want emails from us anymore? Click: ${URL}`));
  assert.ok(mime.headers.has("list-unsubscribe") && mime.headers.has("list-unsubscribe-post"));
});

test("TC-23.4 / 23.5 / 52.7: every language value gets a footer and both List headers, never none", async () => {
  const cases: [string, unknown, "vietnamese" | "english"][] = [
    ["vietnamese", { language: "vietnamese" }, "vietnamese"],
    ["english", { language: "english" }, "english"],
    ["legacy indonesian", { language: "indonesian" }, "english"],
    ["garbage", { language: "klingon" }, "english"],
    ["number", { language: 5 }, "english"],
    ["null language", { language: null }, "english"],
    ["null context", null, "english"],
    ["undefined context", undefined, "english"],
    ["empty context", {}, "english"],
    ["__proto__", { language: "__proto__" }, "english"],
    ["array context", [{ language: "vietnamese" }], "english"],
  ];
  for (const [name, context, expected] of cases) {
    const options = buildMailOptions(msg({ context }), ACCOUNT, URL);
    assert.equal(emailLanguage(context), expected, name);
    const mime = await render(options);
    assert.ok(mime.text.includes(FOOTER_LINE[expected](URL)), `${name}: footer line`);
    assert.ok(mime.text.startsWith(`${BODY}\n\n--\n`), `${name}: footer separator`);
    assert.equal(mime.headers.get("list-unsubscribe"), `<${URL}>`, name);
    assert.equal(mime.headers.get("list-unsubscribe-post"), "List-Unsubscribe=One-Click", name);
  }
});

test("TC-23.4: a message with no context key at all still carries footer and headers", () => {
  const { context: _ignored, ...noContext } = msg();
  const options = buildMailOptions(noContext as MailMessageInput, ACCOUNT, URL);
  assert.ok(options.text.includes("--\n"));
  assert.ok(options.text.endsWith(FOOTER_LINE.english(URL)));
  assert.deepEqual(Object.keys(options.headers).sort(), ["List-Unsubscribe", "List-Unsubscribe-Post"]);
});

test("TC-25.3 / 52.9: English options equal what the pre-change inline code built (pure refactor)", () => {
  const legacyHeaderLine = (v: string, max = 200) => v.replace(/[\r\n\v\f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  const legacy = (next: MailMessageInput, a: MailAccountInput, url: string) => ({
    from: { name: legacyHeaderLine(a.fromName, 120), address: a.fromEmail },
    to: (next.toEmail ?? "").toLowerCase(),
    ...(a.replyTo ? { replyTo: a.replyTo } : {}),
    subject: legacyHeaderLine(next.subject ?? ""),
    text: `${next.body}\n\n${["--", legacyHeaderLine(a.fromName, 120), a.postalAddress.replace(/\r/g, "").trim().slice(0, 300), `Don't want emails from us anymore? Click: ${url}`].join("\n")}`,
    headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  const accounts: MailAccountInput[] = [
    { fromName: "Acme Studio", fromEmail: "hello@example.com", replyTo: null, postalAddress: "1 Example Street, Springfield" },
    { fromName: "Acme  Studio\r\n", fromEmail: "hello@example.com", replyTo: "reply@example.com", postalAddress: "  Line one\r\nLine two  " },
  ];
  for (const a of accounts) {
    for (const next of [msg({ subject: "Booking software for your shop", body: "Hello,\n\nA short note.", context: { language: "english" } }), msg({ subject: null, body: "x", toEmail: null, context: { language: "english" } })]) {
      assert.deepEqual(buildMailOptions(next, a, URL), legacy(next, a, URL));
    }
  }
});

test("TC-23.11: buildMailOptions does not mutate its input and the body stays footer-free", () => {
  const next = msg();
  const before = JSON.stringify(next);
  const a = buildMailOptions(next, ACCOUNT, URL);
  const b = buildMailOptions(next, ACCOUNT, URL);
  assert.equal(JSON.stringify(next), before);
  assert.deepEqual(a, b);
  assert.equal(next.body, BODY);
});

test("TC-23.10 / 25.5 / 52.12: CRLF plus Bcc in the sender name or the subject cannot add a header", async () => {
  const mime = await render(buildMailOptions(msg({ subject: "Hợp tác\r\nBcc: x@example.com" }), { ...ACCOUNT, fromName: "Minh\r\nBcc: x@example.com" }, URL));
  assert.ok(!mime.headers.has("bcc"), "no Bcc header");
  assert.ok(!/^bcc:/im.test(mime.rawHeaders));
  assert.equal(mime.headers.get("subject"), "Hợp tác Bcc: x@example.com");
  assert.match(mime.headers.get("from") ?? "", /Minh Bcc: x@example\.com/);
});

test("S7 LOW: NEL, LS, PS and other control characters are stripped from header text", async () => {
  const nel = String.fromCharCode(0x85);
  const ls = String.fromCharCode(0x2028);
  const ps = String.fromCharCode(0x2029);
  const evil = [`Minh${nel}Bcc: x@example.com`, `Minh${ls}Bcc: x@example.com`, `Minh${ps}Bcc: x@example.com`, "Minh\u0000\u0007Bcc: x@example.com", "Minh\tBcc: x@example.com"];
  for (const e of evil) {
    const options = buildMailOptions(msg({ subject: e }), { ...ACCOUNT, fromName: e }, URL);
    assert.equal(options.subject, "Minh Bcc: x@example.com", JSON.stringify(e));
    assert.equal(options.from.name, "Minh Bcc: x@example.com");
    const mime = await render(options);
    assert.ok(!mime.headers.has("bcc"), JSON.stringify(e));
    assert.equal(mime.rawHeaders.split(/\r?\n/).filter((l) => /^subject:/i.test(l)).length, 1);
  }
});

test("TC-25.1 / 25.8 / 52.6: names with diacritics (including a leading Đ) survive in From and in the footer", async () => {
  for (const fromName of ["Minh Anh", "Đặng Minh Anh"]) {
    const mime = await render(buildMailOptions(msg(), { ...ACCOUNT, fromName }, URL));
    assert.ok((mime.headers.get("from") ?? "").includes(fromName), fromName);
    assert.ok(mime.text.includes(`--\n${fromName}\n`), `footer name ${fromName}`);
    assert.ok(!/[\r\n]/.test(fromName));
  }
});

test("TC-25.2: a 60-character multi-byte subject is intact after header folding", async () => {
  const subject = [..."Hợp tác phát triển hệ thống quản lý đặt lịch cho tiệm ạ ạ ạ ạ ạ ạ ạ"].slice(0, 59).join("") + "ạ";
  assert.equal([...subject].length, 60);
  const mime = await render(buildMailOptions(msg({ subject }), ACCOUNT, URL));
  assert.equal(mime.headers.get("subject"), subject);
});

test("TC-25.4 / 25.6: an emoji body decodes intact and the 8-bit text uses a safe transfer encoding", async () => {
  const body = "Cảm ơn anh/chị nhiều 😊 hẹn gặp lại";
  const mime = await render(buildMailOptions(msg({ body }), ACCOUNT, URL));
  assert.ok(mime.text.startsWith(body));
  assert.match(mime.headers.get("content-transfer-encoding") ?? "", /^(quoted-printable|base64)$/i);
});

test("TC-25.7: a subject handed over in NFD is sent as the NFC the owner approved", async () => {
  const nfd = SUBJECT.normalize("NFD");
  assert.notEqual(nfd, SUBJECT);
  const options = buildMailOptions(msg({ subject: nfd }), ACCOUNT, URL);
  assert.equal(options.subject, SUBJECT);
  assert.equal((await render(options)).headers.get("subject"), SUBJECT);
});

test("TC-25.9: the options carry a text part only (record: no html part)", () => {
  assert.equal("html" in buildMailOptions(msg(), ACCOUNT, URL), false);
});

test("replyTo is set only when the account has one; the address is lower-cased and never normalised otherwise", () => {
  assert.equal("replyTo" in buildMailOptions(msg(), ACCOUNT, URL), false);
  assert.equal(buildMailOptions(msg(), { ...ACCOUNT, replyTo: "reply@example.com" }, URL).replyTo, "reply@example.com");
  // addresses are never NFC-normalised: the opt-out lookup and the unsubscribe token must stay byte-identical (S7)
  const nfdLocal = "dũng@example.com".normalize("NFD");
  assert.equal(buildMailOptions(msg({ toEmail: nfdLocal }), ACCOUNT, URL).to, nfdLocal.toLowerCase());
});

test("TC-52.8: the activity note is cut by code point at 140 and stays well formed", () => {
  const long = "Hợp tác về hệ thống ".repeat(20);
  assert.equal([...activityNote(long)].length, 140);
  assert.equal(activityNote(long), sliceChars(long, 140));
  const emoji = "a".repeat(139) + "😀" + "b";
  const note = activityNote(emoji);
  assert.equal([...note].length, 140);
  assert.ok(note.endsWith("😀"), "the emoji is whole, not a lone surrogate");
  assert.doesNotMatch(note, /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
  assert.equal(activityNote(null), "");
  assert.equal(activityNote(undefined), "");
  assert.equal(activityNote("Short"), "Short");
});

test("every footer has exactly one unsubscribe link and a footer line in both languages", () => {
  for (const language of ["vietnamese", "english"] as const) {
    const footer = footerOf(language);
    assert.equal(footer.split(URL).length - 1, 1, language);
    assert.ok(footer.startsWith("--\n"));
  }
});
