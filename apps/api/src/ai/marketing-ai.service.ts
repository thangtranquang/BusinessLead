import { Injectable, Logger } from "@nestjs/common";
import { AiClientService, WorkspaceAi } from "./ai-client.service";
import { LANGUAGE_LABEL, toOutputLanguage } from "../common/language";
import { nfc } from "../common/text";
import { OUTPUT_NOTE, SECURITY_RULE, clip } from "./chat-import/style-prompt";

const NL = String.fromCharCode(10);

export interface GenerateContentInput {
  businessName: string;
  address?: string;
  industry: string;
  rating?: string;
  hasWebsite?: boolean;
  yourService: string;
  contentStyle: string;
  language: string;
  score: number;
}

/**
 * WhatsApp and Instagram messages are no longer written here: they come from the draft engine
 * (owner's voice + knowledge base) and wait for approval in the Outbox. `source` marks content written by a model.
 */
export interface MarketingContent {
  email: { subject: string; body: string };
  linkedin: { connectionNote: string };
  coldCall: { opening: string };
  source: "llm";
}

const STYLE_CUES: Readonly<Record<string, string>> = Object.freeze({
  professional: "formal, professional, direct",
  friendly: "warm, friendly, approachable",
  casual: "casual, relaxed, conversational",
  balanced: "balanced, friendly yet professional",
});

/** The longest each field may be; a longer string is a malformed answer, not something to cut and store. */
const MAX_LEN = Object.freeze({ subject: 200, body: 4_000, connectionNote: 600, opening: 1_500 });

/** A string field of the model's JSON, NFC, trimmed, within its limit; anything else is a malformed answer. */
function field(value: unknown, max: number): string {
  if (typeof value !== "string") throw new TypeError("lead notes: a field is not text");
  const text = nfc(value).trim();
  if (!text || text.length > max) throw new RangeError("lead notes: a field is empty or too long");
  return text;
}

/** Checks the shape and the lengths of the parsed JSON before it is stored. Throws without echoing the model's text. */
export function validateContent(parsed: unknown): Omit<MarketingContent, "source"> {
  const p = parsed as { email?: { subject?: unknown; body?: unknown }; linkedin?: { connectionNote?: unknown }; coldCall?: { opening?: unknown } } | null;
  if (!p || typeof p !== "object" || !p.email || !p.linkedin || !p.coldCall) throw new TypeError("lead notes: wrong shape");
  return {
    email: { subject: field(p.email.subject, MAX_LEN.subject), body: field(p.email.body, MAX_LEN.body) },
    linkedin: { connectionNote: field(p.linkedin.connectionNote, MAX_LEN.connectionNote) },
    coldCall: { opening: field(p.coldCall.opening, MAX_LEN.opening) },
  };
}

@Injectable()
export class MarketingAiService {
  private readonly logger = new Logger(MarketingAiService.name);
  constructor(private readonly aiClient: AiClientService) {}

  /** Returns null when no model is available or it fails: we never store canned text that looks like a real draft. */
  async generateContent(workspaceId: string, input: GenerateContentInput): Promise<MarketingContent | null> {
    const ai = await this.aiClient.forWorkspace(workspaceId);
    if (!ai.enabled) return null;
    try {
      return await this.callModel(ai, input);
    } catch (err) {
      // never the error message: a JSON parse error quotes the model's raw output
      this.logger.warn(`Content generation failed (${err instanceof Error ? err.name : "error"})`);
      return null;
    }
  }

  /** The prompt: instructions in the system message, everything scraped inside one `<data_lead>` block through `clip()`. */
  buildMessages(input: GenerateContentInput): { role: "system" | "user"; content: string }[] {
    const language = toOutputLanguage(input.language); // the job or row may carry a legacy value
    const cue = typeof input.contentStyle === "string" && Object.prototype.hasOwnProperty.call(STYLE_CUES, input.contentStyle) ? STYLE_CUES[input.contentStyle] : "balanced";
    const system = [
      "Generate personalized outreach content for the business lead described in the <data_lead> block of the user message.",
      `Tone: ${cue}`,
      `Language: ${LANGUAGE_LABEL[language]}`,
      ...(OUTPUT_NOTE[language] ? [OUTPUT_NOTE[language]] : []),
      "Generate: email (subject + body, 100-150 words), LinkedIn connection note (under 280 chars), cold call opening (2-3 sentences).",
      "Be specific to this business. Mention their name, rating, location.",
      SECURITY_RULE,
      "Respond ONLY with valid JSON:",
      '{ "email": { "subject": "...", "body": "..." }, "linkedin": { "connectionNote": "..." }, "coldCall": { "opening": "..." } }',
    ].join(NL);
    const user = [
      "<data_lead>",
      `Business: ${clip(input.businessName, 200)}`,
      `Industry: ${clip(input.industry, 200)}`,
      `Address: ${clip(input.address, 300) || "unknown"}`,
      `Rating: ${clip(input.rating, 20) || "unknown"} stars`,
      `Has Website: ${input.hasWebsite ? "yes" : "no"}`,
      `AI Score: ${Number.isFinite(input.score) ? Math.round(input.score) : 0}/100`,
      "</data_lead>",
      "<data_offer>",
      `Your Service/Product: ${clip(input.yourService, 700)}`,
      "</data_offer>",
    ].join(NL);
    return [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
  }

  private async callModel(ai: WorkspaceAi, input: GenerateContentInput): Promise<MarketingContent> {
    const reply = await ai.chat(this.buildMessages(input), { json: true, temperature: 0.7 });
    return { ...validateContent(JSON.parse(reply)), source: "llm" };
  }
}
