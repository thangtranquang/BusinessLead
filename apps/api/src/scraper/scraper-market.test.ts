// Market resolution in the scraper job, lead keys, the start endpoint and the "never fabricate" rule
// (TC-VM-4.8 to 4.11, 4.13, 4.15, 5.18 to 5.20). Fakes only; no network, no database, no browser.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ConflictException } from "@nestjs/common";
import { MARKET } from "../common/market";
import { INDONESIA_CITIES } from "./areas";
import { ScraperProcessor, leadKey, resolveJobMarket, type ScraperJobData } from "./scraper.processor";
import { ScraperController } from "./scraper.controller";
import { parseCard, type RawCard } from "./maps-parse";

test("MARKET.ID.cities is the Indonesian city list, unchanged and in order", () => {
  assert.deepEqual([...MARKET.ID.cities], [...INDONESIA_CITIES]);
});

test("resolveJobMarket: the stored value wins, the payload is the fallback, anything else is ID (TC-VM-4.8, 4.10, 5.18-5.20)", () => {
  assert.equal(resolveJobMarket(undefined, {}), "ID");
  assert.equal(resolveJobMarket(undefined, undefined), "ID");
  assert.equal(resolveJobMarket(undefined, "VN"), "VN");
  assert.equal(resolveJobMarket(null, "VN"), "VN");
  assert.equal(resolveJobMarket("VN", "ID"), "VN");
  assert.equal(resolveJobMarket("ID", "VN"), "ID");
  assert.equal(resolveJobMarket("XX", "VN"), "ID");
  for (const bad of ["XX", null, 1, {}, "vn", "", [], "VN&hl=en", " VN"]) assert.equal(resolveJobMarket(undefined, bad), "ID", String(bad));
});

test("leadKey: leading 0 becomes the market's calling code; Indonesia is unchanged", () => {
  const b = { name: "A", address: "B", phone: "02838221234" };
  assert.equal(leadKey(b, "VN"), "tel:842838221234");
  assert.equal(leadKey({ ...b, phone: "842838221234" }, "VN"), "tel:842838221234");
  assert.equal(leadKey({ ...b, phone: "0901234567" }, "VN"), "tel:84901234567");
  assert.equal(leadKey(b), "tel:622838221234");
  assert.equal(leadKey(b, "ID"), leadKey(b));
  assert.equal(leadKey({ name: "X", address: "Y", phone: "123" }, "VN"), "x|y");
});

type ScrapeOpts = { area?: string; market?: string };

function fakes(market: unknown, scrape: (q: string, n: number, o: ScrapeOpts) => Promise<unknown[]>) {
  const calls: Array<{ q: string; area?: string; market?: string }> = [];
  const created: unknown[][] = [];
  const statuses: string[] = [];
  const processor = new ScraperProcessor(
    {
      findOne: async () => (market === "missing" ? Promise.reject(new Error("not found")) : { market }),
      updateStatus: async (_id: string, status: string) => void statuses.push(status),
      updateStats: async () => undefined,
    } as never,
    { createMany: async (l: unknown[]) => void created.push(l) } as never,
    { scoreLeads: (l: Array<Record<string, unknown>>) => l.map((x) => ({ ...x, score: 10, priority: "LOW", factors: [], recommendation: "" })) } as never,
    { generateContent: async () => null } as never,
    {
      scrape: async (q: string, n: number, o: ScrapeOpts) => {
        calls.push({ q, area: o.area, market: o.market });
        return scrape(q, n, o);
      },
    } as never,
    { assess: async () => [] } as never,
    { enrichCampaign: async () => ({}) } as never,
    { start: () => undefined } as never,
  );
  return { processor, calls, created, statuses };
}

const job = (over: Partial<ScraperJobData> = {}) =>
  ({
    id: "j1",
    data: { campaignId: "c1", workspaceId: "w1", searchQueries: ["công ty logistics TP.HCM"], industry: "x", location: "TP.HCM", maxResults: 5, yourService: "s", contentStyle: "c", language: "vietnamese", ...over } as ScraperJobData,
  }) as never;

test("the processor reads the market from the stored campaign at job start (TC-VM-4.8, 4.9)", async () => {
  delete process.env.SCRAPER_MODE;
  const a = fakes("VN", async () => []);
  await a.processor.process(job({ market: "ID" }));
  assert.deepEqual(a.calls[0], { q: "công ty logistics Hồ Chí Minh", area: "Hồ Chí Minh", market: "VN" }, "stored VN beats payload ID; area resolved by VN rules");
  const b = fakes("ID", async () => []);
  await b.processor.process(job({ market: "VN", searchQueries: ["kopi"], location: "Bandung" }));
  assert.equal(b.calls[0].market, "ID", "stored ID beats payload VN");
  const c = fakes("missing", async () => []);
  await c.processor.process(job({ market: "VN" }));
  assert.equal(c.calls[0].market, "VN", "no stored campaign: payload is the fallback");
  const d = fakes(undefined, async () => []);
  await d.processor.process(job({ market: undefined, searchQueries: ["kopi"], location: "Bandung" }));
  assert.equal(d.calls[0].market, "ID", "a job queued before the field existed is Indonesian");
  assert.equal(d.calls[0].q, "kopi Bandung");
});

test("a failed or empty scrape never produces leads or test data (TC-VM-4.15)", async () => {
  delete process.env.SCRAPER_MODE;
  const failing = fakes("VN", async () => {
    throw new Error("CAPTCHA detected");
  });
  await assert.rejects(failing.processor.process(job()));
  assert.equal(failing.created.length, 0);
  assert.equal(failing.statuses.at(-1), "failed");
  const empty = fakes("VN", async () => []);
  await empty.processor.process(job());
  assert.equal(empty.created.length, 0);
  assert.equal(empty.statuses.at(-1), "failed");
});

test("the browser returns raw phone text and Node cleans it for the market (TC-VM-4.13)", () => {
  const raw: RawCard = { name: "Công ty Mẫu", ariaStar: "", ariaSao: "", ratingText: "", spans: ["(028) 3822 1234"], rows: [], hrefs: [] };
  assert.equal(parseCard(raw, "VN").phone, "02838221234");
  assert.equal(parseCard({ ...raw, spans: ["+84 90 123 4567"] }, "VN").phone, "84901234567");
  assert.equal(parseCard({ ...raw, spans: ["+62 812 3456 7890"] }, "ID").phone, "081234567890");
});

function controller(status: string, market: string) {
  const added: unknown[] = [];
  const spent: string[] = [];
  const c = new ScraperController(
    {
      add: async (_n: string, data: unknown) => {
        added.push(data);
        return { id: "7" };
      },
    } as never,
    { findOne: async () => ({ id: "c1", workspaceId: "w1", searchQueries: ["q"], industry: "i", location: "l", maxResults: 5, yourService: "s", contentStyle: "c", language: "vietnamese", status, market }) } as never,
    { assertCan: async () => void spent.push("assert"), record: async () => void spent.push("record") } as never,
  );
  return { c, added, spent };
}

test("start puts the campaign's market into the job (TC-VM-4.11)", async () => {
  for (const m of ["VN", "ID"]) {
    const { c, added } = controller("draft", m);
    await c.startCampaign("c1", "w1");
    assert.equal((added[0] as ScraperJobData).market, m);
  }
  const retry = controller("failed", "VN");
  await retry.c.startCampaign("c1", "w1");
  assert.equal(retry.added.length, 1);
});

test("start is refused with 409 unless the campaign is a draft or failed, and nothing is spent", async () => {
  for (const status of ["running", "completed", "queued", ""]) {
    const { c, added, spent } = controller(status, "VN");
    await assert.rejects(c.startCampaign("c1", "w1"), ConflictException, status);
    assert.equal(added.length, 0);
    assert.equal(spent.length, 0);
  }
});
