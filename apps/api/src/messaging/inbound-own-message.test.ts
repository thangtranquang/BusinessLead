import test from "node:test";
import assert from "node:assert/strict";
import { InboundService } from "./inbound.service";

// TC-19.4 / TC-43.x (FR-44.1): the owner's own message is recognised as ours whatever its Unicode form
function service(sentBodies: string[]) {
  const created: unknown[] = [];
  const prisma = {
    lead: { findFirst: async () => ({ id: "lead1", crmStatus: "contacted", contactedAt: null }), update: async () => ({}) },
    outboundMessage: {
      findMany: async () => sentBodies.map((body, i) => ({ providerMessageId: `p${i}`, body })),
      create: async (a: unknown) => { created.push(a); return {}; },
      updateMany: async () => ({ count: 0 }),
    },
    leadActivity: { create: async () => ({}) },
  };
  const wa = { onInbound: () => undefined };
  return { svc: new InboundService(prisma as never, {} as never, {} as never, wa as never), created };
}
const own = (text: string) => ({ id: "m-new", phone: "84900000001", text, at: new Date() });

test("a message that Prospex already sent is not recorded again, in NFC or NFD, whichever form was stored", async () => {
  const body = "Dạ, em gửi anh/chị báo giá ạ.";
  for (const [stored, incoming] of [[body, body.normalize("NFD")], [body.normalize("NFD"), body], [body, body]] as const) {
    const { svc, created } = service([stored]);
    assert.equal(await svc.handleOwnMessage("ws", own(incoming)), "ignored");
    assert.equal(created.length, 0);
  }
});

test("a different message is recorded, as NFC", async () => {
  const { svc, created } = service(["Dạ, em gửi anh/chị báo giá ạ."]);
  assert.equal(await svc.handleOwnMessage("ws", own("Cảm ơn anh/chị".normalize("NFD"))), "recorded");
  assert.equal(created.length, 1);
  assert.equal((created[0] as { data: { body: string } }).data.body, "Cảm ơn anh/chị");
});
