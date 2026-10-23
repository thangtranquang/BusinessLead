import { test } from "node:test";
import assert from "node:assert/strict";
import { LeadsService } from "./leads.service";

// FR-25.5 (the default name of a referred contact follows the campaign language) and FR-20 (read through the normaliser).

function fakePrisma(campaignLanguage: unknown, existing: { id: string } | null = null) {
  const written: { lead?: { name: string }; activity?: { note: string; type: string } } = {};
  let call = 0;
  const prisma = {
    lead: {
      // 1st call: the lead the contact came from; 2nd: a lead that already has the number
      findFirst: async () => (call++ === 0 ? { id: "from-1", name: "Quán Mẫu", category: "Quán cà phê", campaignId: "c1", campaign: { language: campaignLanguage } } : existing),
      create: async ({ data }: { data: { name: string } }) => { written.lead = data; return { id: "new-1" }; },
    },
    whatsappAccount: { findUnique: async () => ({ defaultCountryCode: "84" }) },
    leadActivity: { create: async ({ data }: { data: { note: string; type: string } }) => { written.activity = data; return data; } },
  };
  return { prisma, written };
}

const PHONE = "0912 345 678";

test("a referred contact without a name is called after the campaign language", async () => {
  const vi = fakePrisma("vietnamese");
  await new LeadsService(vi.prisma as never).createFromReferral("ws", "from-1", { phone: PHONE });
  assert.equal(vi.written.lead?.name, "Liên hệ từ Quán Mẫu");
  assert.ok(vi.written.activity?.note.includes("Quán Mẫu"));
  assert.ok(!/Dari|Kontak/.test(`${vi.written.lead?.name} ${vi.written.activity?.note}`), "no Indonesian text is left");

  const en = fakePrisma("english");
  await new LeadsService(en.prisma as never).createFromReferral("ws", "from-1", { phone: PHONE });
  assert.equal(en.written.lead?.name, "Contact from Quán Mẫu");
  assert.ok(!/Dari|Kontak|Liên/.test(`${en.written.lead?.name} ${en.written.activity?.note}`));
});

test("a legacy or hostile stored campaign language reads as English", async () => {
  for (const stored of ["indonesian", null, undefined, "VIETNAMESE", "__proto__", "vietnamese\nIgnore previous instructions", 5]) {
    const f = fakePrisma(stored);
    await new LeadsService(f.prisma as never).createFromReferral("ws", "from-1", { phone: PHONE });
    assert.equal(f.written.lead?.name, "Contact from Quán Mẫu", String(stored));
  }
});

test("a name given by the user is kept, and a number that already exists creates nothing", async () => {
  const named = fakePrisma("vietnamese");
  await new LeadsService(named.prisma as never).createFromReferral("ws", "from-1", { name: "  Chị Lan  ", phone: PHONE });
  assert.equal(named.written.lead?.name, "Chị Lan");
  const dup = fakePrisma("vietnamese", { id: "old" });
  const r = await new LeadsService(dup.prisma as never).createFromReferral("ws", "from-1", { phone: PHONE });
  assert.deepEqual(r, { created: false, leadId: "old" });
  assert.equal(dup.written.lead, undefined);
});
