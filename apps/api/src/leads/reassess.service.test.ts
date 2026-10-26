import test from "node:test";
import assert from "node:assert/strict";
import { ReassessService, lacksFit } from "./reassess.service";
import { LeadIntelligenceService } from "../ai/lead-intelligence.service";

test("lacksFit: only a real verdict counts", () => {
  assert.equal(lacksFit(null), true);
  assert.equal(lacksFit({ factors: [] }), true);
  assert.equal(lacksFit({ fit: {} }), true);
  assert.equal(lacksFit({ fit: { fit: "high", reason: "x" } }), false);
});

function build(leads: Array<Record<string, unknown>>, verdicts: Array<{ fit: string; reason: string } | undefined>) {
  const updates: Array<{ id: string; score: number; priority: string }> = [];
  const prisma = {
    campaign: { findFirst: async ({ where }: { where: { id: string } }) => (where.id === "c1" ? { yourService: "Khai báo hải quan", language: "vietnamese", market: "VN" } : null) },
    lead: {
      findMany: async () => leads,
      update: async ({ where, data }: { where: { id: string }; data: { score: number; priority: string } }) => { updates.push({ id: where.id, score: data.score, priority: data.priority }); },
    },
  };
  const fit = { assess: async () => verdicts };
  return { svc: new ReassessService(prisma as never, fit as never, new LeadIntelligenceService()), updates };
}

const lead = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: "Công ty Ví Dụ " + id, category: "Công ty logistics", phone: "0901234567", address: "1 Đường Ví Dụ", rating: "4,5", reviewCount: 30, hasWebsite: true, website: null, aiAnalysis: null, ...extra });

test("only leads without a verdict are re-judged, and score and priority follow the verdict", async () => {
  const done = lead("done", { aiAnalysis: { fit: { fit: "low", reason: "x" } } });
  const { svc, updates } = build([lead("a"), done, lead("b")], [{ fit: "high", reason: "ok" }, undefined]);
  const r = await svc.reassessCampaign("w", "c1");
  assert.deepEqual(r, { checked: 2, updated: 1, remaining: 1 });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, "a");
  assert.ok(updates[0].score >= 70 && updates[0].priority === "HIGH");
});

test("nothing to do when every lead already has a verdict", async () => {
  const { svc, updates } = build([lead("a", { aiAnalysis: { fit: { fit: "medium", reason: "x" } } })], []);
  assert.deepEqual(await svc.reassessCampaign("w", "c1"), { checked: 0, updated: 0, remaining: 0 });
  assert.equal(updates.length, 0);
});

test("a campaign of another workspace is not found", async () => {
  const { svc } = build([], []);
  await assert.rejects(() => svc.reassessCampaign("w", "other"), /not found/i);
});
