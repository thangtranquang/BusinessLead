import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UnsubscribeController } from "./unsubscribe.controller";
import { signUnsubscribe } from "./email-utils";
import { nfc } from "../common/text";

// TC-24.x / 52.15 / S7. The public page interpolates constants only: it never echoes the token, the address or the
// workspace name. GET never writes. POST writes exactly one opt-out row. All names and addresses are invented.

const SECRET = "test-secret-test-secret-1234";
const EMAIL = "recipient@example.com";
const WORKSPACE = "Công ty Mẫu"; // a workspace id/name that must never appear in the page

function harness() {
  const calls: { op: string; args: unknown }[] = [];
  const rows = new Map<string, { workspaceId: string; email: string; reason: string }>();
  const prisma = {
    emailOptOut: {
      upsert: async (args: { where: { workspaceId_email: { workspaceId: string; email: string } }; create: { workspaceId: string; email: string; reason: string } }) => {
        calls.push({ op: "emailOptOut.upsert", args });
        const key = `${args.where.workspaceId_email.workspaceId}|${args.where.workspaceId_email.email}`;
        if (!rows.has(key)) rows.set(key, args.create);
        return rows.get(key);
      },
    },
    outboundMessage: { updateMany: async (args: unknown) => { calls.push({ op: "outboundMessage.updateMany", args }); return { count: 0 }; } },
  };
  // any other model or method is recorded too, so a stray write cannot go unnoticed
  const spy = new Proxy(prisma, {
    get(target, model: string) {
      if (model in target) return target[model as keyof typeof target];
      return new Proxy({}, { get: (_t, method: string) => async (args: unknown) => { calls.push({ op: `${model}.${method}`, args }); return {}; } });
    },
  });
  const config = { getOrThrow: (k: string) => { if (k !== "JWT_SECRET") throw new Error(k); return SECRET; } };
  const controller = new UnsubscribeController(spy as never, config as never);
  return { controller, calls, rows };
}

const valid = () => signUnsubscribe(WORKSPACE, EMAIL, SECRET);
const assertBilingualPage = (html: string, label: string) => {
  assert.match(html, /<html lang="vi">/, label);
  assert.match(html, /<meta charset="utf-8">/, label);
  assert.match(html, /<title>[^<]*\p{L}[^<]*<\/title>/u, label);
  assert.match(html, /<[a-z0-9]+ lang="en">[^<]+<\/[a-z0-9]+>/i, `${label}: the English part is marked lang="en"`);
  assert.match(html, /[ăâêôơưđạảãàáậẩẫầấặẳẵằắẹẻẽèéệểễềếịỉĩìíọỏõòóộổỗồốợởỡờớụủũùúựửữừứỵỷỹỳý]/i, `${label}: Vietnamese text with diacritics`);
  assert.equal(html, nfc(html), `${label}: NFC`);
  assert.ok(!html.includes("�"), `${label}: no replacement character`);
  assert.doesNotMatch(html, /lang="id"|Tautan|Berhenti|Anda sudah|Kami tidak/, `${label}: no Indonesian leftovers`);
};

test("TC-24.1: the confirm page is bilingual, constant-only and a GET performs zero database calls", () => {
  const { controller, calls } = harness();
  const token = valid();
  const html = controller.confirm(token);
  assertBilingualPage(html, "confirm");
  assert.match(html, /<form method="post" action="">/);
  for (const secret of [EMAIL, WORKSPACE, token, "example.com", token.split(".")[0], Buffer.from(`${WORKSPACE}|${EMAIL}`).toString("base64")]) {
    assert.ok(!html.includes(secret), `the page must not echo ${secret.slice(0, 12)}...`);
  }
  assert.deepEqual(calls, [], "GET writes nothing and reads nothing");
  controller.confirm(token);
  controller.confirm(token);
  assert.deepEqual(calls, [], "three GETs, still nothing");
});

test("TC-24.2: POST creates exactly one opt-out row, withdraws waiting drafts and shows the done page", async () => {
  const { controller, calls, rows } = harness();
  const html = await controller.unsubscribe(valid());
  assertBilingualPage(html, "done");
  assert.deepEqual(calls.map((c) => c.op), ["emailOptOut.upsert", "outboundMessage.updateMany"]);
  assert.equal(rows.size, 1);
  assert.deepEqual([...rows.values()][0], { workspaceId: WORKSPACE, email: EMAIL, reason: "unsubscribe link" });
  const cancel = calls[1].args as { where: Record<string, unknown>; data: Record<string, unknown> };
  assert.deepEqual(cancel.where, { workspaceId: WORKSPACE, channel: "email", toEmail: EMAIL, status: { in: ["draft", "approved"] } });
  assert.deepEqual(cancel.data, { status: "cancelled", error: "Recipient opted out" });
  assert.ok(!html.includes(EMAIL) && !html.includes(WORKSPACE));
});

test("TC-24.4: a repeated POST still leaves one row and the same success page", async () => {
  const { controller, rows } = harness();
  const first = await controller.unsubscribe(valid());
  const second = await controller.unsubscribe(valid());
  assert.equal(first, second);
  assert.equal(rows.size, 1);
});

test("TC-24.5 / 24.6: an invalid link shows the same constant bilingual page on GET and POST, with no database call", async () => {
  const { controller, calls } = harness();
  const getPage = controller.confirm("x");
  assertBilingualPage(getPage, "invalid GET");
  const postPage = await controller.unsubscribe("x");
  assertBilingualPage(postPage, "invalid POST");
  assert.deepEqual(calls, []);
  assert.notEqual(getPage, controller.confirm(valid()), "the invalid page differs from the confirm page");
});

test("TC-24.7: a token signed with another secret, a changed payload or a changed signature is invalid and writes nothing", async () => {
  const { controller, calls, rows } = harness();
  const [payload, mac] = valid().split(".");
  const forged = [
    signUnsubscribe(WORKSPACE, EMAIL, "another-secret-9999"),
    `${Buffer.from(`other|${EMAIL}`).toString("base64url")}.${mac}`,
    `${payload}.${mac.slice(0, -2)}aa`,
    payload,
    `${payload}.${mac}.extra`,
  ];
  const invalid = controller.confirm("x");
  for (const t of forged) {
    assert.equal(controller.confirm(t), invalid);
    assert.equal(await controller.unsubscribe(t), invalid);
  }
  assert.deepEqual(calls, []);
  assert.equal(rows.size, 0);
});

test("S7 / TC-24.12: a 10,000-character or hostile token gives the constant invalid page and is never echoed", async () => {
  const { controller, calls } = harness();
  const invalid = controller.confirm("x");
  const hostile = ["a".repeat(10_000), "<script>alert(1)</script>", "dừng", "dừng", "&quot;><img src=x onerror=alert(1)>", "../../etc/passwd", "'; DROP TABLE email_opt_outs; --"];
  for (const t of hostile) {
    assert.equal(controller.confirm(t), invalid, t.slice(0, 20));
    assert.equal(await controller.unsubscribe(t), invalid, t.slice(0, 20));
    assert.ok(!invalid.includes(t));
  }
  assert.deepEqual(calls, []);
});

test("a validly signed token that carries markup in the address or workspace is still never echoed", async () => {
  const { controller } = harness();
  const token = signUnsubscribe("<b>ws</b>", "<script>x</script>@example.com", SECRET);
  for (const html of [controller.confirm(token), await controller.unsubscribe(token)]) {
    assert.ok(!html.includes("<script>x") && !html.includes("<b>ws") && !html.includes("example.com"));
  }
});

test("TC-52.15: the controller source never interpolates the token, the address or the workspace into a page", () => {
  const source = readFileSync(join(__dirname, "unsubscribe.controller.ts"), "utf8");
  assert.doesNotMatch(source, /\$\{\s*(token|t\b|t\.|email|workspace|a\.|next\.)/);
  assert.doesNotMatch(source, /lang="id"|Tautan|Berhenti|Anda sudah|Kami tidak/);
});
