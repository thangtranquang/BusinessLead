import { test } from "node:test";
import assert from "node:assert/strict";
import { MessagingService } from "./messaging.service";
import { EmailService } from "../email/email.service";

// VM-FR-21: the outbox time zone suggestion comes from the market of the workspace's latest campaign. Fakes only.

type Camp = { market: string };
const latest = (c: Camp[]) => (c.length ? c[c.length - 1] : null);

function waService(campaigns: Camp[]) {
  const prisma = {
    whatsappAccount: { upsert: async () => ({ provider: "baileys", status: "disconnected", phone: null, hourlyLimit: 8, dailyLimit: 40, quietStartHour: 20, quietEndHour: 7, timezone: "Asia/Jakarta", defaultCountryCode: "62", paused: false, lastError: null, nextSendAt: null }) },
    outboundMessage: { count: async () => 0 },
    campaign: {
      findFirst: async () => latest(campaigns),
      count: async (a?: { where?: { market?: string } }) => campaigns.filter((c) => !a?.where?.market || c.market === a.where.market).length,
    },
  };
  const wa = { use: () => undefined, state: () => ({ status: "disconnected", qr: null, phone: null }), hasCloud: () => false };
  const ent = { has: async () => false, edition: "community" };
  return new MessagingService(prisma as never, {} as never, wa as never, ent as never, {} as never);
}

function mailService(campaigns: Camp[], account: { timezone: string } | null = null) {
  const prisma = {
    emailAccount: { findUnique: async () => (account ? { ...account, quietStartHour: 20, quietEndHour: 7, hourlyLimit: 8, dailyLimit: 40, passwordEnc: "x" } : null) },
    outboundMessage: { count: async () => 0 },
    lead: { count: async () => 0 },
    campaign: { findFirst: async () => latest(campaigns) },
  };
  return new EmailService(prisma as never, { get: () => undefined, getOrThrow: () => "k" } as never, {} as never);
}

test("TC-VM-15.1 whatsapp overview: latest campaign VN gives Asia/Ho_Chi_Minh and hasVnCampaign", async () => {
  const o = await waService([{ market: "ID" }, { market: "VN" }]).overview("ws1");
  assert.equal(o.suggestedTimezone, "Asia/Ho_Chi_Minh");
  assert.equal(o.hasVnCampaign, true);
});

test("TC-VM-15.2 latest campaign ID (older VN) gives Jakarta, hasVnCampaign still true", async () => {
  const o = await waService([{ market: "VN" }, { market: "ID" }]).overview("ws1");
  assert.equal(o.suggestedTimezone, "Asia/Jakarta");
  assert.equal(o.hasVnCampaign, true);
});

test("TC-VM-15.3 no campaign gives Jakarta and no VN campaign", async () => {
  const o = await waService([]).overview("ws1");
  assert.equal(o.suggestedTimezone, "Asia/Jakarta");
  assert.equal(o.hasVnCampaign, false);
});

test("TC-VM-15.4 the saved account fields are returned unchanged (the suggestion is separate)", async () => {
  const o = await waService([{ market: "VN" }]).overview("ws1");
  assert.equal(o.account.timezone, "Asia/Jakarta");
  assert.equal(o.account.defaultCountryCode, "62");
});

test("TC-VM-15.5 email overview: suggestedTimezone from the latest campaign; the account's own timezone is untouched", async () => {
  assert.equal((await mailService([{ market: "VN" }]).overview("ws1")).suggestedTimezone, "Asia/Ho_Chi_Minh");
  assert.equal((await mailService([{ market: "ID" }]).overview("ws1")).suggestedTimezone, "Asia/Jakarta");
  assert.equal((await mailService([]).overview("ws1")).suggestedTimezone, "Asia/Jakarta");
  const o = await mailService([{ market: "VN" }], { timezone: "Asia/Jakarta" }).overview("ws1");
  assert.equal(o.account?.timezone, "Asia/Jakarta");
});

test("a hostile market value on the latest campaign falls back to Jakarta", async () => {
  assert.equal((await waService([{ market: "vn" }]).overview("ws1")).suggestedTimezone, "Asia/Jakarta");
});
