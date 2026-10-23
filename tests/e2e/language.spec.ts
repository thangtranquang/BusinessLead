import { test, expect } from "./fixtures";
import { test as plain } from "@playwright/test";
import {
  blockCookies, cookieWrites, expectText, htmlLang, langCookie, overflow,
  setCampaignLanguageInDb, setLangCookie, spyCookieWrites, en, vi, type MessageKey,
} from "./helpers-language";

// UC-1..4, 6..8, 20, 26..28, 33..35, 43 (browser part). English stays the default; Vietnamese is chosen with the EN | VI toggle.

// the buttons read "EN" and "VI"; their title carries the language name
const toggle = (page: import("@playwright/test").Page, name: "English" | "Tiếng Việt") => page.getByRole("group", { name: /Language|Ngôn ngữ/ }).getByRole("button", { name: name === "English" ? "EN" : "VI", exact: true });

plain.describe("Language cookie and toggle", () => {
  plain("no cookie: the UI is English and the toggle says so", async ({ page, context }) => {
    await page.goto("/login");
    expect(await htmlLang(page)).toBe("en");
    await expectText(page, en("auth.page.loginTitle"));
    await expect(toggle(page, "English")).toHaveAttribute("aria-pressed", "true");
    await expect(toggle(page, "Tiếng Việt")).toHaveAttribute("aria-pressed", "false");
    expect(await langCookie(context)).toBeNull();
  });

  plain("clicking VI switches the UI to Vietnamese and writes prospex_lang=vi", async ({ page, context }) => {
    await page.goto("/login");
    await toggle(page, "Tiếng Việt").click();
    await expectText(page, vi("auth.page.loginTitle"));
    await expectText(page, vi("auth.login.submit"));
    expect(await htmlLang(page)).toBe("vi");
    expect(await langCookie(context)).toBe("vi");
    await expect(toggle(page, "Tiếng Việt")).toHaveAttribute("aria-pressed", "true");
  });

  plain("reload keeps Vietnamese with no flash: the server already renders it", async ({ page, context }) => {
    await page.goto("/login");
    await toggle(page, "Tiếng Việt").click();
    await expect.poll(() => langCookie(context)).toBe("vi");
    // the raw HTML the server sends (no JavaScript has run) already carries lang="vi": the login form itself is drawn
    // by the client behind a guard, so the language attribute is what the server decides
    const res = await context.request.get("/login");
    const html = await res.text();
    expect(html).toMatch(/<html[^>]* lang="vi"/);
    expect(html).not.toMatch(/<html[^>]* lang="en"/);
    await page.reload();
    expect(await htmlLang(page)).toBe("vi");
    await expectText(page, vi("auth.login.submit"));
  });

  plain("clicking EN after VI goes back to English and writes en", async ({ page, context }) => {
    await setLangCookie(context, undefined, "vi");
    await page.goto("/login");
    await toggle(page, "English").click();
    await expectText(page, en("auth.login.submit"));
    expect(await langCookie(context)).toBe("en");
    expect(await htmlLang(page)).toBe("en");
  });

  plain("a legacy cookie value shows English and a click on EN replaces it with en", async ({ page, context }) => {
    await spyCookieWrites(page);
    await setLangCookie(context, undefined, "id");
    await page.goto("/login");
    expect(await htmlLang(page)).toBe("en");
    await expectText(page, en("auth.login.submit"));
    expect(await cookieWrites(page)).toEqual([]);
    await toggle(page, "English").click();
    const writes = await cookieWrites(page);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/^prospex_lang=en;/);
    expect(await langCookie(context)).toBe("en");
  });

  for (const junk of ["VI", "vi ", "indonesian", "x".repeat(300)]) {
    plain(`a junk cookie value (${junk.length > 20 ? "300 chars" : JSON.stringify(junk)}) reads as English, never as Vietnamese`, async ({ page, context }) => {
      await setLangCookie(context, undefined, junk.trim() === junk ? junk : encodeURIComponent(junk));
      await page.goto("/login");
      expect(await htmlLang(page)).toBe("en");
      await expectText(page, en("auth.login.submit"));
    });
  }

  plain("clicking the option that is already active writes nothing when the cookie already equals it", async ({ page, context }) => {
    await spyCookieWrites(page);
    await setLangCookie(context, undefined, "vi");
    await page.goto("/login");
    await toggle(page, "Tiếng Việt").click();
    expect(await cookieWrites(page)).toEqual([]);
    await setLangCookie(context, undefined, "en");
    await page.reload();
    await toggle(page, "English").click();
    expect(await cookieWrites(page)).toEqual([]);
  });

  plain("with no cookie a click on EN still writes the choice", async ({ page, context }) => {
    await spyCookieWrites(page);
    await page.goto("/login");
    await toggle(page, "English").click();
    expect(await cookieWrites(page)).toHaveLength(1);
    expect(await langCookie(context)).toBe("en");
  });

  plain("with cookies blocked the page does not crash and the choice lasts for the session", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await blockCookies(page);
    await page.goto("/login");
    await expectText(page, en("auth.login.submit"));
    await toggle(page, "Tiếng Việt").click();
    await expectText(page, vi("auth.login.submit"));
    await toggle(page, "English").click();
    await expectText(page, en("auth.login.submit"));
    expect(errors).toEqual([]);
  });

  plain("the register page has the toggle and Vietnamese text", async ({ page, context }) => {
    await setLangCookie(context, undefined, "vi");
    await page.goto("/register");
    await expectText(page, vi("auth.page.registerTitle"));
    await expectText(page, vi("auth.register.submit"));
    await expectText(page, vi("auth.register.fullName"));
    await expect(toggle(page, "Tiếng Việt")).toHaveAttribute("aria-pressed", "true");
  });
});

// ---- Vietnamese rendering of the main screens, formatting, layout ----------------------------------------------------------------

const SCREENS: { name: string; path: string; keys: MessageKey[]; tabs?: MessageKey[] }[] = [
  { name: "dashboard", path: "/dashboard", keys: ["nav.dashboard", "nav.campaigns", "nav.leads", "dash.subtitle"] },
  { name: "campaigns list", path: "/campaigns", keys: ["page.campaigns.title", "page.campaigns.subtitle"] },
  { name: "new campaign", path: "/campaigns/new", keys: ["page.newCampaign.title", "camp.form.name", "camp.form.language"] },
  { name: "leads", path: "/leads", keys: ["page.leads.title", "page.leads.subtitle"] },
  { name: "pipeline", path: "/pipeline", keys: ["pipeline.subtitle"] },
  { name: "outbox", path: "/outbox", keys: [], tabs: ["outbox.tab.review", "outbox.tab.queue", "outbox.tab.sent"] },
  { name: "marketing brief", path: "/brief", keys: ["mkt.brief.title", "mkt.brief.intro"] },
  { name: "settings", path: "/settings", keys: ["settings.title", "settings.tab.workspace", "settings.tab.team"] },
  { name: "knowledge base", path: "/knowledge", keys: ["kb.subtitle"] },
  { name: "AI style", path: "/style", keys: ["style.title", "style.intro"] },
  { name: "billing", path: "/billing", keys: ["billing.title"] },
];

test.describe("Vietnamese screens", () => {
  for (const s of SCREENS) {
    test(`${s.name} renders in Vietnamese`, async ({ authedPage: page, context, baseURL }) => {
      await setLangCookie(context, baseURL, "vi");
      await page.goto(s.path);
      expect(await htmlLang(page)).toBe("vi");
      for (const k of s.keys) await expectText(page, vi(k));
      // tab labels carry a counter after the text
      for (const k of s.tabs ?? []) await expect(page.getByRole("tab", { name: new RegExp(`^${vi(k)}`) })).toBeVisible({ timeout: 15000 });
    });
  }

  test("the same screens stay English without the cookie", async ({ authedPage: page }) => {
    await page.goto("/dashboard");
    expect(await htmlLang(page)).toBe("en");
    await expectText(page, en("nav.campaigns"));
    await page.goto("/campaigns");
    await expectText(page, en("page.campaigns.title"));
  });

  test("the toggle in the dashboard header switches the whole screen and survives navigation", async ({ authedPage: page, context }) => {
    await page.goto("/dashboard");
    await toggle(page, "Tiếng Việt").click();
    await expectText(page, vi("dash.subtitle"));
    await page.getByRole("link", { name: vi("nav.leads"), exact: true }).first().click();
    await page.waitForURL(/\/leads/);
    await expectText(page, vi("page.leads.title"));
    expect(await langCookie(context)).toBe("vi");
  });
});

test.describe("Layout in Vietnamese", () => {
  const LAYOUT_PATHS = ["/dashboard", "/campaigns", "/campaigns/new", "/leads", "/pipeline", "/outbox", "/brief", "/settings", "/knowledge", "/style", "/billing"];
  for (const width of [1280, 375]) {
    for (const path of LAYOUT_PATHS) {
      test(`${path} has no horizontal overflow at ${width}px in Vietnamese`, async ({ authedPage: page, context, baseURL }) => {
        await page.setViewportSize({ width, height: 900 });
        await setLangCookie(context, baseURL, "vi");
        await page.goto(path);
        await page.waitForLoadState("load");
        await page.waitForTimeout(800); // data-driven screens settle
        const viO = await overflow(page);
        if (viO.scrollWidth <= viO.clientWidth + 1) return;
        // wider than the window: only a defect of the translation if English fits (or is narrower)
        await setLangCookie(context, baseURL, "en");
        await page.goto(path);
        await page.waitForLoadState("load");
        await page.waitForTimeout(800);
        const enO = await overflow(page);
        test.info().annotations.push({ type: "overflow", description: `${path} @${width}: vi ${viO.scrollWidth}/${viO.clientWidth}, en ${enO.scrollWidth}/${enO.clientWidth}` });
        expect(viO.scrollWidth, `${path} @${width}: Vietnamese must not be wider than English (en ${enO.scrollWidth}, window ${enO.clientWidth})`).toBeLessThanOrEqual(Math.max(enO.scrollWidth, enO.clientWidth) + 1);
        expect(enO.scrollWidth, `${path} @${width}: English itself overflows (existing behaviour, not caused by Vietnamese)`).toBeGreaterThan(enO.clientWidth + 1);
      });
    }
  }
});

plain.describe("Layout of the sign-in pages in Vietnamese", () => {
  for (const width of [1280, 375]) {
    for (const path of ["/login", "/register"]) {
      plain(`${path} has no horizontal overflow at ${width}px in Vietnamese`, async ({ page, context }) => {
        await page.setViewportSize({ width, height: 900 });
        await setLangCookie(context, undefined, "vi");
        await page.goto(path);
        await page.waitForLoadState("load");
        await page.waitForTimeout(800);
        const o = await overflow(page);
        expect(o.scrollWidth, `${path} @${width}`).toBeLessThanOrEqual(o.clientWidth + 1);
      });
    }
  }
});

test.describe("Campaign language", () => {
  test.describe.configure({ mode: "serial" });
  let createdId = "";
  test("the new-campaign form defaults to Vietnamese even in the English UI, and the campaign is stored as vietnamese", async ({ authedPage: page }) => {
    await page.goto("/campaigns/new");
    const langField = page.locator("div.space-y-2", { has: page.getByText(en("camp.form.language"), { exact: true }) }).locator('button[role="combobox"]').first();
    await expect(langField).toContainText(en("camp.lang.vietnamese"));

    const name = `Lang Campaign ${Date.now()}`;
    await page.fill("#name", name);
    await page.fill("#location", "Hà Nội");
    await page.fill("#industry", "quán cà phê");
    await page.getByTestId("query-input").first().fill("quán cà phê Hà Nội");
    await page.fill("#service", "Phần mềm quản lý đặt bàn");
    const created = page.waitForResponse((r) => r.url().endsWith("/campaigns") && r.request().method() === "POST");
    await page.click('button[type="submit"]');
    const res = await created;
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { id: string; language: string };
    expect(body.language).toBe("vietnamese");
    createdId = body.id;
    await page.waitForURL(/\/campaigns\/(?!new$)[a-z0-9-]+$/, { timeout: 15000 });
    // the detail screen names the language in the UI language
    await expect(page.getByText(en("camp.cfg.language"), { exact: true })).toBeVisible();
    await expect(page.locator("body")).toContainText(new RegExp(`${en("camp.cfg.language")}\\s*${en("camp.lang.vietnamese")}`));
  });

  test("the form shows Vietnamese labels and the default language in the Vietnamese UI", async ({ authedPage: page, context, baseURL }) => {
    await setLangCookie(context, baseURL, "vi");
    await page.goto("/campaigns/new");
    const langField = page.locator("div.space-y-2", { has: page.getByText(vi("camp.form.language"), { exact: true }) }).locator('button[role="combobox"]').first();
    await expect(langField).toContainText(vi("camp.lang.vietnamese"));
    await langField.click();
    await expect(page.getByRole("option", { name: vi("camp.lang.vietnamese") })).toBeVisible();
    await expect(page.getByRole("option", { name: vi("camp.lang.english") })).toBeVisible();
    // only the two real values are offered
    await expect(page.getByRole("option")).toHaveCount(2);
  });

  test("a legacy campaign stored as indonesian is shown as English in both UIs, and dates follow the UI locale", async ({ authedPage: page, context, baseURL }) => {
    // the campaign the first test created, rewritten the way an old row would hold it
    const id = createdId;
    expect(id, "the first test of this block creates the campaign").toBeTruthy();
    const done = setCampaignLanguageInDb(id, "indonesian");
    test.skip(!done, "docker/psql is not available to write the legacy value");

    await page.goto(`/campaigns/${id}`);
    await expect(page.locator("body")).toContainText(new RegExp(`${en("camp.cfg.language")}\\s*${en("camp.lang.english")}`));
    const cell = (label: string) => page.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd");
    const enDate = (await cell(en("camp.cfg.created")).innerText()).trim();

    await setLangCookie(context, baseURL, "vi");
    await page.goto(`/campaigns/${id}`);
    await expect(page.locator("body")).toContainText(new RegExp(`${vi("camp.cfg.language")}\\s*${vi("camp.lang.english")}`));
    const viDate = (await cell(vi("camp.cfg.created")).innerText()).trim();
    expect(viDate).not.toBe("");
    expect(viDate).not.toBe(enDate);
    expect(viDate).toMatch(/thg|tháng/i); // vi-VN month wording
    expect(enDate).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/); // en-US

    // the list shows the date in the Vietnamese format too
    await page.goto("/campaigns");
    await expect(page.locator("body")).toContainText(/\d{1,2} thg \d{1,2}, \d{4}/);
  });
});
