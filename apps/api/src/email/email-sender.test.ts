import { test, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import nodemailer = require("nodemailer");
import { EmailSenderService } from "./email-sender.service";
import { buildMailOptions, signUnsubscribe } from "./email-utils";
import { encryptSecret } from "../settings/encryption.util";

// Order of the email sender (CLAUDE.md, Email section): claim (approved -> sending) -> opt-out check -> build -> transport.
// Everything below is a fake: no database, no network. The nodemailer factory is replaced, so "the transport was never
// called" is observable. All names and addresses are invented.

const KEY = randomBytes(32).toString("base64");
const JWT_SECRET = "test-secret-test-secret-1234";
const BASE = "https://api.example.com/api";

const ACCOUNT = {
  id: "acc1", workspaceId: "ws1", paused: false, status: "ready", hourlyLimit: 100, dailyLimit: 1000, quietStartHour: 0, quietEndHour: 0,
  timezone: "Asia/Ho_Chi_Minh", nextSendAt: null, host: "smtp.example.com", port: 587, secure: false, username: "u",
  passwordEnc: encryptSecret("pw", KEY), fromName: "Đặng Minh Anh", fromEmail: "minh@example.com", replyTo: null, postalAddress: "1 Phố Mẫu, Hà Nội",
};

const NEXT = { id: "m1", workspaceId: "ws1", channel: "email", status: "approved", toEmail: "Khach.Mau@Example.com", subject: "Hợp tác về hệ thống đặt lịch", body: "Xin chào anh/chị,\nEm gửi thông tin ạ.", context: { language: "vietnamese" }, attempts: 0, leadId: "lead1", source: "ai_outreach", approvedAt: new Date() };

function harness(opts: { optedOut: boolean }) {
  const calls: string[] = [];
  const sent: unknown[] = [];
  const updates: { where: unknown; data: Record<string, unknown> }[] = [];
  const prisma = {
    emailAccount: { findMany: async () => [ACCOUNT], update: async () => ({}) },
    outboundMessage: {
      count: async () => 0,
      findFirst: async () => NEXT,
      updateMany: async (args: { where: { status?: string }; data: { status?: string } }) => { calls.push(`claim:${args.where.status}->${args.data.status}`); return { count: 1 }; },
      update: async (args: { where: unknown; data: Record<string, unknown> }) => { calls.push(`update:${String(args.data.status)}`); updates.push(args); return {}; },
    },
    emailOptOut: { findUnique: async (args: { where: { workspaceId_email: { email: string } } }) => { calls.push(`optout:${args.where.workspaceId_email.email}`); return opts.optedOut ? { id: "o1" } : null; } },
    lead: { updateMany: async () => ({ count: 1 }), update: async () => ({}) },
    leadActivity: { create: async (args: { data: { note: string } }) => { calls.push(`activity:${args.data.note}`); return {}; } },
  };
  const config = { get: (k: string) => (k === "PUBLIC_API_URL" ? BASE : undefined), getOrThrow: (k: string) => (k === "JWT_SECRET" ? JWT_SECRET : KEY) };
  const factory = mock.method(nodemailer, "createTransport", () => ({
    sendMail: async (options: unknown) => { calls.push("transport"); sent.push(options); return { rejected: [], messageId: "<id@example.com>" }; },
    close: () => undefined,
  }) as never);
  const svc = new EmailSenderService(prisma as never, config as never);
  return { svc, calls, sent, updates, factory };
}

let savedFlag: string | undefined;
beforeEach(() => { savedFlag = process.env.EMAIL_ALLOW_PRIVATE_SMTP; process.env.EMAIL_ALLOW_PRIVATE_SMTP = "true"; }); // skip DNS in the transport factory
afterEach(() => { mock.restoreAll(); if (savedFlag === undefined) delete process.env.EMAIL_ALLOW_PRIVATE_SMTP; else process.env.EMAIL_ALLOW_PRIVATE_SMTP = savedFlag; });

test("S7: an opted-out approved message ends cancelled and no transport is ever created or called", async () => {
  const h = harness({ optedOut: true });
  await h.svc.tick();
  assert.deepEqual(h.calls, ["claim:approved->sending", "optout:khach.mau@example.com", "update:cancelled"], "claim, then opt-out check, then cancel");
  assert.equal(h.updates[0].data.error, "Recipient opted out");
  assert.equal(h.factory.mock.callCount(), 0, "the SMTP transport factory was never used");
  assert.equal(h.sent.length, 0);
});

test("a message that is not opted out is built with buildMailOptions and handed to the transport after the checks", async () => {
  const h = harness({ optedOut: false });
  await h.svc.tick();
  assert.deepEqual(h.calls.slice(0, 3), ["claim:approved->sending", "optout:khach.mau@example.com", "transport"]);
  assert.equal(h.sent.length, 1);
  const to = "khach.mau@example.com";
  const url = `${BASE}/unsubscribe/${signUnsubscribe("ws1", to, JWT_SECRET)}`;
  assert.deepEqual(h.sent[0], buildMailOptions(NEXT, ACCOUNT, url), "the sender passes the output of buildMailOptions to sendMail");
  assert.ok(h.calls.includes("update:sent"));
  assert.ok(h.calls.includes(`activity:${NEXT.subject}`), "the activity note is the subject");
});

test("TC-23.4 / 52.8: the sender builds its options and its activity note with the shared pure helpers (no inline copy)", async () => {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const source = readFileSync(join(__dirname, "email-sender.service.ts"), "utf8");
  assert.match(source, /buildMailOptions\(/);
  assert.match(source, /activityNote\(/);
  assert.doesNotMatch(source, /List-Unsubscribe/, "the headers are built in email-utils only");
  assert.doesNotMatch(source, /\.slice\(0, 140\)/, "the note is cut by code point");
});
