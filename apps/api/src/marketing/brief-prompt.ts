import { OUTPUT_RULES, SECURITY_RULE, clip, untrusted } from "../ai/chat-import/style-prompt";
import { LANGUAGE_LABEL, toOutputLanguage, type OutputLanguage } from "../common/language";
import { nfc } from "../common/text";

const NL = String.fromCharCode(10);

export interface BriefSource {
  title: string;
  url?: string | null;
  text: string;
}

export interface BriefPromptInput {
  language: OutputLanguage;
  /** What the user already wrote about the offer, if anything. Treated as rough notes, not as verified fact. */
  notes?: string;
  industry?: string;
  location?: string;
  sources: BriefSource[];
  /** Total characters of source text to include. */
  budget?: number;
}

/** A double quote would close the attribute value of the source tag. */
const attr = (text: string, max: number) => clip(text, max).replace(/"/g, "");

/** Sources are cut evenly so one long page cannot crowd out the others. The text is NFC and loses angle brackets and look-alikes. */
export function sourceDigest(sources: BriefSource[], budget = 36_000): string {
  const each = Math.max(3_000, Math.floor(budget / Math.max(1, sources.length)));
  return sources
    .map((s, i) => `<data_sumber nomor="${i + 1}" judul="${attr(s.title, 120)}"${s.url ? ` url="${attr(s.url, 200)}"` : ""}>${NL}${untrusted(nfc(s.text), each)}${NL}</data_sumber>`)
    .join(NL + NL);
}

export type BriefPass = "positioning" | "evidence" | "outreach";

/** The three passes keep each JSON small enough for modest models to get right (one big object invites misplaced keys). */
const PASS_SCHEMA: Record<BriefPass, { keys: string; template: unknown; rules: string[] }> = {
  positioning: {
    keys: "summary, overview, audience, problems, differentiation",
    template: {
      summary: "",
      overview: { oneLiner: "", whatItDoes: "", category: "", businessModel: "" },
      audience: { targetCustomers: "", decisionMakers: "", primaryUseCase: "", jobsToBeDone: [""] },
      problems: { coreProblem: "", whyAlternativesFallShort: [""], cost: "" },
      differentiation: { keyDifferentiators: [""], whyBetter: "" },
      gaps: ["[NEED: ...]"],
    },
    rules: [
      "- Positioning first: decide the category where customers look for you, what sets you apart from the alternatives (including doing it themselves or using a spreadsheet), the value customers get, and the best-fitting customers.",
      "- `summary`: a description of the service or product in 2 to 3 sentences (at most 450 characters), from the owner's point of view (\"We build ...\"): what is sold, to whom, and the main result named in the sources. No numeric promises unless they are in the sources.",
    ],
  },
  evidence: {
    keys: "objections, proof, offer, voice",
    template: {
      objections: [{ objection: "", response: "" }],
      proof: { metrics: [""], customers: [""], testimonials: [""] },
      offer: { pricing: "", callToAction: "" },
      voice: { tone: "", wordsToUse: [""], wordsToAvoid: [""] },
      gaps: ["[NEED: ...]"],
    },
    rules: [
      "- `objections`: an array of objects, one per objection (objection and response). The objections most likely to come from prospects, with an honest answer based on the sources. If the sources do not answer one, leave the answer empty and note it in gaps.",
      "- `proof`: only numbers, customer names and testimonials that are written in the sources, copied as they are. If there are none, leave it empty.",
      "- `offer`: price and call to action only when written in the sources.",
      "- `voice`: the writing tone of the sources themselves, and the words the sources use or avoid.",
    ],
  },
  outreach: {
    keys: "angles, campaign",
    template: {
      angles: [{ segment: "", pain: "", hook: "", benefit: "" }],
      campaign: { name: "", target: "", location: "", searchQueries: [""], contentStyle: "balanced", language: "vietnamese|english" },
      gaps: ["[NEED: ...]"],
    },
    rules: [
      "- `angles`: 2 to 4 outreach angles, one per CUSTOMER SEGMENT that is a concrete kind of business findable on Google Maps (not an abstract category such as \"corporate\" or \"startup\"). Fields: segment, pain (the problem that segment probably has, a reasonable hypothesis is fine), hook (one opening sentence based on a fact from the sources), benefit (a concrete result for that segment). These are hypotheses to test, not facts.",
      "- `campaign`: suggested fields for a campaign that searches Google Maps for prospective CUSTOMERS, for the user to correct. CUSTOMERS are businesses that would BUY the offer, NOT businesses like the user's and not competitors. Example: the user sells rental management software, so the customers are \"camera rental\", \"car rental\", \"party equipment rental\" (not \"software house\"). The user sells wedding photography, so the customers are \"wedding organizer\", \"wedding venue\", \"bridal boutique\".",
      "  `target` = the kind of customer business to search for, in Google Maps terms. NEVER a job title (manager, director, owner), the user's own service or product (automation, software, system, chatbot, services), or a sentence; only the name of a kind of business such as \"phone shop\", \"dental clinic\", \"car rental\". `searchQueries` = 3 to 6 search keywords that find those customer businesses, without a city name. `location` = a city or region ONLY when the sources or notes name a service area; otherwise leave it empty. `name` = a short campaign name. `contentStyle` = professional, friendly, balanced or casual, matching the brand voice. `language` = vietnamese or english, matching the target market.",
    ],
  },
};

/**
 * Builds the prompt for one pass of the Marketing Brief. The principles are those of the installed marketing skills
 * (product-marketing, copywriting): positioning first, customer language, specificity, no invented proof.
 * `context` carries the result of the earlier passes into the later ones. One English instruction set; the output language
 * enters only as its label plus the per-language block (FR-21).
 */
export function buildBriefMessages(input: BriefPromptInput, pass: BriefPass = "positioning", context = ""): { role: "system" | "user"; content: string }[] {
  const language = toOutputLanguage(input.language);
  const lang = LANGUAGE_LABEL[language];
  const spec = PASS_SCHEMA[pass];
  const system = [
    `You are a senior product marketer. Your job is to write part of a Marketing Brief (the marketing context of a product) from the user's own source material: the parts ${spec.keys}. Every later marketing module (outreach messages, content, ads) will read this brief, so it must be accurate, specific and honest.`,
    "",
    "PRINCIPLES:",
    "- Customer language over company language. Benefits over features. Specific over generic: a sentence that could be pasted unchanged onto a competitor's site must be rewritten.",
    "- ONLY facts from the sources. Never invent customers, numbers, prices, testimonials, competitors, awards or result claims. If the information is missing, leave the field empty and write it in `gaps` as \"[NEED: what is needed]\".",
    "- Do not write like an AI: no \"not X, but Y\" contrasts, no lists of negations, no cliché openers, no words like solution, innovative, leading, seamless, powerful, and no long dashes.",
    ...spec.rules,
    `- Write all the content in ${lang}.`,
    ...(OUTPUT_RULES[language] ? [OUTPUT_RULES[language]] : []),
    "",
    SECURITY_RULE,
    "",
    `Reply ONLY with one flat JSON object of exactly this shape: the top-level keys are only ${spec.keys}, and gaps. Every key is required; use "" or [] when there is no data.`,
    JSON.stringify(spec.template),
  ].join(NL);

  const user = [
    input.industry || input.location ? `Target market: ${[input.industry, input.location].filter(Boolean).map((x) => clip(x, 200)).join(", ")}` : "",
    input.notes?.trim() ? `Rough notes from the owner (not verified, treat as hints, not facts):${NL}${clip(input.notes, 1500)}` : "",
    context ? `Result of the earlier passes (already checked, use as context):${NL}${clip(context, 3000)}` : "",
    input.sources.length ? `Source material:${NL}${sourceDigest(input.sources, input.budget)}` : "There is no source material. Write as far as the notes above allow and put everything that must be completed in `gaps`.",
    "Write the part now.",
  ].filter(Boolean).join(NL + NL);

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
