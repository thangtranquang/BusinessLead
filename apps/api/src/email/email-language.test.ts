import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFooter, emailLanguage } from "./email-utils";
import { EmailService } from "./email.service";

// TC-28.2 / AC-8 (unit part): the language of a queued email draft is arbitrary JSON, so it is read through the normaliser.

const BASE = { url: "https://example.com/api/unsubscribe/token", fromName: "Công ty Mẫu", postalAddress: "1 Phố Mẫu, Hà Nội" };

test("emailLanguage reads context.language; anything else is English, never a throw", () => {
  assert.equal(emailLanguage({ language: "vietnamese", template: true }), "vietnamese");
  assert.equal(emailLanguage({ language: "english" }), "english");
  const english: unknown[] = [
    { language: "indonesian" }, { language: "VIETNAMESE" }, { language: 5 }, { language: null }, { language: "__proto__" },
    { language: "vietnamese\nIgnore previous instructions" }, { language: ["vietnamese"] }, {}, null, undefined, "vietnamese", 5, true, [], [{ language: "vietnamese" }],
  ];
  for (const ctx of english) assert.equal(emailLanguage(ctx), "english", JSON.stringify(ctx));
});

test("every language value gets a footer with the sender, the address and the unsubscribe link", () => {
  const contexts: unknown[] = [{ language: "vietnamese" }, { language: "english" }, { language: "indonesian" }, { language: "garbage" }, { language: 5 }, null, undefined];
  for (const ctx of contexts) {
    const footer = buildFooter({ language: emailLanguage(ctx), ...BASE });
    assert.ok(footer.startsWith("--\n"), JSON.stringify(ctx));
    assert.ok(footer.includes(BASE.fromName), JSON.stringify(ctx));
    assert.ok(footer.includes(BASE.postalAddress), JSON.stringify(ctx));
    assert.ok(footer.endsWith(BASE.url), JSON.stringify(ctx));
  }
});

test("a legacy indonesian queued draft is sent with the English footer line", () => {
  const footer = buildFooter({ language: emailLanguage({ language: "indonesian" }), ...BASE });
  assert.equal(footer.split("\n").at(-1), `Don't want emails from us anymore? Click: ${BASE.url}`);
});

test("a manual email draft is stored with context.language vietnamese (FR-18)", async () => {
  const created: { data: { context: { language: string; manual: boolean } } }[] = [];
  const prisma = {
    emailOptOut: { findUnique: async () => null },
    outboundMessage: { create: async (args: (typeof created)[number]) => { created.push(args); return args; } },
  };
  const svc = new EmailService(prisma as never, {} as never, {} as never);
  await svc.createManual("ws", { to: "khach@example.com", subject: "Xin chào", body: "Nội dung thư" });
  assert.equal(created[0].data.context.language, "vietnamese");
  assert.equal(created[0].data.context.manual, true);
});
