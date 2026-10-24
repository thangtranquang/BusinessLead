import { Injectable, Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { CampaignsService } from "../campaigns/campaigns.service";
import { LeadsService } from "../leads/leads.service";
import { LeadIntelligenceService } from "../ai/lead-intelligence.service";
import { GeoService } from "../leads/geo.service";
import { EnrichmentService } from "../leads/enrichment.service";
import { FitService } from "../ai/fit.service";
import { MarketingAiService } from "../ai/marketing-ai.service";
import { planAreas, stripPlaces } from "./areas";
import { toOutputLanguage } from "../common/language";
import { MARKET, normalizeMarket, type Market } from "../common/market";
import { GoogleMapsScraperService } from "./google-maps.scraper";

/** Two results are the same business when they share a phone number, or else a name and an address. */
export function leadKey(b: { name: string; address: string; phone: string }, market: Market = "ID"): string {
  const digits = (b.phone ?? "").replace(/\D/g, "");
  // the leading 0 of a national number becomes the market's calling code (62 for Indonesia, 84 for Vietnam)
  return digits.length >= 8 ? `tel:${digits.replace(/^0/, MARKET[normalizeMarket(market)].callingCode)}` : `${b.name.toLowerCase()}|${b.address.toLowerCase()}`;
}

export interface ScraperJobData {
  campaignId: string;
  workspaceId: string;
  searchQueries: string[];
  industry: string;
  location: string;
  maxResults: number;
  yourService: string;
  contentStyle: string;
  language: string;
  /** The campaign's market when the job was queued. The campaign row read at job start wins; jobs queued before this field exist read as ID. */
  market?: string;
}

/**
 * The market a job runs in. The campaign's stored value wins (it may have been edited while the job waited); the payload is
 * only used when the row has no value; anything unknown reads as ID. Never throws.
 */
export function resolveJobMarket(dbValue: unknown, jobValue: unknown): Market {
  if (dbValue === "ID" || dbValue === "VN") return dbValue;
  if (dbValue === undefined || dbValue === null) return normalizeMarket(jobValue);
  return "ID";
}

@Processor("scraper")
@Injectable()
export class ScraperProcessor extends WorkerHost {
  private readonly logger = new Logger(ScraperProcessor.name);

  constructor(
    private campaigns: CampaignsService,
    private leads: LeadsService,
    private leadIntelligence: LeadIntelligenceService,
    private marketingAi: MarketingAiService,
    private googleMaps: GoogleMapsScraperService,
    private fit: FitService,
    private enrichment: EnrichmentService,
    private geo: GeoService,
  ) {
    super();
  }

  async process(job: Job<ScraperJobData>): Promise<void> {
    const data = job.data;
    const { campaignId, workspaceId } = data;
    // a job queued before the language change carries "indonesian"; read it through the normaliser like every other consumer
    const language = toOutputLanguage(data.language);
    this.logger.log(`Starting campaign ${campaignId} (job ${job.id})`);

    try {
      // the campaign may have been edited while the job waited in the queue: the row decides, the payload is a fallback
      const stored = await this.campaigns.findOne(campaignId, workspaceId).catch(() => null);
      const market = resolveJobMarket((stored as { market?: unknown } | null)?.market, data.market);
      await this.campaigns.updateStatus(campaignId, "running", 0);

      const rawLeads = await this.scrapeLeads(data, campaignId, market);
      const total = rawLeads.length;

      if (total === 0) {
        await this.campaigns.updateStatus(campaignId, "failed", 0, "No leads found");
        return;
      }

      await this.campaigns.updateStatus(campaignId, "running", 30);

      // Fit is judged per business from its name and real Google Maps category, against the offer and the Marketing Brief (needs an AI provider).
      const fits = await this.fit.assess(workspaceId, rawLeads.map((l) => ({ name: l.name, category: l.category })), data.yourService, language);
      const scoredLeads = this.leadIntelligence.scoreLeads(rawLeads, fits);
      await this.campaigns.updateStatus(campaignId, "running", 60);

      const processedLeads = await Promise.all(
        scoredLeads.map(async (lead, i) => {
          let marketingContent = null;
          if (lead.priority === "HIGH") {
            try {
              marketingContent = await this.marketingAi.generateContent(workspaceId, {
                businessName: lead.name,
                address: lead.address,
                industry: data.industry,
                rating: lead.rating,
                hasWebsite: lead.hasWebsite,
                yourService: data.yourService,
                contentStyle: data.contentStyle,
                language,
                score: lead.score,
              });
            } catch (e) {
              this.logger.warn(`Content gen failed for ${lead.name}: ${e}`);
            }
          }
          if (i % 5 === 0) {
            const pct = 60 + Math.round((i / total) * 35);
            await this.campaigns.updateStatus(campaignId, "running", pct);
          }
          return {
            name: lead.name,
            address: lead.address,
            phone: lead.phone,
            website: lead.website,
            rating: lead.rating,
            reviewCount: lead.reviewCount ?? undefined,
            hasWebsite: lead.hasWebsite ?? false,
            referenceUrl: lead.referenceUrl,
            source: (lead as { source?: string }).source ?? "google_maps",
            lat: lead.lat ?? undefined,
            lng: lead.lng ?? undefined,
            score: lead.score,
            priority: lead.priority,
            category: (lead as { category?: string }).category || undefined,
            aiAnalysis: { factors: lead.factors, recommendation: lead.recommendation, ...(lead.fit ? { fit: lead.fit } : {}) },
            marketingContent,
            campaignId,
            workspaceId,
          };
        }),
      );

      await this.leads.createMany(processedLeads);

      const highQuality = processedLeads.filter((l) => (l.score ?? 0) >= 70).length;
      const priority = processedLeads.filter((l) => l.priority === "HIGH").length;
      const avgScore = Math.round(
        processedLeads.reduce((s, l) => s + (l.score ?? 0), 0) / processedLeads.length,
      );

      await this.campaigns.updateStats(campaignId, {
        totalLeads: total,
        priorityLeads: priority,
        highQualityLeads: highQuality,
        averageScore: avgScore,
      });

      await this.campaigns.updateStatus(campaignId, "completed", 100);
      this.geo.start(workspaceId); // province / kota / kecamatan for the new leads, in the background
      this.logger.log(`Campaign ${campaignId} done: ${total} leads, ${priority} priority`);

      // Contact details from each business's own website. Runs after the campaign is complete and never fails it.
      if (process.env.SCRAPER_MODE !== "fixture") {
        void this.enrichment.enrichCampaign(workspaceId, campaignId)
          .then((r) => this.logger.log(`Campaign ${campaignId} enrichment: ${JSON.stringify(r)}`))
          .catch((e) => this.logger.warn(`Campaign ${campaignId} enrichment failed: ${e}`));
      }
    } catch (err) {
      this.logger.error(`Campaign ${campaignId} failed: ${err}`);
      await this.campaigns.updateStatus(campaignId, "failed", undefined, (err as Error).message ?? String(err));
      throw err; // re-throw so BullMQ can retry if configured
    }
  }

  private async scrapeLeads(data: ScraperJobData, campaignId: string, market: Market = "ID") {
    // "Seluruh Indonesia" becomes one search per city: Google ranks a country-wide search by where the searcher is.
    const plan = planAreas(data.location, data.searchQueries.length, data.maxResults, market);
    // City by city across all queries, so a stop part-way still covers the biggest markets for every query.
    const combos = plan.areas.flatMap((area) => data.searchQueries.map((query) => ({ query: `${stripPlaces(query, plan.areas, market)} ${area}`.trim(), area })));
    const perQuery = plan.perSearch;
    if (plan.nationwide) this.logger.log(`Nationwide campaign: ${plan.areas.length} cities x ${data.searchQueries.length} queries, ${perQuery} results each`);
    const results: ReturnType<typeof this.normalizeRaw>[] = [];
    const errors: string[] = [];
    const fixtures = process.env.SCRAPER_MODE === "fixture";

    const unique = new Set<string>();
    const countNew = (list: { name: string; address: string; phone: string }[]) => {
      for (const b of list) unique.add(leadKey(b, market));
      return unique.size;
    };

    for (let i = 0; i < combos.length; i++) {
      const combo = combos[i];
      if (!fixtures && countNew(results) >= data.maxResults) {
        this.logger.log(`Target of ${data.maxResults} reached after ${i} of ${combos.length} searches`);
        break;
      }
      if (fixtures) {
        results.push(...this.fixtureLeads(data, combo.query, combo.area, perQuery));
      } else {
        try {
          const raw = await this.googleMaps.scrape(combo.query, perQuery, { area: combo.area, market });
          results.push(...raw.map((b) => this.normalizeRaw(b, data.industry)));
          this.logger.log(`Query "${combo.query}": ${raw.length} results`);
          // A short random pause between searches: hundreds of searches in a row from one address look like a robot.
          if (plan.nationwide && i < combos.length - 1) await new Promise((r) => setTimeout(r, 2500 + Math.random() * 3500));
        } catch (err) {
          // A failed search is reported, never replaced with invented businesses.
          this.logger.warn(`Scrape failed for "${combo.query}": ${err}`);
          errors.push(String((err as Error).message ?? err));
        }
      }
      const pct = Math.min(28, Math.round(((i + 1) / combos.length) * 28));
      await this.campaigns.updateStatus(campaignId, "running", pct);
    }

    if (results.length === 0 && errors.length > 0) throw new Error(this.explainScrapeError(errors[0]));

    // Deduplicate: the same listing can come up under several cities and queries.
    const seen = new Set<string>();
    return results.filter((b) => {
      const key = leadKey(b, market);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private normalizeRaw(
    raw: {
      name: string;
      address: string;
      phone: string;
      website: string;
      rating: string;
      reviewCount?: number | null;
      category?: string;
      hasWebsite: boolean;
      referenceLink?: string;
      lat?: number | null;
      lng?: number | null;
    },
    industry: string,
  ) {
    return {
      name: raw.name,
      address: raw.address,
      phone: raw.phone ?? "",
      website: raw.website ?? "",
      rating: raw.rating ?? "N/A",
      reviewCount: raw.reviewCount ?? null,
      category: raw.category ?? "",
      hasWebsite: raw.hasWebsite ?? !!raw.website,
      referenceUrl: raw.referenceLink ?? "",
      lat: raw.lat ?? null,
      lng: raw.lng ?? null,
      industry,
      source: "google_maps",
    };
  }

  /** Maps the raw browser error to something the operator can act on. */
  private explainScrapeError(message: string): string {
    if (/Executable doesn't exist|playwright install|browserType\.launch/i.test(message)) {
      return "The scraping browser is not installed on the server. Run: pnpm --filter @prospex/api exec playwright install chromium";
    }
    return `Google Maps scraping failed: ${message.split("\n")[0].slice(0, 200)}`;
  }

  /**
   * Only for tests and demos (SCRAPER_MODE=fixture). Clearly labelled, with no phone number, no website and
   * source "fixture", so they can never be mistaken for real businesses or be contacted.
   */
  private fixtureLeads(data: ScraperJobData, query: string, area: string, count: number) {
    return Array.from({ length: Math.min(count, 10) }, (_, i) => ({
      name: `[Test data] ${query} ${i + 1}`,
      address: `${area}`,
      phone: "",
      website: "",
      rating: (3.5 + (i % 3) * 0.4).toFixed(1),
      reviewCount: 5 + i * 17,
      category: "",
      hasWebsite: false,
      referenceUrl: "",
      lat: null,
      lng: null,
      industry: data.industry,
      source: "fixture",
    }));
  }
}
