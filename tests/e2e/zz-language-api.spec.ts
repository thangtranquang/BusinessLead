import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";

// HTTP matrix for the output language (PRD 1.9, AC-7, AC-4). It talks to the real API.
// The file name (zz-) sorts after every other spec so it runs LAST: the API has a global throttle (60 requests / 60 s per client),
// so this spec keeps a reduced request set and paces itself (and waits out a 429 once if an earlier spec used the window).
// Valid values are NOT sent to the two routes that call the AI model (template generate, brief generate): without a real model
// they fail with a 5xx, and with a real key they would spend it. Their validation layer is covered with invalid values (400).

const API = (process.env.API_URL ?? "http://localhost:3001/api").replace(/\/$/, "");
const MESSAGE = "language must be one of: vietnamese, english";
const RUN = Date.now();

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
const post = (path: string, data: unknown, s = owner) => paced(() => api.post(`${API}${path}`, { data, headers: auth(s) }));
const patch = (path: string, data: unknown, s = owner) => paced(() => api.patch(`${API}${path}`, { data, headers: auth(s) }));

async function register(label: string): Promise<Session> {
  const res = await paced(() => api.post(`${API}/auth/register`, { data: { name: `Lang ${label}`, email: `lang-${label}-${RUN}@prospex.test`, password: "TestPass123!", workspaceName: `Lang ${label} ${RUN}` } }));
  expect(res.status()).toBe(201);
  const body = (await res.json()) as { token: string; workspace: { id: string } };
  return { token: body.token, workspaceId: body.workspace.id };
}

const CAMPAIGN = { name: "Lang HTTP", industry: "cafe", location: "Hà Nội", searchQueries: ["cafe Hà Nội"], yourService: "Phần mềm đặt bàn" };

// language values: [label, value]; only a string value can be checked for an echo
const BAD: [string, unknown][] = [
  ["indonesian (the removed value)", "indonesian"],
  ["null", null],
  ["empty string", ""],
  ["upper case", "VIETNAMESE"],
  ["a number", 123],
];

async function expectLanguageRejected(res: APIResponse, value: unknown) {
  expect(res.status()).toBe(400);
  const text = await res.text();
  const body = JSON.parse(text) as { message: string | string[] };
  expect([body.message].flat()).toContain(MESSAGE);
  // the rejected value is never echoed back
  if (typeof value === "string" && value.length > 0 && !MESSAGE.includes(value)) expect(text).not.toContain(value);
}

test.beforeAll(async ({ playwright }) => {
  api = await playwright.request.newContext();
  owner = await register("owner");
  other = await register("other");
});
test.afterAll(async () => { await api.dispose(); });

test.describe("POST /campaigns", () => {
  test("accepts vietnamese and english and stores them", async () => {
    for (const language of ["vietnamese", "english"]) {
      const res = await post("/campaigns", { ...CAMPAIGN, name: `${CAMPAIGN.name} ${language}`, language });
      expect(res.status()).toBe(201);
      expect(((await res.json()) as { language: string }).language).toBe(language);
    }
  });

  test("an omitted language is stored as vietnamese", async () => {
    const res = await post("/campaigns", CAMPAIGN);
    expect(res.status()).toBe(201);
    expect(((await res.json()) as { language: string }).language).toBe("vietnamese");
  });

  for (const [label, value] of BAD) {
    test(`rejects ${label} with 400 and no echo`, async () => {
      await expectLanguageRejected(await post("/campaigns", { ...CAMPAIGN, language: value }), value);
    });
  }
});

test.describe("PATCH /campaigns/:id", () => {
  let id: string;
  test.beforeAll(async () => {
    const res = await post("/campaigns", { ...CAMPAIGN, name: "Lang patch", language: "vietnamese" });
    id = ((await res.json()) as { id: string }).id;
  });

  test("the owner can switch the language and it persists", async () => {
    const res = await patch(`/campaigns/${id}`, { language: "english" });
    expect(res.status()).toBe(200);
    const got = await paced(() => api.get(`${API}/campaigns/${id}`, { headers: auth(owner) }));
    expect(((await got.json()) as { language: string }).language).toBe("english");
    expect((await patch(`/campaigns/${id}`, { language: "vietnamese" })).status()).toBe(200);
  });

  for (const [label, value] of BAD.slice(0, 3)) {
    test(`rejects ${label} with 400 (a PATCH can never clear the language)`, async () => {
      await expectLanguageRejected(await patch(`/campaigns/${id}`, { language: value }), value);
    });
  }

  test("a member of another workspace gets 404 and the campaign is unchanged", async () => {
    const res = await patch(`/campaigns/${id}`, { language: "english" }, other);
    expect(res.status()).toBe(404);
    const got = await paced(() => api.get(`${API}/campaigns/${id}`, { headers: auth(owner) }));
    expect(((await got.json()) as { language: string }).language).toBe("vietnamese");
  });
});

test.describe("routes that carry a language", () => {
  const routes: { name: string; path: string; body: (language: unknown) => unknown; valid?: "no-model" | "skip" }[] = [
    { name: "POST /marketing/brief/generate", path: "/marketing/brief/generate", body: (language) => ({ language }), valid: "skip" },
    { name: "POST /messaging/templates/generate", path: "/messaging/templates/generate", body: (language) => ({ segment: "quán cà phê", channel: "whatsapp", language }), valid: "skip" },
    { name: "POST /messaging/templates/apply", path: "/messaging/templates/apply", body: (language) => ({ channel: "whatsapp", leadIds: ["does-not-exist"], body: "Xin chào", language }), valid: "no-model" },
    { name: "POST /style/draft", path: "/style/draft", body: (language) => ({ incoming: "Xin chào", language }), valid: "no-model" },
  ];

  for (const r of routes) {
    test.describe(r.name, () => {
      for (const [label, value] of BAD.slice(0, 3)) {
        test(`rejects ${label} with 400 and no echo`, async () => {
          await expectLanguageRejected(await post(r.path, r.body(value)), value);
        });
      }

      if (r.valid === "no-model") {
        for (const language of ["vietnamese", "english"]) {
          test(`passes validation for ${language} (never a language 400)`, async () => {
            const res = await post(r.path, r.body(language));
            const text = await res.text();
            expect(text).not.toContain(MESSAGE);
            // apply: nothing to draft for an unknown lead; style/draft: no style profile yet. Neither reaches the model.
            expect(res.status()).toBeLessThan(500);
          });
        }
      } else {
        test("valid values are not sent: the route calls the AI model", async () => {
          test.skip(true, "needs a real AI provider: without one it returns 5xx, with one it spends the key; the validation layer is covered by the invalid values above");
        });
      }
    });
  }
});
