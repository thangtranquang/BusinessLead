import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { Campaign, Lead } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LimitsService } from "../entitlements/limits.service";
import { AiClientService } from "../ai/ai-client.service";
import { KnowledgeService } from "../ai/knowledge.service";
import { StyleService } from "../ai/style.service";
import { checkReply, fallbackReply, judgeMessages, parseJudge, templateReply, type ReplyAction } from "./reply-plan";
import { outreachProblems } from "./outreach-check";
import { toWhatsapp } from "./whatsapp-format";
import { tidyWhatsappOutreach, neutralHonorific, neutralHonorificChat, removeEmoji, stripMarkdown } from "./plain-text";
import { detectOfferKind } from "../ai/chat-import/offer-kind";
import { buildDraftMessages, buildOutreachMessages, clip, DEFAULT_BUSINESS_TEXT, OUTPUT_NOTE, OUTREACH_VARIANTS, pickVariant, SECURITY_RULE, untrusted, type OutreachVariant } from "../ai/chat-import/style-prompt";
import type { StyleStats } from "../ai/chat-import/style-stats";
import { draftRisks } from "./draft-risk";
import { neutralGreeting, normalizeDraft } from "../ai/orthography";
import { briefForDraft, foreignVerticalWords } from "../marketing/brief-use";
import type { BriefContent } from "../marketing/brief-schema";
import { OPT_OUT_HINT } from "./opt-out";
import { lastOwnLine, ownLines } from "./thread";
import { LANGUAGE_LABEL, toOutputLanguage, type OutputLanguage } from "../common/language";
import { REPLY_MARKERS } from "../common/conversation-markers";
import { capThenNfc, escapeRegExp, fold, hasVietnameseMarks, lacksVietnameseDiacritics, nfc, sliceChars, wordRegex, wordRegexFromSource } from "../common/text";

export interface WrittenMessage {
  text: string;
  trace: { variant?: string; styled: boolean; examples: number; knowledge: string; model: string; latencyMs: number };
  /** Things in the draft a reviewer should double-check (links, prices, discounts...). Empty when nothing stands out. */
  risks: string[];
}

type LeadWithCampaign = Lead & { campaign: Pick<Campaign, "yourService" | "language"> };

/** Models sometimes leave template markers behind; a message with "[Nama Anda]" must never reach a customer. */
const PLACEHOLDER = /\[[^\]\n]{1,40}\]|\{\{[^}]+\}\}/;

/** The link line before the closing: one table per output language (FR-25.4, FR-49). */
export const LINK_LABEL: Readonly<Record<OutputLanguage, string>> = Object.freeze({ vietnamese: "Xem thêm", english: "More details" });

/** The closing the prompts ask for, per output language. Recognised closings below also include the legacy Indonesian one. */
export const CLOSINGS: Readonly<Record<OutputLanguage, readonly string[]>> = Object.freeze({
  vietnamese: Object.freeze(["Trân trọng"]),
  english: Object.freeze(["Best regards", "Regards", "Sincerely"]),
});
const LEGACY_CLOSINGS: readonly string[] = Object.freeze(["Salam"]);
const CLOSING_LINE = wordRegexFromSource(`(?:${[...CLOSINGS.vietnamese, ...CLOSINGS.english, ...LEGACY_CLOSINGS].map(escapeRegExp).join("|")})[,.]?`, "iu");

/**
 * Adds the owner's own link before the closing line (found within the last three lines, so a sender name after it is fine).
 * The model never writes URLs, so none can be invented. Linear: no pattern runs over the whole body.
 */
export function withLink(body: string, url: string, language: OutputLanguage): string {
  const line = `${LINK_LABEL[toOutputLanguage(language)]}: ${url}`;
  const text = nfc(body).trimEnd();
  const lines = text.split("\n");
  for (let k = lines.length - 1; k >= Math.max(1, lines.length - 3); k--) {
    if (CLOSING_LINE.test(lines[k].trim()) && lines[k].trim().length <= 20) {
      return `${lines.slice(0, k).join("\n").trimEnd()}\n\n${line}\n\n${lines.slice(k).join("\n").trim()}`;
    }
  }
  return `${text}\n\n${line}`;
}

/**
 * Replies are written in two parts: INTENT (what they meant, for the model's own reasoning) then REPLY. Only the reply is kept:
 * the LAST line-anchored "REPLY:" wins, so a line the model copied from the customer's text earlier cannot decide.
 */
export function pickReply(raw: string): string {
  const text = typeof raw === "string" ? raw : "";
  const re = new RegExp(`^[ \\t]{0,10}${REPLY_MARKERS.reply}[ \\t]{0,3}:[ \\t]{0,3}`, "gim");
  let last: RegExpExecArray | null = null;
  for (const m of text.matchAll(re)) last = m as RegExpExecArray;
  if (last) return text.slice(last.index + last[0].length);
  return text.replace(new RegExp(`^\\s{0,10}${REPLY_MARKERS.intent}\\s{0,3}:[^\\n]{0,2000}(\\r?\\n)?`, "i"), "");
}

const OWN_INTRO_VI = wordRegex(["em là", "tôi là", "chúng tôi", "bên em", "bên mình", "đến từ", "xin giới thiệu"], "iu");
const OWN_INTRO_EN = wordRegex(["I'm from", "I’m from", "I am from", "we're from", "we’re from", "we are from", "my name is", "I'm with", "I work for"], "iu");
const OWN_INTRO_LEGACY = wordRegex(["saya dari", "kami dari", "perkenalkan"], "iu");

/** True when one of OUR lines (`Me:`) in the history already says who we are. A customer line can never count (it is labelled `Them:`). */
export function alreadyIntroduced(history: string): boolean {
  return ownLines(history).some((l) => {
    const t = nfc(l);
    return OWN_INTRO_VI.test(t) || OWN_INTRO_EN.test(t) || OWN_INTRO_LEGACY.test(t);
  });
}

const QUERY_PREFIX: Readonly<Record<OutputLanguage, string>> = Object.freeze({ vietnamese: "khách hàng tiềm năng", english: "prospective customer" });

/** What to search the owner's examples for when drafting a first message. */
export function styleExampleQuery(o: { category?: string | null; yourService: string }, language: OutputLanguage): string {
  return `${QUERY_PREFIX[toOutputLanguage(language)]} ${o.category ?? ""} ${o.yourService}`.replace(/\s+/g, " ").trim();
}

const OFFERING: Readonly<Record<OutputLanguage, (offer: string, lead: string) => string>> = Object.freeze({
  vietnamese: (offer: string, lead: string) => `chào bán ${offer} cho ${lead}`,
  english: (offer: string, lead: string) => `offering ${offer} to ${lead}`,
});

/** The business description of the reply prompt. The scraped lead name and the offer are clipped; the prompt puts the whole in a data block. */
export function replyBusinessDescription(business: string, lead: { name: string; campaign: { yourService: string } } | null, language: OutputLanguage): string {
  const base = clip(business, 150);
  return lead ? `${base}, ${OFFERING[toOutputLanguage(language)](clip(lead.campaign.yourService, 200), clip(lead.name, 100))}` : base;
}

// ---- Email subject (FR-28) ------------------------------------------------------------------------------------------------

const SUBJECT_PREFIX = /^(?:chủ đề|tiêu đề|subject|subjek)[ \t]{0,3}:[ \t]{0,3}/iu;
const PROMO_VI = ["miễn phí", "giảm giá", "khuyến mãi", "khuyến mại", "ưu đãi", "chiết khấu", "quà tặng", "trúng thưởng"];
/** Promotional words per language. English has none in code (the prompt asks; English behaviour is unchanged). */
const PROMO_RULES: Readonly<Record<OutputLanguage, { plain: RegExp; folded: RegExp } | null>> = Object.freeze({
  vietnamese: Object.freeze({ plain: wordRegex(PROMO_VI, "iu"), folded: wordRegex(PROMO_VI.map(fold), "iu") }),
  english: null,
});
const SUBJECT_NOTE: Readonly<Record<OutputLanguage, string>> = Object.freeze({
  vietnamese: " Keep every Vietnamese diacritic; formal register (Quý khách, chúng tôi).",
  english: "",
});
const SUBJECT_MAX_REJECT = 90;
const SUBJECT_MAX = 60;

export function subjectMessages(body: string, language: OutputLanguage): { role: "system" | "user"; content: string }[] {
  const lang = toOutputLanguage(language);
  return [
    { role: "system", content: [
      `Write ONE subject line for the sales email below, in ${LANGUAGE_LABEL[lang]}.${SUBJECT_NOTE[lang]}`,
      "Rules: at most 60 characters, mention something specific from the email, no exclamation mark, no all-capital text, no emoji, no promotional words such as free or discount, no quotation marks.",
      SECURITY_RULE,
      "Write ONLY the subject.",
    ].join("\n") },
    { role: "user", content: `<data_email>\n${untrusted(body, 1500)}\n</data_email>` },
  ];
}

/**
 * Turns the model's answer into a subject, or throws ServiceUnavailableException (no regeneration loop). NFC first; rejected:
 * empty, a template placeholder, "!", all capitals, an emoji, a promotional word (Vietnamese), no diacritics (Vietnamese), more
 * than 90 code points. Above 60 code points it is cut by code point to 57 plus "...".
 */
export function cleanSubject(raw: string, language: OutputLanguage): string {
  const lang = toOutputLanguage(language);
  const fail = () => new ServiceUnavailableException("Could not write a safe subject");
  const first = capThenNfc(raw, 400).split(/\r\n|[\n\r]/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const stripped = first.replace(SUBJECT_PREFIX, "").replace(/^["“”'`]+|["“”'`]+$/g, "").trim();
  if (!stripped || PLACEHOLDER.test(stripped) || /[!！]/.test(stripped)) throw fail();
  if (Array.from(stripped).length > SUBJECT_MAX_REJECT) throw fail();
  if (/\p{Extended_Pictographic}/u.test(stripped)) throw fail();
  if (/\p{L}/u.test(stripped) && !/\p{Ll}/u.test(stripped) && stripped.length >= 3) throw fail();
  const promo = PROMO_RULES[lang];
  if (promo && (promo.plain.test(stripped) || (!hasVietnameseMarks(stripped) && promo.folded.test(fold(stripped))))) throw fail();
  if (lang === "vietnamese" && lacksVietnameseDiacritics(stripped)) throw fail();
  const subject = stripped.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
  return Array.from(subject).length > SUBJECT_MAX ? `${sliceChars(subject, 57).trimEnd()}...` : subject;
}

/** WhatsApp keeps its own formatting (*bold*, _italic_, lists, paragraphs); email is plain text, so Markdown symbols are removed there. */
function clean(raw: string, whatsapp = false): string {
  if (whatsapp) return toWhatsapp(raw.trim().replace(/^["“”']+|["“”']+$/g, ""));
  return stripMarkdown(raw).trim().replace(/^["“”']+|["“”']+$/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

@Injectable()
export class MessageWriterService {
  private readonly logger = new Logger(MessageWriterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClientService,
    private readonly knowledge: KnowledgeService,
    private readonly style: StyleService,
    private readonly limits: LimitsService,
  ) {}

  private async businessDescription(workspaceId: string, language: OutputLanguage) {
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
    const name = ws?.name ?? DEFAULT_BUSINESS_TEXT[language];
    return /^[\w-]+(\.[\w-]+)+$/.test(name) ? name.toLowerCase() : name; // a domain-style name is written as a domain
  }

  /** First-contact message, or follow-up number `followUp.number`, in the owner's voice when a style exists. */
  /** First-contact message, or a follow-up. Takes one draft from the plan allowance first and gives it back if writing fails. */
  async outreach(workspaceId: string, lead: LeadWithCampaign, followUp?: { number: number; of: number; previousMessage: string; daysSince: number }, channel: "whatsapp" | "email" = "whatsapp"): Promise<WrittenMessage> {
    const release = await this.limits.reserveDraft(workspaceId);
    try {
      return await this.writeOutreach(workspaceId, lead, followUp, channel);
    } catch (e) {
      await release();
      throw e;
    }
  }

  private async writeOutreach(workspaceId: string, lead: LeadWithCampaign, followUp?: { number: number; of: number; previousMessage: string; daysSince: number }, channel: "whatsapp" | "email" = "whatsapp"): Promise<WrittenMessage> {
    const ai = await this.ai.forWorkspace(workspaceId);
    if (!ai.enabled) throw new ServiceUnavailableException("AI provider is not configured");
    const started = Date.now();
    const language = toOutputLanguage(lead.campaign.language);
    const profile = await this.prisma.styleProfile.findUnique({ where: { workspaceId } });
    const stats = profile ? (profile.stats as unknown as StyleStats) : undefined;

    let examples: { incoming: string; reply: string; similarity: number }[] = [];
    if (profile) {
      try {
        examples = await this.style.retrieveExamples(workspaceId, profile, styleExampleQuery({ category: lead.category, yourService: lead.campaign.yourService }, language));
      } catch (e) {
        // Stats still apply; only the retrieved examples are skipped (e.g. embedding model changed).
        this.logger.warn(`Style examples skipped: ${(e as Error).message}`);
      }
    }
    // facts about THIS kind of business first; the offer's own long description would pull in facts about every other business
    let facts = await this.knowledge.search(workspaceId, `${lead.category ?? ""} ${lead.name}`.trim());
    if (facts.confidence === "none") facts = await this.knowledge.search(workspaceId, `${lead.campaign.yourService} ${lead.category ?? ""}`.trim());
    const analysis = lead.aiAnalysis as { recommendation?: string } | null;
    const briefRow = await this.prisma.marketingBrief.findUnique({ where: { workspaceId }, select: { summary: true, content: true } });
    const brief = briefRow ? briefForDraft(briefRow.summary, briefRow.content as unknown as BriefContent, lead) : undefined;

    const variant = followUp ? undefined : pickVariant(lead.id);
    const angles = (briefRow?.content as unknown as BriefContent | undefined)?.angles ?? [];
    const business = await this.businessDescription(workspaceId, language);
    const offerKind = detectOfferKind(briefRow?.summary, lead.campaign.yourService);
    const build = (avoid?: string[], note?: string) => buildOutreachMessages({
      businessDescription: business,
      offer: lead.campaign.yourService,
      language,
      lead: {
        name: lead.name, category: lead.category, address: lead.address, rating: lead.rating, reviewCount: lead.reviewCount,
        website: lead.website, hasWebsite: lead.hasWebsite, recommendation: analysis?.recommendation ?? null,
      },
      style: stats,
      examples: examples.map((e) => ({ incoming: e.incoming, reply: e.reply, at: new Date() })),
      knowledge: facts.confidence === "none" || (offerKind === "service" && !followUp) ? [] : facts.hits.map((h) => h.content),
      brief,
      followUp,
      channel,
      variant,
      avoid,
      offerKind,
      retryNote: note,
    });
    const normOpts = { language, names: [lead.name, business], whatsapp: channel === "whatsapp" };
    const tidy = (b: { text: string }) => ({ text: channel === "whatsapp" && !followUp ? tidyWhatsappOutreach(b.text, language) : b.text });
    let body = tidy(await this.generate(workspaceId, followUp ? "followup" : "outreach", `${lead.id}`, build(), facts.hits.map((h) => h.sourceId), facts.confidence, normOpts));
    // a draft that talks about another kind of business (a rental system for kebaya offered to a costume shop) gets up to two more tries
    const offerTexts = [briefRow?.summary, lead.campaign.yourService];
    const foreignIn = (text: string) => (followUp ? [] : foreignVerticalWords(text, lead, angles, offerTexts));
    const caseStudies = (briefRow?.content as unknown as BriefContent | undefined)?.proof?.customers ?? [];
    const check = (text: string) => ({ foreign: foreignIn(text), issues: followUp ? [] : outreachProblems(text, { language, service: offerKind === "service", category: lead.category, caseStudies }) });
    let c = check(body.text);
    const banned = new Set<string>();
    for (let retry = 0; retry < 2 && (c.foreign.length || c.issues.length); retry++) {
      c.foreign.forEach((w) => banned.add(w));
      body = tidy(await this.generate(workspaceId, "outreach", `${lead.id}`, build([...banned], c.issues.join("; ") || undefined), facts.hits.map((h) => h.sourceId), facts.confidence, normOpts));
      c = check(body.text);
    }
    const foreign = c.foreign;
    const hint = OPT_OUT_HINT[language];
    // Email carries an unsubscribe link in its footer instead of a "reply STOP" line.
    let emailText = channel === "email" ? neutralHonorific(body.text, language) : body.text;
    if (channel === "email" && !followUp) {
      const acct = await this.prisma.emailAccount.findUnique({ where: { workspaceId }, select: { ctaUrl: true } });
      if (acct?.ctaUrl) emailText = withLink(body.text, acct.ctaUrl, language);
    }
    return {
      text: channel === "email" ? emailText : `${body.text}\n\n${hint}`,
      risks: [...draftRisks(body.text, facts.hits.map((h) => h.content), language), ...(foreign.length ? ["other-business"] : []), ...(c.issues.length ? ["style"] : [])],
      trace: { variant, styled: !!stats, examples: examples.length, knowledge: facts.confidence, model: ai.chatModel, latencyMs: Date.now() - started },
    };
  }

  /** One reusable message for a kind of business (not one lead). Takes one draft from the plan allowance. */
  async generic(workspaceId: string, o: { segment: string; language: OutputLanguage; channel: "whatsapp" | "email"; variant?: OutreachVariant; offer?: string }): Promise<{ text: string; risks: string[] }> {
    const language = toOutputLanguage(o.language);
    const release = await this.limits.reserveDraft(workspaceId);
    try {
      const ai = await this.ai.forWorkspace(workspaceId);
      if (!ai.enabled) throw new ServiceUnavailableException("AI provider is not configured");
      const profile = await this.prisma.styleProfile.findUnique({ where: { workspaceId } });
      const stats = profile ? (profile.stats as unknown as StyleStats) : undefined;
      const facts = await this.knowledge.search(workspaceId, `${o.offer ?? ""} ${o.segment}`.trim());
      const briefRow = await this.prisma.marketingBrief.findUnique({ where: { workspaceId }, select: { summary: true, content: true } });
      const brief = briefRow ? briefForDraft(briefRow.summary, briefRow.content as unknown as BriefContent, { name: o.segment, category: o.segment }) : undefined;
      const business = await this.businessDescription(workspaceId, language);
      // a service gets a different shape on each call; a product template has no business facts for the "observation" opening
      const kind = detectOfferKind(briefRow?.summary, o.offer);
      const picked = o.variant ?? OUTREACH_VARIANTS[Math.floor(Math.random() * OUTREACH_VARIANTS.length)];
      const genericVariant = kind === "service" || picked !== "observation" ? picked : "pain";
      const build = (note?: string) => buildOutreachMessages({
        businessDescription: business,
        offer: o.offer?.trim() || briefRow?.summary || business,
        language,
        lead: { name: o.segment, category: o.segment },
        style: stats,
        knowledge: facts.confidence === "none" || kind === "service" ? [] : facts.hits.map((h) => h.content),
        brief,
        channel: o.channel,
        variant: genericVariant,
        generic: true,
        offerKind: kind,
        retryNote: note,
      });
      const normOpts = { language, names: [business], whatsapp: o.channel === "whatsapp" };
      const tidy = (b: { text: string }) => ({ text: o.channel === "whatsapp" ? tidyWhatsappOutreach(b.text, language) : b.text });
      let body = tidy(await this.generate(workspaceId, "outreach", `template:${o.segment}`, build(), facts.hits.map((h) => h.sourceId), facts.confidence, normOpts));
      const caseStudies = (briefRow?.content as unknown as BriefContent | undefined)?.proof?.customers ?? [];
      let issues = outreachProblems(body.text, { language, service: kind === "service", category: o.segment, caseStudies });
      for (let retry = 0; retry < 2 && issues.length; retry++) {
        body = tidy(await this.generate(workspaceId, "outreach", `template:${o.segment}`, build(issues.join("; ")), facts.hits.map((h) => h.sourceId), facts.confidence, normOpts));
        issues = outreachProblems(body.text, { language, service: kind === "service", category: o.segment, caseStudies });
      }
      const text = o.channel === "email" ? neutralHonorific(body.text, language) : body.text;
      return { text, risks: [...draftRisks(text, facts.hits.map((h) => h.content), language), ...(issues.length ? ["style"] : [])] };
    } catch (e) {
      await release();
      throw e;
    }
  }

  /** Subject line for an email body: specific, plain, no clickbait. Throws when the model cannot produce a usable one. */
  async subjectFor(workspaceId: string, body: string, language: OutputLanguage): Promise<string> {
    const lang = toOutputLanguage(language);
    const ai = await this.ai.forWorkspace(workspaceId);
    return cleanSubject(await ai.chat(subjectMessages(body, lang)), lang);
  }

  /** Reply to something a known lead just wrote. `history` is the recent thread, oldest first. */
  /** Reply to a known lead. Same allowance rule as `outreach`. */
  async reply(workspaceId: string, lead: LeadWithCampaign | null, incoming: string, history: string, action: ReplyAction = "answer"): Promise<WrittenMessage | null> {
    if (action === "none") return null;
    const language = toOutputLanguage(lead?.campaign.language);
    // fixed wording for thanks and goodbyes: no model, no allowance used, nothing to go wrong
    const fixed = templateReply(action, language);
    if (fixed) return { text: fixed, risks: [], trace: { styled: false, examples: 0, knowledge: "none", model: "template", latencyMs: 0 } };
    const release = await this.limits.reserveDraft(workspaceId);
    try {
      return await this.writeReply(workspaceId, lead, incoming, history, action === "next_step" ? "next_step" : "answer");
    } catch (e) {
      await release();
      throw e;
    }
  }

  private async writeReply(workspaceId: string, lead: LeadWithCampaign | null, incoming: string, history: string, action: "answer" | "next_step"): Promise<WrittenMessage> {
    const ai = await this.ai.forWorkspace(workspaceId);
    if (!ai.enabled) throw new ServiceUnavailableException("AI provider is not configured");
    const started = Date.now();
    const profile = await this.prisma.styleProfile.findUnique({ where: { workspaceId } });
    if (!profile) throw new BadRequestException("No style profile yet");
    // "boleh" or "iya" alone say nothing about the topic: search with what we last said as well
    const lastMine = lastOwnLine(history);
    const topicQuery = `${lastMine.slice(0, 300)} ${incoming}`.trim();
    let examples: { incoming: string; reply: string; similarity: number }[] = [];
    try {
      examples = await this.style.retrieveExamples(workspaceId, profile, topicQuery);
    } catch (e) {
      this.logger.warn(`Style examples skipped: ${(e as Error).message}`);
    }
    const language = toOutputLanguage(lead?.campaign.language);
    const facts = await this.knowledge.search(workspaceId, topicQuery);
    const knownFacts = facts.confidence === "none" ? [] : facts.hits.map((h) => h.content);
    const introduced = alreadyIntroduced(history);
    const briefSummary = (await this.prisma.marketingBrief.findUnique({ where: { workspaceId }, select: { summary: true } }))?.summary;
    const offerKind = detectOfferKind(briefSummary, lead?.campaign.yourService);
    const names = [...(lead ? [lead.name] : []), await this.businessDescription(workspaceId, language)];
    const build = (retryNote?: string) => buildDraftMessages({
      businessDescription: replyBusinessDescription(names[names.length - 1], lead, language),
      language,
      style: profile.stats as unknown as StyleStats,
      examples: examples.map((e) => ({ incoming: e.incoming, reply: e.reply, at: new Date() })),
      knowledge: knownFacts,
      incoming,
      history,
      prospect: !!lead,
      action,
      alreadyIntroduced: introduced,
      retryNote,
      reason: true,
      offerKind,
    });
    let text = "";
    let problems: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const body = await this.generate(workspaceId, "reply", incoming, build(attempt ? problems.join(", ") : undefined), facts.hits.map((h) => h.sourceId), facts.confidence, { language: language === "english" ? "english" : "auto", names, whatsapp: true }, pickReply);
      text = neutralHonorificChat(lead ? removeEmoji(body.text) : body.text, language);
      problems = checkReply(text, { alreadyIntroduced: introduced, knownText: [history, ...knownFacts].join("\n"), language });
      // a second reading catches what the rules cannot: a cut-off sentence, an answer to another question, an invented price
      if (problems.length === 0) {
        const verdict = await this.judgeReply(workspaceId, { history, incoming, draft: text, facts: knownFacts, language });
        if (verdict) problems = [`reviewer: ${verdict}`];
      }
      if (problems.length === 0) break;
    }
    const risks = draftRisks(text, knownFacts, language);
    // two failed attempts: show safe wording instead of a reply that makes no sense, and say so
    if (problems.length > 0) { text = fallbackReply(action, language, offerKind); risks.push("fallback"); }
    return { text, risks, trace: { styled: true, examples: examples.length, knowledge: facts.confidence, model: ai.chatModel, latencyMs: Date.now() - started } };
  }

  /** null = the draft passes (or the check itself could not run: it only ever adds a retry, never blocks). */
  private async judgeReply(workspaceId: string, o: { history: string; incoming: string; draft: string; facts: string[]; language: OutputLanguage }): Promise<string | null> {
    try {
      const ai = await this.ai.forWorkspace(workspaceId);
      return parseJudge(await ai.chat(judgeMessages(o), { temperature: 0 }));
    } catch (e) {
      this.logger.warn(`Reply check skipped: ${(e as Error).message}`);
      return null;
    }
  }

  private async generate(workspaceId: string, kind: string, input: string, messages: { role: "system" | "user"; content: string }[], sourceIds: string[], confidence: string, norm: { language: OutputLanguage | "auto"; names: string[]; whatsapp?: boolean }, pick: (raw: string) => string = (raw) => raw) {
    const ai = await this.ai.forWorkspace(workspaceId);
    const started = Date.now();
    let output = "";
    let error: string | undefined;
    try {
      output = normalizeDraft(neutralGreeting(clean(pick(capThenNfc(await ai.chat(messages, kind === "reply" ? undefined : { temperature: 0.9 }), 20_000)), norm.whatsapp)), norm);
      if (!output) error = "empty output";
      else if (PLACEHOLDER.test(output)) error = "output contains a template placeholder";
    } catch (e) {
      this.logger.error(`${kind} generation failed`, e as Error);
      error = "generation failed";
    }
    await this.prisma.aiRun.create({
      data: { workspaceId, kind, model: ai.chatModel, input: input.slice(0, 2000), output: output || null, sourceIds, confidence, latencyMs: Date.now() - started, error },
    });
    if (error) throw new ServiceUnavailableException(`Could not write a safe draft (${error})`);
    return { text: output };
  }
}
