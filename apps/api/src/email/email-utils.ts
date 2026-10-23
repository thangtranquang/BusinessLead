import { createHmac, timingSafeEqual } from "crypto";
import { toOutputLanguage, type OutputLanguage } from "../common/language";
import { capThenNfc, nfc, sliceChars } from "../common/text";

export const ALLOWED_SMTP_PORTS = [25, 465, 587, 2525];

/**
 * The language of a queued email draft. `context` is arbitrary JSON written at draft time (or by an older version), so
 * anything that is not exactly "vietnamese" or "english", including a legacy "indonesian", is read as English.
 */
export function emailLanguage(context: unknown): OutputLanguage {
  if (typeof context !== "object" || context === null || Array.isArray(context)) return toOutputLanguage(undefined);
  return toOutputLanguage((context as { language?: unknown }).language);
}

/** Controls that must never reach a mail header: C0/C1 controls (CR, LF, NEL ...), line separator, paragraph separator. */
const HEADER_BREAKS = /[\p{Cc}\u{85}\u{2028}\u{2029}]+/gu;
/** A header value is a subject or a name, never long: anything beyond this is cut before any pass runs over it. */
const HEADER_RAW_MAX = 4_000;

/**
 * One header-safe line: NFC, no line breaks or control characters (a CR, LF, NEL, LS or PS would end the header and start a
 * new one), bounded length cut by code point so a tone mark or a surrogate pair is never split. Not for email addresses.
 */
export function headerLine(v: string, max = 200): string {
  return sliceChars(capThenNfc(v, HEADER_RAW_MAX).replace(HEADER_BREAKS, " ").replace(/\s+/g, " ").trim(), max);
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** Signed, tamper-proof token for the unsubscribe link: it says which workspace and which address, and nothing else. */
export function signUnsubscribe(workspaceId: string, email: string, secret: string): string {
  const payload = b64(`${workspaceId}|${email.toLowerCase()}`);
  const mac = b64(createHmac("sha256", secret).update(payload).digest());
  return `${payload}.${mac}`;
}

export function verifyUnsubscribe(token: string, secret: string): { workspaceId: string; email: string } | null {
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined || token.length > 600) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let given: Buffer;
  try { given = Buffer.from(mac, "base64url"); } catch { return null; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [workspaceId, email, more] = Buffer.from(payload, "base64url").toString("utf8").split("|");
  if (!workspaceId || !email || more !== undefined) return null;
  return { workspaceId, email };
}

/** The one unsubscribe line of the footer, per output language. Frozen: indexed only with a normalised language. */
export const FOOTER_LINE: Readonly<Record<OutputLanguage, (url: string) => string>> = Object.freeze({
  vietnamese: (url: string) => `Nếu anh/chị không muốn nhận email từ chúng tôi nữa, bấm vào đây: ${url}`,
  english: (url: string) => `Don't want emails from us anymore? Click: ${url}`,
});

/** Plain-text footer on every message: who sends it, where they are, and a way out. */
export function buildFooter(o: { language: OutputLanguage; url: string; fromName: string; postalAddress: string }): string {
  return [
    "--",
    headerLine(o.fromName, 120),
    sliceChars(nfc(o.postalAddress).replace(/\r/g, "").trim(), 300),
    FOOTER_LINE[toOutputLanguage(o.language)](o.url),
  ].join("\n");
}

/** What the mail builder reads from a queued message. Only these fields: it never touches the database. */
export interface MailMessageInput {
  toEmail: string | null;
  subject: string | null;
  body: string;
  /** Arbitrary JSON written at draft time (or by an older version). */
  context?: unknown;
}

/** What the mail builder reads from the workspace's mail account. */
export interface MailAccountInput {
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
  postalAddress: string;
}

export interface BuiltMailOptions {
  from: { name: string; address: string };
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  headers: { "List-Unsubscribe": string; "List-Unsubscribe-Post": string };
}

/**
 * The options handed to the SMTP transport for one approved email. Pure (no I/O, no input mutated), so a test can render it with
 * nodemailer's stream transport and read the MIME. Every message, in every language and whatever its stored context, carries the
 * footer and both List-Unsubscribe headers. The recipient address is lower-cased and otherwise left byte-identical: the opt-out
 * lookups and the unsubscribe token use the same form.
 */
export function buildMailOptions(next: MailMessageInput, account: MailAccountInput, url: string): BuiltMailOptions {
  const language = emailLanguage(next.context);
  return {
    from: { name: headerLine(account.fromName, 120), address: account.fromEmail },
    to: (next.toEmail ?? "").toLowerCase(),
    ...(account.replyTo ? { replyTo: account.replyTo } : {}),
    subject: headerLine(next.subject ?? ""),
    text: `${next.body}\n\n${buildFooter({ language, url, fromName: account.fromName, postalAddress: account.postalAddress })}`,
    headers: { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

/** The note stored on the lead's `email_sent` activity: the subject, cut by code point (never in the middle of a character). */
export function activityNote(subject: string | null | undefined): string {
  return sliceChars(subject ?? "", 140);
}

/** SMTP reply codes of 5xx mean the server refused for good (bad address, rejected content); anything else may work later. */
export function isPermanentSmtpError(e: unknown): boolean {
  const code = (e as { responseCode?: number })?.responseCode;
  return typeof code === "number" && code >= 500 && code < 600;
}

export function authFailure(e: unknown): boolean {
  const x = e as { code?: string; responseCode?: number };
  return x?.code === "EAUTH" || x?.responseCode === 535;
}

/** Base address printed in unsubscribe links. */
export function unsubscribeBase(env: { PUBLIC_API_URL?: string; PORT?: string } = process.env): string {
  return (env.PUBLIC_API_URL || `http://localhost:${env.PORT || 3001}/api`).replace(/\/$/, "");
}

/** An unsubscribe link only works for the recipient when it points at a public https address. */
export function isPublicUnsubscribeBase(url: string, env: { ALLOW_LOCAL_UNSUBSCRIBE?: string } = process.env): boolean {
  if (env.ALLOW_LOCAL_UNSUBSCRIBE === "true") return true;
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (u.protocol !== "https:") return false;
    if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}
