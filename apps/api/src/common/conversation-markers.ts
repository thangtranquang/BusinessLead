/**
 * Internal protocol markers (FR-32, FR-47): one definition, imported both where text is written into a prompt or a stored
 * row and where it is parsed, so a label and its parser cannot drift apart. The set is English and does not change with the
 * output language. Both `messaging/` and `ai/chat-import/` import from here; neither imports the other.
 */

/** Who spoke, in the conversation text given to a model. */
export const SPEAKER = Object.freeze({ me: "Me", them: "Them" } as const);
export const ME_PREFIX = `${SPEAKER.me}:`;
export const THEM_PREFIX = `${SPEAKER.them}:`;

const LINE_BREAK = /\r\n|[\n\r\u0085\u2028\u2029]/;

/**
 * One bubble as conversation text. EVERY line of the bubble carries the label, so a customer who writes a line starting
 * with "Me:" cannot make it read as ours (security S5). Lines are joined with "\n".
 */
export function speakerLine(mine: boolean, text: string): string {
  const label = mine ? ME_PREFIX : THEM_PREFIX;
  const body = typeof text === "string" ? text : "";
  return body.split(LINE_BREAK).map((line) => `${label} ${line}`).join("\n");
}

/** The two labelled parts of a reply the model writes: what the customer meant, then the reply itself. */
export const REPLY_MARKERS = Object.freeze({ intent: "INTENT", reply: "REPLY" } as const);

/** The reply judge answers "OK" or "NO: <reason>". */
export const JUDGE_NO = "NO";

/**
 * What a stored inbound WhatsApp row holds when a message has no words, and the placeholder for a contact card without a
 * name. The text is the one already stored in rows (it is not translated; stored rows keep parsing), so these are protocol,
 * not UI text.
 */
export const WA_INBOUND_MARKERS = Object.freeze({
  image: "[Gambar]",
  video: "[Video]",
  voice: "[Pesan suara]",
  sticker: "[Stiker]",
  /** The file name used when a document has none. */
  documentFallbackName: "file",
  /** The name used for a contact card that has none. */
  noName: "tanpa nama",
  document: (fileName: string): string => `[Dokumen: ${fileName}]`,
  /** `phones` is the already joined list ("+6281200000001, 0812..."), or "". */
  contact: (displayName: string, phones: string): string => `[Kontak: ${displayName || "tanpa nama"}${phones ? ` ${phones}` : ""}]`,
});

/**
 * Finds a contact card in a stored message; group 1 is its body (name and numbers). Case-insensitive, bounded (a body is at
 * most 160 characters, the gap after the colon at most 3), so a hostile text of repeated "[Kontak:" costs linear time.
 * The regex is global: use it with `matchAll` or `replace`, never `test`/`exec` on the shared object.
 */
export const CONTACT_CARD_RE = /\[Kontak:\s{0,3}([^\]]{0,160})\]/gi;
