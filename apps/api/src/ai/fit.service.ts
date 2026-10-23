import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AiClientService } from "./ai-client.service";
import { OUTPUT_NOTE, SECURITY_RULE, clip } from "./chat-import/style-prompt";
import { capThenNfc, lacksVietnameseDiacritics } from "../common/text";
import type { FitLevel, FitVerdict } from "./lead-intelligence.service";
import { LANGUAGE_LABEL, toOutputLanguage, type OutputLanguage } from "../common/language";

const NL = String.fromCharCode(10);
const BATCH = 20;
const MAX_LEADS = 200;

export interface FitCandidate {
  name: string;
  category?: string;
}

/** One line per lead: the business name and its real Google Maps category are both evidence. One English instruction set (FR-21). */
export function buildFitMessages(input: { offer: string; targets: string; language: OutputLanguage; leads: FitCandidate[] }) {
  const language = toOutputLanguage(input.language);
  const lang = LANGUAGE_LABEL[language];
  return [
    {
      role: "system" as const,
      content: [
        "You are a sales analyst. For each business below (its name and Google Maps category), judge how likely it is to need or buy the user's offer.",
        "- high: clearly a main user of the offer. medium: may need it. low: rarely or not relevant.",
        "- The name and the category are both evidence. The category can be too general (e.g. Camera Shop) and the name can show the real activity (e.g. Camera Rental); combine both.",
        "- Base the judgement ONLY on the offer, the targets, the name and the category given. Do not invent facts about the business.",
        "- If the business name contains a word showing the same activity as the offer's target (e.g. rental, hire), rate at least medium, and high when that activity is clearly the core of the business. Do not lower the rating just because the Maps category is general.",
        `- reason: one short sentence in ${lang} that names the evidence (at most 110 characters).`,
        ...(OUTPUT_NOTE[language] ? [OUTPUT_NOTE[language]] : []),
        SECURITY_RULE,
        'Reply ONLY with JSON: {"results":[{"n":1,"fit":"high|medium|low","reason":"..."}]} with one entry per number.',
      ].join(NL),
    },
    {
      role: "user" as const,
      content: [
        `Offer: ${clip(input.offer, 700)}`,
        input.targets ? `Target customers according to the brief: ${clip(input.targets, 700)}` : "",
        `<data_bisnis>${NL}${input.leads.map((l, i) => `${i + 1}. ${clip(l.name, 100)} | ${clip(l.category ?? "", 80) || "(category unknown)"}`).join(NL)}${NL}</data_bisnis>`,
      ].filter(Boolean).join(NL + NL),
    },
  ];
}

export interface ParsedFit {
  verdicts: (FitVerdict | undefined)[];
  /** How many Vietnamese reasons were dropped for lacking diacritics (the batch is asked again once). */
  rejected: number;
}

/**
 * Reads the model's answer. Every reason is NFC straight away; for Vietnamese a reason without diacritics is rejected (the verdict
 * keeps its fit level but loses the reason) and counted, so the caller can ask once more.
 */
export function parseFitDetailed(raw: string, count: number, language: OutputLanguage = "english"): ParsedFit {
  const out: (FitVerdict | undefined)[] = Array.from({ length: count }, () => undefined);
  let rejected = 0;
  let data: unknown;
  try {
    const t = capThenNfc(raw, 200_000).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    data = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
  } catch {
    return { verdicts: out, rejected };
  }
  const results = (data as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return { verdicts: out, rejected };
  for (const r of results as { n?: unknown; fit?: unknown; reason?: unknown }[]) {
    if (!r || typeof r !== "object") continue;
    const n = typeof r.n === "number" ? r.n : Number(r.n);
    const fit = typeof r.fit === "string" ? (r.fit.toLowerCase() as FitLevel) : undefined;
    if (Number.isInteger(n) && n >= 1 && n <= count && fit && ["high", "medium", "low"].includes(fit)) {
      let reason = typeof r.reason === "string" ? clip(r.reason, 140) : "";
      if (reason && toOutputLanguage(language) === "vietnamese" && lacksVietnameseDiacritics(reason)) {
        reason = "";
        rejected++;
      }
      out[n - 1] = { fit, reason };
    }
  }
  return { verdicts: out, rejected };
}

/** Returns one verdict (or undefined) per input lead, in the same order. */
export function parseFit(raw: string, count: number, language: OutputLanguage = "english"): (FitVerdict | undefined)[] {
  return parseFitDetailed(raw, count, language).verdicts;
}

/** Judges, per scraped business, how well it fits the offer. Needs an AI provider; without one nothing is assumed. */
@Injectable()
export class FitService {
  private readonly logger = new Logger(FitService.name);

  constructor(private readonly prisma: PrismaService, private readonly ai: AiClientService) {}

  async assess(workspaceId: string, leads: FitCandidate[], offer: string, language: OutputLanguage): Promise<(FitVerdict | undefined)[]> {
    const none = leads.map(() => undefined);
    const ai = await this.ai.forWorkspace(workspaceId);
    if (!ai.enabled || leads.length === 0 || !offer.trim()) return none;
    const brief = await this.prisma.marketingBrief.findUnique({ where: { workspaceId }, select: { summary: true, content: true } });
    const content = brief?.content as { audience?: { targetCustomers?: string }; angles?: { segment?: string }[] } | null;
    const targets = [content?.audience?.targetCustomers, ...(content?.angles ?? []).map((a) => a.segment)].filter(Boolean).join("; ");
    const out = [...none];
    const capped = Math.min(leads.length, MAX_LEADS);
    for (let from = 0; from < capped; from += BATCH) {
      const slice = leads.slice(from, Math.min(from + BATCH, capped));
      try {
        const ask = () => ai.chat(buildFitMessages({ offer: brief?.summary || offer, targets, language, leads: slice }), { json: true, temperature: 0.1 });
        let parsed = parseFitDetailed(await ask(), slice.length, language);
        // Vietnamese reasons without diacritics are a defect: ask once more, then keep the verdict without the reason
        if (parsed.rejected > 0) parsed = parseFitDetailed(await ask(), slice.length, language);
        parsed.verdicts.forEach((v, i) => { out[from + i] = v; });
      } catch (e) {
        this.logger.warn(`Fit assessment skipped for a batch: ${(e as Error).message}`);
      }
    }
    return out;
  }
}
