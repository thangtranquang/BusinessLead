// Indonesian regression snapshot — must not change in the Vietnam market feature.
// Expected values were recorded by running the code as it was BEFORE any market change; invented data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, phoneFromJid, phoneFromKey } from "./phone";

/** [QA row, input, expected]. Expected is what normalizePhone returned before the market work, for both call forms. */
const ID_ROWS: Array<[string, string, string | null]> = [
  ["P01", "0812-3456-789", "628123456789"],
  ["P02", "081234567890", "6281234567890"],
  ["P03", "+62 812 3456 7890", "6281234567890"],
  ["P04", "+628123456789", "628123456789"],
  ["P05", "62812345678", "62812345678"],
  ["P06", "628123456789", "628123456789"],
  ["P07", "812345678", "62812345678"],
  ["P08", "81234567", "6281234567"],
  ["P09", "8123", null],
  ["P10", "00628123456789", "628123456789"],
  ["P11", "0062 812 3456 789", "628123456789"],
  ["P12", "(0812) 3456 789", "628123456789"],
  ["P13", "0812.3456.789", "628123456789"],
  ["P14", "0812 3456 789 ext 12", "62812345678912"],
  ["P15", "021 5551234", "62215551234"],
  ["P16", "+1 415 555 0100", "14155550100"],
  ["P17", "+65 6123 4567", "6561234567"],
  ["P18", "+44 20 7946 0958", "442079460958"],
  ["P19", "1234567", null],
  ["P20", "12345678", "12345678"],
  ["P21", "123456789012345", "123456789012345"],
  ["P22", "1234567890123456", null],
  ["P23", "+123456789012345", "123456789012345"],
  ["P24", "+1234567890123456", null],
  ["P25", "", null],
  ["P26", "   ", null],
  ["P28", "abc", null],
  ["P29", "+", null],
  ["P30", "0", null],
  ["P31", "08", null],
  ["P32", "0812345", "62812345"],
  ["P33", "081 234 ABC 567", "6281234567"],
  ["P34", "++628123456789", "628123456789"],
  ["P35", "  +628123456789  ", "628123456789"],
  ["P36", "+62 0812 3456 789", "6208123456789"],
  ["P37", "0800-1-500-000", "628001500000"],
  ["P38", "1500-123", null],
  ["P39", "+84 90 123 4567", "84901234567"],
  ["P40", "84901234567", "6284901234567"],
  ["P41", "0901234567", "62901234567"],
  ["P42", "028 3822 1234", "622838221234"],
  ["P43", String.fromCharCode(1632, 1640, 1633, 1634, 1635, 1636, 1637, 1638, 1639, 1640, 1641), null],
  ["P44", String.fromCharCode(65296, 65304, 65297, 65298, 65299, 65300, 65301, 65302, 65303, 65304, 65305), null],
  ["P45", "0812-3456-789 / 0813-1111-222", null],
  ["P46", "+62-812-3456-789", "628123456789"],
  ["P47", "62-812-3456-789", "628123456789"],
  ["P48", "0812_3456_789", "628123456789"],
  ["P49", "0812\t3456\n789", "628123456789"],
  ["P50", "00 62 812 3456 789", "628123456789"],
  ["P51", "0062", null],
  ["P52", "+0812345678", "0812345678"],
  ["P53", "8", null],
  ["P54", "88888888", "6288888888"],
  ["P55", "7".repeat(15), "777777777777777"],
  ["P56", "0".repeat(14), "000000000000"],
  ["P57", "0".repeat(15), "0000000000000"],
  ["P58", "0".repeat(10240), null],
  ["P59", "(".repeat(10240), null],
  ["P60", "0812" + " ".repeat(80) + "3456789", "628123456789"],
  ["P61", "0812 3456 789\u00a0", "628123456789"],
  ["P62", "+62(0)812-3456-789", "6208123456789"],
  ["P63", "+62 21 5551 234", "62215551234"],
  ["P64", "0062-21-5551234", "62215551234"],
  ["P65", "<script>0812</script>", null],
  ["P66", "081299999999999999999999", null],
  ["P67", "+8 8888888", "88888888"],
  ["P68", "81234567890123", null],
  ["P69", "0812\u200b3456789", "628123456789"],
  ["P70", "tel: 0812-3456-789", "628123456789"],
];

test("normalizePhone: Indonesian table, default code and explicit \"62\" give the same answer (TC-VM-5.1)", () => {
  assert.ok(ID_ROWS.length >= 60);
  for (const [id, input, expected] of ID_ROWS) {
    assert.equal(normalizePhone(input), expected, `${id} default`);
    assert.equal(normalizePhone(input, "62"), expected, `${id} explicit 62`);
  }
});

test("normalizePhone: null, undefined and empty are null (P27)", () => {
  assert.equal(normalizePhone(null), null);
  assert.equal(normalizePhone(undefined), null);
  assert.equal(normalizePhone(null, "62"), null);
  assert.equal(normalizePhone(undefined, "62"), null);
});

test("normalizePhone: P60 a valid number padded past 64 characters still normalises today (decides where the later 64-char cap may apply)", () => {
  const padded = "0812" + " ".repeat(80) + "3456789";
  assert.ok(padded.length > 64);
  assert.equal(normalizePhone(padded), "628123456789");
  assert.equal(normalizePhone(padded, "62"), "628123456789");
});

test("normalizePhone: a 10 kB hostile input returns quickly (no backtracking)", () => {
  const started = Date.now();
  normalizePhone("0".repeat(10240));
  normalizePhone("(".repeat(10240));
  normalizePhone("+".repeat(10240) + "1");
  normalizePhone(" ".repeat(10240) + "0812345678");
  assert.ok(Date.now() - started < 500);
});

/** [id, input, default calling code, expected]: other explicit codes, current behaviour (TC-VM-5.2). */
const OTHER_CODE_ROWS: Array<[string, string, string, string | null]> = [
  ["C01", "0901234567", "84", "84901234567"],
  ["C02", "812345678", "84", "812345678"],
  ["C03", "0812-3456-789", "60", "608123456789"],
  ["C04", "+84 90 123 4567", "62", "84901234567"],
  ["C05", "0912345678", "84", "84912345678"],
  ["C06", "0028 3822 1234", "84", "2838221234"],
  ["C07", "+84 28 3822 1234", "84", "842838221234"],
  ["C08", "84901234567", "84", "84901234567"],
  ["C09", "90 123 4567", "84", "901234567"],
  ["C10", "0123456", "65", "65123456"],
  ["C11", "6123 4567", "65", "61234567"],
  ["C12", "0812", "", null],
  ["C13", "812345678", "1", "812345678"],
  ["C14", "0812345678", "0", "0812345678"],
];

test("normalizePhone: other explicit calling codes (TC-VM-5.2)", () => {
  for (const [id, input, code, expected] of OTHER_CODE_ROWS) assert.equal(normalizePhone(input, code), expected, id);
});

const JID_ROWS: Array<[string, string | null | undefined, string | null]> = [
  ["J01", "628123456789@s.whatsapp.net", "628123456789"],
  ["J02", "628123456789:12@s.whatsapp.net", "628123456789"],
  ["J03", "84901234567@s.whatsapp.net", "84901234567"],
  ["J04", "1234567@s.whatsapp.net", null],
  ["J05", "1234567890123456@s.whatsapp.net", null],
  ["J06a", "123@g.us", null],
  ["J06b", null, null],
  ["J06c", undefined, null],
  ["J06d", "", null],
  ["J11", "12345678@s.whatsapp.net", "12345678"],
  ["J12", "123456789012345@s.whatsapp.net", "123456789012345"],
  ["J13", "abc@s.whatsapp.net", null],
  ["J14", "628123456789@lid", null],
  ["J15", "628123456789:1:2@s.whatsapp.net", "628123456789"],
  ["J16", "62812345678@S.WHATSAPP.NET", null],
  ["J17", "status@broadcast", null],
];

test("phoneFromJid (TC-VM-5.3)", () => {
  for (const [id, jid, expected] of JID_ROWS) assert.equal(phoneFromJid(jid), expected, id);
});

const KEY_ROWS: Array<[string, { remoteJid?: string | null; senderPn?: string | null; participantPn?: string | null }, string | null]> = [
  ["J07", { remoteJid: "abc@lid", senderPn: "628123456789@s.whatsapp.net" }, "628123456789"],
  ["J08", { remoteJid: "abc@lid", participantPn: "84901234567@s.whatsapp.net" }, "84901234567"],
  ["J09", { remoteJid: "120363@g.us", senderPn: "628123456789@s.whatsapp.net" }, null],
  ["J10", { remoteJid: "abc@lid" }, null],
  ["J18", { remoteJid: "628123456789@s.whatsapp.net" }, "628123456789"],
  ["J19", { remoteJid: "628123456789@s.whatsapp.net", senderPn: "62811111111@s.whatsapp.net" }, "628123456789"],
  ["J20", { remoteJid: "abc@lid", senderPn: "bad", participantPn: "628123456789@s.whatsapp.net" }, "628123456789"],
  ["J21", { remoteJid: "status@broadcast", senderPn: "628123456789@s.whatsapp.net" }, null],
  ["J22", {  }, null],
  ["J23", { remoteJid: null, senderPn: "628123456789@s.whatsapp.net" }, null],
  ["J24", { remoteJid: "abc@lid", senderPn: "628123456789@s.whatsapp.net", participantPn: "62811111111@s.whatsapp.net" }, "628123456789"],
];

test("phoneFromKey (TC-VM-5.3)", () => {
  for (const [id, key, expected] of KEY_ROWS) assert.equal(phoneFromKey(key), expected, id);
});
