import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildOutreachMessages, describeStyle, type OutreachPromptInput } from "./chat-import/style-prompt";
import type { StyleStats } from "./chat-import/style-stats";
import { MarketingAiService } from "./marketing-ai.service";

/**
 * QA 0.6 baseline: the English prompts exactly as they were BEFORE the Vietnamese feature. Later slices must keep every
 * English prompt byte-identical (AC-28), except the entries named in EXEMPT below (PRD NFR-7 / FR-46), which a slice may
 * regenerate deliberately. Regenerate with UPDATE_PROMPT_SNAPSHOTS=1 (only for an exempt entry, and say why in the commit).
 *
 * All inputs are invented.
 */
const SNAPSHOT_FILE = path.join(__dirname, "__snapshots__", "english-prompts.json");

/** Entries a later slice is allowed to change on purpose. Empty until a slice names one together with its reason. */
const EXEMPT: Record<string, string> = {};

type Msg = { role: string; content: string };

const style: StyleStats = {
  messageCount: 120,
  avgChars: 64,
  medianChars: 48,
  avgWords: 11,
  emojiRate: 0.25,
  exclamationRate: 0.1,
  questionRate: 0.3,
  lowercaseStartRate: 0.4,
  noEndPunctuationRate: 0.5,
  multiLineRate: 0.05,
  topOpeners: [{ word: "hello", count: 12 }, { word: "sure", count: 6 }],
  topClosers: [{ word: "thanks", count: 9 }, { word: "soon", count: 4 }],
  topEmoji: [{ emoji: "🙏", count: 20 }, { emoji: "😊", count: 11 }, { emoji: "👍", count: 5 }],
  language: { vietnamese: 0.1, english: 0.9 },
};

const examples = [
  { incoming: "How much is the monthly plan?", reply: "Hello! The monthly plan is listed on our site. Happy to explain.", at: new Date("2026-01-01T00:00:00Z") },
  { incoming: "Do you open on Sunday?", reply: "Yes, we do. See you then.", at: new Date("2026-01-02T00:00:00Z") },
];

const brief: NonNullable<OutreachPromptInput["brief"]> = {
  summary: "Booking software for small rental shops.",
  angle: { segment: "equipment rental", pain: "double bookings", hook: "two customers, one item", benefit: "a calendar that never clashes" },
  proof: ["Used by 3 example shops"],
  wordsToAvoid: ["synergy", "revolutionary"],
  profile: { category: "Software agency", oneLiner: "We build custom software.", whatItDoes: "Web systems, mobile apps and AI automation.", callToAction: "Reply to this message" },
};

const lead = {
  name: "Contoh Camera Rental",
  category: "Camera rental",
  address: "1 Example Street, Sample City",
  rating: "4.6",
  reviewCount: 87,
  hasWebsite: false,
  website: null,
  recommendation: "Has many reviews but no website.",
};

const base: OutreachPromptInput = {
  businessDescription: "Contoh Digital Agency",
  offer: "A booking app for rental shops",
  language: "english",
  lead,
  style,
  examples,
  knowledge: ["Free two-week trial.", "Works on any phone."],
  brief,
  variant: "pain",
};

function capture(build: () => Msg[]): Msg[] {
  return build().map((m) => ({ role: m.role, content: m.content }));
}

async function leadNotesPrompt(): Promise<Msg[]> {
  let captured: Msg[] = [];
  const fakeAi = {
    enabled: true,
    chat: async (messages: Msg[]) => {
      captured = messages;
      return JSON.stringify({ email: { subject: "s", body: "b" }, linkedin: { connectionNote: "n" }, coldCall: { opening: "o" } });
    },
  };
  const service = new MarketingAiService({ forWorkspace: async () => fakeAi } as never);
  const out = await service.generateContent("workspace-test", {
    businessName: "Contoh Camera Rental",
    address: "1 Example Street, Sample City",
    industry: "Camera rental",
    rating: "4.6",
    hasWebsite: false,
    yourService: "A booking app for rental shops",
    contentStyle: "friendly",
    language: "english",
    score: 72,
  });
  assert.ok(out, "the fake model reply must be accepted");
  return captured.map((m) => ({ role: m.role, content: m.content }));
}

async function currentPrompts(): Promise<Record<string, unknown>> {
  return {
    "outreach.whatsapp.first.pain": capture(() => buildOutreachMessages({ ...base, variant: "pain" })),
    "outreach.whatsapp.first.observation": capture(() => buildOutreachMessages({ ...base, variant: "observation" })),
    "outreach.whatsapp.first.outcome": capture(() => buildOutreachMessages({ ...base, variant: "outcome" })),
    "outreach.whatsapp.followup": capture(() =>
      buildOutreachMessages({ ...base, followUp: { number: 1, of: 2, previousMessage: "Hi, I'm from Contoh Digital Agency.", daysSince: 3 } })),
    "outreach.whatsapp.followup.last": capture(() =>
      buildOutreachMessages({ ...base, followUp: { number: 2, of: 2, previousMessage: "Hi, I'm from Contoh Digital Agency.", daysSince: 1 } })),
    "outreach.email.first": capture(() => buildOutreachMessages({ ...base, channel: "email" })),
    "outreach.email.followup": capture(() =>
      buildOutreachMessages({ ...base, channel: "email", followUp: { number: 1, of: 2, previousMessage: "Hi, a short note.", daysSince: 4 } })),
    "outreach.generic": capture(() => buildOutreachMessages({ ...base, generic: true, avoid: ["bakery"] })),
    "outreach.whatsapp.service": capture(() => buildOutreachMessages({ ...base, offerKind: "service" })),
    "outreach.email.service": capture(() => buildOutreachMessages({ ...base, offerKind: "service", channel: "email" })),
    "outreach.noStyle": capture(() => buildOutreachMessages({ ...base, style: undefined, examples: undefined, knowledge: undefined, brief: undefined, retryNote: "too long" })),
    "describeStyle.english": describeStyle(style, "english"),
    "leadNotes.english": await leadNotesPrompt(),
  };
}

function readSnapshot(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8")) as Record<string, unknown>;
}

test("recording mode writes the snapshot only when asked", async () => {
  if (process.env.UPDATE_PROMPT_SNAPSHOTS !== "1") return;
  fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(await currentPrompts(), null, 2) + "\n", "utf8");
});

test("the baseline snapshot exists and covers every English prompt of the list", async () => {
  const snap = readSnapshot();
  assert.deepEqual(Object.keys(snap).sort(), Object.keys(await currentPrompts()).sort());
});

test("English prompts are byte-identical to the baseline (AC-28), except named exemptions", async () => {
  const snap = readSnapshot();
  const now = await currentPrompts();
  for (const key of Object.keys(snap)) {
    if (key in EXEMPT) continue;
    assert.deepEqual(now[key], snap[key], `English prompt changed: ${key}`);
  }
});

test("exemptions each carry a reason", () => {
  for (const [key, reason] of Object.entries(EXEMPT)) assert.ok(reason.length >= 10, key);
});

test("the baseline holds no Vietnamese-feature text (it was taken before any prompt change)", () => {
  const raw = fs.readFileSync(SNAPSHOT_FILE, "utf8");
  assert.doesNotMatch(raw, /Vietnamese|tiếng Việt/);
});
