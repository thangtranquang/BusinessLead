import { expect, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
// Relative imports only: the specs run without the web app's path aliases.
import { enAll, viAll, type MessageKey } from "../../apps/web/src/lib/i18n/messages";
import { LANG_COOKIE } from "../../apps/web/src/lib/i18n/lang";

export { enAll, viAll, LANG_COOKIE };
export type { MessageKey };

/** The Vietnamese / English dictionary entry for a key (placeholders left as written). */
export const vi = (key: MessageKey): string => viAll[key];
export const en = (key: MessageKey): string => enAll[key];

export async function setLangCookie(context: BrowserContext, baseURL: string | undefined, value: string): Promise<void> {
  await context.addCookies([{ name: LANG_COOKIE, value, url: baseURL ?? "http://localhost:3000" }]);
}

export async function langCookie(context: BrowserContext): Promise<string | null> {
  const c = (await context.cookies()).find((x) => x.name === LANG_COOKIE);
  return c ? c.value : null;
}

/** Records every assignment to `document.cookie` (before the page scripts run) in `window.__cookieWrites`. */
export async function spyCookieWrites(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cookieWrites: string[] };
    w.__cookieWrites = [];
    const d = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
    if (!d || !d.get || !d.set) return;
    const get = d.get;
    const set = d.set;
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get() { return get.call(document); },
      set(v: string) { w.__cookieWrites.push(String(v)); set.call(document, v); },
    });
  });
}

export const cookieWrites = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __cookieWrites?: string[] }).__cookieWrites ?? []);

/** Makes every read and write of `document.cookie` throw, as a browser with cookies blocked does. */
export async function blockCookies(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(document, "cookie", {
      configurable: true,
      get() { throw new DOMException("blocked", "SecurityError"); },
      set() { throw new DOMException("blocked", "SecurityError"); },
    });
  });
}

export const htmlLang = (page: Page): Promise<string> => page.evaluate(() => document.documentElement.lang);

export async function overflow(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
}

export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const o = await overflow(page);
  expect(o.scrollWidth, `${label}: scrollWidth ${o.scrollWidth} must fit clientWidth ${o.clientWidth}`).toBeLessThanOrEqual(o.clientWidth + 1);
}

/** A string is visible somewhere on the page (exact match of an element's own text). */
export async function expectText(page: Page, text: string): Promise<void> {
  await expect(page.getByText(text, { exact: true }).first(), `text "${text}"`).toBeVisible({ timeout: 15000 });
}

/**
 * Sets a campaign's stored language to the legacy value directly in the database (the API refuses to write it).
 * Returns false when docker is not available, so the caller can skip with a reason.
 */
export function setCampaignLanguageInDb(campaignId: string, language: string): boolean {
  if (!/^[a-z0-9]{10,40}$/i.test(campaignId) || !/^[a-z]{3,20}$/.test(language)) throw new Error("unexpected id or language");
  try {
    execFileSync("docker", ["exec", process.env.E2E_DB_CONTAINER ?? "prospex_db", "psql", "-U", "prospex", "-d", "prospex", "-v", "ON_ERROR_STOP=1", "-c", `update campaigns set language='${language}' where id='${campaignId}'`], { stdio: "pipe", timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}
