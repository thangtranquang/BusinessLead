import test from "node:test";
import assert from "node:assert/strict";
import { isOptOut, OPT_OUT_HINT, OPT_OUT_HINT_EN, OPT_OUT_HINT_ID_LEGACY, OPT_OUT_HINT_VI } from "./opt-out";

test("STOP inside a short sentence is an opt-out, the way people answer our own 'balas STOP' line", () => {
  for (const t of ["Maaf kak belum ya STOP", "Ok stop", "belum butuh, stop ya kak", "tolong berhenti ya", "jangan ganggu lagi", "unsubscribe", "STOP", "stop!!"]) assert.equal(isOptOut(t), true, t);
});

test("a long message, a question about something else, or an unrelated word is not an opt-out", () => {
  assert.equal(isOptOut("Halo kak, kami lagi sibuk jadi nanti dikabari lagi ya. Untuk saat ini kami sedang meninjau beberapa penawaran sistem sewa lain dan belum bisa memutuskan, terima kasih banyak"), false);
  assert.equal(isOptOut("Berapa harganya kak?"), false);
  assert.equal(isOptOut("stopwatch"), false);
  assert.equal(isOptOut("Sewa motor dekat bus stop terminal ada?"), false);
});

// ---- Slice 3: per-language opt-out line (FR-29, FR-49; TC-46.5, DT-9 constants) ----

test("the opt-out hint table has exactly the two output languages and is frozen", () => {
  assert.deepEqual(Object.keys(OPT_OUT_HINT).sort(), ["english", "vietnamese"]);
  assert.ok(Object.isFrozen(OPT_OUT_HINT));
  assert.equal(OPT_OUT_HINT.english, OPT_OUT_HINT_EN);
  assert.equal(OPT_OUT_HINT.vietnamese, OPT_OUT_HINT_VI);
  assert.equal(OPT_OUT_HINT_EN, "If you'd rather not hear from me, reply STOP.");
});

test("the Vietnamese hint keeps the literal STOP, is written in NFC and is a short single sentence", () => {
  assert.ok(OPT_OUT_HINT_VI.includes("STOP"));
  assert.equal(OPT_OUT_HINT_VI, OPT_OUT_HINT_VI.normalize("NFC"));
  assert.ok(OPT_OUT_HINT_VI.normalize("NFD").length > OPT_OUT_HINT_VI.length, "it carries diacritics");
  assert.ok(OPT_OUT_HINT_VI.length >= 20 && OPT_OUT_HINT_VI.length <= 90, String(OPT_OUT_HINT_VI.length));
  assert.ok(!OPT_OUT_HINT_VI.includes("\n"));
  // answering the hint with its own keyword is an opt-out
  assert.equal(isOptOut("STOP"), true);
});

test("the legacy Indonesian hint stays available for stripping stored messages but is not a language of the table", () => {
  assert.equal(OPT_OUT_HINT_ID_LEGACY, "Kalau tidak berkenan, balas STOP.");
  assert.ok(!(Object.values(OPT_OUT_HINT) as string[]).includes(OPT_OUT_HINT_ID_LEGACY));
});

test("the table has no own key for a legacy or hostile language name (it is only indexed with a normalised value)", () => {
  for (const k of ["__proto__", "constructor", "toString", "indonesian"]) {
    assert.ok(!Object.prototype.hasOwnProperty.call(OPT_OUT_HINT, k), k);
  }
});
