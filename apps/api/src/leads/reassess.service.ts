import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { FitService } from "../ai/fit.service";
import { LeadIntelligenceService } from "../ai/lead-intelligence.service";
import { normalizeMarket } from "../common/market";
import { toOutputLanguage } from "../common/language";

const MAX_PER_CALL = 200;

/** True when the stored analysis has no fit verdict yet (the AI was missing or failed during the scrape). */
export function lacksFit(aiAnalysis: unknown): boolean {
  const fit = (aiAnalysis as { fit?: { fit?: unknown } } | null)?.fit;
  return !fit || typeof fit.fit !== "string";
}

/**
 * Judges fit again for the leads of one campaign that never got a verdict, for example because the AI key was wrong
 * when the campaign ran. Only those leads change; their score, priority and analysis are recomputed with the same rules.
 */
@Injectable()
export class ReassessService {
  constructor(private readonly prisma: PrismaService, private readonly fit: FitService, private readonly intelligence: LeadIntelligenceService) {}

  async reassessCampaign(workspaceId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id: campaignId, workspaceId }, select: { yourService: true, language: true, market: true } });
    if (!campaign) throw new NotFoundException("Campaign not found");
    const market = normalizeMarket(campaign.market);
    const all = await this.prisma.lead.findMany({ where: { workspaceId, campaignId, source: "google_maps" }, orderBy: { createdAt: "asc" } });
    const pending = all.filter((l) => lacksFit(l.aiAnalysis)).slice(0, MAX_PER_CALL);
    if (!pending.length) return { checked: 0, updated: 0, remaining: 0 };

    const verdicts = await this.fit.assess(workspaceId, pending.map((l) => ({ name: l.name, category: l.category ?? undefined })), campaign.yourService, toOutputLanguage(campaign.language));
    let updated = 0;
    for (let i = 0; i < pending.length; i++) {
      const verdict = verdicts[i];
      if (!verdict) continue;
      const l = pending[i];
      const r = this.intelligence.scoreLead(
        { name: l.name, address: l.address ?? undefined, phone: l.phone ?? undefined, website: l.website ?? undefined, rating: l.rating ?? undefined, reviewCount: l.reviewCount, hasWebsite: l.hasWebsite, category: l.category ?? undefined },
        verdict,
        market,
      );
      await this.prisma.lead.update({ where: { id: l.id }, data: { score: r.score, priority: r.priority, aiAnalysis: { factors: r.factors, recommendation: r.recommendation, fit: { fit: verdict.fit, reason: verdict.reason } } } });
      updated++;
    }
    return { checked: pending.length, updated, remaining: all.filter((l) => lacksFit(l.aiAnalysis)).length - updated };
  }
}
