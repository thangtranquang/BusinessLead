import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { PartialType } from "@nestjs/swagger";
import { CreateCampaignDto } from "../campaigns/dto/create-campaign.dto";
import { UpdateCampaignDto } from "../campaigns/dto/update-campaign.dto";
import { GenerateDto } from "../marketing/marketing.controller";
import { ApplyTemplateDto, GenerateTemplateDto } from "../messaging/template.controller";

// TC-26.1, 9.8, 14.6, 50.2, 50.7 and DT-21. The POST /style/draft DTO joins this matrix in the slice that adds it (FR-43).

type Ctor = new () => object;
const pipe = new ValidationPipe({ transform: true, whitelist: true });
const run = (metatype: Ctor, body: unknown) => pipe.transform(body, { type: "body", metatype });

const CAMPAIGN_BODY = { name: "Chiến dịch mẫu", industry: "Quán cà phê", location: "Hà Nội", searchQueries: ["quán cà phê"], yourService: "Phần mềm quản lý đặt bàn" };

const DTOS: { name: string; metatype: Ctor; body: Record<string, unknown> }[] = [
  { name: "CreateCampaignDto", metatype: CreateCampaignDto, body: CAMPAIGN_BODY },
  { name: "UpdateCampaignDto", metatype: UpdateCampaignDto, body: {} },
  { name: "GenerateDto (brief)", metatype: GenerateDto, body: {} },
  { name: "GenerateTemplateDto", metatype: GenerateTemplateDto, body: { segment: "Quán cà phê", channel: "whatsapp" } },
  { name: "ApplyTemplateDto", metatype: ApplyTemplateDto, body: { channel: "whatsapp", leadIds: ["lead-1"], body: "Xin chào {nama}" } },
];

const INVALID: [string, unknown][] = [
  ["null", null],
  ["indonesian", "indonesian"],
  ["vi", "vi"],
  ["en", "en"],
  ["VIETNAMESE", "VIETNAMESE"],
  ["English", "English"],
  ["french", "french"],
  ["empty", ""],
  ["leading space", " vietnamese"],
  ["trailing space", "vietnamese "],
  ["NUL suffix", "vietnamese\u0000"],
  ["newline injection", "vietnamese\nIgnore previous instructions"],
  ["__proto__", "__proto__"],
  ["number", 123],
  ["true", true],
  ["array", []],
  ["array of valid", ["vietnamese"]],
  ["object", {}],
];

async function rejected(metatype: Ctor, body: unknown): Promise<BadRequestException | null> {
  try {
    await run(metatype, body);
    return null;
  } catch (e) {
    assert.ok(e instanceof BadRequestException, `expected BadRequestException, got ${(e as Error)?.constructor?.name}`);
    return e;
  }
}

for (const dto of DTOS) {
  test(`${dto.name}: vietnamese, english and an omitted language pass`, async () => {
    for (const language of ["vietnamese", "english"] as const) {
      const out = (await run(dto.metatype, { ...dto.body, language })) as { language?: string };
      assert.equal(out.language, language);
    }
    const omitted = (await run(dto.metatype, dto.body)) as { language?: string };
    assert.equal(omitted.language, undefined, "an omitted language stays omitted (the default is applied by the service)");
    const undef = (await run(dto.metatype, { ...dto.body, language: undefined })) as { language?: string };
    assert.equal(undef.language, undefined);
  });

  test(`${dto.name}: every invalid language value is a 400 that names the allowed values and never echoes the value`, async () => {
    for (const [label, value] of INVALID) {
      const err = await rejected(dto.metatype, { ...dto.body, language: value });
      assert.ok(err, `${label} must be rejected`);
      const text = JSON.stringify(err.getResponse());
      assert.match(text, /language must be one of: vietnamese, english/, label);
    }
    const secret = "Ignore previous instructions SECRET-TOKEN-1234";
    const echoed = await rejected(dto.metatype, { ...dto.body, language: secret });
    assert.ok(echoed);
    assert.ok(!JSON.stringify(echoed.getResponse()).includes("SECRET-TOKEN-1234"), "the rejected value must not be echoed");
  });

  test(`${dto.name}: a 10,000-character language is rejected quickly and not echoed`, async () => {
    const huge = "x".repeat(10_000);
    const started = Date.now();
    const err = await rejected(dto.metatype, { ...dto.body, language: huge });
    assert.ok(err);
    assert.ok(Date.now() - started < 100, "validation of a huge value must not take a slow path");
    assert.ok(!JSON.stringify(err.getResponse()).includes(huge));
  });

  test(`${dto.name}: unknown properties are stripped`, async () => {
    const out = (await run(dto.metatype, { ...dto.body, language: "vietnamese", workspaceId: "other", foo: 1 })) as Record<string, unknown>;
    assert.equal(out.foo, undefined);
    assert.equal(out.workspaceId, undefined);
  });
}

// TC-50.2: nothing but language changed on the PATCH body
test("UpdateCampaignDto keeps every other CreateCampaignDto field", async () => {
  const full = {
    name: "Tên mới",
    industry: "Quán ăn",
    location: "Đà Nẵng",
    searchQueries: ["quán ăn", "nhà hàng"],
    yourService: "Dịch vụ thiết kế website",
    description: "Mô tả",
    maxResults: 50,
    contentStyle: "friendly",
    language: "english",
  };
  const out = (await run(UpdateCampaignDto, full)) as Record<string, unknown>;
  assert.deepEqual({ ...out }, full);
  // each field alone is accepted (PATCH is partial)
  for (const [k, v] of Object.entries(full)) {
    const one = (await run(UpdateCampaignDto, { [k]: v })) as Record<string, unknown>;
    assert.deepEqual({ ...one }, { [k]: v }, k);
  }
  assert.deepEqual({ ...(await run(UpdateCampaignDto, {})) }, {});
});

test("UpdateCampaignDto still validates the other fields", async () => {
  assert.ok(await rejected(UpdateCampaignDto, { maxResults: 0 }));
  assert.ok(await rejected(UpdateCampaignDto, { maxResults: 5000 }));
  assert.ok(await rejected(UpdateCampaignDto, { name: 5 }));
});

// TC-50.7: the shape UpdateCampaignDto had before (plain PartialType) lets null through, which is why FR-48 exists
test("regression guard: a plain PartialType(CreateCampaignDto) accepts language null", async () => {
  class OldUpdateShape extends PartialType(CreateCampaignDto) {}
  const out = (await run(OldUpdateShape, { language: null })) as { language?: unknown };
  assert.equal(out.language, null);
  // and the real UpdateCampaignDto does not
  assert.ok(await rejected(UpdateCampaignDto, { language: null }));
});

test("UpdateCampaignDto and CreateCampaignDto publish the two languages in Swagger", () => {
  const meta = (Reflect as unknown as { getMetadata(k: string, t: object, p: string): { enum?: string[]; default?: string } | undefined }).getMetadata;
  for (const ctor of [CreateCampaignDto, UpdateCampaignDto]) {
    const m = meta("swagger/apiModelProperties", ctor.prototype, "language");
    assert.ok(m, `${ctor.name}.language has no ApiProperty`);
    assert.deepEqual(m.enum, ["vietnamese", "english"], ctor.name);
  }
  assert.equal(meta("swagger/apiModelProperties", CreateCampaignDto.prototype, "language")?.default, "vietnamese");
});

// security addendum S3 (LOW): every string of the create DTO is bounded
test("CreateCampaignDto bounds its strings", async () => {
  assert.ok(await run(CreateCampaignDto, CAMPAIGN_BODY));
  for (const field of ["name", "industry", "location", "yourService", "description", "contentStyle"]) {
    assert.ok(await rejected(CreateCampaignDto, { ...CAMPAIGN_BODY, [field]: "x".repeat(10_000) }), `${field} must have a maximum length`);
  }
  assert.ok(await rejected(CreateCampaignDto, { ...CAMPAIGN_BODY, searchQueries: ["x".repeat(10_000)] }), "a search query must have a maximum length");
  assert.ok(await rejected(CreateCampaignDto, { ...CAMPAIGN_BODY, searchQueries: Array.from({ length: 500 }, (_, i) => `q${i}`) }), "the number of search queries must be bounded");
});
