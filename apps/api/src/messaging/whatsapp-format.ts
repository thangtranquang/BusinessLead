/**
 * WhatsApp has its own formatting: *bold*, _italic_, ~strike~, `mono`, "- " lists, "> " quotes, and blank lines between paragraphs.
 * Models write Markdown (**bold**, # headings, * bullets) or leave symbols unbalanced, which WhatsApp shows literally.
 * This turns what the model wrote into clean WhatsApp text: valid spans kept, Markdown converted, stray symbols removed,
 * emphasis kept sparing, and paragraphs spaced so the message reads well on a phone.
 */
import { wordRegex } from "../common/text";

// Opening words of a first message. Unicode word boundaries (wordRegex), so "Xin chào" and "chào" are whole words whatever
// the form of the diacritics; the Indonesian words are legacy tolerance for text written before the language change.
const GREETING_WORDS = wordRegex(["halo", "hai", "hello", "selamat", "xin chào", "xin chao", "chào", "chao", "kính gửi", "kinh gui"], "iu");
const VIETNAMESE_GREETING = wordRegex(["xin chào", "xin chao", "chào", "chao", "kính gửi", "kinh gui"], "iu");
function startsWithGreeting(sentence: string): boolean {
  return GREETING_WORDS.exec(sentence.normalize("NFC"))?.index === 0;
}

const MAX_BOLD = 4;
const MAX_BOLD_LENGTH = 60;
const MARK = "\u0001";

export function toWhatsapp(input: string): string {
  let text = input.replace(/\r\n?/g, "\n");

  // Markdown -> WhatsApp
  text = text
    .replace(/^#{1,6}\s+(.+?)\s*:?\s*$/gm, "*$1*")
    .replace(/\*\*([^*\n]+?)\*\*/g, "*$1*")
    .replace(/__([^_\n]+?)__/g, "_$1_")
    .replace(/~~([^~\n]+?)~~/g, "~$1~")
    .replace(/^[ \t]*[*•·▪‣]\s+/gm, "- ")
    .replace(/^[ \t]*-\s+/gm, "- ")
    .replace(/^[ \t]*(\d{1,2})[.)]\s+/gm, "$1. ");

  // A span only counts when the symbols hug the text: "* word *" is not bold. Protect valid spans, drop the rest.
  const spans: string[] = [];
  let bold = 0;
  text = text.replace(/(^|[\s(])([*_~])([^\s*_~](?:[^*_~\n]*?[^\s*_~])?)\2(?=[\s).,!?:;]|$)/gm, (_m, pre: string, mark: string, body: string) => {
    if (mark === "*") {
      bold++;
      if (bold > MAX_BOLD || body.length > MAX_BOLD_LENGTH) return `${pre}${body}`; // emphasis everywhere is emphasis nowhere
    }
    spans.push(`${mark}${body}${mark}`);
    return `${pre}${MARK}${spans.length - 1}${MARK}`;
  });
  text = text.replace(/\*+/g, "").replace(/~+/g, "").replace(/(^|\s)_+|_+(?=\s|$)/g, "$1");
  text = text.replace(new RegExp(`${MARK}(\\d+)${MARK}`, "g"), (_m, i: string) => spans[Number(i)]);

  // spacing
  text = text.replace(/[ \t]+$/gm, "").replace(/(\S)[ \t]{2,}/g, "$1 ").replace(/\n{3,}/g, "\n\n").trim();
  const lines = text.split("\n");
  const isList = (l: string) => /^(- |\d{1,2}\. )/.test(l);
  const out: string[] = [];
  lines.forEach((line, i) => {
    const prev = out[out.length - 1];
    // a list gets a blank line before and after it
    if (prev !== undefined && prev !== "" && line !== "" && isList(line) !== isList(prev)) out.push("");
    out.push(line);
    void i;
  });
  text = out.join("\n");

  // one unbroken block of four or more sentences: greeting, body and closing line each get their own paragraph
  if (!text.includes("\n")) {
    const sentences = text.split(/(?<=[.!?])\s+/);
    if (sentences.length >= 4) {
      let greeting = "";
      if (startsWithGreeting(sentences[0])) {
        greeting = sentences.shift()!;
        // a Vietnamese greeting is followed by a comma, not a full stop ("Xin chào anh/chị, em là ..."): only up to the comma is the greeting
        const comma = greeting.indexOf(",");
        if (comma > 0 && comma <= 40 && comma < greeting.length - 1 && VIETNAMESE_GREETING.test(greeting)) {
          const rest = greeting.slice(comma + 1).trim();
          greeting = greeting.slice(0, comma + 1);
          sentences.unshift(rest.charAt(0).toUpperCase() + rest.slice(1));
        }
      }
      const closing = sentences.length >= 3 ? sentences.pop()! : "";
      text = [greeting, sentences.join(" "), closing].filter(Boolean).join("\n\n");
    }
  }
  return text;
}
