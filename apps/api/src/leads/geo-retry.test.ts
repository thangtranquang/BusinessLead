import test from "node:test";
import assert from "node:assert/strict";
import { GeoService } from "./geo.service";

/** The public Nominatim cuts a connection now and then (ECONNRESET). One cut must not lose the lead: retry after a pause. */
const HCM = { address: { suburb: "Phường Tân Sơn", city: "Thành phố Hồ Chí Minh", country_code: "vn" } };

function service() {
  const config = { get: (k: string) => (k === "GEOCODER_RETRY_MS" ? "0" : k === "GEOCODER_DISABLED" ? "false" : undefined) };
  return new GeoService({} as never, config as never) as unknown as { lookup: (lat: number, lng: number, lang: "vi" | "id") => Promise<{ province: string | null } | null> };
}

function stubFetch(plan: Array<"reset" | "ok" | "429">) {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    const step = plan[Math.min(calls++, plan.length - 1)];
    if (step === "reset") throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
    if (step === "429") return new Response("", { status: 429 });
    return new Response(JSON.stringify(HCM), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { calls: () => calls, restore: () => { globalThis.fetch = original; } };
}

test("one connection reset is retried and the lead still gets its province", async () => {
  const f = stubFetch(["reset", "ok"]);
  try {
    const r = await service().lookup(10.79, 106.69, "vi");
    assert.equal(r?.province, "Hồ Chí Minh");
    assert.equal(f.calls(), 2);
  } finally { f.restore(); }
});

test("it gives up after 3 attempts with the network error", async () => {
  const f = stubFetch(["reset"]);
  try {
    await assert.rejects(() => service().lookup(10.79, 106.69, "vi"), /fetch failed/);
    assert.equal(f.calls(), 3);
  } finally { f.restore(); }
});

test("a 429 is never retried (the run stops as rate-limited)", async () => {
  const f = stubFetch(["429"]);
  try {
    await assert.rejects(() => service().lookup(10.79, 106.69, "vi"), /rate-limited/);
    assert.equal(f.calls(), 1);
  } finally { f.restore(); }
});
