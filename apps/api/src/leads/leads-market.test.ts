// S7a: the campaign market decides how scraped, referred and backfilled phones are normalised and who can be messaged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LeadsService, leadPhoneKind } from "./leads.service";
import { TemplateService, whatsappBlock } from "../messaging/template.service";
import { parseReferrals } from "../messaging/wa-text";

const read = (rel: string) => readFileSync(join(__dirname, rel), "utf8");

function createManyPrisma() {
  const calls: Array<Array<{ phoneE164: string | null }>> = [];
  const prisma = { lead: { createMany: async ({ data }: { data: Array<{ phoneE164: string | null }> }) => { calls.push(data); return { count: data.length }; } } };
  return { prisma, calls };
}
const row = (phone: string) => ({ name: "Quán Mẫu", phone, campaignId: "c1", workspaceId: "w1" });

test("createMany under VN stores 84... for landlines and mobiles", async () => {
  const f = createManyPrisma();
  await new LeadsService(f.prisma as never).createMany([row("(028) 3822 1234"), row("0901234567"), row("+84 90 123 4568"), row("1900 1234"), row("")], "VN");
  assert.deepEqual(f.calls[0].map((d) => d.phoneE164), ["842838221234", "84901234567", "84901234568", null, null]);
});

test("createMany without a market stores today's Indonesian value", async () => {
  const f = createManyPrisma();
  await new LeadsService(f.prisma as never).createMany([row("0812-3456-789"), row("0901234567")]);
  assert.deepEqual(f.calls[0].map((d) => d.phoneE164), ["628123456789", "62901234567"]);
  const g = createManyPrisma();
  await new LeadsService(g.prisma as never).createMany([row("0812-3456-789"), row("0901234567")], "ID");
  assert.deepEqual(g.calls[0], f.calls[0]);
});

function referralPrisma(market: unknown, existing: { id: string } | null = null) {
  const written: { phoneE164?: string } = {};
  let call = 0;
  const prisma = {
    lead: {
      findFirst: async () => (call++ === 0 ? { id: "from-1", name: "Quán Mẫu", category: "Quán", campaignId: "c1", campaign: { language: "vietnamese", market } } : existing),
      create: async ({ data }: { data: { phoneE164: string } }) => { written.phoneE164 = data.phoneE164; return { id: "n1" }; },
    },
    whatsappAccount: { findUnique: async () => ({ defaultCountryCode: "62" }) },
    leadActivity: { create: async () => ({}) },
  };
  return { prisma, written };
}

test("a referral from a VN-campaign lead is normalised with the Vietnamese rules", async () => {
  const f = referralPrisma("VN");
  await new LeadsService(f.prisma as never).createFromReferral("w", "from-1", { phone: "090 123 4567" });
  assert.equal(f.written.phoneE164, "84901234567");
  const l = referralPrisma("VN");
  await new LeadsService(l.prisma as never).createFromReferral("w", "from-1", { phone: "(028) 3822 1234" });
  assert.equal(l.written.phoneE164, "842838221234");
});

test("a referral from an ID (or legacy) lead keeps today's rule", async () => {
  for (const m of ["ID", null, undefined, "vn"]) {
    const f = referralPrisma(m);
    await new LeadsService(f.prisma as never).createFromReferral("w", "from-1", { phone: "0812-3456-789" });
    assert.equal(f.written.phoneE164, "628123456789", String(m));
  }
});

test("a VN referral with a service number is refused; an existing number creates nothing", async () => {
  const f = referralPrisma("VN");
  await assert.rejects(new LeadsService(f.prisma as never).createFromReferral("w", "from-1", { phone: "1900 1234" }));
  const g = referralPrisma("VN", { id: "old" });
  assert.deepEqual(await new LeadsService(g.prisma as never).createFromReferral("w", "from-1", { phone: "0901234567" }), { created: false, leadId: "old" });
});

test("findOne returns phoneKind computed from the campaign market", async () => {
  const mk = (phoneE164: string, market: string) => ({ id: "l1", phoneE164, campaign: { id: "c", name: "n", market }, activities: [], followUps: [] });
  const run = (l: object) => new LeadsService({ lead: { findFirst: async () => l } } as never).findOne("l1", "w");
  assert.equal((await run(mk("842838221234", "VN"))).phoneKind, "landline");
  assert.equal((await run(mk("84901234567", "VN"))).phoneKind, "mobile");
  assert.equal((await run(mk("842838221234", "ID"))).phoneKind, "unknown");
  assert.equal(leadPhoneKind("", "VN"), "unknown");
  assert.equal(leadPhoneKind(null, "VN"), "unknown");
  assert.equal(leadPhoneKind("1900123456", "VN"), "unknown");
});

test("parseReferrals reads Vietnamese numbers only with market VN", () => {
  const text = "Bạn liên hệ Lan 0901234567 nhé";
  assert.ok(parseReferrals(text, "VN").some((r) => r.phone.endsWith("901234567")));
  assert.deepEqual(parseReferrals(text), parseReferrals(text, "ID"));
});

test("inbound.service passes the lead's campaign market to parseReferrals and the backfill", () => {
  const src = read("../messaging/inbound.service.ts");
  assert.ok(src.includes("parseReferrals(conv.incoming, normalizeMarket(lead.campaign?.market))"));
  assert.ok(src.includes("normalizePhoneFor(r.phone, normalizeMarket(r.campaign?.market))"));
});

const mkLead = (id: string, phone: string, phoneE164: string | null, market: string, email: string | null = null) => ({ id, name: id, category: "c", phone, phoneE164, email, score: 1, crmStatus: "new", campaign: { market }, outbound: [] });

test("template leads: landline and service numbers are unreachable on WhatsApp with a reason; email is unaffected", async () => {
  const rows = [mkLead("m", "0901234567", "84901234567", "VN"), mkLead("l", "(028) 3822 1234", "842838221234", "VN", "a@example.com"), mkLead("s", "1900 1234", "", "VN"), mkLead("i", "0812-3456-789", null, "ID"), mkLead("n", "", null, "VN")];
  const svc = new TemplateService({ lead: { findMany: async () => rows } } as never, {} as never, {} as never);
  const wa = await svc.leads("w", { channel: "whatsapp" });
  const by = Object.fromEntries(wa.map((r) => [r.id, r as { reachable: boolean; reason?: string }]));
  assert.equal(by.m.reachable, true);
  assert.equal(by.l.reachable, false);
  assert.equal(by.l.reason, "landline");
  assert.equal(by.s.reachable, false);
  assert.equal(by.i.reachable, true);
  assert.equal(by.n.reachable, false);
  const em = await svc.leads("w", { channel: "email" });
  assert.equal(em.find((r) => r.id === "l")!.reachable, true);
  assert.ok(em.every((r) => !("reason" in r)));
});

test("whatsappBlock: only VN landline and service numbers are blocked", () => {
  assert.equal(whatsappBlock("842838221234", "VN"), "landline");
  assert.equal(whatsappBlock("841900123456", "VN"), "service");
  assert.equal(whatsappBlock("84901234567", "VN"), null);
  assert.equal(whatsappBlock("842838221234", "ID"), null);
});

test("template apply skips VN landlines on WhatsApp and normalises with the lead's market", async () => {
  const created: Array<{ toPhone: string }> = [];
  const rows = [mkLead("m", "0901234567", null, "VN"), mkLead("l", "(028) 3822 1234", "842838221234", "VN"), mkLead("id", "0812-3456-789", null, "ID")];
  const prisma = {
    lead: { findMany: async () => rows, update: async () => ({}) },
    whatsappAccount: { findUnique: async () => null },
    messageOptOut: { findMany: async () => [] },
    emailOptOut: { findMany: async () => [] },
    outboundMessage: { findMany: async () => [], createMany: async ({ data }: { data: Array<{ toPhone: string }> }) => { created.push(...data); return {}; } },
  };
  const r = await new TemplateService(prisma as never, {} as never, {} as never).apply("w", { channel: "whatsapp", leadIds: ["m", "l", "id"], body: "Xin chào {nama}" });
  assert.deepEqual(created.map((c) => c.toPhone), ["84901234567", "628123456789"]);
  assert.equal(r.skipped.noContact, 1);
});

test("dedupe stays first-wins per phoneE164 (createMany keeps skipDuplicates)", async () => {
  let opts: { skipDuplicates?: boolean } = {};
  const prisma = { lead: { createMany: async (o: { skipDuplicates?: boolean }) => { opts = o; return { count: 0 }; } } };
  await new LeadsService(prisma as never).createMany([row("0901234567")], "VN");
  assert.equal(opts.skipDuplicates, true);
});

test("the touched services never log phone numbers", () => {
  // an interpolated number, not the word in a message
  const logCall = new RegExp(["(logger|console)", "[.]", "[a-z]+", "[(]", "[^)]*", "[$][{]", "[^}]*", "(phone|e164)"].join(""), "i");
  for (const f of ["./leads.service.ts", "../messaging/template.service.ts", "../ai/lead-intelligence.service.ts", "../messaging/inbound.service.ts"]) {
    assert.ok(!logCall.test(read(f)), f);
  }
});
