import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { execFileSync } from "node:child_process";

// HTTP matrix for the campaign market (PRD 2.13, VM-AC-11, TC-VM-3.x, 9.20, 14.6, 14.7, 19.x, S.12). It talks to the real API.
// The file name (zz-) sorts after every other spec so it runs LAST: the API has a global throttle (60 requests / 60 s per client),
// so this spec keeps a reduced request set and paces itself (and waits out a 429 once if an earlier spec used the window).

const API = (process.env.API_URL ?? "http://localhost:3001/api").replace(/\/$/, "");
const MESSAGE = "market must be one of: ID, VN";
const RUN = Date.now();
const PROVINCE = "Hồ Chí Minh";

test.describe.configure({ mode: "serial" });

const calls: number[] = [];
const PER_WINDOW = 40; // stay well under the global limit of 60 per 60 s
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function paced(send: () => Promise<APIResponse>): Promise<APIResponse> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const now = Date.now();
    while (calls.length && now - calls[0] > 60_000) calls.shift();
    if (calls.length >= PER_WINDOW) await sleep(60_000 - (now - calls[0]) + 250);
    calls.push(Date.now());
    const res = await send();
    if (res.status() !== 429) return res;
    await sleep(Number(res.headers()["retry-after"] ?? 61) * 1000 + 500);
  }
  return send();
}

interface Session { token: string; workspaceId: string }
let owner: Session;
let other: Session;
let api: APIRequestContext;

const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
const get = (path: string, s = owner) => paced(() => api.get(`${API}${path}`, { headers: auth(s) }));
const post = (path: string, data: unknown, s = owner) => paced(() => api.post(`${API}${path}`, { data, headers: auth(s) }));
const patch = (path: string, data: unknown, s = owner) => paced(() => api.patch(`${API}${path}`, { data, headers: auth(s) }));

async function register(label: string): Promise<Session> {
  const res = await paced(() => api.post(`${API}/auth/register`, { data: { name: `Market ${label}`, email: `market-${label}-${RUN}@prospex.test`, password: "TestPass123!", workspaceName: `Market ${label} ${RUN}` } }));
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { token: string; workspace: { id: string } };
  return { token: body.token, workspaceId: body.workspace.id };
}

/** Sets a campaign's status directly in the test database (the API has no way to force "running"). False without docker. */
function setStatusInDb(campaignId: string, status: "running" | "failed"): boolean {
  if (!/^[a-z0-9]{10,40}$/i.test(campaignId)) throw new Error("unexpected id");
  try {
    execFileSync("docker", ["exec", process.env.E2E_DB_CONTAINER ?? "prospex_db", "psql", "-U", "prospex", "-d", "prospex", "-v", "ON_ERROR_STOP=1", "-c", `update campaigns set status='${status}' where id='${campaignId}'`], { stdio: "pipe", timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}

const CAMPAIGN = { name: "Market HTTP", industry: "logistics", location: "TP.HCM", searchQueries: ["logistics TP.HCM"], yourService: "Dịch vụ mẫu", maxResults: 5 };

// market values that must be refused: [label, value]
const BAD: [string, unknown][] = [
  ["lower case vn", "vn"],
  ["null", null],
  ["empty string", ""],
  ["an empty array", []],
  ["an unknown code XX", "XX"],
  ["a number", 123],
];

async function expectMarketRejected(res: APIResponse, value: unknown) {
  expect(res.status()).toBe(400);
  const text = await res.text();
  const body = JSON.parse(text) as { message: string | string[] };
  expect([body.message].flat()).toContain(MESSAGE);
  // the rejected value is never echoed back
  if (typeof value === "string" && value.length > 0 && !MESSAGE.includes(value)) expect(text).not.toContain(value);
}

async function waitCompleted(id: string, s = owner): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const c = (await (await get(`/campaigns/${id}`, s)).json()) as { status: string };
    if (c.status === "completed") return;
    expect(c.status, "campaign must not fail").not.toBe("failed");
    await sleep(2000);
  }
  throw new Error("campaign did not complete in time");
}

let completedVn: string; // a finished VN campaign of the owner (non-draft)
let draftId: string;
let vnLeadId: string;

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext();
  owner = await register("owner");
  other = await register("other");
});
test.afterAll(async () => { await api.dispose(); });

test.describe("POST /campaigns", () => {
  test("accepts ID and VN and stores them", async () => {
    for (const market of ["ID", "VN"]) {
      const res = await post("/campaigns", { ...CAMPAIGN, name: `${CAMPAIGN.name} ${market}`, market });
      expect(res.status()).toBe(201);
      const body = (await res.json()) as { id: string; market: string };
      expect(body.market).toBe(market);
      if (market === "VN") completedVn = body.id;
    }
  });

  test("an omitted market is stored as ID", async () => {
    const res = await post("/campaigns", CAMPAIGN);
    expect(res.status()).toBe(201);
    expect(((await res.json()) as { market: string }).market).toBe("ID");
  });

  for (const [label, value] of BAD) {
    test(`rejects ${label} with 400 and no echo`, async () => {
      await expectMarketRejected(await post("/campaigns", { ...CAMPAIGN, market: value }), value);
    });
  }
});

test.describe("authentication (TC-VM-19.1, 19.2)", () => {
  test("create, patch and start without a token or with a garbage token give 401", async () => {
    for (const headers of [{}, { Authorization: "Bearer garbage.token.value" }]) {
      expect((await paced(() => api.post(`${API}/campaigns`, { data: { ...CAMPAIGN, market: "VN" }, headers }))).status()).toBe(401);
      expect((await paced(() => api.patch(`${API}/campaigns/${completedVn}`, { data: { market: "VN" }, headers }))).status()).toBe(401);
      expect((await paced(() => api.post(`${API}/scraper/campaigns/${completedVn}/start`, { data: {}, headers }))).status()).toBe(401);
    }
  });
});

test.describe("PATCH /campaigns/:id (draft only)", () => {
  test.beforeAll(async () => {
    const res = await post("/campaigns", { ...CAMPAIGN, name: "Market patch" });
    draftId = ((await res.json()) as { id: string }).id;
  });

  test("a draft can change market and it persists", async () => {
    expect((await patch(`/campaigns/${draftId}`, { market: "VN" })).status()).toBe(200);
    const got = (await (await get(`/campaigns/${draftId}`)).json()) as { market: string };
    expect(got.market).toBe("VN");
    expect((await patch(`/campaigns/${draftId}`, { market: "ID" })).status()).toBe(200);
  });

  for (const [label, value] of BAD.slice(0, 5)) {
    test(`rejects ${label} with 400 (a PATCH can never clear or corrupt the market)`, async () => {
      await expectMarketRejected(await patch(`/campaigns/${draftId}`, { market: value }), value);
    });
  }

  test("after a rejected value the stored market is unchanged", async () => {
    const got = (await (await get(`/campaigns/${draftId}`)).json()) as { market: string };
    expect(got.market).toBe("ID");
  });

  test("a PATCH without market still works (other fields) and leaves the market alone", async () => {
    expect((await patch(`/campaigns/${draftId}`, { name: "Market patch renamed" })).status()).toBe(200);
    expect(((await (await get(`/campaigns/${draftId}`)).json()) as { market: string }).market).toBe("ID");
  });
});

test.describe("start, non-draft campaigns and workspaces (TC-VM-3.10 to 3.13)", () => {
  test("start a VN campaign: 202, it completes and the market stays VN", async () => {
    const res = await post(`/scraper/campaigns/${completedVn}/start`, {});
    expect(res.status()).toBe(202);
    await waitCompleted(completedVn);
    expect(((await (await get(`/campaigns/${completedVn}`)).json()) as { market: string }).market).toBe("VN");
  });

  test("PATCH market on a completed campaign is 409 and the market is unchanged", async () => {
    const res = await patch(`/campaigns/${completedVn}`, { market: "ID" });
    expect(res.status()).toBe(409);
    expect(JSON.stringify(await res.json())).toContain("The market can only be changed while the campaign is a draft");
    expect(((await (await get(`/campaigns/${completedVn}`)).json()) as { market: string }).market).toBe("VN");
  });

  test("start on a completed campaign is 409 and queues nothing", async () => {
    const res = await post(`/scraper/campaigns/${completedVn}/start`, {});
    expect(res.status()).toBe(409);
    expect(JSON.stringify(await res.json())).toContain("The campaign can only be started while it is a draft or has failed");
  });

  test("start on a running campaign is 409; on a failed campaign it is allowed again", async () => {
    test.setTimeout(120_000);
    const res0 = await post("/campaigns", { ...CAMPAIGN, name: "Market status" });
    const id = ((await res0.json()) as { id: string }).id;
    test.skip(!setStatusInDb(id, "running"), "docker is not available to set the status");
    expect((await post(`/scraper/campaigns/${id}/start`, {})).status()).toBe(409);
    expect((await patch(`/campaigns/${id}`, { market: "VN" })).status()).toBe(409);
    expect(setStatusInDb(id, "failed")).toBe(true);
    expect((await post(`/scraper/campaigns/${id}/start`, {})).status()).toBe(202);
    await waitCompleted(id);
  });

  test("another workspace gets 404 for PATCH and start, and 404 wins over 409 on a non-draft campaign", async () => {
    // completedVn is not a draft: a member of another workspace must still see 404, never the 409 that would confirm it exists
    for (const market of ["ID", "VN"]) expect((await patch(`/campaigns/${completedVn}`, { market }, other)).status()).toBe(404);
    expect((await patch(`/campaigns/${draftId}`, { market: "VN" }, other)).status()).toBe(404);
    expect((await post(`/scraper/campaigns/${draftId}/start`, {}, other)).status()).toBe(404);
    expect((await post(`/scraper/campaigns/${completedVn}/start`, {}, other)).status()).toBe(404);
    expect(((await (await get(`/campaigns/${draftId}`)).json()) as { market: string }).market).toBe("ID");
  });
});

test.describe("region filter isolation and exactness (TC-VM-14.6, 14.7, 19.7)", () => {
  test("the owner finds the leads by exact province; the other workspace finds none; no diacritics finds none", async () => {
    const mine = (await (await get(`/leads?province=${encodeURIComponent(PROVINCE)}&limit=100`)).json()) as { data: { id: string; province: string }[]; total: number };
    expect(mine.total).toBeGreaterThan(0);
    for (const l of mine.data) expect(l.province).toBe(PROVINCE);
    vnLeadId = mine.data[0].id;
    const theirs = (await (await get(`/leads?province=${encodeURIComponent(PROVINCE)}`, other)).json()) as { data: unknown[]; total: number };
    expect(theirs.total).toBe(0);
    expect(theirs.data).toHaveLength(0);
    const plain = (await (await get("/leads?province=Ho%20Chi%20Minh")).json()) as { total: number };
    expect(plain.total, "the filter is exact as stored; no fuzzy match is added").toBe(0);
  });

  test("the other workspace's leads, analytics and export never contain the owner's campaign or market", async () => {
    for (const path of ["/leads?limit=100", "/analytics", "/export/leads/json"]) {
      const res = await get(path, other);
      expect(res.status(), path).toBe(200);
      const text = await res.text();
      expect(text, path).not.toContain(completedVn);
      expect(text, path).not.toContain(PROVINCE);
    }
  });
});

test.describe("phone length cap (TC-VM-9.20, S.12)", () => {
  const digits = (n: number) => "9".repeat(n);

  test("manual outbox phone: 64 characters pass the DTO, 65 are a 400 about length", async () => {
    const ok = await post("/messaging/outbox/manual", { phone: digits(64), body: "Xin chào" });
    expect(JSON.stringify(await ok.json().catch(() => ({})))).not.toMatch(/shorter than or equal to 64/);
    const bad = await post("/messaging/outbox/manual", { phone: digits(65), body: "Xin chào" });
    expect(bad.status()).toBe(400);
    expect(JSON.stringify(await bad.json())).toMatch(/phone must be shorter than or equal to 64 characters/);
  });

  test("referral phone: 64 pass the DTO, 65 are a 400 about length", async () => {
    expect(vnLeadId).toBeTruthy();
    const ok = await post(`/leads/${vnLeadId}/referral`, { phone: digits(64) });
    expect(JSON.stringify(await ok.json().catch(() => ({})))).not.toMatch(/shorter than or equal to 64/);
    const bad = await post(`/leads/${vnLeadId}/referral`, { phone: digits(65) });
    expect(bad.status()).toBe(400);
    expect(JSON.stringify(await bad.json())).toMatch(/phone must be shorter than or equal to 64 characters/);
  });

  test("a 1 MB phone is refused fast (413 from the body-size limit, or 400 from the DTO), never a 500", async () => {
    const started = Date.now();
    const res = await post("/messaging/outbox/manual", { phone: "9".repeat(1_000_000), body: "Xin chào" });
    expect([400, 413]).toContain(res.status());
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
