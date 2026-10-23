import { strict as assert } from "node:assert";
import { test } from "node:test";
import { chunkText } from "./text-chunker";

test("empty input gives no chunks", () => assert.deepEqual(chunkText("  \n "), []));

test("short text stays one chunk", () => assert.deepEqual(chunkText("Harga paket Pro Rp250.000 per bulan."), ["Harga paket Pro Rp250.000 per bulan."]));

test("long text is split and no chunk is far over the limit", () => {
  const long = Array.from({ length: 60 }, (_, i) => `Kalimat nomor ${i} menjelaskan satu hal tentang layanan kami.`).join(" ");
  const chunks = chunkText(long, { maxChars: 300, overlap: 40 });
  assert.ok(chunks.length > 3);
  for (const c of chunks) assert.ok(c.length <= 300 + 41, `chunk too long: ${c.length}`);
});

test("a single oversized word run is hard-split", () => {
  const chunks = chunkText("x".repeat(2500), { maxChars: 1000, overlap: 0 });
  assert.equal(chunks.length, 3);
});

test("overlap repeats the tail of the previous chunk", () => {
  const chunks = chunkText(["A".repeat(250), "B".repeat(250)].join("\n\n"), { maxChars: 260, overlap: 20 });
  assert.equal(chunks.length, 2);
  assert.ok(chunks[1].startsWith("A".repeat(20)));
});

test("NFD text gives the same chunks as the NFC text (TC-43.3)", () => {
  const vietnamese = Array.from({ length: 40 }, (_, i) => `Câu số ${i} nói về dịch vụ đặt lịch cho tiệm cắt tóc và quán cà phê.`).join(" ");
  const options = { maxChars: 300, overlap: 40 };
  const fromNfc = chunkText(vietnamese, options);
  const fromNfd = chunkText(vietnamese.normalize("NFD"), options);
  assert.deepEqual(fromNfd, fromNfc);
  for (const c of fromNfd) assert.equal(c, c.normalize("NFC"));
});

test("a flood of combining marks does not stall the chunker", () => {
  const t0 = Date.now();
  const chunks = chunkText("a" + String.fromCharCode(0x301).repeat(50_000), { maxChars: 900, overlap: 0 });
  assert.ok(chunks.length > 0);
  assert.ok(Date.now() - t0 < 1500);
});
