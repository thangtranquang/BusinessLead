import { test } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { MessagingService } from "./messaging.service";
import { SenderService } from "./sender.service";

// VM-FR-25 (PRD only): a WhatsApp message to a Vietnamese landline or service number is refused at approve and again at send, after
// the claim and the opt-out check, before the provider is touched. Everything is a fake; numbers are invented.

const LANDLINE = "842838221234";
const MOBILE = "84901234567";
const SERVICE = "841900123456";
const ID_NUM = "622155512344";
const INTL = "6561234567";

interface Lead { phoneE164: string | null; campaign: { market: string } | null }
interface Row { id: string; workspaceId: string; channel: string; status: string; body: string; aiBody: string | null; subject: string | null; toPhone: string; toEmail: string | null; leadId: string | null; attachmentId: string | null; linkPreview: unknown; source: string; attempts: number; lead?: Lead | null }
const lineLead = (e164: string, market = "VN"): Lead => ({ phoneE164: e164, campaign: { market } });
const row = (over: Partial<Row> = {}): Row => ({ id: "m1", workspaceId: "ws1", channel: "whatsapp", status: "draft", body: "Dạ em chào anh", aiBody: null, subject: null, toPhone: MOBILE, toEmail: null, leadId: "l1", attachmentId: null, linkPreview: null, source: "ai_outreach", attempts: 0, lead: lineLead(MOBILE), ...over });

function approveHarness(rows: Row[], optedOut: string[] = []) {
  const writes: unknown[] = [];
  const prisma = {
    whatsappAccount: { upsert: async () => ({ defaultCountryCode: "84" }) },
    messageOptOut: { findMany: async () => optedOut.map((phone) => ({ phone })) },
    emailOptOut: { findMany: async () => [] },
    emailAccount: { findUnique: async () => ({ id: "acc" }) },
    outboundMessage: {
      findMany: async () => rows.filter((r) => r.status === "draft"),
      updateMany: async (a: unknown) => { writes.push(a); return { count: 1 }; },
    },
  };
  const svc = new MessagingService(prisma as never, {} as never, {} as never, {} as never, {} as never);
  return { svc, writes };
}

const notMobile = (e: unknown) => e instanceof BadRequestException && e.message === "Not a mobile number";

test("TC-VM-11.10 approve rejects a landline with 400 Not a mobile number; the draft stays a draft (no write at all)", async () => {
  const h = approveHarness([row({ toPhone: LANDLINE, lead: lineLead(LANDLINE) })]);
  await assert.rejects(() => h.svc.approve("ws1", ["m1"]), notMobile);
  assert.equal(h.writes.length, 0);
});

test("TC-VM-11.11 approve rejects a stored service-kind number", async () => {
  const h = approveHarness([row({ toPhone: SERVICE, lead: lineLead(SERVICE) })]);
  await assert.rejects(() => h.svc.approve("ws1", ["m1"]), notMobile);
  assert.equal(h.writes.length, 0);
});

test("TC-VM-11.12 approve allows mobile, international-unknown and Indonesian numbers", async () => {
  for (const [to, lead] of [[MOBILE, lineLead(MOBILE)], [INTL, lineLead(INTL)], [ID_NUM, lineLead(ID_NUM, "ID")]] as const) {
    const h = approveHarness([row({ toPhone: to, lead })]);
    const r = await h.svc.approve("ws1", ["m1"]);
    assert.equal(r.approved, 1, to);
    assert.equal(h.writes.length, 1);
  }
});

test("TC-VM-11.19 an ID lead with a landline-looking number is approved as before", async () => {
  const h = approveHarness([row({ toPhone: "62215551234", lead: lineLead("62215551234", "ID") })]);
  assert.equal((await h.svc.approve("ws1", ["m1"])).approved, 1);
});

test("a message without a lead (free-typed number) is not classified", async () => {
  const h = approveHarness([row({ toPhone: LANDLINE, leadId: null, lead: null })]);
  assert.equal((await h.svc.approve("ws1", ["m1"])).approved, 1);
});

test("TC-VM-11.13 the email channel is not blocked by a landline phone on the lead", async () => {
  process.env.PUBLIC_API_URL = "https://api.example.com/api";
  const h = approveHarness([row({ channel: "email", toPhone: "", toEmail: "khach@example.com", subject: "Chào", lead: lineLead(LANDLINE) })]);
  assert.equal((await h.svc.approve("ws1", ["m1"])).approved, 1);
});

test("TC-VM-11.16 opt-out is checked before the landline guard: an opted-out landline is rejected by opt-out (not a 400), as before", async () => {
  const h = approveHarness([row({ toPhone: LANDLINE, lead: lineLead(LANDLINE) })], [LANDLINE]);
  assert.deepEqual(await h.svc.approve("ws1", ["m1"]), { approved: 0, rejected: [{ id: "m1", reason: "recipient opted out" }] });
  const h2 = approveHarness([row({ toPhone: MOBILE })], [MOBILE]);
  assert.deepEqual((await h2.svc.approve("ws1", ["m1"])).rejected, [{ id: "m1", reason: "recipient opted out" }]);
});

// ---------- createManual ----------

function manualHarness(code: string) {
  const created: unknown[] = [];
  const prisma = {
    whatsappAccount: { upsert: async () => ({ defaultCountryCode: code }) },
    messageOptOut: { findUnique: async () => null },
    lead: { findFirst: async () => null },
    outboundMessage: { create: async (a: unknown) => { created.push(a); return a; } },
  };
  return { svc: new MessagingService(prisma as never, {} as never, {} as never, {} as never, {} as never), created };
}

test("createManual: a typed 1800/1900 number under country code 84 is a 400 Service number", async () => {
  const h = manualHarness("84");
  await assert.rejects(() => h.svc.createManual("ws1", { phone: "1900 123 456", body: "Xin chào" }), (e: unknown) => e instanceof BadRequestException && e.message === "Service number: not WhatsApp-capable");
  assert.equal(h.created.length, 0);
});

test("createManual: a typed mobile under 84 is created as a draft; the service rule does not apply under country code 62", async () => {
  const h = manualHarness("84");
  await h.svc.createManual("ws1", { phone: "090 123 4567", body: "Xin chào" });
  assert.equal(h.created.length, 1);
  const id = manualHarness("62");
  await id.svc.createManual("ws1", { phone: "1900 123 456", body: "Halo" });
  assert.equal(id.created.length, 1);
});

// ---------- sender ----------

function senderHarness(msg: Row, optedOut = false) {
  const events: string[] = [];
  let status = msg.status;
  const account = { id: "acc1", workspaceId: "ws1", provider: "baileys", paused: false, timezone: "Asia/Ho_Chi_Minh", hourlyLimit: 10, dailyLimit: 50, quietStartHour: 0, quietEndHour: 0, nextSendAt: null };
  const prisma = {
    whatsappAccount: { findMany: async () => [account], update: async () => ({}) },
    outboundMessage: {
      findFirst: async (a: { where: { source?: string } }) => (a.where.source === "ai_reply" ? null : status === "approved" ? msg : null),
      count: async () => 0,
      updateMany: async () => { if (status !== "approved") return { count: 0 }; status = "sending"; events.push("claim"); return { count: 1 }; },
      update: async (a: { data: { status?: string; error?: string } }) => { status = a.data.status ?? status; events.push(`update:${a.data.status}:${a.data.error ?? ""}`); return {}; },
    },
    messageOptOut: { findUnique: async () => { events.push("optout-check"); return optedOut ? { id: "o" } : null; } },
    lead: { findFirst: async () => { events.push("lead-read"); return msg.lead ?? null; }, updateMany: async () => ({ count: 1 }), update: async () => ({}) },
    leadActivity: { create: async () => ({}) },
  };
  const wa = {
    use: () => undefined,
    state: () => ({ status: "connected" }),
    resolve: async () => { events.push("provider-resolve"); return "jid"; },
    send: async () => { events.push("provider-send"); return "pid"; },
  };
  const svc = new SenderService(prisma as never, { get: () => undefined } as never, wa as never, { has: async () => true } as never, {} as never);
  return { svc, events, status: () => status };
}

test("TC-VM-11.14/11.17 sender: claim, then landline check, then failed Not a mobile number; the provider is never called", async () => {
  const h = senderHarness(row({ status: "approved", toPhone: LANDLINE, lead: lineLead(LANDLINE) }));
  await h.svc.tick("ws1");
  assert.equal(h.status(), "failed");
  assert.ok(!h.events.some((e) => e.startsWith("provider")), "provider must not be called");
  const fail = h.events.indexOf("update:failed:Not a mobile number");
  assert.ok(h.events.indexOf("claim") === 0 && fail > 0, h.events.join(","));
  assert.ok(h.events.indexOf("optout-check") < fail, "opt-out is read before the landline decision");
});

test("TC-VM-11.14 sender: a service number fails the same way", async () => {
  const h = senderHarness(row({ status: "approved", toPhone: SERVICE, lead: lineLead(SERVICE) }));
  await h.svc.tick("ws1");
  assert.equal(h.status(), "failed");
  assert.ok(!h.events.some((e) => e.startsWith("provider")));
});

test("TC-VM-11.16/S.10 sender: an opted-out landline is cancelled by opt-out, the provider is never called, the lead is not read", async () => {
  const h = senderHarness(row({ status: "approved", toPhone: LANDLINE, lead: lineLead(LANDLINE) }), true);
  await h.svc.tick("ws1");
  assert.equal(h.status(), "cancelled");
  assert.ok(h.events.includes("update:cancelled:Recipient opted out"));
  assert.ok(!h.events.some((e) => e.startsWith("provider")));
  assert.ok(!h.events.includes("lead-read"));
});

test("TC-VM-11.15/11.19 sender: mobile, unknown and ID numbers go to the provider as before", async () => {
  for (const lead of [lineLead(MOBILE), lineLead(INTL), lineLead("62215551234", "ID")]) {
    const h = senderHarness(row({ status: "approved", toPhone: lead.phoneE164 ?? "", lead }));
    await h.svc.tick("ws1");
    assert.equal(h.status(), "sent");
    assert.deepEqual(h.events.filter((e) => e.startsWith("provider")), ["provider-resolve", "provider-send"]);
  }
});

test("sender: a message without a lead (free-typed) goes through without a lead read", async () => {
  const h = senderHarness(row({ status: "approved", leadId: null, lead: null, toPhone: LANDLINE }));
  await h.svc.tick("ws1");
  assert.equal(h.status(), "sent");
  assert.ok(!h.events.includes("lead-read"));
});

test("no phone number is written to the log by the guard", async () => {
  const logged: string[] = [];
  const saved = [console.log, console.warn, console.error];
  console.log = console.warn = console.error = (...a: unknown[]) => { logged.push(a.join(" ")); };
  try {
    const h = senderHarness(row({ status: "approved", toPhone: LANDLINE, lead: lineLead(LANDLINE) }));
    await h.svc.tick("ws1");
    await assert.rejects(() => approveHarness([row({ toPhone: LANDLINE, lead: lineLead(LANDLINE) })]).svc.approve("ws1", ["m1"]));
  } finally { [console.log, console.warn, console.error] = saved; }
  assert.ok(!logged.join("\n").includes("8428382"), logged.join("\n"));
});
