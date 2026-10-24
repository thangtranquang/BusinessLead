import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { loginOnly } from "./fixtures";
import { setLangCookie, expectNoHorizontalOverflow, en, vi } from "./helpers-language";

// Vietnam market, end to end through the real UI and API (PRD 2.13, TC-VM-8.8, 8.9, 14.1, 2.1, 2.2, 2.12, 22.5).
// The API runs with SCRAPER_MODE=fixture GEOCODER_DISABLED=true WHATSAPP_DISABLED=true, so the leads are invented
// ("Công ty Mẫu n", visibly fake numbers) and carry their region without any geocoder. Own user and workspace, so the
// shared e2e workspace used by the other specs is left alone.

const API = (process.env.API_URL ?? "http://localhost:3001/api").replace(/\/$/, "");
const RUN = Date.now();
const USER = { name: `VN User ${RUN}`, email: `vn-${RUN}@prospex.test`, password: "TestPass123!", workspace: `VN Workspace ${RUN}` };
const PROVINCE = "Hồ Chí Minh";

test.describe.configure({ mode: "serial" });

let token = "";
let api: APIRequestContext;
let vnCampaignId = "";

interface Lead { id: string; name: string; phone: string; phoneE164: string | null; phoneKind: string; province: string | null; lat: number | null; lng: number | null; source: string; campaignId: string }
const auth = () => ({ Authorization: `Bearer ${token}` });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function leadsOf(campaignId: string, extra = ""): Promise<Lead[]> {
  const res = await api.get(`${API}/leads?campaignId=${campaignId}&limit=100${extra}`, { headers: auth() });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { data: Lead[] }).data;
}

async function waitCompleted(campaignId: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const res = await api.get(`${API}/campaigns/${campaignId}`, { headers: auth() });
    const c = (await res.json()) as { status: string };
    if (c.status === "completed") return;
    expect(c.status, "campaign must not fail").not.toBe("failed");
    await sleep(2000);
  }
  throw new Error("campaign did not complete in time");
}

/**
 * The template panel lists only leads whose source is google_maps (fixture leads are never offered for sending). To exercise the
 * panel the VN campaign's invented leads are relabelled directly in the test database. Returns false without docker.
 */
function relabelAsScraped(campaignId: string): boolean {
  if (!/^[a-z0-9]{10,40}$/i.test(campaignId)) throw new Error("unexpected id");
  try {
    execFileSync("docker", ["exec", process.env.E2E_DB_CONTAINER ?? "prospex_db", "psql", "-U", "prospex", "-d", "prospex", "-v", "ON_ERROR_STOP=1", "-c", `update leads set source='google_maps', category='logistics' where "campaignId"='${campaignId}'`], { stdio: "pipe", timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}

async function fillForm(page: Page, name: string, location: string) {
  await page.fill("#name", name);
  await page.fill("#location", location);
  await page.fill("#industry", "logistics");
  await page.getByTestId("query-input").first().fill(`logistics ${location}`);
  await page.fill("#service", "Dịch vụ khai báo hải quan (dữ liệu mẫu)");
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext();
  const res = await api.post(`${API}/auth/register`, { data: { name: USER.name, email: USER.email, password: USER.password, workspaceName: USER.workspace } });
  expect(res.status()).toBe(201);
  token = ((await res.json()) as { token: string }).token;
});
test.afterAll(async () => { await api.dispose(); });

test.describe("campaign form market (TC-VM-2.1, 2.2, 22.5)", () => {
  test("English UI defaults to Indonesia and shows no Vietnam compliance line", async ({ page }) => {
    await loginOnly(page, USER);
    await page.goto("/campaigns/new");
    const select = page.getByTestId("market-select");
    await expect(select).toContainText("Indonesia");
    await expect(page.getByTestId("market-compliance")).toHaveCount(0);
    await expect(page.getByTestId("location-help")).toContainText("Seluruh Indonesia");
  });

  test("choosing Vietnam shows the compliance line and Vietnamese placeholders; going back hides it", async ({ page }) => {
    await loginOnly(page, USER);
    await page.goto("/campaigns/new");
    await page.getByTestId("market-select").click();
    await page.getByRole("option", { name: "Việt Nam" }).click();
    await expect(page.getByTestId("market-compliance")).toBeVisible();
    await expect(page.getByTestId("market-compliance")).toHaveText(en("camp.market.compliance"));
    await expect(page.getByTestId("location-help")).toContainText("Toàn quốc");
    await expect(page.locator("#location")).toHaveAttribute("placeholder", en("camp.form.locationPhVN"));
    await page.getByTestId("market-select").click();
    await page.getByRole("option", { name: "Indonesia" }).click();
    await expect(page.getByTestId("market-compliance")).toHaveCount(0);
  });

  test("Vietnamese UI defaults to Vietnam with the compliance line in Vietnamese", async ({ page, context, baseURL }) => {
    await setLangCookie(context, baseURL, "vi");
    await loginOnly(page, USER);
    await page.goto("/campaigns/new");
    await expect(page.getByTestId("market-select")).toContainText("Việt Nam");
    await expect(page.getByTestId("market-compliance")).toHaveText(vi("camp.market.compliance"));
    await expect(page.locator("#location")).toHaveAttribute("placeholder", vi("camp.form.locationPhVN"));
  });
});

test.describe("layout (TC-VM-2.12)", () => {
  for (const lang of ["en", "vi"] as const) {
    for (const size of [{ width: 375, height: 812 }, { width: 1280, height: 800 }]) {
      test(`campaign form has no horizontal overflow: ${lang} ${size.width}px, both markets`, async ({ page, context, baseURL }) => {
        await setLangCookie(context, baseURL, lang);
        await page.setViewportSize(size);
        await loginOnly(page, USER);
        await page.goto("/campaigns/new");
        await expect(page.getByTestId("market-select")).toBeVisible();
        for (const market of ["Indonesia", "Việt Nam"]) {
          await page.getByTestId("market-select").click();
          await page.getByRole("option", { name: market }).click();
          await expect(page.getByTestId("market-select")).toContainText(market);
          await expectNoHorizontalOverflow(page, `${lang} ${size.width} ${market}`);
          await expect(page.getByTestId("location-help")).toBeVisible();
          if (market === "Việt Nam") {
            const note = page.getByTestId("market-compliance");
            await expect(note).toBeVisible();
            const box = await note.boundingBox();
            expect(box && box.x >= 0 && box.x + box.width <= size.width + 1, "compliance line fits the viewport").toBeTruthy();
          }
        }
        await page.screenshot({ path: `test-results/vm-form-${lang}-${size.width}.png` });
      });
    }
  }
});

test.describe("Vietnam fixture campaign end to end (TC-VM-8.8, 14.1)", () => {
  test("create a Vietnam campaign through the UI, it runs and completes", async ({ page }) => {
    await loginOnly(page, USER);
    await page.goto("/campaigns/new");
    await page.getByTestId("market-select").click();
    await page.getByRole("option", { name: "Việt Nam" }).click();
    await fillForm(page, `Chiến dịch mẫu ${RUN}`, "TP.HCM");
    const created = page.waitForResponse((r) => r.url().endsWith("/campaigns") && r.request().method() === "POST");
    await page.click('button[type="submit"]');
    const body = (await (await created).json()) as { id: string; market: string };
    expect(body.market).toBe("VN");
    vnCampaignId = body.id;
    await page.waitForURL(/\/campaigns\/(?!new$)[a-z0-9-]+$/, { timeout: 15000 });
    await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible({ timeout: 45000 });
  });

  test("leads carry the Ho Chi Minh City region, coordinates, fixture source and a landline/mobile mix", async () => {
    expect(vnCampaignId).not.toBe("");
    const leads = await leadsOf(vnCampaignId);
    expect(leads.length).toBeGreaterThan(1);
    for (const l of leads) {
      expect(l.province).toBe(PROVINCE);
      expect(l.lat).toBeCloseTo(10.7769, 4);
      expect(l.lng).toBeCloseTo(106.7009, 4);
      expect(l.source).toBe("fixture");
      expect(l.name).toMatch(/^Công ty Mẫu \d+$/);
      expect(l.phoneE164, "fake numbers normalise to 84").toMatch(/^84\d{9,10}$/);
    }
    const kinds = new Set(leads.map((l) => l.phoneKind));
    expect(kinds.has("landline"), "a landline is classified").toBe(true);
    expect(kinds.has("mobile"), "a mobile is classified").toBe(true);
    for (const l of leads) expect(l.phoneKind).toBe(l.phone.startsWith("028") ? "landline" : "mobile");
  });

  test("the province filter returns exactly these leads (API) and the leads page filter selects them (UI)", async () => {
    const all = await leadsOf(vnCampaignId);
    const filtered = await leadsOf(vnCampaignId, `&province=${encodeURIComponent(PROVINCE)}`);
    expect(filtered.map((l) => l.id).sort()).toEqual(all.map((l) => l.id).sort());
    const none = await leadsOf(vnCampaignId, "&province=Jawa%20Barat");
    expect(none).toHaveLength(0);
  });

  test("the leads page lists the region and filters by it", async ({ page }) => {
    await loginOnly(page, USER);
    await page.goto("/leads");
    await page.getByRole("combobox").filter({ hasText: en("leads.region.allProvinces") }).click();
    await page.getByRole("option", { name: new RegExp(PROVINCE) }).click();
    await expect(page.getByText("Công ty Mẫu 1", { exact: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test("a landline lead cannot be picked in the outbox template panel; a mobile lead can", async ({ page }) => {
    test.skip(!relabelAsScraped(vnCampaignId), "docker is not available to relabel the fixture leads");
    await loginOnly(page, USER);
    await page.goto("/outbox");
    await page.getByRole("button", { name: en("tpl.open"), exact: true }).click();
    const landlineRow = page.locator("label, li, div").filter({ hasText: "Công ty Mẫu 1" }).filter({ has: page.locator('input[type="checkbox"]') }).last();
    await expect(landlineRow).toContainText(en("tpl.landline"), { timeout: 15000 });
    await expect(landlineRow.locator('input[type="checkbox"]')).toBeDisabled();
    const mobileRow = page.locator("label, li, div").filter({ hasText: "Công ty Mẫu 2" }).filter({ has: page.locator('input[type="checkbox"]') }).last();
    await expect(mobileRow.locator('input[type="checkbox"]')).toBeEnabled();
  });

  test("the lead detail names the landline", async ({ page }) => {
    const leads = await leadsOf(vnCampaignId);
    const landline = leads.find((l) => l.phoneKind === "landline");
    expect(landline).toBeTruthy();
    await loginOnly(page, USER);
    await page.goto(`/leads/${landline!.id}`);
    await expect(page.getByText(en("leads.phone.landline")).first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Indonesia campaign beside Vietnam is unchanged (TC-VM-8.9)", () => {
  test("an ID fixture campaign has no phone, no coordinates and no region", async () => {
    const created = await api.post(`${API}/campaigns`, { headers: auth(), data: { name: `ID beside VN ${RUN}`, industry: "kopi", location: "Bandung", searchQueries: ["kopi Bandung"], yourService: "Layanan contoh", maxResults: 5 } });
    expect(created.status()).toBe(201);
    const c = (await created.json()) as { id: string; market: string };
    expect(c.market).toBe("ID");
    const started = await api.post(`${API}/scraper/campaigns/${c.id}/start`, { headers: auth(), data: {} });
    expect(started.status()).toBeLessThan(300);
    await waitCompleted(c.id);
    const leads = await leadsOf(c.id);
    expect(leads.length).toBeGreaterThan(0);
    for (const l of leads) {
      expect(l.name).toMatch(/^\[Test data\] kopi Bandung \d+$/);
      expect(l.phone).toBe("");
      expect(l.lat).toBeNull();
      expect(l.province).toBeNull();
      expect(l.phoneKind).toBe("unknown");
    }
  });
});
