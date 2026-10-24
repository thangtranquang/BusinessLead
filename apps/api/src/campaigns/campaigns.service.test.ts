import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CampaignsController } from "./campaigns.controller";
import { CampaignsService } from "./campaigns.service";
import type { CreateCampaignDto } from "./dto/create-campaign.dto";
import type { UpdateCampaignDto } from "./dto/update-campaign.dto";

// TC-26.2, TC-50.3 (unit part) and security addendum S3: PATCH and DELETE are scoped to the caller's workspace.

type Row = Record<string, unknown> & { id: string; workspaceId: string };

function fakePrisma(initial: Row[]) {
  const rows = initial.map((r) => ({ ...r }));
  const calls = { create: [] as unknown[], updateMany: [] as { where: Record<string, unknown>; data: Record<string, unknown> }[], deleteMany: [] as { where: Record<string, unknown> }[] };
  const matches = (r: Row, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => r[k] === v);
  return {
    rows,
    calls,
    workspace: { upsert: async () => ({}) },
    campaign: {
      create: async ({ data }: { data: Row }) => { calls.create.push(data); const r = { id: `new-${rows.length}`, ...data }; rows.push(r); return r; },
      findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => matches(r, where)) ?? null,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        calls.updateMany.push({ where, data });
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        calls.deleteMany.push({ where });
        const hit = rows.filter((r) => matches(r, where));
        hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
        return { count: hit.length };
      },
      // the unscoped writes must not be used for a request that carries a user id
      update: async () => { throw new Error("campaign.update is unscoped: use updateMany with the workspace id"); },
      delete: async () => { throw new Error("campaign.delete is unscoped: use deleteMany with the workspace id"); },
    },
  };
}

const CREATE: CreateCampaignDto = { name: "Chiến dịch mẫu", industry: "Quán cà phê", location: "Hà Nội", searchQueries: ["quán cà phê"], yourService: "Phần mềm đặt bàn" };
const seed = (): Row[] => [
  { id: "c-a", workspaceId: "ws-a", name: "Của A", language: "indonesian", status: "completed", progress: 100, totalLeads: 12, createdAt: new Date("2026-01-01") },
  { id: "c-b", workspaceId: "ws-b", name: "Của B", language: "vietnamese", status: "draft", progress: 0, totalLeads: 0, createdAt: new Date("2026-02-01") },
];

test("create without a language stores vietnamese; english is kept (TC-26.2)", async () => {
  const prisma = fakePrisma([]);
  const svc = new CampaignsService(prisma as never);
  await svc.create({ ...CREATE }, "ws-a");
  await svc.create({ ...CREATE, language: "english" }, "ws-a");
  assert.equal((prisma.calls.create[0] as Row).language, "vietnamese");
  assert.equal((prisma.calls.create[1] as Row).language, "english");
});

test("create writes the caller's workspace id whatever the body carries", async () => {
  const prisma = fakePrisma([]);
  const svc = new CampaignsService(prisma as never);
  await svc.create({ ...CREATE, workspaceId: "ws-evil", status: "completed", progress: 100 } as unknown as CreateCampaignDto, "ws-a");
  const data = prisma.calls.create[0] as Row;
  assert.equal(data.workspaceId, "ws-a");
  assert.equal(data.status, undefined);
  assert.equal(data.progress, undefined);
});

test("a language that is not one of the two never reaches the database, even if a caller skipped validation", async () => {
  const prisma = fakePrisma(seed());
  const svc = new CampaignsService(prisma as never);
  for (const bad of ["indonesian", null, "VIETNAMESE", 5, "", "vi"]) {
    await assert.rejects(svc.create({ ...CREATE, language: bad } as never, "ws-a"), BadRequestException, String(bad));
    await assert.rejects(svc.update("c-a", { language: bad } as never, "ws-a"), BadRequestException, String(bad));
  }
  assert.equal(prisma.calls.create.length, 0);
  assert.equal(prisma.calls.updateMany.length, 0);
});

test("PATCH {language: english} by the owner persists (S3)", async () => {
  const prisma = fakePrisma(seed());
  const svc = new CampaignsService(prisma as never);
  const out = await svc.update("c-a", { language: "english" }, "ws-a");
  assert.equal(prisma.rows[0].language, "english");
  assert.equal(out.language, "english");
  assert.deepEqual(prisma.calls.updateMany[0].where, { id: "c-a", workspaceId: "ws-a" });
});

test("PATCH of a campaign that belongs to another workspace is a 404 and changes nothing (S3, TC-27.2)", async () => {
  const prisma = fakePrisma(seed());
  const svc = new CampaignsService(prisma as never);
  await assert.rejects(svc.update("c-a", { language: "vietnamese", name: "Hijack" }, "ws-b"), NotFoundException);
  assert.equal(prisma.rows[0].language, "indonesian");
  assert.equal(prisma.rows[0].name, "Của A");
  // the same answer as for an id that does not exist at all (existence is not revealed)
  await assert.rejects(svc.update("does-not-exist", { name: "x" }, "ws-b"), NotFoundException);
});

test("DELETE of another workspace's campaign is a 404 and deletes nothing; the owner can delete (S3)", async () => {
  const prisma = fakePrisma(seed());
  const svc = new CampaignsService(prisma as never);
  await assert.rejects(svc.remove("c-a", "ws-b"), NotFoundException);
  assert.equal(prisma.rows.length, 2);
  await svc.remove("c-a", "ws-a");
  assert.deepEqual(prisma.rows.map((r) => r.id), ["c-b"]);
  assert.deepEqual(prisma.calls.deleteMany.at(-1)?.where, { id: "c-a", workspaceId: "ws-a" });
});

test("PATCH with only a name leaves a legacy indonesian language untouched and sends no language key (TC-26.2, TC-50.3)", async () => {
  const prisma = fakePrisma(seed());
  const svc = new CampaignsService(prisma as never);
  await svc.update("c-a", { name: "Tên mới" }, "ws-a");
  assert.equal(prisma.rows[0].language, "indonesian");
  assert.equal(prisma.rows[0].name, "Tên mới");
  assert.ok(!("language" in prisma.calls.updateMany[0].data));
  // an explicit undefined is the same as an omitted field
  await svc.update("c-a", { name: "Tên khác", language: undefined }, "ws-a");
  assert.ok(!("language" in prisma.calls.updateMany[1].data));
  assert.equal(prisma.rows[0].language, "indonesian");
});

test("PATCH cannot write fields that are not part of the DTO (mass assignment, S3)", async () => {
  const prisma = fakePrisma(seed());
  const before = { ...prisma.rows[0] };
  const svc = new CampaignsService(prisma as never);
  await svc.update("c-a", {
    name: "Tên mới",
    workspaceId: "ws-b",
    status: "failed",
    progress: 5,
    totalLeads: 999,
    id: "other",
    createdAt: new Date("2000-01-01"),
  } as unknown as UpdateCampaignDto, "ws-a");
  const row = prisma.rows[0];
  assert.equal(row.name, "Tên mới");
  for (const k of ["workspaceId", "status", "progress", "totalLeads", "id", "createdAt"]) assert.deepEqual(row[k], before[k], k);
  assert.deepEqual(Object.keys(prisma.calls.updateMany[0].data), ["name"]);
});

test("the controller passes the caller's workspace id to PATCH and DELETE (S3)", async () => {
  const seen: unknown[][] = [];
  const service = {
    update: async (...args: unknown[]) => { seen.push(["update", ...args]); return {}; },
    remove: async (...args: unknown[]) => { seen.push(["remove", ...args]); return {}; },
  };
  const controller = new CampaignsController(service as never);
  await controller.update("c-a", { name: "x" }, "ws-a");
  await controller.remove("c-a", "ws-a");
  assert.deepEqual(seen, [["update", "c-a", { name: "x" }, "ws-a"], ["remove", "c-a", "ws-a"]]);
});

// ---- Vietnam market support: TC-VM-1.23, 3.1, 3.4, 3.6, 3.8, 3.9, 3.14 ----

const MSEED = (): Row[] => [
  { id: "d-a", workspaceId: "ws-a", name: "Nháp", market: "ID", status: "draft", language: "vietnamese" },
  { id: "r-a", workspaceId: "ws-a", name: "Đang chạy", market: "VN", status: "running", language: "vietnamese" },
  { id: "x-b", workspaceId: "ws-b", name: "Của B", market: "ID", status: "completed", language: "vietnamese" },
];

test("create stores market, defaulting to ID (TC-VM-1.23)", async () => {
  const prisma = fakePrisma([]);
  const svc = new CampaignsService(prisma as never);
  await svc.create({ ...CREATE }, "ws-a");
  await svc.create({ ...CREATE, market: "VN" }, "ws-a");
  await svc.create({ ...CREATE, market: "ID" }, "ws-a");
  assert.deepEqual(prisma.calls.create.map((c) => (c as Row).market), ["ID", "VN", "ID"]);
});

test("a market that is not ID or VN never reaches the database, even if validation was skipped", async () => {
  const prisma = fakePrisma(MSEED());
  const svc = new CampaignsService(prisma as never);
  for (const bad of ["vn", null, "", "XX", 5, ["VN"], {}]) {
    await assert.rejects(svc.create({ ...CREATE, market: bad } as never, "ws-a"), BadRequestException, String(bad));
    await assert.rejects(svc.update("d-a", { market: bad } as never, "ws-a"), BadRequestException, String(bad));
  }
  assert.equal(prisma.calls.create.length, 0);
  assert.equal(prisma.calls.updateMany.length, 0);
});

test("PATCH market on a draft is one updateMany limited to draft status inside the workspace (TC-VM-3.1, 3.14)", async () => {
  const prisma = fakePrisma(MSEED());
  const svc = new CampaignsService(prisma as never);
  const out = await svc.update("d-a", { market: "VN" }, "ws-a");
  assert.deepEqual(prisma.calls.updateMany[0], { where: { id: "d-a", workspaceId: "ws-a", status: "draft" }, data: { market: "VN" } });
  assert.equal(out.market, "VN");
});

test("PATCH market on a non-draft is a 409 whether or not the value changes (TC-VM-3.3, 3.4)", async () => {
  const prisma = fakePrisma(MSEED());
  const svc = new CampaignsService(prisma as never);
  await assert.rejects(svc.update("r-a", { market: "ID" }, "ws-a"), ConflictException);
  await assert.rejects(svc.update("r-a", { market: "VN" }, "ws-a"), ConflictException);
  assert.equal(prisma.rows[1].market, "VN");
});

test("404 comes before 409: another workspace's non-draft campaign is a 404 (TC-VM-3.6)", async () => {
  const prisma = fakePrisma(MSEED());
  const svc = new CampaignsService(prisma as never);
  await assert.rejects(svc.update("x-b", { market: "VN" }, "ws-a"), NotFoundException);
  await assert.rejects(svc.update("does-not-exist", { market: "VN" }, "ws-a"), NotFoundException);
  assert.equal(prisma.rows[2].market, "ID");
  assert.equal(prisma.calls.updateMany.length, 0, "nothing is written for a campaign outside the workspace");
});

test("PATCH without market on a non-draft keeps working and adds no status filter (TC-VM-3.8)", async () => {
  const prisma = fakePrisma(MSEED());
  const svc = new CampaignsService(prisma as never);
  await svc.update("r-a", { name: "Tên mới" }, "ws-a");
  assert.equal(prisma.rows[1].name, "Tên mới");
  assert.deepEqual(prisma.calls.updateMany[0].where, { id: "r-a", workspaceId: "ws-a" });
  assert.ok(!("market" in prisma.calls.updateMany[0].data));
});

test("PATCH name + market on a non-draft is a 409 and nothing is applied (TC-VM-3.9)", async () => {
  const prisma = fakePrisma(MSEED());
  const svc = new CampaignsService(prisma as never);
  await assert.rejects(svc.update("r-a", { name: "Tên mới", market: "ID" }, "ws-a"), ConflictException);
  assert.equal(prisma.rows[1].name, "Đang chạy");
  assert.equal(prisma.rows[1].market, "VN");
});

test("PATCH name + market on a draft applies both", async () => {
  const prisma = fakePrisma(MSEED());
  const svc = new CampaignsService(prisma as never);
  await svc.update("d-a", { name: "Tên mới", market: "VN" }, "ws-a");
  assert.equal(prisma.rows[0].name, "Tên mới");
  assert.equal(prisma.rows[0].market, "VN");
  assert.ok(prisma.calls.updateMany.every((c) => !("market" in c.data) || c.where.status === "draft"), "market is only ever written with the draft filter");
});
