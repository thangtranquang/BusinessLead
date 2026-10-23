import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { MAX_BODY, MAX_EMAIL_BODY, MessagingService } from "./messaging.service";
import { nfc } from "../common/text";

// AC-23 / FR-44.1 / S7: what the owner approved must be byte-identical to what is sent, so an owner edit is NFC at save and at
// approve, for the body AND the email subject. The edit races with approve, so both write with a guarded updateMany. Everything
// below is a fake (no database, no WhatsApp, no network); all names and addresses are invented.

const VI = "Dạ em chào anh/chị, em gửi báo giá hệ thống đặt lịch cho tiệm ạ";
const NFD = VI.normalize("NFD");
const SUBJECT_VI = "Hợp tác về hệ thống quản lý đặt lịch";
assert.notEqual(NFD, VI);

interface Row { id: string; workspaceId: string; channel: string; status: string; body: string; aiBody: string | null; subject: string | null; toPhone: string; toEmail: string | null; attachmentId: string | null; linkPreview: unknown }
const row = (over: Partial<Row> = {}): Row => ({ id: "m1", workspaceId: "ws1", channel: "whatsapp", status: "draft", body: VI, aiBody: VI, subject: null, toPhone: "84901234567", toEmail: null, attachmentId: null, linkPreview: null, ...over });

interface Call { op: string; args: { where: Record<string, unknown>; data: Record<string, unknown> } }

function harness(rows: Row[], opts: { updateManyCount?: number; optedOutEmails?: string[] } = {}) {
  const calls: Call[] = [];
  const created: unknown[] = [];
  const prisma = {
    whatsappAccount: { upsert: async () => ({ defaultCountryCode: "84" }) },
    messageOptOut: { findMany: async () => [], findUnique: async () => null },
    emailOptOut: { findMany: async () => (opts.optedOutEmails ?? []).map((email) => ({ email })) },
    emailAccount: { findUnique: async () => ({ id: "acc" }) },
    lead: { findFirst: async () => null },
    outboundMessage: {
      findFirst: async (args: { where: { id: string } }) => rows.find((r) => r.id === args.where.id) ?? null,
      findMany: async () => rows.filter((r) => r.status === "draft"),
      updateMany: async (args: Call["args"]) => { calls.push({ op: "updateMany", args }); return { count: opts.updateManyCount ?? 1 }; },
      update: async (args: Call["args"]) => { calls.push({ op: "update", args }); return {}; },
      create: async (args: unknown) => { created.push(args); return args; },
    },
  };
  const svc = new MessagingService(prisma as never, {} as never, {} as never, {} as never, {} as never);
  return { svc, calls, created };
}

let savedBase: string | undefined;
beforeEach(() => { savedBase = process.env.PUBLIC_API_URL; process.env.PUBLIC_API_URL = "https://api.example.com/api"; });
afterEach(() => { if (savedBase === undefined) delete process.env.PUBLIC_API_URL; else process.env.PUBLIC_API_URL = savedBase; });

test("edit: an NFD body is saved as NFC with a guarded updateMany (status draft, own workspace), never a bare update", async () => {
  const h = harness([row()]);
  await h.svc.edit("ws1", "m1", NFD);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].op, "updateMany");
  assert.deepEqual(h.calls[0].args.where, { id: "m1", workspaceId: "ws1", status: "draft" });
  assert.equal(h.calls[0].args.data.body, VI);
  assert.equal(h.calls[0].args.data.editedByUser, false, "the same text in another Unicode form is not an edit");
});

test("edit: an NFD email subject is saved as NFC together with the body", async () => {
  const h = harness([row({ channel: "email", toPhone: "", toEmail: "khach@example.com", subject: "Cũ", aiBody: null })]);
  await h.svc.edit("ws1", "m1", NFD, SUBJECT_VI.normalize("NFD"));
  assert.equal(h.calls[0].args.data.body, VI);
  assert.equal(h.calls[0].args.data.subject, SUBJECT_VI);
  assert.equal(h.calls[0].args.data.editedByUser, true);
});

test("edit: a subject is cut by code point at 200, never in the middle of a character", async () => {
  const h = harness([row({ channel: "email", toPhone: "", toEmail: "khach@example.com", subject: "Cũ" })]);
  await h.svc.edit("ws1", "m1", NFD, "a".repeat(199) + "😀" + "b");
  const sub = String(h.calls[0].args.data.subject);
  assert.equal([...sub].length, 200);
  assert.ok(sub.endsWith("😀"));
});

test("edit: the length check runs on the NFC text (an NFD body three times longer than its NFC form is accepted)", async () => {
  const body = "ệ".repeat(MAX_BODY - 100); // NFC length 7,900; NFD length 23,700
  assert.ok(body.normalize("NFD").length > MAX_BODY);
  const h = harness([row()]);
  await h.svc.edit("ws1", "m1", body.normalize("NFD"));
  assert.equal(h.calls[0].args.data.body, body);
  await assert.rejects(() => harness([row()]).svc.edit("ws1", "m1", "ệ".repeat(MAX_BODY + 1).normalize("NFD")), BadRequestException);
  await assert.rejects(() => harness([row({ channel: "email", toEmail: "k@example.com" })]).svc.edit("ws1", "m1", "ệ".repeat(MAX_EMAIL_BODY + 1), "Tiêu đề"), BadRequestException);
});

test("edit: a hostile 5 MB body is refused quickly, not normalised in full", async () => {
  const t0 = performance.now();
  await assert.rejects(() => harness([row()]).svc.edit("ws1", "m1", "a".repeat(5_000_000)), BadRequestException);
  assert.ok(performance.now() - t0 < 1500);
});

test("edit: the race with approve is closed: if the message stopped being a draft meanwhile, nothing is overwritten", async () => {
  const h = harness([row()], { updateManyCount: 0 });
  await assert.rejects(() => h.svc.edit("ws1", "m1", NFD), (e: unknown) => e instanceof BadRequestException && /draft/i.test((e as Error).message));
  const approved = harness([row({ status: "approved" })]);
  await assert.rejects(() => approved.svc.edit("ws1", "m1", NFD), BadRequestException);
  assert.equal(approved.calls.length, 0);
});

test("createManual: a typed message is stored as NFC", async () => {
  const h = harness([]);
  await h.svc.createManual("ws1", { phone: "0901234567", body: NFD });
  const data = (h.created[0] as { data: { body: string } }).data;
  assert.equal(data.body, VI);
});

test("approve: a body that NFC changes is written with the status in ONE guarded updateMany (where includes the old body)", async () => {
  const h = harness([row({ body: NFD })]);
  const r = await h.svc.approve("ws1", ["m1"]);
  assert.equal(r.approved, 1);
  assert.deepEqual(r.rejected, []);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].args.where, { id: "m1", workspaceId: "ws1", status: "draft", body: NFD });
  assert.equal(h.calls[0].args.data.body, VI);
  assert.equal(h.calls[0].args.data.status, "approved");
  assert.ok(h.calls[0].args.data.approvedAt instanceof Date);
  assert.equal(h.calls[0].args.data.error, null);
});

test("approve: an email whose body AND subject are NFD is approved with both as NFC in the same write", async () => {
  const h = harness([row({ channel: "email", toPhone: "", toEmail: "khach@example.com", subject: SUBJECT_VI.normalize("NFD"), body: NFD })]);
  const r = await h.svc.approve("ws1", ["m1"]);
  assert.equal(r.approved, 1);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].args.where, { id: "m1", workspaceId: "ws1", status: "draft", body: NFD, subject: SUBJECT_VI.normalize("NFD") });
  assert.equal(h.calls[0].args.data.body, VI);
  assert.equal(h.calls[0].args.data.subject, SUBJECT_VI);
  assert.equal(h.calls[0].args.data.status, "approved");
});

test("approve: an email whose subject alone is NFD is fixed too", async () => {
  const h = harness([row({ channel: "email", toPhone: "", toEmail: "khach@example.com", subject: SUBJECT_VI.normalize("NFD"), body: VI })]);
  assert.equal((await h.svc.approve("ws1", ["m1"])).approved, 1);
  assert.equal(h.calls[0].args.data.subject, SUBJECT_VI);
  assert.equal("body" in h.calls[0].args.data, false, "the body was already NFC and is not rewritten");
});

test("approve: if the owner edited the draft after it was read, the guarded write matches nothing and the message is NOT approved", async () => {
  const h = harness([row({ body: NFD })], { updateManyCount: 0 });
  const r = await h.svc.approve("ws1", ["m1"]);
  assert.equal(r.approved, 0);
  assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0].id, "m1");
});

test("approve: text that is already NFC keeps the single bulk write it always had", async () => {
  const h = harness([row(), row({ id: "m2" })]);
  const r = await h.svc.approve("ws1", ["m1", "m2"]);
  assert.equal(r.approved, 2);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].args.where, { id: { in: ["m1", "m2"] }, workspaceId: "ws1", status: "draft" });
  assert.equal("body" in h.calls[0].args.data, false);
});

test("approve: the length limit is measured after NFC", async () => {
  const fits = row({ body: "ệ".repeat(MAX_BODY - 100).normalize("NFD") });
  const tooLong = row({ id: "m2", body: "ệ".repeat(MAX_BODY + 1) });
  const h = harness([fits, tooLong]);
  const r = await h.svc.approve("ws1", ["m1", "m2"]);
  assert.equal(r.approved, 1);
  assert.deepEqual(r.rejected, [{ id: "m2", reason: "invalid text" }]);
});

test("approve: the opt-out check stays where it was: an opted-out email recipient is rejected and nothing is written", async () => {
  const h = harness([row({ channel: "email", toPhone: "", toEmail: "Khach@Example.com", subject: SUBJECT_VI, body: NFD })], { optedOutEmails: ["khach@example.com"] });
  const r = await h.svc.approve("ws1", ["m1"]);
  assert.equal(r.approved, 0);
  assert.deepEqual(r.rejected, [{ id: "m1", reason: "recipient opted out" }]);
  assert.equal(h.calls.length, 0);
});

test("the recipient address is never normalised: an NFD local part is looked up and kept byte-identical", async () => {
  const address = "dũng@example.com".normalize("NFD");
  const h = harness([row({ channel: "email", toPhone: "", toEmail: address, subject: SUBJECT_VI, body: VI })], { optedOutEmails: [address.toLowerCase()] });
  const r = await h.svc.approve("ws1", ["m1"]);
  assert.deepEqual(r.rejected, [{ id: "m1", reason: "recipient opted out" }]);
  assert.equal(nfc(address) === address, false);
});
