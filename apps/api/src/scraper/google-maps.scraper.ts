import { Injectable, Logger } from "@nestjs/common";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { FEED_FALLBACK_SELECTOR, SEARCH_BOX_SELECTOR, isEndOfList, parseCard, type RawCard } from "./maps-parse";
import { buildAreaUrl, buildSearchUrl, contextOptions } from "./maps-urls";
import { normalizeMarket, type Market } from "../common/market";
import { DEFAULT_RADIUS_KM, inArea, type LatLng } from "./areas";

export interface ScrapedBusiness {
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: string;
  reviewCount: number | null;
  /** The category Google Maps shows for this place ("Toko Kamera"), in the language of the Maps interface. */
  category: string;
  hasWebsite: boolean;
  referenceLink: string;
  lat: number | null;
  lng: number | null;
  source: string;
}

// Google Maps place URLs embed coordinates either as a precise place marker
// (!3d<lat>!4d<lng>) or as the viewport anchor (@lat,lng,zoom) — prefer the former.
function extractLatLng(url: string): { lat: number | null; lng: number | null } {
  const precise = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (precise) return { lat: parseFloat(precise[1]), lng: parseFloat(precise[2]) };
  const viewport = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (viewport) return { lat: parseFloat(viewport[1]), lng: parseFloat(viewport[2]) };
  return { lat: null, lng: null };
}

@Injectable()
export class GoogleMapsScraperService {
  private readonly logger = new Logger(GoogleMapsScraperService.name);
  private browser: Browser | null = null;

  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    }
    return this.browser;
  }

  /** Where an area is, found once through Google Maps itself and remembered. Null when Maps does not say. */
  private readonly centers = new Map<string, LatLng | null>();

  private async locate(context: BrowserContext, area: string, market: Market): Promise<LatLng | null> {
    const key = `${market}|${area.trim().toLowerCase()}`;
    if (this.centers.has(key)) return this.centers.get(key) ?? null;
    const page = await context.newPage();
    let found: LatLng | null = null;
    try {
      await page.goto(buildAreaUrl(area, market), { waitUntil: "domcontentloaded", timeout: 45000 });
      for (let i = 0; i < 18 && !found; i++) {
        await page.waitForTimeout(500);
        const c = extractLatLng(page.url());
        if (c.lat != null && c.lng != null) found = { lat: c.lat, lng: c.lng };
      }
    } catch (e) {
      this.logger.warn(`Could not locate "${area}": ${(e as Error).message}`);
    } finally {
      await page.close().catch(() => undefined);
    }
    this.centers.set(key, found);
    if (!found) this.logger.warn(`Maps did not give a position for "${area}": results will not be checked against its location`);
    return found;
  }

  /**
   * One Google Maps search. With `opts.area` the search is anchored on that place's coordinates, so the answer does not
   * depend on where the server (or the person running it) is, and results that turn out to be outside the area are dropped.
   */
  async scrape(searchQuery: string, maxResults = 20, opts: { area?: string; radiusKm?: number; market?: Market } = {}): Promise<ScrapedBusiness[]> {
    const market = normalizeMarket(opts.market);
    const browser = await this.getBrowser();
    // The market's locale and timezone, so listings come back in its language whatever the server's own locale is.
    // Indonesia (the default) is id-ID / Asia/Jakarta, searched as `<area>, Indonesia` with ?hl=id and anchored at /@lat,lng,13z;
    // the addresses are built in maps-urls.ts. Vietnam is vi-VN / Asia/Ho_Chi_Minh, `<area>, Việt Nam`, hl=vi (SIMULATED: no real run).
    const context = await browser.newContext({
      ...contextOptions(market),
      viewport: { width: 1280, height: 800 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    try {
      // Strip control chars + limit length before the text goes into a URL or the search box.
      const safeQuery = String(searchQuery)
        .replace(/[\x00-\x1f<>"'`]/g, "")
        .substring(0, 200);
      const center = opts.area ? await this.locate(context, opts.area, market) : null;

      this.logger.log(`Searching Google Maps: "${safeQuery}"${center ? ` anchored at ${center.lat.toFixed(3)},${center.lng.toFixed(3)}` : ""}`);

      if (center) {
        await page.goto(buildSearchUrl(safeQuery, center.lat, center.lng, market), { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForSelector('[role="feed"]', { timeout: 15000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
      } else {
        await page.goto("https://www.google.com/maps/", { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(2000);
        const searchBox = await page.$(SEARCH_BOX_SELECTOR);
        if (searchBox) {
          await searchBox.click({ clickCount: 3 });
          await page.keyboard.type(safeQuery, { delay: 40 });
          await page.keyboard.press("Enter");
          await page.waitForTimeout(3000);
        }
      }

      await this.scrollResultsList(page, maxResults);

      let businesses = await this.extractBusinessCards(page, market);
      if (center && opts.area) {
        const { kept, dropped } = inArea(businesses, opts.area, center, opts.radiusKm ?? DEFAULT_RADIUS_KM);
        if (dropped > 0) this.logger.warn(`"${safeQuery}": dropped ${dropped} of ${businesses.length} results outside ${opts.area}`);
        businesses = kept;
      }
      this.logger.log(`Extracted ${businesses.length} businesses from Google Maps`);

      await context.close();
      return businesses.slice(0, maxResults);
    } catch (err) {
      this.logger.error(`Google Maps scraping error: ${err}`);
      await context.close().catch(() => undefined);
      throw err; // the caller reports it; an empty list would hide a broken scrape as "no results"
    }
  }

  private async scrollResultsList(page: Page, maxResults: number): Promise<void> {
    // The results list is the element with role="feed". Matching several selectors at once picks the first one in the page,
    // which was a wrapper that cannot scroll, so every search stopped after the first six results.
    const feedSelector = '[role="feed"]';
    const fallbackSelector = FEED_FALLBACK_SELECTOR;
    const cardCount = () => page.evaluate(() => document.querySelectorAll('[data-result-index], .Nv2PK, [jsaction*="mouseover:pane"]').length).catch(() => 0);
    const reachedEnd = () => page.evaluate(() => document.body.innerText).then((text) => isEndOfList(text)).catch(() => false);

    let stale = 0;
    let prev = 0;
    for (let i = 0; i < 40; i++) {
      const feed = (await page.$(feedSelector)) ?? (await page.$(fallbackSelector));
      if (feed) await feed.evaluate((el) => { (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight; });
      else await page.evaluate(() => window.scrollBy(0, 1000));

      await page.waitForTimeout(1600);
      const count = await cardCount();
      if (count >= maxResults) break;
      if (await reachedEnd()) break; // Google has no more for this search
      if (count === prev) {
        stale++;
        if (stale >= 3) break;
      } else {
        stale = 0;
      }
      prev = count;
    }
  }

  private async extractBusinessCards(page: Page, market: Market): Promise<ScrapedBusiness[]> {
    // $$eval is Playwright's scoped DOM query — the callback is a static inline function serialized and run in the browser
    // context. Nothing is passed into it (no market, no user text): it only hands back RAW text, and Node reads it with the
    // pure helpers in maps-parse.ts for the campaign's market (phone clean-up included).
    const cards = await page
      .$$eval(".Nv2PK, [data-result-index]", (cards) =>
        cards
          .map((card) => {
            const nameSels = [".qBF1Pd", ".fontHeadlineSmall", '[class*="fontHeadline"]', "h3"];
            let name = "";
            for (const s of nameSels) {
              const el = card.querySelector(s);
              if (el?.textContent?.trim()) {
                name = el.textContent.trim();
                break;
              }
            }
            if (!name) return null;
            return {
              name,
              // The rating wrapper's aria-label reads like "4.5 stars 1,234 Reviews" (SIMULATED for Vietnamese: "4,6 sao").
              ariaStar: card.querySelector('[aria-label*="star" i]')?.getAttribute("aria-label") ?? "",
              ariaSao: card.querySelector('[aria-label*="sao" i]')?.getAttribute("aria-label") ?? "",
              ratingText: card.querySelector(".MW4etd")?.textContent?.trim() ?? "",
              spans: [...card.querySelectorAll("span")].map((s) => s.textContent?.trim() ?? ""),
              rows: [...card.querySelectorAll(".W4Efsd")].map((r) => r.textContent?.trim() ?? ""),
              hrefs: [...card.querySelectorAll("a[href]")].map((a) => (a as HTMLAnchorElement).href ?? ""),
            };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null),
      )
      .catch(() => [] as RawCard[]);

    return (cards as RawCard[]).map((raw) => {
      const card = parseCard(raw, market);
      return { ...card, source: "Google Maps", ...extractLatLng(card.referenceLink) };
    });
  }

  async close(): Promise<void> {
    if (this.browser?.isConnected()) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
