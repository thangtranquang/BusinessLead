import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AttachmentService } from "./attachment.service";
import { CAPTION_LIMIT } from "./attachment-file";
import { maybePreview } from "./link-preview";
import { isValidEmail } from "./email-address";
import { MessageWriterService } from "./message-writer.service";
import { MAX_BODY, MAX_EMAIL_BODY } from "./messaging.service";
import { OPT_OUT_HINT } from "./opt-out";
import { outputLanguageOrDefault, type OutputLanguage } from "../common/language";
import { normalizePhone, normalizePhoneFor } from "./phone";
import { normalizeMarket, phoneKind, type Market } from "../common/market";
import type { OutreachVariant } from "../ai/chat-import/style-prompt";

export const MAX_TEMPLATE_LEADS = 500;

export type UnreachableReason = "landline" | "service";

/** Why a WhatsApp number cannot be messaged (Vietnamese landline or 1800/1900 service number), or null. Never changes email. */
export function whatsappBlock(e164: string, market: Market): UnreachableReason | null {
  const kind = phoneKind(e164, market);
  return kind === "landline" || kind === "service" ? kind : null;
}
export type Channel = "whatsapp" | "email";

/** `{nama}` and `{kategori}` become the lead's own name and category; nothing else is substituted. */
export function fillTemplate(text: string, lead: { name: string; category?: string | null }): string {
  return text.replace(/\{nama\}/gi, lead.name.trim()).replace(/\{kategori\}/gi, (lead.category ?? "").trim());
}

/**
 * One message written once (by hand or by the AI for a kind of business) and turned into a draft for every selected lead.
 * No AI call per lead, so hundreds of drafts take a second. The drafts land in the Outbox review list like any other.
 */
@Injectable()
export class TemplateService {
  constructor(private readonly prisma: PrismaService, private readonly writer: MessageWriterService, private readonly attachments: AttachmentService) {}

  /** Kinds of business among the workspace's leads, with how many can be reached on each channel. */
  async categories(workspaceId: string) {
    const rows = await this.prisma.lead.groupBy({ by: ["category"], where: { workspaceId, source: "google_maps" }, _count: { _all: true }, orderBy: { _count: { category: "desc" } } });
    const withPhone = await this.prisma.lead.groupBy({ by: ["category"], where: { workspaceId, source: "google_maps", phone: { not: null } }, _count: { _all: true } });
    const withEmail = await this.prisma.lead.groupBy({ by: ["category"], where: { workspaceId, source: "google_maps", email: { not: null } }, _count: { _all: true } });
    const n = (list: typeof withPhone, c: string | null) => list.find((r) => r.category === c)?._count._all ?? 0;
    return rows.map((r) => ({ category: r.category ?? "", count: r._count._all, withPhone: n(withPhone, r.category), withEmail: n(withEmail, r.category) }));
  }

  /** Leads of one kind (or matching a search), with whether each already has a first message waiting or sent. */
  async leads(workspaceId: string, f: { channel: Channel; category?: string; q?: string; campaignId?: string; limit?: number }) {
    const take = Math.min(Math.max(f.limit ?? 300, 1), MAX_TEMPLATE_LEADS);
    const rows = await this.prisma.lead.findMany({
      where: {
        workspaceId, source: "google_maps",
        ...(f.category !== undefined && f.category !== "" ? { category: f.category } : {}),
        ...(f.campaignId ? { campaignId: f.campaignId } : {}),
        ...(f.q ? { name: { contains: f.q, mode: "insensitive" as const } } : {}),
        crmStatus: { notIn: ["won", "lost"] },
      },
      orderBy: [{ score: "desc" }, { createdAt: "asc" }],
      take,
      select: { id: true, name: true, category: true, phone: true, phoneE164: true, email: true, score: true, crmStatus: true, campaign: { select: { market: true } }, outbound: { where: { channel: f.channel, source: "ai_outreach", status: { in: ["draft", "approved", "sending", "sent"] } }, select: { status: true }, take: 1 } },
    });
    return rows.map((l) => {
      const market = normalizeMarket(l.campaign?.market);
      const e164 = f.channel === "email" ? "" : l.phoneE164 || normalizePhoneFor(l.phone, market) || "";
      const reason = f.channel === "email" || !e164 ? null : whatsappBlock(e164, market);
      return {
        id: l.id, name: l.name, category: l.category, score: l.score, crmStatus: l.crmStatus,
        contact: f.channel === "email" ? l.email : l.phoneE164 || l.phone,
        reachable: f.channel === "email" ? !!l.email && isValidEmail(l.email.trim().toLowerCase()) : !!e164 && !reason,
        ...(reason ? { reason } : {}),
        alreadyMessaged: l.outbound.length > 0,
      };
    });
  }

  /** The AI writes ONE generic message for a kind of business. Consumes one draft from the plan. */
  async generate(workspaceId: string, o: { segment: string; channel: Channel; language?: OutputLanguage; variant?: OutreachVariant; offer?: string }) {
    const segment = o.segment.trim();
    if (!segment) throw new BadRequestException("Choose or type the kind of business first");
    const language = outputLanguageOrDefault(o.language);
    const w = await this.writer.generic(workspaceId, { segment, language, channel: o.channel, variant: o.variant, offer: o.offer });
    const subject = o.channel === "email" ? await this.writer.subjectFor(workspaceId, w.text, language) : undefined;
    return { body: w.text, subject, risks: w.risks };
  }

  /** Turns the template into one draft per selected lead. Leads that cannot or should not be messaged are counted, not failed. */
  async apply(workspaceId: string, o: { channel: Channel; leadIds: string[]; body: string; subject?: string; language?: OutputLanguage; attachmentId?: string; linkPreview?: boolean }) {
    const body = o.body.trim();
    const language = outputLanguageOrDefault(o.language);
    if (!body) throw new BadRequestException("The message is empty");
    const hint = OPT_OUT_HINT[language];
    const max = o.channel === "email" ? MAX_EMAIL_BODY : MAX_BODY - hint.length - 2;
    if (body.length > max) throw new BadRequestException(`The message is longer than ${max} characters`);
    const subject = o.subject?.trim();
    if (o.channel === "email" && !subject) throw new BadRequestException("An email needs a subject");

    if (o.channel === "email" && (o.attachmentId || o.linkPreview)) throw new BadRequestException("Attachments and link previews are only for WhatsApp messages");
    if (o.attachmentId) await this.attachments.owned(workspaceId, o.attachmentId);
    // one card for every draft: the link is the same, so the page is opened once, not once per lead
    const found = o.channel === "whatsapp" ? await maybePreview(body, o.linkPreview, !!o.attachmentId && body.length <= CAPTION_LIMIT) : null;
    const card = found ? (found as unknown as Prisma.InputJsonValue) : undefined;
    const ids = [...new Set(o.leadIds)].slice(0, MAX_TEMPLATE_LEADS);
    const leads = await this.prisma.lead.findMany({ where: { workspaceId, id: { in: ids } }, select: { id: true, name: true, category: true, phone: true, phoneE164: true, email: true, campaign: { select: { market: true } } } });
    const account = await this.prisma.whatsappAccount.findUnique({ where: { workspaceId }, select: { defaultCountryCode: true } });
    const optPhones = new Set((await this.prisma.messageOptOut.findMany({ where: { workspaceId }, select: { phone: true } })).map((r) => r.phone));
    const optEmails = new Set((await this.prisma.emailOptOut.findMany({ where: { workspaceId }, select: { email: true } })).map((r) => r.email));
    const active = await this.prisma.outboundMessage.findMany({ where: { workspaceId, channel: o.channel, source: "ai_outreach", status: { in: ["draft", "approved", "sending", "sent"] } }, select: { toPhone: true, toEmail: true, leadId: true } });
    const taken = new Set(active.map((m) => (o.channel === "email" ? m.toEmail : m.toPhone) ?? ""));
    const messagedLeads = new Set(active.map((m) => m.leadId).filter(Boolean));

    const skipped = { noContact: 0, optedOut: 0, alreadyMessaged: 0 };
    const rows: { lead: (typeof leads)[number]; to: string }[] = [];
    for (const l of leads) {
      const market = normalizeMarket(l.campaign?.market);
      const to = o.channel === "email" ? (l.email ?? "").trim().toLowerCase() : l.phoneE164 || (market === "VN" ? normalizePhoneFor(l.phone, market) : normalizePhone(l.phone, account?.defaultCountryCode ?? "62")) || "";
      if (o.channel === "whatsapp" && to && whatsappBlock(to, market)) { skipped.noContact++; continue; }
      if (!to || (o.channel === "email" && !isValidEmail(to))) { skipped.noContact++; continue; }
      if ((o.channel === "email" ? optEmails : optPhones).has(to)) { skipped.optedOut++; continue; }
      if (taken.has(to) || messagedLeads.has(l.id)) { skipped.alreadyMessaged++; continue; }
      taken.add(to);
      rows.push({ lead: l, to });
    }

    if (rows.length) {
      await this.prisma.outboundMessage.createMany({
        data: rows.map(({ lead, to }) => {
          const text = fillTemplate(body, lead);
          return {
            workspaceId, leadId: lead.id, channel: o.channel, source: "ai_outreach", status: "draft",
            ...(o.channel === "email" ? { toEmail: to, toPhone: "", subject: fillTemplate(subject ?? "", lead).slice(0, 200), body: text, context: { template: true, language } } : { toPhone: to, body: `${text}\n\n${hint}`, context: { template: true }, attachmentId: o.attachmentId ?? null, ...(card ? { linkPreview: card } : {}) }),
          };
        }),
      });
      if (o.channel === "whatsapp") {
        for (const { lead, to } of rows) if (!lead.phoneE164) await this.prisma.lead.update({ where: { id: lead.id }, data: { phoneE164: to } });
      }
    }
    return { created: rows.length, skipped, requested: ids.length };
  }
}
