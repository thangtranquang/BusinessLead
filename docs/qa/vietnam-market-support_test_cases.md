# Test Cases: Vietnam market support (next to Indonesia)

> Based on [PRD](../PRD.md) section 2 (`VM-FR/NFR/AC`, authority: 2.13 "Architecture review amendments") and [Use Cases](../use-cases/vietnam-market-support_use_cases.md) (UC-VM-1..22). Format baseline: [vietnamese-language_test_cases.md](vietnamese-language_test_cases.md).
>
> Created 2026-10-24. Specifications only; no code. All data is invented (example.com, "Công ty Mẫu", numbers such as `0901 234 567` are visibly fake). Never use real numbers, names or chats in any test, fixture, log or doc.

## 0. Conventions

**Columns**: `ID | Title | Ref (UC / VM-FR / VM-AC; "PRD-only" = not traced in the use-case file) | Level | Pri | Inputs | Expected | Target file`.
**Levels**: `unit` = node:test via tsx, glob `apps/api/src/**/*.test.ts` (`pnpm --filter @prospex/api test`); `integration` = `apps/api/scripts/pipeline-check.ts` (real DB, fake WhatsApp provider, `sender.tick(workspaceId)`) or a scratch-DB script; `e2e` = Playwright `tests/e2e/*.spec.ts` against `http://localhost:3210` (browser specs use `./fixtures`; pure-helper specs are browser-less with relative imports, like `lang-helpers.spec.ts`); `static` = grep/git/tsc/diff gate; `manual` = reviewer or real-run check.
**Priority**: P0 = release blocker (ID regression, security, data integrity, guards); P1 = core behaviour; P2 = polish/edge.
**Reuse**: `apps/api/src/common/hostile-limits.ts` (`HOSTILE_MS_SMALL` 500 ms, `HOSTILE_MS_LARGE` 1500 ms, `assertLinear(fn, make)`; no test may hard-code a limit); `common/text.ts` (accent folding, shared, not duplicated: VM-NFR-3); `common/language.ts` (pattern for `normalizeMarket`/`toMarket`/`IsMarket`; existing tests `language.test.ts`, `language-dto.test.ts`, `language-migration.test.ts` are the models for the new market tests).
**Verified test layout** (read from repo): API unit tests sit next to code (`areas.test.ts`, `maps-parse.test.ts`, `scraper.processor.test.ts`, `geo.test.ts`, `wa-text.test.ts`, `messaging.test.ts`, `scoring.test.ts`, `campaigns.service.test.ts`, ...); e2e specs `tests/e2e/{auth,campaigns,leads,settings,workspaces,analytics,export,language,lang-helpers,i18n-dictionaries}.spec.ts` plus `zz-language-api.spec.ts` (HTTP-heavy, last for throttle reasons). New HTTP-heavy spec must be named `zz-market-api.spec.ts`. `leadKey` is already exported from `scraper.processor.ts` (so the dedupe key can be snapshotted in S1 without a production change). The Maps URLs and browser context are currently **inline** in `google-maps.scraper.ts` (no pure builder yet): see TC-VM-5.5.
**Simulated**: every Vietnamese Google Maps wording test (UC-VM-7, UC-VM-4-EC1) is **Simulated** (invented fixtures); docs must say so (VM-NFR-6).

**Placeholders for new target files** (proposed names, owned by the test-writer): `common/market.test.ts`, `common/market-dto.test.ts`, `messaging/phone.snapshot.test.ts`, `messaging/phone-vn.test.ts`, `messaging/landline-guard.test.ts`, `scraper/areas.snapshot.test.ts`, `scraper/areas-vn.test.ts`, `scraper/maps-parse.snapshot.test.ts`, `scraper/maps-parse-vn.test.ts`, `scraper/maps-urls.test.ts`, `leads/geo.snapshot.test.ts`, `leads/geo-vn.test.ts`, `messaging/wa-text.snapshot.test.ts`, `ai/scoring.snapshot.test.ts`, `ai/scoring-market.test.ts`, `apps/web/src/lib/market-ui.ts` (pure helpers, tested browser-less in `tests/e2e/market-helpers.spec.ts`), `tests/e2e/vietnam-market.spec.ts`, `tests/e2e/zz-market-api.spec.ts`.

---

## 1. ID regression snapshots (S1, written BEFORE any behaviour change, never edited afterwards)

Rules: inline literals only (no generated files); file names end `.snapshot.test.ts`; committed in S1 with no production change; any later diff of these files is a BLOCKER (VM-NFR-1). Expected values below are **derived by reading the current code** (`messaging/phone.ts`, `scraper.processor.ts:16-19`); a value marked **[derive]** must be confirmed by running the current code in slice 1 and written as the literal the code returns today (the snapshot records reality, not this document).

### 1.1 Snapshot test cases

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-5.1 | `normalizePhone` ID table (table 1.2, 60 rows) | UC-VM-5-A2, UC-VM-9-M12, VM-FR-4, VM-AC-1 | unit | P0 | Table 1.2, default code and explicit `"62"` | Every row equals the listed output, both call forms | `messaging/phone.snapshot.test.ts` |
| TC-VM-5.2 | `normalizePhone` with other explicit codes (current behaviour) | VM-FR-4 | unit | P1 | Table 1.3 | As listed | `messaging/phone.snapshot.test.ts` |
| TC-VM-5.3 | `phoneFromJid` / `phoneFromKey` table (table 1.4) | UC-VM-10-E2, VM-AC-6 | unit | P0 | Table 1.4 | As listed | `messaging/phone.snapshot.test.ts` |
| TC-VM-5.4 | `leadKey` dedupe table (table 1.5) | UC-VM-10, VM-FR-12 | unit | P0 | Table 1.5 | As listed | `scraper/areas.snapshot.test.ts` (or `scraper.processor.snapshot.test.ts`) |
| TC-VM-5.5 | ID Maps URLs and context recorded | UC-VM-5-A2, VM-AC-1 | static | P0 | At S1 the URLs are inline (no builder to call): read `google-maps.scraper.ts` as text and assert it contains the literals `, Indonesia`, `hl=id`, `id-ID`, `Asia/Jakarta`, `13z`; in S4 add a pure-builder test asserting equality with the same literals for sample area `Bandung` and query `kopi` | S1: the four literals present. S4 (new file, S1 file untouched): `buildAreaUrl("Bandung","ID")` = `https://www.google.com/maps/search/Bandung%2C%20Indonesia?hl=id` **[derive exact current encoding from code]** | `scraper/areas.snapshot.test.ts` (S1), `scraper/maps-urls.test.ts` (S4) |
| TC-VM-5.6 | `INDONESIA_CITIES` and aliases frozen | UC-VM-5-A2, VM-FR-4 | unit | P0 | Import list and `PLACE_ALIASES` | length 70, order identical to an inline literal copy; alias list identical (Jogja, Yogya, DIY, Solo, Bali, Jabodetabek, Jabar, Jateng, Jatim, Sumatera, Jawa, Kalimantan, Sulawesi, Papua, Indonesia) | `scraper/areas.snapshot.test.ts` |
| TC-VM-5.7 | `planAreas` / `splitAreas` / `stripPlaces` / `isNationwide` for >= 12 inputs (table 1.6) | UC-VM-5-A2, UC-VM-6-A8, VM-AC-1, VM-AC-3 | unit | P0 | Table 1.6 | Outputs recorded as inline literals **[derive]** | `scraper/areas.snapshot.test.ts` |
| TC-VM-5.8 | `inArea`, `haversineKm`, `DEFAULT_RADIUS_KM` | VM-FR-4 | unit | P1 | `DEFAULT_RADIUS_KM`; `haversineKm` Jakarta (-6.2088,106.8456) to Bandung (-6.9175,107.6191) rounded to 1 km; `inArea` with and without coordinates | 50; distance value **[derive]**; address-name fallback as today | `scraper/areas.snapshot.test.ts` |
| TC-VM-5.9 | maps-parse ID table (table 1.7) | UC-VM-7-A8, VM-AC-7 | unit | P0 | Table 1.7 | As listed **[derive]** | `scraper/maps-parse.snapshot.test.ts` |
| TC-VM-5.10 | `regionFromNominatim` ID table (table 1.8) | UC-VM-13-A4, VM-AC-8 | unit | P0 | Table 1.8 | As listed **[derive]** | `leads/geo.snapshot.test.ts` |
| TC-VM-5.11 | `normalizeProvince`, `cellKey` ID samples | VM-FR-4 | unit | P1 | `normalizeProvince("DKI Jakarta")`, `("Daerah Istimewa Yogyakarta")`, `cellKey(-6.2088,106.8456)` | Literals **[derive]** | `leads/geo.snapshot.test.ts` |
| TC-VM-5.12 | `wa-text` shared-contact ID table (table 1.9) | UC-VM-10-A3, VM-FR-12 | unit | P0 | Table 1.9 | As listed **[derive]** | `messaging/wa-text.snapshot.test.ts` |
| TC-VM-5.13 | Scoring ID table (table 1.10) | UC-VM-12-A1, VM-NFR-1 | unit | P0 | Table 1.10 | Score and factor texts identical **[derive]** | `ai/scoring.snapshot.test.ts` |
| TC-VM-5.14 | `decide()` send-policy unchanged | UC-VM-15-A5, VM-AC-13 | unit | P0 | Existing send-policy tests (`messaging.test.ts` and siblings) | Pass with zero edits (`git diff` of those files empty) | existing + static diff |
| TC-VM-5.15 | Existing exports without a market argument | UC-VM-5-A3, VM-FR-4 | unit | P0 | Call `normalizePhone(x)`, `planAreas(l,q,max)`, `isNationwide(l)`, `normalizeRating(r)`, `regionFromNominatim(a)` with the old arities | Same results as TC-VM-5.1/5.7/5.9/5.10; `tsc --noEmit` accepts old call sites | `scraper/areas.snapshot.test.ts` + tsc |
| TC-VM-5.16 | Snapshot files immutable | UC-VM-5-EC1, VM-NFR-1, VM-AC-1 | static | P0 | `git diff --name-only <S1 commit>..HEAD -- "*.snapshot.test.ts"` | Empty output (only the S1 commit touches them; S4's new builder test lives in a different file) | CI/review gate |
| TC-VM-5.17 | S1 precedes production change | UC-VM-5-EC1, VM-AC-1 | static | P1 | `git log --oneline` order | The S1 commit has no non-test file in its diff and is earlier than S2 | review gate |
| TC-VM-5.18 | Legacy queued job without `market` | UC-VM-5 primary, VM-FR-6, VM-NFR-5 | unit | P0 | Job data without `market` into the market resolution used by the processor | Resolves `ID`; profile equals ID literals | `scraper/scraper.processor.test.ts` |
| TC-VM-5.19 | Job with `market: "VN"` | UC-VM-5-A1, VM-FR-6 | unit | P1 | Job `market: "VN"`, DB value absent | `VN` profile (but see TC-VM-4.8: DB wins when present) | `scraper/scraper.processor.test.ts` |
| TC-VM-5.20 | Job with `"XX"`, `null`, `1`, `{}`, `"vn"` | UC-VM-5-E1, VM-NFR-2 | unit | P0 | Each value | `ID`, no throw, value never appears in any built URL | `scraper/scraper.processor.test.ts` |
| TC-VM-22.1 | Existing API unit suite green, unchanged | UC-VM-22-A1, VM-NFR-1 | static | P0 | `pnpm --filter @prospex/api test` (732 tests per PRD; re-measure count at S1 and record it here) | Count >= baseline, 0 failures, no pre-existing test file edited except additions | CI |
| TC-VM-22.2 | Existing Playwright suite green, unchanged | UC-VM-22-A2, VM-NFR-1 | e2e | P0 | `pnpm test:e2e` (155 tests per brief; re-measure at S1) | All pass; `i18n-dictionaries.spec.ts` and `language.spec.ts` unedited except for added keys | `tests/e2e/*` |
| TC-VM-22.3 | Indonesian campaign end to end unchanged | UC-VM-22 primary, VM-NFR-1 | integration | P0 | `pipeline-check.ts` ID workspace: create default campaign, fixture scrape, score, approve, send with fake provider | Same outcomes and numbers as the pre-feature run | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-22.4 | Vietnamese language support unchanged | UC-VM-22 primary, UC-VM-22-A3, VM-FR-3 | e2e | P1 | Existing `language.spec.ts`, `zz-language-api.spec.ts`; plus unit `language.test.ts` | Pass unchanged; output language independent of market | existing |
| TC-VM-22.5 | English UI default is ID | UC-VM-22-A4 | e2e | P1 | See TC-VM-2.2 | `ID` | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-22.6 | Any ID output differing from snapshot is a blocker | UC-VM-22-E1, VM-NFR-1 | static | P0 | Review rule | Failing S1 file blocks merge | review gate |
| TC-VM-22.7 | 1,500-lead campaign: no slowdown, no extra per-lead network call | UC-VM-22-EC1, VM-NFR-4 | integration | P2 | `pipeline-check.ts` with 1,500 fixture-like rows through `createMany`; fake geocoder counting calls | Geocoder/network calls per lead unchanged vs baseline; total time within 20 percent of baseline measured at S1 | `apps/api/scripts/pipeline-check.ts` |

### 1.2 Table: `normalizePhone` ID (default code "62"), current behaviour

Algorithm read from `phone.ts`: trim; digits = remove `\D`; empty gives null; leading `+` keeps digits; else leading `00` drops it; else leading `0` becomes `62`; else a leading `8` gets `62` prepended; result valid only if 8 to 15 digits. Unicode digits (Arabic-Indic, fullwidth) are `\D` and are stripped. Letters are stripped, not rejected.

| # | Input | Expected |
|---|-------|----------|
| P01 | `0812-3456-789` | `628123456789` |
| P02 | `081234567890` | `6281234567890` |
| P03 | `+62 812 3456 7890` | `6281234567890` |
| P04 | `+628123456789` | `628123456789` |
| P05 | `62812345678` (no plus, starts 6) | `62812345678` |
| P06 | `628123456789` | `628123456789` |
| P07 | `812345678` (bare 8, 9 digits) | `62812345678` |
| P08 | `81234567` (bare 8, 8 digits) | `6281234567` |
| P09 | `8123` (bare 8, too short) | `null` |
| P10 | `00628123456789` | `628123456789` |
| P11 | `0062 812 3456 789` | `628123456789` |
| P12 | `(0812) 3456 789` | `628123456789` |
| P13 | `0812.3456.789` | `628123456789` |
| P14 | `0812 3456 789 ext 12` | `62812345678912` (letters stripped, digits kept) |
| P15 | `021 5551234` (Jakarta landline) | `62215551234` |
| P16 | `+1 415 555 0100` | `14155550100` |
| P17 | `+65 6123 4567` | `6561234567` |
| P18 | `+44 20 7946 0958` | `442079460958` |
| P19 | `1234567` (7 digits) | `null` |
| P20 | `12345678` (8 digits, starts 1) | `12345678` |
| P21 | `123456789012345` (15 digits) | `123456789012345` |
| P22 | `1234567890123456` (16 digits) | `null` |
| P23 | `+123456789012345` (15) | `123456789012345` |
| P24 | `+1234567890123456` (16) | `null` |
| P25 | `` (empty) | `null` |
| P26 | `   ` | `null` |
| P27 | `null` / `undefined` | `null` |
| P28 | `abc` | `null` |
| P29 | `+` | `null` |
| P30 | `0` | `null` (`62` only 2 digits) |
| P31 | `08` | `null` |
| P32 | `0812345` | `62812345` (8 digits, valid; flag as quirk) |
| P33 | `081 234 ABC 567` | `6281234567` (letters stripped; flag: VN will differ, see TC-VM-9.9) |
| P34 | `++628123456789` | `628123456789` |
| P35 | `  +628123456789  ` | `628123456789` |
| P36 | `+62 0812 3456 789` (trunk zero after code, kept today) | `6208123456789` |
| P37 | `0800-1-500-000` | `628001500000` |
| P38 | `1500-123` | `null` (7 digits) |
| P39 | `+84 90 123 4567` (VN number under ID default) | `84901234567` |
| P40 | `84901234567` (no plus, ID default, starts 8) | `6284901234567` (bare-8 rule; UC-VM-9-M13) |
| P41 | `0901234567` under ID default | `62901234567` |
| P42 | `028 3822 1234` under ID default | `622838221234` |
| P43 | `٠٨١٢٣٤٥٦٧٨٩` (Arabic-Indic digits) | `null` |
| P44 | `０８１２３４５６７８９` (fullwidth digits) | `null` |
| P45 | `0812-3456-789 / 0813-1111-222` (two numbers) | digits `08123456789` + `08131111222` = 22 digits, leading 0 gives `62`+... total > 15: `null` |
| P46 | `+62-812-3456-789` | `628123456789` |
| P47 | `62-812-3456-789` | `628123456789` |
| P48 | `0812_3456_789` | `628123456789` |
| P49 | tab/newline separated `0812\t3456\n789` | `628123456789` |
| P50 | `00 62 812 3456 789` | `628123456789` |
| P51 | `0062` | `null` (`62` then nothing: digits `0062` -> `62`, 2 digits) |
| P52 | `+0812345678` (plus then zero) | `0812345678` (no rewrite after `+`) |
| P53 | `8` | `628` -> `null` |
| P54 | `88888888` (8 digits, bare 8) | `6288888888` |
| P55 | `7` x 15 | `777777777777777` |
| P56 | `0` x 14 | `62` + 13 zeros = 15 digits: `620000000000000` |
| P57 | `0` x 15 | `null` (16 digits) |
| P58 | hostile 10 kB: `"0".repeat(10240)` | `null` |
| P59 | hostile 10 kB: `"(".repeat(10240)` | `null` |
| P60 | cap probe: `"0812" + " ".repeat(80) + "3456789"` (> 64 chars, valid digits `08123456789`) | `628123456789` today. **Critical**: VM-FR-12 adds a 64-char cap "in both markets"; this row is the one that would change for ID, so per VM-FR-12 the cap must then be gated to the VN path. The ID snapshot keeps `628123456789`. |

P42 clarification: expected literal is `622838221234`.

### 1.3 Table: other explicit default codes (current)

| # | Call | Expected |
|---|------|----------|
| C01 | `normalizePhone("0901234567","84")` | `84901234567` |
| C02 | `normalizePhone("812345678","84")` | `812345678` (bare-8 rule only for `62`) |
| C03 | `normalizePhone("0812-3456-789","60")` | `60812-` stripped: `608123456789` |
| C04 | `normalizePhone("+84 90 123 4567","62")` | `84901234567` |

### 1.4 Table: JID helpers

| # | Call | Expected |
|---|------|----------|
| J01 | `phoneFromJid("628123456789@s.whatsapp.net")` | `628123456789` |
| J02 | `phoneFromJid("628123456789:12@s.whatsapp.net")` | `628123456789` |
| J03 | `phoneFromJid("84901234567@s.whatsapp.net")` | `84901234567` |
| J04 | `phoneFromJid("1234567@s.whatsapp.net")` | `null` (7 digits) |
| J05 | `phoneFromJid("1234567890123456@s.whatsapp.net")` | `null` (16 digits) |
| J06 | `phoneFromJid("123@g.us")`, `null`, `undefined`, `""` | `null` each |
| J07 | `phoneFromKey({remoteJid:"abc@lid", senderPn:"628123456789@s.whatsapp.net"})` | `628123456789` |
| J08 | `phoneFromKey({remoteJid:"abc@lid", participantPn:"84901234567@s.whatsapp.net"})` | `84901234567` |
| J09 | `phoneFromKey({remoteJid:"120363@g.us", senderPn:"628123456789@s.whatsapp.net"})` | `null` |
| J10 | `phoneFromKey({remoteJid:"abc@lid"})` | `null` |

### 1.5 Table: `leadKey`

| # | Input `{name,address,phone}` | Expected |
|---|------------------------------|----------|
| K01 | phone `0812-3456-789` | `tel:628123456789` |
| K02 | phone `+62 812 3456 789` | `tel:628123456789` |
| K03 | phone `0812 3456 789` (same lead as K01) | `tel:628123456789` |
| K04 | phone `1234567`, name `Toko Mawar`, address `Jl. A No. 1` | `toko mawar|jl. a no. 1` |
| K05 | phone `""` | `name.toLowerCase()|address.toLowerCase()` |
| K06 | phone `(021) 555 1234` | `tel:62215551234` |
| K07 | phone `+84 90 123 4567` | `tel:84901234567` (no leading 0, unchanged) |
| K08 | phone `090 123 4567` (ID today) | `tel:62901234567` |

### 1.6 Table: areas (ID), minimum inputs (outputs **[derive]** from current code)

`splitAreas`: `Seluruh Indonesia`; `Jogja dan Solo`; `Medan; Batam`; `yogyakarta, medan dan semarang`; `Solo & Jogja`; `di Bandung`; `kota Surabaya`; `Kab. Sleman`; `a|b/c+d`; newline-separated three cities; `  ` (empty); `x` (length 1 dropped); duplicate `Bandung, bandung`.
`isNationwide`: `Seluruh Indonesia`, `semua indonesia`, `se indonesia`, `nasional`, `all Indonesia`, `nationwide`, `Jakarta` (false).
`planAreas(location, query, max)`: `Seluruh Indonesia` with several `max` values (checks >= 8 and <= 70 and `perSearch`), `Jogja dan Solo`, `Medan; Batam`, `Jabodetabek`, `Bali`, `Bandung`.
`stripPlaces`: `sewa kamera Solo` (typed `["Medan"]`), `toko roti di Bandung`, `kopi` (< 3 chars result guard), `jasa Jakarta Selatan`.

### 1.7 Table: maps-parse (ID), minimum inputs (**[derive]**)

`normalizeRating`: `4,6`, `4.6`, `5`, `0`, `""`, `abc`, `4,67`. Review counts: `(1.234)`, `(1,234)`, `(12)`, `()`. `pickCategory`: rows starting `Buka`, `Tutup`, `Open`, `Closed`, `Opens`, `Closes`, `Sementara tutup`, `24 jam`, `Sponsor`, `Iklan`, address-like `Jl.`, `Jalan`, `Gg`, `Gang`, `Street`, `Ruko`, `Komplek`; a real category row (`Toko kopi`); empty list.

### 1.8 Table: `regionFromNominatim` (ID), minimum inputs (**[derive]**)

`country_code:"id"` with state `Jawa Barat`, city `Bandung`, city_district `Coblong`; Jakarta special case (`DKI Jakarta`, city `Jakarta Selatan`); Yogyakarta special case (`Daerah Istimewa Yogyakarta`); `county`, `regency`, `municipality`, `town` fallbacks; missing `country_code` (passes today); `country_code:"ke"` and `"sg"` (null); empty address object; `null` input.

### 1.9 Table: wa-text shared contact (ID), minimum inputs (**[derive]**)

`Hubungi +62 812 3456 789`, `0812-3456-789`, `08123456789`, `+62 21 555 1234` (landline-looking), `kontak: 628123456789`, a text containing two numbers, a 4,000-character text with a number at the end, a 5,000-character text with a number after char 4,000, and `+84 90 123 4567` (not matched today; **[derive]**; after S3 this may match: that is a VM-FR-12 change and must live in `wa-text-vn` tests, not in the snapshot).

### 1.10 Table: scoring (ID), minimum inputs (**[derive]**)

Lead with phone `628123456789` (+15 today), phone `622155512344` landline-looking ID number (+15 today, must stay +15), no phone ("No phone number: cannot be reached on WhatsApp"), address present (+3), address absent, website present/absent, rating/review combinations used by existing `scoring.test.ts`. The record is score total and factor list.

---

## 2. Market model (UC-VM-1, UC-VM-5, VM-FR-1, VM-FR-2)

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-1.1 | `MARKETS`/`DEFAULT_MARKET` constants | VM-FR-1 | unit | P0 | Import | `MARKETS` deep-equals `['ID','VN']`, frozen (`Object.isFrozen`), `DEFAULT_MARKET === 'ID'` | `common/market.test.ts` |
| TC-VM-1.2 | `normalizeMarket` reads | UC-VM-1-EC1, VM-FR-1 | unit | P0 | `'VN'`; `'ID'`; `'vn'`; `'Vn'`; `'XX'`; `null`; `undefined`; `''`; `1`; `['VN']`; `{}`; 10 kB string | `VN` only for exact `'VN'`; `ID` for everything else; never throws | `common/market.test.ts` |
| TC-VM-1.3 | `toMarket` writes | VM-FR-1 | unit | P0 | Same inputs as TC-VM-1.2 | Returns `'ID'`/`'VN'` for exact values; throws for all others | `common/market.test.ts` |
| TC-VM-1.4 | Profile registry exhaustive and frozen | VM-FR-2 | unit | P1 | `MARKET.ID`, `MARKET.VN` | Keys exactly `MARKETS`; `ID`: `callingCode '62'`, `mapsLocale 'id-ID'`, `timezone 'Asia/Jakarta'`, `nominatimCountry 'id'`, `regionSuffix 'Indonesia'`, `bareMobileLead` matches `8...`; `VN`: `'84'`, `'vi-VN'`, `'Asia/Ho_Chi_Minh'`, `'vn'`, `'Việt Nam'`, `bareMobileLead === null`; frozen | `common/market.test.ts` |
| TC-VM-1.5 | ID profile equals pre-feature literals | VM-FR-4, VM-NFR-1 | unit | P0 | Profile vs Section 1 snapshot literals | `cities` = the 70 names in order; `mapCenter` Jakarta (-6.2088, 106.8456) | `common/market.test.ts` |
| TC-VM-1.6 | VN profile `cities` and `nationwideTerms` | VM-FR-2, VM-FR-7a | unit | P1 | `MARKET.VN.cities` | Ordered, no duplicates (accent-folded, case-insensitive), contains Hà Nội, Thành phố Hồ Chí Minh or `TP.HCM` canonical, Đà Nẵng; length >= 8; `nationwideTerms` non-empty | `common/market.test.ts` |
| TC-VM-1.7 | `common/market.ts` import boundary | VM-FR-1, VM-FR-2 | static | P1 | grep imports of `common/market.ts` | No import from `scraper/`, `leads/`, `messaging/` | review gate |
| TC-VM-1.8 | No hard-coded country literals outside profile | PRD 2.12 invariant, VM-FR-6 | static | P2 | grep `", Indonesia"`, `"hl=id"`, `"Asia/Jakarta"`, `"id-ID"` in `apps/api/src` non-test files | Occurrences only inside the profile registry/`areas.ts` ID data and documented defaults (email fallback, schema default) | review gate |

## 3. Campaign API: create, read, patch, start (UC-VM-1, 3, 19; VM-FR-1, 24; VM-AC-11)

### 3.1 DTO validation matrix (`POST /campaigns`, `PATCH /campaigns/:id`)

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-1.9 | `IsMarket` accepts `ID`, `VN` | VM-FR-1 | unit | P0 | DTO via `class-validator` `validate` | 0 errors | `common/market-dto.test.ts` |
| TC-VM-1.10 | `IsMarket` rejects lowercase and variants | UC-VM-1-E1, VM-AC-11 | unit | P0 | `'vn'`, `'Vn'`, `'id'`, `'Vietnam'`, `'XX'`, `'VN '`, `' VN'` | Each: validation error | `common/market-dto.test.ts` |
| TC-VM-1.11 | `IsMarket` rejects null and empty | UC-VM-1-E2, VM-AC-11 | unit | P0 | `null`, `''` (explicit properties) | Each: error (no `ValidateIf` skip for null on this field, unlike optional fields) | `common/market-dto.test.ts` |
| TC-VM-1.12 | `IsMarket` rejects non-strings | UC-VM-1-E3, VM-NFR-2 | unit | P0 | `123`, `['VN']`, `[]`, `{}`, `true` | Each: error | `common/market-dto.test.ts` |
| TC-VM-1.13 | Omitted `market` | UC-VM-1-A2, VM-NFR-5 | unit | P0 | DTO without property | 0 errors (optional) | `common/market-dto.test.ts` |
| TC-VM-1.14 | 10 kB `market` string | VM-NFR-2, VM-NFR-3 | unit | P1 | `"A".repeat(10240)` | Error, finishes within `HOSTILE_MS_SMALL` | `common/market-dto.test.ts` |
| TC-VM-1.15 | DTO mirrors `language-dto.test.ts` pattern for Create and Update DTOs | VM-FR-1 | unit | P1 | Both `CreateCampaignDto` and `UpdateCampaignDto` | Same results in all rows above | `common/market-dto.test.ts` |
| TC-VM-1.16 | Mass assignment | UC-VM-19-A5, VM-NFR-5 | unit | P0 | Transform with `whitelist:true`: body `{name, market:'VN', workspaceId:'other', status:'running', id:'x'}` | `workspaceId`, `status`, `id` stripped; `market` kept | `common/market-dto.test.ts` |
| TC-VM-1.17 | Existing clients without `market` | UC-VM-19-EC3, VM-NFR-5 | unit | P0 | Pre-feature create/patch bodies from existing tests | All validate | `common/market-dto.test.ts` |

### 3.2 HTTP and service behaviour

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-1.18 | Create VN campaign | UC-VM-1 primary, VM-AC-11 | e2e | P0 | `POST /api/campaigns` `{name, query, location:'TP.HCM', market:'VN'}` | 201; body `market:'VN'`, `status:'draft'`; `GET /campaigns` and `GET /campaigns/:id` both return `market:'VN'` | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-1.19 | Create with `market:'ID'` | UC-VM-1-A1 | e2e | P1 | `market:'ID'` | 201, `market:'ID'` | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-1.20 | Create without `market` | UC-VM-1-A2, VM-AC-10 | e2e | P0 | Body without `market` | 201, `market:'ID'` | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-1.21 | Market independent of language | UC-VM-1-A3, VM-FR-3 | e2e | P1 | (`VN`,`english`) and (`ID`,`vietnamese`) | Both 201, both values stored as sent | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-1.22 | Invalid `market` values over HTTP | UC-VM-1-E1..E3, UC-VM-19-E1, VM-AC-11 | e2e | P0 | `'XX'`, `'vn'`, `'Vietnam'`, `null`, `''`, `1`, `['VN']`, `{}` | 400 each, error shape normalised by `HttpExceptionFilter`; `GET /campaigns` count unchanged (nothing stored) | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-1.23 | Service `create` stores market | UC-VM-1 primary | unit | P1 | Fake prisma in `campaigns.service.test.ts` style | `campaign.create` called with `market:'VN'`; with none, no `market` key or `'ID'` (DB default) | `campaigns/campaigns.service.test.ts` |
| TC-VM-3.1 | PATCH market on draft | UC-VM-3 primary, VM-FR-24 | unit | P0 | Fake prisma: campaign `draft` in workspace W | `updateMany` called with `where:{id, workspaceId:W, status:'draft'}`, `data` containing `market`; returns updated campaign | `campaigns/campaigns.service.test.ts` |
| TC-VM-3.2 | PATCH market on draft over HTTP | UC-VM-3 primary, VM-AC-11 | e2e | P0 | Create draft `ID`, `PATCH {market:'VN'}` | 200, `market:'VN'` | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-3.3 | PATCH market on non-draft | UC-VM-3-E1, VM-FR-24, VM-AC-11 | integration | P0 | Campaigns in `running`, `completed`, `failed` (set via DB in `pipeline-check.ts`) | 409 `ConflictException` each; stored `market` unchanged | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-3.4 | Same value on non-draft | UC-VM-3-EC1, VM-FR-24 | unit | P0 | Non-draft campaign `VN`, `PATCH {market:'VN'}` | 409 (status-based, not value-based) | `campaigns/campaigns.service.test.ts` |
| TC-VM-3.5 | Other workspace's campaign | UC-VM-3-E2, UC-VM-19-A3, VM-NFR-2 | e2e | P0 | Workspace B token PATCHes campaign of A | 404; A's market unchanged; body does not leak A's data | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-3.6 | 404 before 409 | VM-FR-24 | unit | P0 | Non-draft campaign belonging to another workspace | 404 `NotFoundException` (not 409) | `campaigns/campaigns.service.test.ts` |
| TC-VM-3.7 | Invalid market on PATCH | UC-VM-3-E3, VM-AC-11 | e2e | P0 | `null`, `''`, `'XX'`, `'vn'` on a draft | 400; market unchanged | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-3.8 | PATCH without `market` on non-draft | UC-VM-3-E4, VM-FR-24, VM-NFR-5 | unit | P0 | Non-draft, body `{name:'New'}` | Existing behaviour (no 409; no `status:'draft'` filter added for other fields) | `campaigns/campaigns.service.test.ts` |
| TC-VM-3.9 | PATCH mixed fields with market on non-draft | VM-FR-24 | unit | P1 | Non-draft, body `{name:'New', market:'VN'}` | 409; document and assert whether `name` was applied (expected: nothing applied, no partial write) | `campaigns/campaigns.service.test.ts` |
| TC-VM-3.10 | Concurrent start vs PATCH | UC-VM-3-EC2, VM-FR-6, VM-FR-24 | integration | P0 | Draft campaign; run `PATCH {market:'VN'}` and `start` concurrently 20 times (fake queue) | Never a job whose effective run market differs from the stored market at job start; outcomes only: (PATCH ok then start) or (start then PATCH 409) | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-3.11 | Start on non-draft, non-failed | UC-VM-4-E2, VM-FR-24, VM-AC-11 | integration | P0 | `POST /scraper/campaigns/:id/start` with status `running`, `completed` | 409 each; no job enqueued | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-3.12 | Start on `draft` and `failed` allowed | VM-FR-24 | integration | P0 | Status `draft`, `failed` | 2xx; job enqueued with `market` of the stored campaign | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-3.13 | Start other workspace's campaign | UC-VM-4-E1, UC-VM-19-A3 | e2e | P0 | Token of B | 404, no job | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-3.14 | Draft-only is enforced in SQL | VM-FR-24 | static | P1 | grep `campaigns.service.ts` | `market` update uses `updateMany` with `status:'draft'` in `where` (no read-then-write) | review gate |
| TC-VM-19.1 | Unauthenticated create | UC-VM-19-A1, VM-NFR-2 | e2e | P0 | `POST /api/campaigns` without token | 401 | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-19.2 | Unauthenticated PATCH and start | UC-VM-19-A2 | e2e | P0 | No token; expired/garbage token | 401 | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-19.3 | API key creates campaign with market | UC-VM-19-A4 | e2e | P1 | `ApiKeyGuard` route (if campaign create accepts API keys) with `market:'VN'`, `'XX'` | Same validation (201 / 400) and workspace scoping; if routes do not accept API keys, record N/A | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-19.4 | Throttle unchanged | UC-VM-19-A6, VM-NFR-5 | static | P2 | grep for new `@Throttle`/`@SkipThrottle` in the diff | None added | review gate |
| TC-VM-19.5 | Stored unknown market reads as ID in all consumers | UC-VM-19-EC1, VM-NFR-2 | integration | P0 | DB row `market='XX'` (raw SQL), then start in fixture mode, list leads | Treated as `ID`: Indonesian fixture, `ID` URLs; `XX` never appears in URL, prompt, SQL parameter or log | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-19.6 | No new user-URL fetch | UC-VM-19-EC2, VM-NFR-2 | static | P0 | grep `fetch(`/`goto(` in diff | No new call with user input; `url-fetch.ts` and `SafeProxy` untouched (`git diff` empty on them) | review gate |
| TC-VM-19.7 | `market` not returned outside the campaign routes | VM-NFR-2 | e2e | P1 | `GET /leads`, `GET /analytics`, `GET /export` payloads | No `market` property leaks via leads of another workspace; own routes only | `tests/e2e/zz-market-api.spec.ts` |

## 4. Scraper: URLs, context, processor (UC-VM-4, 5, 8; VM-FR-6, 12, 22; VM-AC-2)

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-4.1 | VN area URL | UC-VM-4-A1, VM-AC-2 | unit | P0 | `buildAreaUrl("TP.HCM","VN")` (pure, no browser) | Starts `https://www.google.com/maps/search/`; contains encoded `Vi%E1%BB%87t%20Nam` (or `Vi%E1%BB%87t Nam` per final encoder, assert via `decodeURIComponent` equals `TP.HCM, Việt Nam`); contains `hl=vi`; not `Indonesia`, not `hl=id` | `scraper/maps-urls.test.ts` |
| TC-VM-4.2 | VN search URL | UC-VM-4 primary, VM-AC-2 | unit | P0 | query `công ty logistics`, area `Hà Nội`, centre 21.0278,105.8342 | Path `encodeURIComponent("công ty logistics Hà Nội")`, then `/@21.0278,105.8342,13z`, `?hl=vi` | `scraper/maps-urls.test.ts` |
| TC-VM-4.3 | VN context | UC-VM-4 primary, VM-AC-2 | unit | P0 | `buildContext("VN")` | `locale:'vi-VN'`, `timezoneId:'Asia/Ho_Chi_Minh'` | `scraper/maps-urls.test.ts` |
| TC-VM-4.4 | ID URLs and context equal S1 literals | UC-VM-4 primary, VM-AC-1 | unit | P0 | Builders with `"ID"` and with no market argument | Equal to TC-VM-5.5 literals: `, Indonesia`, `hl=id`, `id-ID`, `Asia/Jakarta` | `scraper/maps-urls.test.ts` |
| TC-VM-4.5 | Hostile area text is encoded | UC-VM-4-A2, VM-NFR-2 | unit | P0 | Areas: `a&hl=en`, `a#frag`, `a?x=1`, `a/b`, `a\nb`, `a\r\nHost: evil`, `ünï ç ọ̀ 越南`, `%00`, `"><script>`, `../../x`, emoji | Resulting URL has exactly one `?` and exactly one `hl=` parameter (the constant); user text appears only percent-encoded in the path; no raw `&`, `#`, `?`, newline, space from user text; `new URL(url).searchParams.get('hl')` equals the profile value; hostname is `www.google.com` | `scraper/maps-urls.test.ts` |
| TC-VM-4.6 | Market suffix is a constant | VM-NFR-2 | unit | P0 | Market `"VN"` vs injected `"VN&hl=en"` (as untyped input) via `normalizeMarket` first | Injected value normalises to `ID`; URL contains no part of the injected string | `scraper/maps-urls.test.ts` |
| TC-VM-4.7 | Query plus area composed as one encoded string | VM-FR-6 | static | P1 | Source assertion on builders | Uses `encodeURIComponent(query + ' ' + area)` once; no template concatenation of raw strings into the URL | review gate |
| TC-VM-4.8 | Processor reads market from DB at start | VM-FR-6, VM-FR-24 | unit | P0 | Job payload `market:'ID'`, DB row `market:'VN'` (fake prisma) | Effective market `VN` (DB wins) | `scraper/scraper.processor.test.ts` |
| TC-VM-4.9 | PATCH between enqueue and start | UC-VM-3-EC2, VM-FR-6 | unit | P0 | Enqueue with `ID`; DB changed to `VN` before worker runs | Run uses `VN` profile for URLs, context, areas, phone default; opposite direction (`VN`->`ID`) also follows DB | `scraper/scraper.processor.test.ts` |
| TC-VM-4.10 | DB row missing/unknown | UC-VM-5-E1 | unit | P0 | DB `market` null/`'XX'`; payload `'VN'` | Payload is only the fallback when DB has no valid value: assert documented rule (expected: unknown DB value reads `ID` via `normalizeMarket`, never throws) | `scraper/scraper.processor.test.ts` |
| TC-VM-4.11 | Controller puts campaign market into job | UC-VM-4 primary 1 | unit | P1 | Fake queue capture on start for `VN` and `ID` campaigns | `ScraperJobData.market` = campaign market | `scraper/scraper.processor.test.ts` or controller test |
| TC-VM-4.12 | Market enters `page.evaluate` only as closed enum | VM-FR-6, VM-NFR-2 | static | P0 | Source inspection of `page.evaluate` argument | Argument is a value of `Market` (or a closed-set calling code), never a user string | review gate (security pre-review S4) |
| TC-VM-4.13 | Browser returns raw digits; Node normalises | UC-VM-7-EC2, VM-FR-12 | unit | P0 | Mapped card `{phone:"(028) 3822 1234"}` from a fake page result, market `VN` and `ID` | In-page code has no `replace(/^62/,"0")` (static grep); Node result VN `842838221234`, ID `62283822 1234` stripped: `622838221234` | `scraper/scraper.processor.test.ts` + static |
| TC-VM-4.14 | Vietnamese UI-text selectors (Simulated) | UC-VM-4-EC1, VM-FR-8f | unit | P1 | Strings `Bạn đã xem hết danh sách`, `Kết quả`, `Tìm kiếm trên Google Maps` against the end-of-list matcher and selector builders (exported pure helpers) | Matched for VN; Indonesian `Anda telah mencapai akhir` and English still matched; documented **Simulated** | `scraper/maps-parse-vn.test.ts` |
| TC-VM-4.15 | Scrape failure never fabricates | UC-VM-4-EC2, UC-VM-8-E1, VM-NFR-6 | unit | P0 | Fake scraper: CAPTCHA throw; empty result; zero cards, real mode (no `SCRAPER_MODE`) | Campaign `failed` or completed-with-zero per existing rules; no lead rows; no `[Test data]` | `scraper/scraper.processor.test.ts` |
| TC-VM-8.1 | Fixture mode VN | UC-VM-8 primary, VM-FR-22 | unit | P0 | `SCRAPER_MODE=fixture`, market `VN`, query `logistics`, area `Hà Nội` | <= 10 leads named `[Test data] logistics <n>`, `source:'fixture'`, no phone, no website, address contains area | `scraper/scraper.processor.test.ts` |
| TC-VM-8.2 | Fixture VN nationwide uses a VN city | UC-VM-8 primary 2 | unit | P1 | Location `toàn quốc` | Area is a member of `MARKET.VN.cities`, not of `INDONESIA_CITIES` | `scraper/scraper.processor.test.ts` |
| TC-VM-8.3 | Fixture region and coordinates per market | UC-VM-8-A2, VM-FR-22, G-1 | unit | P0 | Fixture leads VN and ID | VN: province `Hồ Chí Minh`, lat 10.7769, lng 106.7009; ID: exactly today's output (unchanged, snapshot-equal) | `scraper/scraper.processor.test.ts` |
| TC-VM-8.4 | Fixture ID unchanged | UC-VM-8-A1, VM-NFR-1 | unit | P0 | `SCRAPER_MODE=fixture`, market `ID`/absent | Byte-identical to pre-feature output | `scraper/scraper.processor.test.ts` |
| TC-VM-8.5 | Fixture leads never contactable | UC-VM-8-E2, VM-FR-22 | unit | P0 | Every fixture lead both markets | `phone` empty, `website` empty, so no `phoneE164`; `reachable` false | `scraper/scraper.processor.test.ts` |
| TC-VM-8.6 | No fabrication outside fixture | UC-VM-8-E1, CLAUDE.md, VM-NFR-6 | static | P0 | grep `[Test data]`/fixture generator references | Reachable only under `SCRAPER_MODE === "fixture"` | review gate |
| TC-VM-8.7 | Google Maps never contacted in tests | UC-VM-8-EC1, VM-FR-22 | static | P0 | grep tests for `google.com/maps` navigation, `chromium.launch` in `apps/api` tests; run suite with network blocked for that host | No real navigation; tests pass offline | CI/review |
| TC-VM-8.8 | E2E: VN fixture campaign end to end | UC-VM-8-A2, VM-AC-9 | e2e | P0 | UI or API: create VN campaign, start with `SCRAPER_MODE=fixture`, poll to `completed`, list leads, `GET /leads?province=Hồ%20Chí%20Minh` with `GEOCODER_DISABLED=true` | Leads listed; province filter returns them; ID campaign in same run unaffected | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-8.9 | E2E: ID fixture campaign unchanged beside VN | UC-VM-8-A2, VM-AC-9 | e2e | P0 | Same flow, `ID` | Same as pre-feature counts and fields | `tests/e2e/vietnam-market.spec.ts` |

## 5. Areas (UC-VM-6; VM-FR-7; VM-AC-3)

Cities written with accents; "canonical" = whatever single value the VN registry returns, asserted equal across all variants (do not hard-code the canonical string in the variant tests; assert once in TC-VM-6.2).

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-6.1 | Nationwide expansion | UC-VM-6 primary, VM-FR-7a, VM-AC-3 | unit | P0 | `planAreas("toàn quốc", q, max, "VN")` for several `max` | >= 8 areas, <= `MARKET.VN.cities.length`, all from VN list, `perSearch` formula identical to ID for the same `max` | `scraper/areas-vn.test.ts` |
| TC-VM-6.2 | Nationwide variants | UC-VM-6-A1, VM-FR-7a | unit | P0 | `cả nước`, `Việt Nam`, `Viet Nam`, `Vietnam`, `nationwide`, `all Vietnam`, `TOÀN QUỐC`, `Toan Quoc`, `  toàn quốc  ` | `isNationwide(x,"VN")` true each | `scraper/areas-vn.test.ts` |
| TC-VM-6.3 | Nationwide terms do not leak between markets | VM-FR-4, UC-VM-6-A8 | unit | P0 | `isNationwide("toàn quốc","ID")`, `isNationwide("Seluruh Indonesia","VN")`, `isNationwide("Vietnam","ID")` | false; false; false (or documented); ID inputs from snapshot unchanged | `scraper/areas-vn.test.ts` |
| TC-VM-6.4 | HCM aliases resolve to one place | UC-VM-6-A2, VM-FR-7c, VM-AC-3 | unit | P0 | `Ho Chi Minh`, `Ho Chi Minh City`, `HCM`, `HCMC`, `TP.HCM`, `TPHCM`, `TP. HCM`, `tp.hcm`, `Sài Gòn`, `Sai Gon`, `Saigon`, `SÀI GÒN`, `TP. Hồ Chí Minh`, `Thành phố Hồ Chí Minh`, `Thanh pho Ho Chi Minh`, `Hồ Chí Minh`, `ho chi minh` | All map to the same canonical string, with and without accents, any case | `scraper/areas-vn.test.ts` |
| TC-VM-6.5 | Hà Nội and Đà Nẵng aliases | UC-VM-6-A3, VM-AC-3 | unit | P0 | `Ha Noi`, `Hanoi`, `HN`, `Hà Nội`, `hà nội`; `Da Nang`, `Danang`, `Đà Nẵng`, `đà nẵng`, `DA NANG` | One canonical per city; the two canonicals differ | `scraper/areas-vn.test.ts` |
| TC-VM-6.6 | `đ` folding | VM-FR-7c, VM-NFR-3 | unit | P1 | `Đà Nẵng` vs `Da Nang`, `Đồng Nai` vs `Dong Nai`, NFC and NFD forms of `Hồ` | Equal after fold; uses `common/text.ts` helper (static: no second fold implementation) | `scraper/areas-vn.test.ts` |
| TC-VM-6.7 | Every VN list city resolves to itself | VM-FR-7c | unit | P1 | Each `MARKET.VN.cities[i]` plus its unaccented form | Resolves to itself (no collision between cities) | `scraper/areas-vn.test.ts` |
| TC-VM-6.8 | Unknown place stays as typed | UC-VM-6-A4, VM-FR-7b, VM-AC-3 | unit | P0 | `Phường Bến Nghé`, `Quận 7`, `KCN Sóng Thần` | Returned unchanged (trim only) | `scraper/areas-vn.test.ts` |
| TC-VM-6.9 | Prefix stripping | UC-VM-6-A4, VM-FR-7b | unit | P1 | `thành phố Đà Nẵng`, `tp. Đà Nẵng`, `tỉnh Đồng Nai`, `tại Hà Nội`, `ở Huế`, `Thành Phố Cần Thơ` (case) | Prefix removed; remainder as typed or canonical; max 3 chained prefixes like ID | `scraper/areas-vn.test.ts` |
| TC-VM-6.10 | Separator words and symbols | UC-VM-6-A5, VM-FR-7b | unit | P0 | `Hà Nội và Đà Nẵng`, `HCM hoặc Cần Thơ`, `Hà Nội cùng với Huế`, `a; b`, `a | b`, `a / b`, `a + b`, `a & b`, `a\nb`, `a\r\nb` | Each splits into two places; duplicates removed case-insensitively; parts of length <= 1 dropped | `scraper/areas-vn.test.ts` |
| TC-VM-6.11 | Comma splits places (VN) | UC-VM-6-A6, VM-FR-7c2, VM-AC-3 | unit | P0 | `Quận 7, TP.HCM` | Two searches: `Quận 7` and the HCM canonical; each searched alone | `scraper/areas-vn.test.ts` |
| TC-VM-6.12 | No comma, one place | UC-VM-6-A6 | unit | P0 | `Quận 7 TP.HCM` | One place | `scraper/areas-vn.test.ts` |
| TC-VM-6.13 | Comma splits places (ID unchanged) | VM-FR-7c2, VM-FR-4 | unit | P0 | `Bandung, Jakarta`, `Medan, Batam` | Two searches each, equal to Section 1 snapshot | `scraper/areas.snapshot.test.ts` (existing rows) |
| TC-VM-6.14 | `stripPlaces` VN | UC-VM-6-A7, VM-FR-7c | unit | P0 | `công ty logistics TP.HCM`; `logistics Sài Gòn`; `Hà Nội` alone; `kho vận Da Nang` | `công ty logistics`; `logistics`; `Hà Nội` (never empty, < 3 chars guard); `kho vận` | `scraper/areas-vn.test.ts` |
| TC-VM-6.15 | ID aliases not applied under VN, VN not under ID | UC-VM-6-A8, VM-AC-3 | unit | P0 | `Jogja`, `Seluruh Indonesia` under `VN`; `TP.HCM`, `Sài Gòn` under `ID`; ID defaults (no market arg) | VN: no Indonesian expansion; ID: as snapshot (no Vietnamese alias) | `scraper/areas-vn.test.ts` |
| TC-VM-6.16 | Pre-merger cities valid as terms | UC-VM-6-A9, VM-OQ-8 | unit | P2 | `Vũng Tàu`, `Biên Hòa`, `Thủ Dầu Một` | Kept as search terms (in list or as typed), not rewritten | `scraper/areas-vn.test.ts` |
| TC-VM-6.17 | Hostile area text linear and capped | UC-VM-6-EC1, VM-FR-7d, VM-NFR-3 | unit | P0 | `assertLinear` with makers: `"(".repeat(n)`, `" ".repeat(n)`, `".".repeat(n)`, `"a, ".repeat(n/3)`, mixed scripts `"Hà Nội 東京 Москва ".repeat(n/16)`; plus one 100,000-char input timed with `HOSTILE_MS_LARGE`; for `splitAreas`, `isNationwide`, `planAreas`, `stripPlaces` under `VN` and `ID` | Linear; area text capped at 400 chars before matching (assert output total length bounded); no throw | `scraper/areas-vn.test.ts` |
| TC-VM-6.18 | No regex from unescaped input | VM-FR-7d, VM-NFR-3 | unit | P0 | Aliases/areas with regex metachar: `(`, `[`, `*`, `\`, `^$`, `.*`, `a|b` as typed area | No `SyntaxError`; matched as literal | `scraper/areas-vn.test.ts` |
| TC-VM-6.19 | Empty / whitespace location | UC-VM-6-EC2, VM-NFR-1 | unit | P1 | `""`, `"   "`, `",,,"` under both markets | Same as existing ID behaviour (documented result), no throw | `scraper/areas-vn.test.ts` |
| TC-VM-6.20 | Radius filter for VN place with no centre | UC-VM-6-EC3, VM-FR-7b | unit | P2 | `inArea` with a VN typed place absent from list (no centre) and results with/without coordinates | Existing handling: address-name fallback only; `DEFAULT_RADIUS_KM` 50 unchanged | `scraper/areas-vn.test.ts` |
| TC-VM-6.21 | 34-province list for planner only | VM-FR-14 | unit | P1 | VN planner list and `geo.ts` dataset | Planner list has 34 entries (28 provinces + 6 cities) **only after the official source is verified**; geo does not reject names outside it | `scraper/areas-vn.test.ts` |
| TC-VM-6.22 | Dataset header cites source and date | UC-VM-13-A3, VM-FR-14, VM-AC-8 | unit | P1 | Read dataset source file header text | Contains an official resolution reference, `1 July 2025` (or the verified date) and an access date; test fails if absent | `leads/geo-vn.test.ts` |

## 6. Maps parsing, `hl=vi` (UC-VM-7; VM-FR-8; VM-AC-7) — all Simulated

Invented fixture card: name `Công ty Mẫu Logistics`; aria `4,6 sao`; review text `(1.234)`; category `Đại lý hải quan`; address `12 Đường Mẫu, Phường Bến Nghé, Quận 1`; phone `(028) 3822 1234`; status `Mở cửa lúc 08:00`.

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-7.1 | Full fixture card | UC-VM-7 primary, VM-AC-7 | unit | P0 | Fixture card above, market `VN` | rating 4.6; reviews 1234; category `Đại lý hải quan`; address recognised; phone accepted; status row is neither category nor address | `scraper/maps-parse-vn.test.ts` |
| TC-VM-7.2 | Rating shapes | UC-VM-7-A1, VM-FR-8a | unit | P0 | `4,6`, `4.6`, `4,6 sao`, `4.6 sao` | 4.6 each | `scraper/maps-parse-vn.test.ts` |
| TC-VM-7.3 | Review count shapes | UC-VM-7-A2, VM-FR-8b | unit | P0 | `(1.234)`, `(1,234)`, `1.234 bài đánh giá`, `(12)`, `(1.234.567)` | 1234; 1234; 1234; 12; 1234567 | `scraper/maps-parse-vn.test.ts` |
| TC-VM-7.4 | Bare `(4,6)` is a rating | UC-VM-7-A3, VM-FR-8b | unit | P0 | `(4,6)`, `(4.6)` | Rating 4.6, review count not set | `scraper/maps-parse-vn.test.ts` |
| TC-VM-7.5 | State and hours rows not categories | UC-VM-7-A4, VM-FR-8c | unit | P0 | Rows `Mở cửa`, `Đóng cửa`, `Mở cửa cả ngày`, `Đóng cửa vĩnh viễn`, `Tạm thời đóng cửa`, `Mở cửa lúc 08:00`, `Đóng cửa lúc 17:00`, `Đang mở cửa`, `Quảng cáo`, also unaccented and upper case variants | `pickCategory` never returns any of them; picks the real category row when present; returns empty/undefined when only these rows | `scraper/maps-parse-vn.test.ts` |
| TC-VM-7.6 | Labels known | UC-VM-7-A4, VM-FR-8c | unit | P1 | `Địa chỉ`, `Điện thoại`, `Trang web` rows | Not returned as category; not treated as lead data | `scraper/maps-parse-vn.test.ts` |
| TC-VM-7.7 | Hours row is not an address | UC-VM-7-A4, VM-FR-8c | unit | P1 | `Mở cửa lúc 08:00 · Đóng cửa lúc 17:00` | Address recogniser false | `scraper/maps-parse-vn.test.ts` |
| TC-VM-7.8 | Vietnamese address words | UC-VM-7-A5, VM-FR-8d | unit | P0 | Rows starting/containing `Đường Mẫu`, `Phố Mẫu`, `Số 5`, `Phường 3`, `Xã Mẫu`, `Quận 7`, `Huyện Mẫu`, `KCN Mẫu`, `Ngõ 12`, `Hẻm 20`, `Tổ 4`; plus `Jl. Mawar No. 3` | All recognised as address (VN rules include the Indonesian ones) | `scraper/maps-parse-vn.test.ts` |
| TC-VM-7.9 | Phone shapes accepted browser-side check | UC-VM-7-A6, VM-FR-8e | unit | P0 | `(028) 3822 1234`, `0901 234 567`, `+84 90 123 4567`, `0901234567`, `090.123.4567`, `+62 812 0000 0001`, `081234567890` | Accepted for VN (exported pure predicate); non-phone text `12 Đường Mẫu` and `2024` rejected | `scraper/maps-parse-vn.test.ts` |
| TC-VM-7.10 | End of list stops loop | UC-VM-7-A7, VM-FR-8f | unit | P1 | Text `Bạn đã xem hết danh sách` | End-of-list predicate true; with Indonesian/English text still true | `scraper/maps-parse-vn.test.ts` |
| TC-VM-7.11 | Same fixtures under ID rules | UC-VM-7-A8, VM-AC-7, VM-NFR-1 | unit | P0 | Fixture card parsed with `"ID"` and with no market | Equals the pre-existing output for those strings; `Mở cửa` row NOT filtered (unreachable rule for ID) or is returned as before; no Vietnamese word alters an Indonesian parse | `scraper/maps-parse-vn.test.ts` |
| TC-VM-7.12 | Card with no phone | UC-VM-7-E1, VM-NFR-6 | unit | P0 | Card without phone | Lead kept, `phone` empty, nothing invented | `scraper/maps-parse-vn.test.ts` |
| TC-VM-7.13 | Unexpected wording degrades | UC-VM-7-E2, VM-NFR-6 | unit | P1 | Aria `Xếp hạng 4,6`, `Not rated`, empty, garbage | No throw; field missing (`null`/undefined) | `scraper/maps-parse-vn.test.ts` |
| TC-VM-7.14 | Hostile card text | UC-VM-7-EC1, VM-NFR-3 | unit | P0 | `assertLinear` on rating, review, category, address, phone predicates with `"<".repeat(n)`, `"(".repeat(n)`, `"Đường ".repeat(n/6)`, 100,000-char string via `HOSTILE_MS_LARGE` | Linear, bounded output | `scraper/maps-parse-vn.test.ts` |
| TC-VM-7.15 | Market passed into the page function | UC-VM-7-EC2, VM-FR-12 | static | P1 | Source inspection | No hard-coded `62` phone clean-up in page code; (see TC-VM-4.13) | review gate |
| TC-VM-7.16 | Real-run verification | VM-NFR-6, 2.10 | manual | P2 | Real low-volume `hl=vi` searches (HCMC, Hanoi, Da Nang) per PRD 2.10, saved card HTML with data stripped | Outside automated scope; until done docs say **Simulated** | manual / docs |

## 7. Phones, VN (UC-VM-9, 10, 11; VM-FR-9..12; VM-AC-4..6)

All VN rows call `normalizePhone(raw, "62", "VN")` or `normalizePhoneFor(raw, "VN")` (assert both; the second must equal the first). Numbers are invented placeholders.

### 7.1 Normalisation matrix

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-9.1 | Nine mobile shapes | UC-VM-9 primary, UC-VM-9-M1, M2, VM-FR-9, VM-AC-4 | unit | P0 | (1) `0901234567` (2) `090 123 4567` (3) `090.123.4567` (4) `090-123-4567` (5) `+84 90 123 4567` (6) `0084901234567` / `0084 901234567` (7) `84901234567` (8) `+84 (0) 90 123 4567` (9) `+84 090 123 4567` | All equal `84901234567` | `messaging/phone-vn.test.ts` |
| TC-VM-9.2 | Extra mobile punctuation | VM-FR-9 | unit | P1 | `(0)901234567`, `(090) 123 4567`, `090 1234 567`, `+84-90-123-4567`, `  0901234567  `, `0901 234 567` | `84901234567` each | `messaging/phone-vn.test.ts` |
| TC-VM-9.3 | Mobile prefixes 03/05/07/08/09 | UC-VM-9-M3, VM-FR-10 | unit | P0 | `0351234567`, `0561234567`, `0701234567`, `0811234567`, `0901234567`, plus the 5 in `+84` form | `84` + 9 digits (`84351234567`, `84561234567`, `84701234567`, `84811234567`, `84901234567`) | `messaging/phone-vn.test.ts` |
| TC-VM-9.4 | Landline shapes | UC-VM-9-M4, VM-FR-9, VM-AC-4 | unit | P0 | `(028) 3822 1234`, `028 3822 1234`, `+84 28 3822 1234`, `02838221234`, `028.3822.1234`, `(024) 3822 1234` | `842838221234`; Hanoi `842438221234` | `messaging/phone-vn.test.ts` |
| TC-VM-9.5 | Service numbers | UC-VM-9-M5, VM-FR-10, VM-AC-4 | unit | P0 | `1800 1234`, `1900 1234`, `1800 123 456`, `1900-1234` | `null` for every one (today these would be returned as digits; must differ for VN only) | `messaging/phone-vn.test.ts` |
| TC-VM-9.6 | Too short / empty | UC-VM-9-M6, VM-AC-4 | unit | P0 | `12345`, ``, `   `, `null`, `undefined`, `0`, `090`, `+84`, `+` | `null` each | `messaging/phone-vn.test.ts` |
| TC-VM-9.7 | Wrong national length | UC-VM-9-M7, VM-FR-9 | unit | P0 | Mobile with 8 national digits `090123456`; 10 national digits `09012345678`; landline `02838221` (short), `0283822123456` (long) | `null` each (exact landline 9-10 digit bounds: **derive** against the national numbering plan before S3 per PRD 2.10; row set is final once checked) | `messaging/phone-vn.test.ts` |
| TC-VM-9.8 | Length boundaries | VM-FR-9 | unit | P1 | Mobile 9 national digits valid; landline 9 and 10 national digits (valid), 8 and 11 (invalid); 15-digit international kept | Per PRD: 9 mobile, 9 to 10 landline | `messaging/phone-vn.test.ts` |
| TC-VM-9.9 | Letters | UC-VM-9-M8, VM-FR-9 | unit | P1 | `0901 ABC 567`, `090123456a`, `0901234567x12` | `null` per UC-VM-9-M8. **Inconsistency**: PRD VM-FR-9 is silent; current ID behaviour strips letters (P33). Decide in S3: VN rejects letters, ID unchanged; document | `messaging/phone-vn.test.ts` |
| TC-VM-9.10 | Bare national without trunk zero | VM-FR-9, profile `bareMobileLead null` | unit | P1 | `901234567` (9 digits, VN) | **Decide in S3** (PRD silent, gap GAP-3): expected `null` (not an international number, bare-8 rule disabled for VN). Test locks the chosen result | `messaging/phone-vn.test.ts` |
| TC-VM-9.11 | `84` bare plus trunk zero | VM-FR-9 | unit | P2 | `84 0901234567`, `840901234567` | **Decide in S3**; expected `84901234567` (trunk zero dropped after code) or `null`; lock chosen result | `messaging/phone-vn.test.ts` |
| TC-VM-9.12 | International kept | UC-VM-9-M9, M10, VM-FR-11, VM-AC-4 | unit | P0 | `+62 812 0000 0001` (VN); `+65 6123 4567`; `+1 415 555 0100`; `+44 20 7946 0958` | `62812000000001`; `6561234567`; `14155550100`; `442079460958` | `messaging/phone-vn.test.ts` |
| TC-VM-9.13 | 8 to 15 digit rule for international | VM-FR-11 | unit | P1 | `+1234567` (7), `+12345678` (8), `+123456789012345` (15), `+1234567890123456` (16) | `null`, `12345678`, kept, `null` | `messaging/phone-vn.test.ts` |
| TC-VM-9.14 | 64-character cap | VM-FR-12, VM-NFR-3, VM-AC-4 | unit | P0 | 64-char valid-looking string (`0901234567` + padding spaces to exactly 64) and 65-char one | 64: normalises; 65: `null` (rejected, checked before any regex) | `messaging/phone-vn.test.ts` |
| TC-VM-9.15 | Unicode digits | VM-FR-9 | unit | P1 | Arabic-Indic `٠٩٠١٢٣٤٥٦٧`, fullwidth `０９０１２３４５６７`, Devanagari digits | `null` (never converted to ASCII) | `messaging/phone-vn.test.ts` |
| TC-VM-9.16 | Hostile phone strings | UC-VM-9-M11, VM-FR-12, VM-NFR-3 | unit | P0 | 100,000 chars; 10 MB string (`"0".repeat(10 * 1024 * 1024)`); `"(".repeat(n)`; repeated `.` and spaces; `"+84 " + "0".repeat(n)`; mixed unicode | Returns `null` (input > 64 rejected before regex); each call under `HOSTILE_MS_SMALL` (10 MB under `HOSTILE_MS_LARGE`); `assertLinear` passes on 2k vs 20k makers; process memory growth small (no copy of the 10 MB string made before the length check: assert RSS delta < 50 MB) | `messaging/phone-vn.test.ts` |
| TC-VM-9.17 | ID results unchanged for the same inputs | UC-VM-9-M12, M13, VM-FR-4, VM-AC-4 | unit | P0 | Table 1.2 inputs with market `"ID"`, `undefined`, and through `normalizePhoneFor(raw,"ID")` | Equal to table 1.2 / `normalizePhone(raw,'62')`; row P60 per gating rule | `messaging/phone-vn.test.ts` |
| TC-VM-9.18 | `84` bare without plus under ID | UC-VM-9-M13 | unit | P1 | `84901234567`, market `ID` | `6284901234567` (as P40) | `messaging/phone-vn.test.ts` |
| TC-VM-9.19 | VN number under ID campaign and ID number under VN campaign keep international form | VM-FR-11 | unit | P1 | `+84 90 123 4567` under ID; `+62 812 0000 0001` under VN | `84901234567`; `62812000000001` | `messaging/phone-vn.test.ts` |
| TC-VM-9.20 | Manual-number DTO cap | VM-FR-12, 2.7 | e2e | P0 | Manual phone fields (all DTOs accepting a phone) with 64 and 65 chars | 64 accepted by DTO; 65 gives 400 | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-9.21 | Manual-number form message for service number | VM-FR-10, 2.9 | e2e | P2 | Type `1800 1234` in the manual-number form | Text "service number, not WhatsApp-capable" (en and vi) shown | `tests/e2e/vietnam-market.spec.ts` |

### 7.2 `phoneKind`

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-11.1 | VN mobile | UC-VM-11-A1, VM-FR-10, VM-AC-5 | unit | P0 | `84351234567`, `84561234567`, `84701234567`, `84811234567`, `84901234567`, market `VN` | `mobile` | `common/market.test.ts` |
| TC-VM-11.2 | VN landline | UC-VM-11-A1, VM-AC-5 | unit | P0 | `842838221234`, `842438221234`, `842251234567` | `landline` | `common/market.test.ts` |
| TC-VM-11.3 | VN service (raw classification) | UC-VM-11-A1, VM-FR-10, C-3 | unit | P0 | Raw `1800 1234`, `1900 1234` (the raw-input entry point; **the PRD does not name it: gap GAP-2**) | `service`; and `normalizePhone` of the same is `null` (stored lead never carries `service`) | `common/market.test.ts` |
| TC-VM-11.4 | VN unknown prefixes | VM-FR-10 | unit | P1 | `84401234567` (04x), `84601234567`, `84121234567`; and wrong-length mobile `8490123456` | `unknown` (PRD silent: **derive/decide in S3**; lock chosen result) | `common/market.test.ts` |
| TC-VM-11.5 | International under VN | UC-VM-11-A3, VM-FR-11 | unit | P0 | `6561234567`, `14155550100`, `62812000000001`, market `VN` | `unknown` | `common/market.test.ts` |
| TC-VM-11.6 | ID always unknown | UC-VM-11-A2, VM-FR-10, VM-AC-5 | unit | P0 | `628123456789`, `62215551234` (landline-looking), `84901234567` and `842838221234` under `ID` | `unknown` each | `common/market.test.ts` |
| TC-VM-11.7 | Missing/garbage input | UC-VM-11-EC1 | unit | P1 | `null`, `undefined`, `""`, `"abc"`, market `undefined`/`"XX"` | `unknown`, no throw; market `XX` behaves as `ID` | `common/market.test.ts` |
| TC-VM-11.8 | `phoneKind` is pure and linear | VM-NFR-3, VM-FR-25 | unit | P1 | 100,000-digit string; `assertLinear` | `unknown`/no throw within limits; no I/O imports (static) | `common/market.test.ts` |
| TC-VM-11.9 | No `phoneKind` column | VM-OQ-6, UC-VM-18-EC1 | static | P1 | `schema.prisma` diff | No `phoneKind`/`waCapable` field added | review gate |

### 7.3 Phone call sites use the campaign market (UC-VM-10)

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-10.1 | Scraped VN lead saved | UC-VM-10 primary 1, VM-AC-6 | integration | P0 | `createMany([{phone:"(028) 3822 1234",...}], "VN")` (real DB) | `phoneE164 = 842838221234` | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-10.2 | Same text in ID campaign | UC-VM-10 primary 2, VM-AC-6, VM-NFR-1 | integration | P0 | Same text, `"ID"` and default market | `phoneE164 = 622838221234`, identical to today | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-10.3 | `createMany` default market | VM-FR-4, VM-FR-12 | unit | P0 | Call without market | ID behaviour | `leads/leads-referral.test.ts` (extend) or new test |
| TC-VM-10.4 | Dedupe key VN | UC-VM-10 primary 3, VM-FR-12 | unit | P0 | `leadKey({phone:"0901234567"}, "VN")` vs `leadKey({phone:"84901234567"}, "VN")` and `+84 90 123 4567` | All equal `tel:84901234567` | `scraper/scraper.processor.test.ts` |
| TC-VM-10.5 | Dedupe key ID unchanged | VM-NFR-1 | unit | P0 | Table 1.5 via `leadKey(b)` and `leadKey(b,"ID")` | As table 1.5 | `scraper/scraper.processor.test.ts` |
| TC-VM-10.6 | Dedupe: first lead wins across markets | UC-VM-10-A5, G-8, 2.10 | integration | P1 | Same number in an ID and a VN campaign of one workspace | Dedupe stays per workspace on `phoneE164`; first lead wins; no cross-market rewrite; documented in `docs/features.md` | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-10.7 | Referral lead uses campaign market | UC-VM-10-A1, VM-FR-12 | unit | P0 | Referral from a VN-campaign lead, number `0901234567`, account code `62` | `84901234567` (campaign market wins over account code); ID campaign with account code `62` unchanged | `leads/leads-referral.test.ts` |
| TC-VM-10.8 | Free-typed number with no lead uses account code | UC-VM-10-A1, VM-FR-12 | unit | P0 | `messaging.service` free-typed number `0901234567`, account `defaultCountryCode '84'`; account `'62'` | `84901234567`; `62901234567`; fallback `62` when no account | `messaging/messaging.test.ts` |
| TC-VM-10.9 | Approve/send/template use lead's campaign market | UC-VM-10-A2, VM-FR-12 | unit | P0 | Lead of VN campaign with legacy number, account code `62` | `normalizePhone` called with `84`/VN (not `62`) at approve, send, `template.service` reachable and render | `messaging/messaging.test.ts`, `messaging/template.test.ts` |
| TC-VM-10.10 | Legacy backfill of `phoneE164` | UC-VM-10-A2, VM-FR-12 | integration | P0 | Row with `phone` set and `phoneE164` null in a VN campaign and in an ID campaign | Backfill selects `campaign.market`; VN gives `84...`, ID gives `62...` | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-10.11 | `wa-text` Vietnamese shared contact | UC-VM-10-A3, VM-FR-12 | unit | P0 | `Liên hệ 0901234567`, `+84 90 123 4567`, `84901234567`, `0351234567`; non-matches `0201234567` (02 prefix), `123456789`; Indonesian rows from table 1.9 | VN forms recognised through the bounded alternative `(\+?84|0)(3|5|7|8|9)\d{8}`; Indonesian results equal table 1.9 | `messaging/wa-text-vn.test.ts` |
| TC-VM-10.12 | `wa-text` hostile and slice bound | VM-FR-12, VM-NFR-3 | unit | P0 | 100,000-char text of repeated `0` and `+84`; number only after char 4,000 | Input sliced to 4,000 chars; linear (`assertLinear`); number after 4,000 not matched | `messaging/wa-text-vn.test.ts` |
| TC-VM-10.13 | Website enrichment `+84` number | UC-VM-10-A4, G-7 | unit | P2 | Page text with `+84 90 123 4567` | Stored per existing `"+" + digits` rule, undamaged (no `62` rewrite); Vietnamese contact keywords are out of scope (no test) | `leads/contact-extract.test.ts` |
| TC-VM-10.14 | Inbound reply matches lead | UC-VM-10 primary 4, VM-AC-6 | integration | P0 | Lead `phoneE164=84901234567`; inbound key `84901234567@s.whatsapp.net`; and `@lid` with `senderPn` | Lead matched; conversation attached to it | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-10.15 | `phoneFromJid` accepts `84...` | UC-VM-10-E2, VM-AC-6 | unit | P1 | `84901234567@s.whatsapp.net` | `84901234567` (also table 1.4 J03) | `messaging/phone.snapshot.test.ts` (existing row) |
| TC-VM-10.16 | Old ID-campaign lead unchanged | UC-VM-10-E1, VM-NFR-1 | integration | P0 | Existing lead rows of `ID` campaigns through backfill/reachable | Same `phoneE164` and `reachable` as before | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-10.17 | Market change on draft has no stored dependants | UC-VM-10-EC1, VM-OQ-5 | integration | P2 | Draft campaign with zero leads; patch market | Zero lead rows; nothing to re-normalise | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-10.18 | No phone in logs | VM-FR-25, security | static | P0 | grep new `logger.*` / `console.*` lines in diff near phone variables; run pipeline with log capture, search for `84901234567`/`0901234567` | No phone number written | review gate + `pipeline-check.ts` |

### 7.4 Guards: landline and service numbers (PRD-only, VM-FR-25; partly UC-VM-11-E2)

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-11.10 | Approve rejects landline | UC-VM-11-E2, VM-FR-25a (PRD-only for the 400 text) | unit | P0 | WhatsApp-channel draft to a lead with `phoneE164 842838221234`, campaign `VN` | `BadRequestException` message `Not a mobile number`; draft status still `draft`; no `approved` write; no opt-out write | `messaging/landline-guard.test.ts` |
| TC-VM-11.11 | Approve rejects `service` kind | VM-FR-25a (PRD-only) | unit | P1 | Lead with a stored service-kind number (injected directly) | Same 400 | `messaging/landline-guard.test.ts` |
| TC-VM-11.12 | Approve allows mobile and unknown | VM-FR-25 (PRD-only) | unit | P0 | VN mobile `84901234567`; VN international `6561234567`; ID `622155512344` | Proceeds as today (approved) | `messaging/landline-guard.test.ts` |
| TC-VM-11.13 | Email channel not blocked | UC-VM-11-A4, VM-FR-25 | unit | P0 | Email-channel draft to a landline VN lead with an email | Approved normally (guard applies to WhatsApp channel only) | `messaging/landline-guard.test.ts` |
| TC-VM-11.14 | Sender fails landline before provider call | VM-FR-25b (PRD-only) | integration | P0 | `approved` WhatsApp message to a VN landline lead (inserted directly past approve), fake provider recording calls, `sender.tick(workspaceId)` | Message `failed`, error exactly `Not a mobile number`; provider `resolve`/`send` call count 0 | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-11.15 | Sender sends mobile | VM-FR-25 | integration | P0 | Same with mobile number | Provider called once; status `sent` | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-11.16 | Guard ordering with opt-out | VM-FR-25, CLAUDE.md opt-out | unit | P0 | Opted-out landline number at approve; opted-out mobile | Opt-out check order exactly as before (assert same error as pre-feature for opted-out; for opted-out landline, whichever fires first is documented and identical to opt-out-first ordering decision) | `messaging/landline-guard.test.ts` |
| TC-VM-11.17 | Claim-then-send preserved | CLAUDE.md invariants | integration | P0 | Failing guard message; a message found in `sending` after simulated restart | Landline: `approved -> sending -> failed` never resent; crashed `sending` still marked failed | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-11.18 | Mobile not on WhatsApp | UC-VM-11-E1, VM-NFR-4 | integration | P1 | Fake provider `onWhatsApp` false for mobile | Existing failure reason; no extra pre-send call (call count equals baseline) | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-11.19 | ID leads unaffected by guard | UC-VM-11-A2 | integration | P0 | ID lead with landline-looking number `62215551234` approved and sent | Approved and sent as today | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-11.20 | Guard logic location | VM-FR-25 | static | P1 | grep | Logic imported from `common/market.ts`; `send-policy.ts` diff empty | review gate |
| TC-VM-11.21 | `reachable` and reason for landline | UC-VM-11 primary 3, VM-FR-10, VM-AC-5 | unit | P0 | `template.service` reachable for VN landline, VN mobile, ID any, no phone | false + reason `landline: cannot be reached on WhatsApp`; true; true; no-phone status (existing) | `messaging/template.test.ts` |
| TC-VM-11.22 | Bulk selection excludes landline in UI | UC-VM-11 primary 3, VM-AC-5 | e2e | P1 | Outbox lead list with a VN landline lead and a VN mobile lead (fixture rows inserted via API/DB) | Landline row checkbox disabled and shows the reason (en and vi); mobile selectable; ID lead unaffected | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-11.23 | Landline lead still stored with other data | UC-VM-11-A4, VM-FR-10 | integration | P1 | Scrape VN lead with landline + email | Lead stored with `phoneE164`; email channel draft allowed; WhatsApp skipped with status not error | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-11.24 | Channel filter retained | UC-VM-11-EC2 | static | P1 | grep WhatsApp queries on `outbound_messages` in diff | Each keeps `channel: "whatsapp"` | review gate |

## 8. Scoring (UC-VM-12; VM-FR-17)

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-12.1 | VN mobile gets +15 | UC-VM-12 primary 1, VM-FR-17 | unit | P0 | Lead phone `84901234567`, market `VN` | Phone factor +15 | `ai/scoring-market.test.ts` |
| TC-VM-12.2 | VN landline gets no phone points | UC-VM-12 primary 2, VM-FR-17 | unit | P0 | `842838221234`, `VN` | 0 phone points; factor text `Landline: cannot be reached on WhatsApp` | `ai/scoring-market.test.ts` |
| TC-VM-12.3 | ID leads unchanged | UC-VM-12-A1, VM-NFR-1 | unit | P0 | Table 1.10 including ID landline-looking `62215551234` | Byte-identical totals and factors | `ai/scoring.snapshot.test.ts` |
| TC-VM-12.4 | VN lead without phone | UC-VM-12-A2 | unit | P1 | No phone | Factor text `No phone number` as today | `ai/scoring-market.test.ts` |
| TC-VM-12.5 | Other factors unchanged | UC-VM-12-A3 | unit | P1 | Address +3, other factors for VN lead | Same weights as ID | `ai/scoring-market.test.ts` |
| TC-VM-12.6 | International number in VN campaign | UC-VM-12-EC1, VM-FR-17 | unit | P1 | `6561234567`, VN | `unknown` is reachable: +15 | `ai/scoring-market.test.ts` |
| TC-VM-12.7 | `FitService` unchanged | UC-VM-12-A4 | static | P2 | `git diff` on `ai/fit.service.ts` | Empty; existing `fit.service.test.ts` passes | review gate |
| TC-VM-12.8 | No hard-coded city/industry weights | UC-VM-12-E1, CLAUDE.md | static | P1 | grep `Jakarta`, `Hồ Chí Minh`, `Rp`, `+84`, `+62` in `lead-intelligence.service.ts`, `fit.service.ts` | No matches | review gate |
| TC-VM-12.9 | Weight value unchanged | VM-FR-17 | unit | P1 | Compare phone weight constant | Still 15 | `ai/scoring-market.test.ts` |
| TC-VM-12.10 | Market comes from the lead's campaign | VM-FR-5 | unit | P1 | Lead with `campaign.market` VN/ID/`XX` | `XX` scores like `ID` | `ai/scoring-market.test.ts` |

## 9. Geo and region (UC-VM-13, 14; VM-FR-13..15; VM-AC-8)

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-13.1 | VN answer, city province | UC-VM-13 primary, VM-FR-13, VM-AC-8 | unit | P0 | `country_code:"vn"`, state `Thành phố Hồ Chí Minh`, suburb `Phường Bến Nghé`, city_district `Quận 1` | `province:"Hồ Chí Minh"`, `regency:"Quận 1"` (city_district), `district:"Phường Bến Nghé"` | `leads/geo-vn.test.ts` |
| TC-VM-13.2 | Prefix `Tỉnh` stripped | UC-VM-13-A1, VM-FR-13 | unit | P0 | state `Tỉnh Đồng Nai` | province `Đồng Nai` | `leads/geo-vn.test.ts` |
| TC-VM-13.3 | State without prefix and unknown names | UC-VM-13-E2 | unit | P1 | state `Hà Nội`; state `Xyz` (not in dataset); no state | `Hà Nội`; `Xyz` kept as returned; `null`-province lead result without error | `leads/geo-vn.test.ts` |
| TC-VM-13.4 | Empty regency | UC-VM-13 primary 3, VM-FR-15 | unit | P0 | No `city_district`/`county` | `regency` empty (null/undefined as ID returns for missing) | `leads/geo-vn.test.ts` |
| TC-VM-13.5 | Regency from `county` | VM-FR-15 | unit | P1 | `county:"Huyện Mẫu"`, no city_district | `regency:"Huyện Mẫu"` | `leads/geo-vn.test.ts` |
| TC-VM-13.6 | Ward mapping | VM-FR-15 | unit | P0 | `suburb`, `quarter`, `village` each alone; all three present | district from `suburb|quarter|village` in that documented order; ward text kept as returned | `leads/geo-vn.test.ts` |
| TC-VM-13.7 | Dispatch by `country_code` | VM-FR-13 | unit | P0 | Answers `vn` and `id` without any campaign argument | `vn` -> VN mapper; `id` -> ID path | `leads/geo-vn.test.ts` |
| TC-VM-13.8 | ID unchanged incl. special cases | UC-VM-13-A4, VM-AC-8 | unit | P0 | Table 1.8 | Equal to snapshot; Jakarta/Yogyakarta cases intact | `leads/geo.snapshot.test.ts` |
| TC-VM-13.9 | Other country null | UC-VM-13-E1, VM-AC-8 | unit | P0 | `ke`, `sg`, `th`, `VN` (uppercase), `"vn "` | `null` (uppercase/space behaviour as ID today; **derive**) | `leads/geo-vn.test.ts` |
| TC-VM-13.10 | Missing `country_code` | UC-VM-13-EC1 | unit | P1 | No code, VN-looking state | Follows ID rule today (passes through ID path); documented | `leads/geo-vn.test.ts` |
| TC-VM-13.11 | Pre-merger names | UC-VM-13-A2, VM-FR-14 | unit | P2 | `Tỉnh Bình Dương`, `Tỉnh Bà Rịa - Vũng Tàu` | Mapped to current unit **only** if covered by the verified mapping; otherwise kept as returned | `leads/geo-vn.test.ts` |
| TC-VM-13.12 | Geocoder language per market | UC-VM-13 primary 1, VM-FR-13 | unit | P1 | Fake HTTP: lead in VN campaign vs ID campaign | `accept-language=vi` for VN, `id` for ID; rate limit (1.1 s) and 0.005-degree cache untouched (existing tests pass) | `leads/geo-vn.test.ts` |
| TC-VM-13.13 | Geocoder disabled / failure | UC-VM-13-E3, VM-NFR-4 | integration | P1 | `GEOCODER_DISABLED=true`; Nominatim 500/timeout | Lead saved, no region, no error | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-13.14 | No added network call per lead | UC-VM-13-EC2, VM-NFR-4 | integration | P1 | 50 leads, same cell and different cells, counting fake | Calls equal baseline | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-13.15 | Hostile address object | VM-NFR-3 | unit | P1 | Fields of 100,000 chars, non-string values, prototype keys | No throw; bounded output | `leads/geo-vn.test.ts` |
| TC-VM-14.1 | Region filter returns VN leads | UC-VM-14 primary, VM-FR-15 | e2e | P0 | `GET /leads?province=Hồ%20Chí%20Minh` after TC-VM-8.8 | Matching leads of caller's workspace only | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-14.2 | Provinces listed before any lead | UC-VM-14-A1, VM-FR-13 | unit | P2 | Filter source with empty lead set and VN dataset | Lists provinces from bundled dataset (or documents that only existing regions list; align to FR-13) | `leads/geo-vn.test.ts` |
| TC-VM-14.3 | Labels unchanged | UC-VM-14-A2, VM-FR-15 | static | P2 | `git diff` region-filter labels / i18n keys | Province/Regency/District keys unchanged | review gate |
| TC-VM-14.4 | Map centre with coordinates | UC-VM-14-A3, VM-FR-15 | e2e | P1 | Workspace with leads with coordinates | Centres on first lead with coordinates (existing) | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-14.5 | Map centre rule | UC-VM-14-A4, VM-FR-15, C-4 | unit | P0 | Pure helper in `market-ui.ts`: (no lead coords, most recent campaign VN) ; (no coords, most recent ID) ; (no coords, no campaigns); (coords present, VN) ; (no coords, mixed with most recent VN) | `[10.7769, 106.7009]`; Jakarta `[-6.2088, 106.8456]`; Jakarta; first-lead coords; HCMC | `tests/e2e/market-helpers.spec.ts` |
| TC-VM-14.6 | Region filter tenant isolation | UC-VM-14-E1, VM-NFR-2 | e2e | P0 | Workspace B filters `province` = A's province | Zero rows from A | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-14.7 | Diacritics exact match | UC-VM-14-EC1 | e2e | P2 | `province=Ho%20Chi%20Minh` vs stored `Hồ Chí Minh` | No match (exact as stored; documented, no fuzzy added) | `tests/e2e/zz-market-api.spec.ts` |

## 10. Quiet hours and timezone (UC-VM-15, 17; VM-FR-16, 21; VM-AC-13)

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-15.1 | Initial timezone from most recent campaign | UC-VM-15 primary, VM-FR-16, VM-AC-13 | integration | P0 | Workspace with no WhatsApp/email account, most recent campaign `VN`, then `GET` of the account/settings route | Initial value `Asia/Ho_Chi_Minh` | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-15.2 | Most recent, not first | UC-VM-15-A4, VM-FR-16 (UC says "first": **inconsistency**, PRD wins) | integration | P0 | Campaigns in order ID (older), VN (newer); then VN older, ID newer | `Asia/Ho_Chi_Minh`; `Asia/Jakarta` | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-15.3 | No campaigns / ID | UC-VM-15-A2, VM-FR-16 | integration | P0 | No campaigns; only ID campaigns | `Asia/Jakarta` | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-15.4 | Existing accounts untouched | UC-VM-15-A1, VM-AC-13 | integration | P0 | Existing `WhatsappAccount` and `EmailAccount` with `Asia/Jakarta` in a VN workspace | Stored value unchanged after GET and after panel open; no DB write | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-15.5 | No stored default change | VM-FR-16, UC-VM-18-EC1 | static | P0 | `schema.prisma` diff | `timezone @default("Asia/Jakarta")` unchanged on both account models; no migration on those tables | review gate |
| TC-VM-15.6 | Email fallback unchanged | VM-FR-16 (UC-VM-15-A3 says VN fallback: **inconsistency**, PRD wins) | unit | P0 | Email send path with no account, VN market known | Fallback `Asia/Jakarta` | `email/email-utils.test.ts` or new test |
| TC-VM-15.7 | Timezone validation unchanged | UC-VM-15-E1, VM-FR-16 | e2e | P1 | `PATCH` account routes with `Mars/Base`, `Asia/Ho_Chi_Minh`, `Asia/Jakarta`, `""`, `null` | 400 for invalid; 200 for valid (as today) | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-15.8 | send-policy unchanged | UC-VM-15-A5, UC-VM-15-EC1, VM-AC-13 | unit | P0 | Existing `decide()` tests; 22:00 UTC+7 held under both zone names | Pass unchanged; same hold decision for `Asia/Jakarta` and `Asia/Ho_Chi_Minh` | existing tests |
| TC-VM-15.9 | Initial-value helper | VM-FR-16, VM-AC-13 | unit | P1 | Pure helper `timezoneFor(market)`; panel helper with `null` | `VN` -> `Asia/Ho_Chi_Minh`; `ID`/`XX`/`null` -> `Asia/Jakarta` | `common/market.test.ts` |
| TC-VM-15.10 | Panel shows initial value | VM-AC-13 | e2e | P1 | Outbox WhatsApp and email panels for a VN workspace without account | Timezone input value `Asia/Ho_Chi_Minh`; editable; saves what is typed | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-15.11 | Panel `defaultCountryCode` notice | UC-VM-17 primary, VM-FR-21 | e2e | P1 | VN campaign exists; account code `62` | One-line notice (en and vi) present; saved value not rewritten | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-17.1 | No notice when code is 84 or no VN campaign | UC-VM-17-A1 | e2e | P1 | Code `84`; ID-only workspace | No notice | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-17.2 | Fields stay editable | UC-VM-17-A2 | e2e | P2 | Edit code and timezone, save | Persisted as typed | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-17.3 | No account yet | UC-VM-17-E1 | e2e | P2 | VN workspace without WhatsApp account | No notice; panel as before | `tests/e2e/vietnam-market.spec.ts` |

## 11. Web UI (UC-VM-2, 16, 20; VM-FR-18..20, 26; VM-AC-10)

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-2.1 | Selector present | UC-VM-2 primary 1, VM-FR-18, VM-AC-10 | e2e | P0 | Open New campaign (vi and en) | Market select next to Location; options `Indonesia`/`Việt Nam`; label `Market`/`Thị trường` | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-2.2 | Default by UI language | UC-VM-2 primary 2, VM-OQ-9, VM-AC-10 | e2e | P0 | Vietnamese UI; English UI; each for an owner who earlier created campaigns of the other market | vi -> `VN`; en -> `ID`, regardless of history | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-2.3 | Default helper | VM-FR-18 | unit | P0 | Pure `defaultMarketFor(lang)` with `vi`, `en`, `id`, `""`, `undefined`, `"xx"` | `VN`, `ID`, `ID`, `ID`, `ID`, `ID` | `tests/e2e/market-helpers.spec.ts` |
| TC-VM-2.4 | Placeholders per market | UC-VM-2 primary 3, VM-FR-19 | unit | P0 | Pure `locationPlaceholder(market, lang)`, `fallbackCity(market)` | ID: `e.g. Bandung, Jakarta` (en UI; vi UI uses vi text with the same Indonesian example places), fallback `Jakarta`; VN: `ví dụ: TP.HCM, Hà Nội` (vi UI), `e.g. Ho Chi Minh City, Hanoi` (en UI), fallback `TP.HCM` | `tests/e2e/market-helpers.spec.ts` |
| TC-VM-2.5 | Switching market updates UI, keeps typed values | UC-VM-2-A1, VM-FR-18, VM-FR-19 | e2e | P1 | Type name and location, switch `ID` -> `VN` -> `ID` | Placeholders/help/fallback switch immediately; typed values and language selection kept | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-2.6 | Help text names nationwide keyword and comma rule | UC-VM-2 primary 4, VM-FR-19, VM-OQ-4 | e2e | P1 | `ID` and `VN` selected | `Seluruh Indonesia` / `toàn quốc` named; comma-separates-places sentence present | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-2.7 | Submit sends `market` | UC-VM-2 primary 5 | e2e | P0 | Create via form with VN, then ID | Request body contains `market`; detail view shows it | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-2.8 | Language not forced by market | UC-VM-2-A4, UC-VM-1-A3, VM-FR-3 | e2e | P1 | Select VN then choose `english` | Accepted; saved `language english`, `market VN` | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-2.9 | Detail view shows market read-only | UC-VM-2-A5, VM-FR-18 | e2e | P1 | Open VN campaign detail | Market shown (`Việt Nam`), no editable control | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-2.10 | Empty query and location preview | UC-VM-2-E1, VM-FR-19 | e2e | P1 | VN selected, both fields empty | Preview uses `TP.HCM`, never `Jakarta` | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-2.11 | UI language switch does not reset touched market | UC-VM-2-EC1, VM-FR-18 | e2e | P1 | Touch select to `VN` in en UI, switch UI to vi and back | Remains `VN`; untouched selector may follow language | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-2.12 | Layout without overflow | VM-FR-18, 2.9 | e2e | P1 | Form with both markets, vi and en, viewports 375x812 and 1280x800 | `document.documentElement.scrollWidth <= innerWidth`; selector, help and compliance line fully visible; screenshot attached | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-2.13 | `Campaign.market` in shared types | 2.9 | static | P2 | `pnpm --filter @prospex/web exec tsc --noEmit` | Clean; `packages/types` has `market: 'ID' \| 'VN'` | tsc |
| TC-VM-20.1 | Compliance line visible only for VN | UC-VM-2-A3, UC-VM-20 primary, UC-VM-20-A2, VM-FR-26 | e2e | P0 | Select VN then ID | Line visible under selector for VN; hidden for ID | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-20.2 | Compliance wording en and vi | UC-VM-20-A1, VM-FR-26 | e2e | P0 | Read the string in en and vi | Contains "may apply" equivalent, `Decree 91/2020/ND-CP` and `Decree 13/2023`, and "not legal advice" equivalent; non-blocking (no checkbox, button stays enabled) | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-20.3 | No "compliant" claim anywhere | UC-VM-20-E1, UC-VM-20-EC1, VM-FR-26, VM-OQ-7 | static | P0 | grep -i `compliant|tuân thủ|hợp pháp|legal` in new strings, README, USER_GUIDE, features.md, CHANGELOG | No claim that the product is compliant/legal; no article numbers or penalties; only "risk"/"may apply" wording (matches of "not legal advice" are allowed) | review gate |
| TC-VM-20.4 | Compliance text verified against official decrees | VM-FR-26 | manual | P1 | Compare string with official Decree 91/2020/ND-CP and 13/2023 texts before shipping | Reviewer sign-off recorded; string not shipped before | manual |
| TC-VM-20.5 | Notice in docs | UC-VM-20-E1, VM-FR-26 | static | P0 | grep `Decree 91/2020` in `README.md`, `docs/USER_GUIDE.md` | Present in both with the same wording as the UI | review gate |
| TC-VM-16.1 | Key parity en/vi | UC-VM-16 primary, UC-VM-16-E1, VM-FR-20 | e2e | P0 | Existing `tests/e2e/i18n-dictionaries.spec.ts` (857+ keys today; re-measure) after new keys added to `en.ts` (and feature dictionaries) and `vi.ts` | Passes unedited: every en key exists in vi, no empty values, placeholders (`{n}`) match; total key count increased by exactly the number of new keys | `tests/e2e/i18n-dictionaries.spec.ts` |
| TC-VM-16.2 | Missing vi key fails typecheck | UC-VM-16-E1, VM-AC-10 | static | P1 | Remove one new key from `vi` temporarily (negative control) | `tsc --noEmit` on web fails; restore | tsc |
| TC-VM-16.3 | Market names proper nouns | UC-VM-16-A1, VM-FR-20 | e2e | P2 | Option text in en and vi | `Indonesia` and `Việt Nam` in both | `tests/e2e/vietnam-market.spec.ts` |
| TC-VM-16.4 | Server components import only `lang.ts` | UC-VM-16-A2 | static | P1 | grep imports in `app/**/page.tsx`/server files for `lib/i18n/` | Only `lib/i18n/lang.ts` | review gate |
| TC-VM-16.5 | Which dictionaries exist | UC-VM-16-EC1, A27, VM-FR-20 | static | P2 | List `apps/web/src/lib/i18n/*` | New keys only in dictionaries that exist (`id.ts` removed by section 1: no `id.ts` edit) | review gate |
| TC-VM-16.6 | No hard-coded UI strings | VM-FR-20 | static | P1 | grep new JSX literals in changed components | All via `t(key)` | review gate |

## 12. Migration and schema (UC-VM-18; VM-FR-23; VM-AC-12)

Run on a **scratch database** (never the shared dev DB), like QA 6.4 of the previous feature.

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-18.1 | Migration content | UC-VM-18 primary 1, VM-FR-23 | static | P0 | Read `packages/database/prisma/migrations/20261024000000_campaign_market/migration.sql` | Only `ALTER TABLE "campaigns" ADD COLUMN "market" TEXT NOT NULL DEFAULT 'ID';` as executable SQL; no index, no CHECK, no UPDATE, no other table | review gate |
| TC-VM-18.2 | Reverse SQL comment | UC-VM-18-A1, VM-AC-12 | static | P0 | Same file | Contains `-- reverse: ALTER TABLE "campaigns" DROP COLUMN "market";` | review gate |
| TC-VM-18.3 | Deploy chain on scratch DB | VM-AC-12 | integration | P0 | Fresh DB, `db:deploy` full chain; insert campaign rows before the new migration (checkout previous migration step) then apply | Applies without error; pre-existing rows read `market = 'ID'` | scratch DB script (manual runbook) |
| TC-VM-18.4 | No drift | UC-VM-18 primary 3, VM-AC-12 | integration | P0 | `prisma migrate diff --from-migrations ... --to-schema-datamodel schema.prisma --exit-code` on scratch | Exit 0 | scratch DB script |
| TC-VM-18.5 | Negative control | UC-VM-18-E1 | integration | P1 | Add a stray column to scratch schema, rerun diff | Exit non-zero | scratch DB script |
| TC-VM-18.6 | Reverse restores schema | UC-VM-18-A1, VM-AC-12 | integration | P1 | Execute reverse SQL on scratch, run diff against previous schema | Column gone; diff vs previous migration set exit 0 | scratch DB script |
| TC-VM-18.7 | Old insert path | UC-VM-18-A2, VM-NFR-5 | integration | P0 | `INSERT` into `campaigns` without `market` (raw SQL, as old code) | Row stored with `'ID'` | scratch DB script |
| TC-VM-18.8 | No other schema change | UC-VM-18-EC1, VM-FR-5, VM-OQ-6 | static | P0 | `git diff` of `schema.prisma` | Only `market String @default("ID")` on `Campaign`; `Unsupported("vector")` columns untouched; no change to `leads`, `whatsapp_accounts`, `email_accounts` | review gate |
| TC-VM-18.9 | Prisma client regenerated | VM-FR-23 | static | P1 | `pnpm --filter @prospex/database exec prisma generate` then API `tsc --noEmit` | Clean; `campaign.market` typed `string` | tsc |
| TC-VM-18.10 | Shared dev DB untouched | VM-FR-23 | manual | P2 | Check slice notes/commands | No `db:push`/`db:deploy` against shared DB recorded | review |
| TC-VM-18.11 | Existing `language-migration.test.ts` pattern for market | VM-FR-23 | unit | P1 | New `market-migration.test.ts` reading the migration file as text (offline) | Asserts TC-VM-18.1 and 18.2 automatically | `common/market-migration.test.ts` |

## 13. Security (P0 block; PRD 2.11 pre-review S2, S3, S4, S7)

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-S.1 | ReDoS sweep of all new matchers | VM-NFR-3, UC-VM-6-EC1, UC-VM-7-EC1, UC-VM-9-M11 | unit | P0 | `assertLinear` for every new exported matcher/parser (phone, `phoneKind`, areas, alias, maps-parse, `wa-text`) with `(`-, space-, dot-, digit-, mixed-script makers, all under `HOSTILE_MS_*` | All pass; limits not hard-coded in tests | the respective `*-vn.test.ts` |
| TC-VM-S.2 | Regex review | VM-NFR-3 | static | P0 | grep new `RegExp(`/regex literals | No nested quantifiers, no `<` without bounded `>` search, no regex built from unescaped input | review gate (security) |
| TC-VM-S.3 | URL building injection | VM-NFR-2, UC-VM-4-A2 | unit | P0 | See TC-VM-4.5 and 4.6 | Pass | `scraper/maps-urls.test.ts` |
| TC-VM-S.4 | Market allow-list and never interpolated | VM-NFR-2, UC-VM-19-EC1 | unit | P0 | `market` values with SQL/URL/prompt payloads `VN'; DROP`, `VN&hl=en`, `<data_x>` through DTO, `normalizeMarket`, builders | DTO 400; reads `ID`; payload never reaches URL, SQL, prompt, logs | `common/market-dto.test.ts` |
| TC-VM-S.5 | Workspace scoping of market | VM-NFR-2 | e2e | P0 | TC-VM-3.5, 3.13, 14.6, 19.7 | Pass | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-S.6 | `url-fetch.ts` / `SafeProxy` untouched | VM-NFR-2, UC-VM-19-EC2 | static | P0 | `git diff -- apps/api/src/marketing/url-fetch.ts` and SafeProxy files | Empty | review gate |
| TC-VM-S.7 | No PII or real numbers in fixtures, logs, docs | VM-FR-22, CLAUDE.md, UC-VM-21-EC2 | static | P0 | grep new files for `\+?84\d{9,10}` and `0[35789]\d{8}` against an allowlist of invented numbers (`0901234567`, `0900000001`, `+84 90 000 0000`, `0351234567`, etc.); grep for real company names, workspace ids | Only allowlisted invented numbers; none in logs (TC-VM-10.18) | review gate |
| TC-VM-S.8 | Page-evaluate argument closed set | VM-FR-6, VM-FR-12 | static | P0 | See TC-VM-4.12 | Pass | review gate |
| TC-VM-S.9 | Scraper terms-of-service risk flagged | 2.10, VM-NFR-6 | manual | P1 | Review docs and PR description | Docs state real-run verification must respect Google's terms and pacing; risk flagged in the security review note | manual / docs |
| TC-VM-S.10 | Opt-out absolute | CLAUDE.md, VM-FR-25 | integration | P0 | Opted-out VN mobile number: approve, then send path | Refused at approve and again at send; ordering unchanged | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-S.11 | Approval still required | CLAUDE.md | integration | P0 | VN lead draft: attempt send without approve | Nothing sent | `apps/api/scripts/pipeline-check.ts` |
| TC-VM-S.12 | 64-char cap prevents memory abuse at DTO | VM-FR-12, VM-NFR-3 | e2e | P1 | Manual-number DTO with 1 MB string (within body limit) | 400 fast (< `HOSTILE_MS_LARGE`), no 500 | `tests/e2e/zz-market-api.spec.ts` |
| TC-VM-S.13 | Prompt delimiting unaffected | CLAUDE.md | unit | P1 | Existing `prompt-snapshots.test.ts`, `style-prompt.test.ts` | Pass unchanged (market adds no prompt text) | existing |
| TC-VM-S.14 | `passwordEnc`/secrets not touched | CLAUDE.md | static | P2 | Diff review | No secret fields added to responses | review gate |

## 14. Documentation (UC-VM-21; VM-AC-14; VM-NFR-6)

| ID | Title | Ref | Lvl | Pri | Inputs | Expected | Target |
|----|-------|-----|-----|-----|--------|----------|--------|
| TC-VM-21.1 | README | UC-VM-21 primary 1, 2.12 | static | P1 | Read README | "still tuned for the Indonesian market" bullet replaced; `market` field and `SCRAPER_MODE=fixture` per market documented; Simulated label; compliance wording (TC-VM-20.5) | review gate |
| TC-VM-21.2 | features.md | UC-VM-21 primary 2 | static | P1 | Read `docs/features.md` | Rows for area search/Maps parsing (**Simulated**), phone/WhatsApp capability (Verified only for what tests run), regions (dataset source and date), real-run requirements, "first lead wins across markets" note | review gate |
| TC-VM-21.3 | architecture.md, USER_GUIDE, whatsapp-outbox | UC-VM-21 primary 3, 2.12 | static | P1 | Read each | "Markets" section; Location rows, rewritten market block, timezone row, `Thị trường` row, comma rule, landline note; 409 and landline behaviour (409, `Not a mobile number`) in whatsapp-outbox | review gate |
| TC-VM-21.4 | Claims checked against code | UC-VM-21-A1, VM-NFR-6 | manual | P1 | For each new doc claim (endpoints, env vars, statuses) grep the code | Every claim traceable; list in PR | review |
| TC-VM-21.5 | No verified-Vietnamese-discovery claim | UC-VM-21-E1, VM-NFR-6, VM-AC-14 | static | P0 | grep `verified` near `Vietnam`/`Vietnamese` in docs/CHANGELOG | None says discovery is verified; **Simulated** label present | review gate |
| TC-VM-21.6 | CHANGELOG entry | UC-VM-21 primary 3 | static | P1 | Read `CHANGELOG.md` | One plain-language entry (Added Vietnam market; no Indonesian change) in the changelog-rules format with real UTC time | review gate |
| TC-VM-21.7 | Root CLAUDE.md untouched by slices | UC-VM-21-EC1 | static | P2 | `git diff -- CLAUDE.md` | Empty unless user approved | review gate |
| TC-VM-21.8 | No real data in docs | UC-VM-21-EC2 | static | P0 | See TC-VM-S.7 | Pass | review gate |
| TC-VM-21.9 | PRD pointers | 2.12 | static | P2 | PRD 1.8/1.14 | Pointer to section 2 added at ship | review gate |
| TC-VM-21.10 | Quality gates | UC-VM-21-A2, VM-AC-14 | static | P0 | `pnpm --filter @prospex/api exec tsc --noEmit`; `pnpm --filter @prospex/web exec tsc --noEmit`; `pnpm --filter @prospex/api test`; `pnpm --filter @prospex/api exec tsx scripts/pipeline-check.ts`; `pnpm test:e2e` | All pass | CI |

---

## 15. Test execution plan by wave

| Wave / Slice | Content (PRD 2.11) | Tests to write and run | Commands | Exit criteria |
|--------------|--------------------|------------------------|----------|---------------|
| W1 / S1 | ID regression snapshots, no production change | TC-VM-5.1..5.15, 5.18..5.20 (5.18..5.20 only for the pieces that exist today; the rest in S4), table 1.2 to 1.10 literals, TC-VM-22.1/22.2 baseline counts recorded | `pnpm --filter @prospex/api test` | All snapshot files green against the **unchanged** code; baseline counts (732 unit, 155 e2e) recorded in this document; commit touches only test files; TC-VM-5.16 gate defined |
| W2 / S2 | Market module, migration, DTOs, draft lock | TC-VM-1.1..1.17, 1.23, 3.1..3.9, 3.14, 18.1, 18.2, 18.8, 18.11, S.4, 15.9 | `pnpm --filter @prospex/api test`, `pnpm --filter @prospex/database exec prisma generate`, `pnpm --filter @prospex/api exec tsc --noEmit`, scratch DB runbook (18.3..18.7) | Snapshots still green and unedited; 404-before-409 proven; migration verified on scratch DB; security pre-review S2 signed |
| W3 / S3 | Phone | TC-VM-9.x, 11.1..11.9, 10.11..10.12, S.1 (phone), 10.18 | `pnpm --filter @prospex/api test` | Section 1.2 rows unchanged (or P60 gating applied); all VN matrix rows green; hostile 10 MB within limit; numbering-plan length rules (9.7/9.8) checked and recorded; pre-review S3 signed |
| W3 / S4 | Scraper | TC-VM-4.x, 5.5 builder part, 5.18..5.20, 6.x, 7.x, 8.1..8.7, S.2, S.3, S.8 | `pnpm --filter @prospex/api test` | URL builder equal to S1 literals for ID; injection rows green; fixture VN has region and coordinates; pre-review S4 signed |
| W3 / S5 | Geo VN and map centre | TC-VM-13.x, 14.2, 14.5, 6.21, 6.22 | `pnpm --filter @prospex/api test`; `pnpm test:e2e -g "market-helpers"` | geo snapshot unchanged; dataset header test green (official source cited, dataset not shipped before) |
| W3 / S6 | Web form and i18n | TC-VM-2.x, 20.1..20.2, 16.x, 17.x (UI), 14.4 | `pnpm --filter @prospex/web exec tsc --noEmit`; `pnpm test:e2e` (vietnam-market, market-helpers, i18n-dictionaries) | Web tsc clean; key parity green; layout 375/1280 clean; compliance wording signed off (TC-VM-20.4) |
| W4 / S7 | Lead call sites, guards, outbox timezone | TC-VM-10.1..10.10, 10.13..10.17, 11.10..11.24, 12.x, 15.1..15.8, S.10, S.11, S.5 | `pnpm --filter @prospex/api test`; `DATABASE_URL=... WORKSPACE_ID=... pnpm --filter @prospex/api exec tsx scripts/pipeline-check.ts` | Landline never reaches provider; ID outcomes unchanged; no phone in logs; pre-review S7 signed |
| W5 / S8 | e2e, pipeline-check, fixture region | TC-VM-8.8, 8.9, 14.1, 14.6, 14.7, 3.x HTTP, 19.x, 9.20, S.12, 22.2..22.7 | `pnpm test:e2e` (servers running with `SCRAPER_MODE=fixture`, `GEOCODER_DISABLED=true`, `WHATSAPP_DISABLED=true`); `zz-market-api.spec.ts` runs last | Full suite green (155 + new); ID campaigns unchanged |
| W6 / S9 | Docs, changelog | TC-VM-21.x, 20.3, 20.5, S.7 | grep gates; all quality gates in TC-VM-21.10 | All docs claims traced; Simulated labels present; every gate green |
| Merge-ready | All | Full matrix | All commands above | No P0 failing; no snapshot diff; gaps in section 17 either closed or accepted by owner |

---

## 16. Traceability matrix

| Requirement | Test cases |
|-------------|------------|
| VM-FR-1 | 1.1-1.3, 1.9-1.17, 1.22, S.4 |
| VM-FR-2 | 1.4-1.8, 6.1 |
| VM-FR-3 | 1.21, 2.8, 22.4 |
| VM-FR-4 | 5.1-5.20, 1.5, 6.3, 6.13, 6.15, 9.17 |
| VM-FR-5 | 1.18, 3.14, 11.9, 18.8 |
| VM-FR-6 | 4.1-4.12, 4.8-4.11, 5.18-5.20 |
| VM-FR-7 | 6.1-6.22 |
| VM-FR-8 | 7.1-7.16, 4.14 |
| VM-FR-9 | 9.1-9.11 |
| VM-FR-10 | 9.5, 11.1-11.9, 11.21, 11.22, 9.21 |
| VM-FR-11 | 9.12, 9.13, 9.19, 11.5 |
| VM-FR-12 | 4.13, 9.14, 9.16, 9.20, 10.1-10.18 |
| VM-FR-13 | 13.1-13.15, 14.2 |
| VM-FR-14 | 6.21, 6.22, 13.11 |
| VM-FR-15 | 13.4-13.6, 14.1-14.7 |
| VM-FR-16 | 15.1-15.9 |
| VM-FR-17 | 12.1-12.10 |
| VM-FR-18 | 2.1-2.3, 2.5, 2.7, 2.9, 2.11 |
| VM-FR-19 | 2.4-2.6, 2.10 |
| VM-FR-20 | 16.1-16.6 |
| VM-FR-21 | 15.11, 17.1-17.3 |
| VM-FR-22 | 8.1-8.9 |
| VM-FR-23 | 18.1-18.11 |
| VM-FR-24 | 3.1-3.14 |
| VM-FR-25 (PRD-only) | 11.10-11.20, 10.18, S.10 |
| VM-FR-26 (PRD-only) | 20.1-20.5 |
| VM-NFR-1 | Section 1 (5.x), 22.1-22.7, 9.17, 12.3 |
| VM-NFR-2 | 1.12, 1.14, 3.5, 3.13, 4.5, 4.6, 19.x, S.3-S.8 |
| VM-NFR-3 | 5.x hostile rows, 6.17, 6.18, 7.14, 9.16, 10.12, 11.8, S.1, S.2 |
| VM-NFR-4 | 11.18, 13.13, 13.14, 22.7 |
| VM-NFR-5 | 1.13, 1.17, 3.8, 18.7, 5.18 |
| VM-NFR-6 | 4.15, 7.13, 7.16, 8.6, 21.4, 21.5, S.9 |
| VM-AC-1 | 5.1-5.20 |
| VM-AC-2 | 4.1-4.3 |
| VM-AC-3 | 6.1-6.15 |
| VM-AC-4 | 9.1-9.14, 9.17 |
| VM-AC-5 | 11.1-11.6, 11.21, 11.22 |
| VM-AC-6 | 10.1, 10.2, 10.14, 10.15 |
| VM-AC-7 | 7.1-7.11 |
| VM-AC-8 | 13.1, 13.8, 13.9, 6.22 |
| VM-AC-9 | 8.8, 8.9 |
| VM-AC-10 | 1.20, 2.1-2.4, 16.1, 16.2 |
| VM-AC-11 | 1.18-1.22, 3.2-3.13 |
| VM-AC-12 | 18.1-18.7 |
| VM-AC-13 | 15.1-15.10 |
| VM-AC-14 | 21.1-21.10, 7.16 |

UC coverage: every UC-VM-1..22 flow id appears in the `Ref` column above except those listed under gaps.

---

## 17. Gaps, open items and inconsistencies

### 17.1 Gaps (cannot be fully tested as specified)

- **GAP-1** `VM-NFR-1` / `VM-FR-12` conflict risk: row P60 (a >64-char padded valid ID number) normalises today. The 64-char cap "in both markets" would change it. The S1 snapshot keeps today's value; implementation must gate the cap to the VN path if the snapshot differs (PRD says so). The test plan treats the snapshot as authoritative.
- **GAP-2** The raw-input classifier for `service` (`1800`/`1900`) has no named function in the PRD (VM-FR-10 says `phoneKind(e164, market)` takes an E.164). TC-VM-11.3 assumes `phoneKind` also accepts the raw national string or a sibling function; name to be fixed in S3.
- **GAP-3** VN bare 9-digit number without trunk zero (`901234567`) and `84`+trunk zero are not specified (TC-VM-9.10, 9.11): expected values to be decided in S3 and locked.
- **GAP-4** Landline length bounds and valid mobile prefix beyond `03 05 07 08 09` need checking against the national numbering plan (PRD 2.10): TC-VM-9.7/9.8 row sets provisional.
- **GAP-5** VN `phoneKind` for unlisted prefixes (04, 06, 01x) and wrong-length mobiles is unspecified (TC-VM-11.4).
- **GAP-6** Letters in a VN phone: UC-VM-9-M8 says `null`, PRD silent, ID strips letters (TC-VM-9.9).
- **GAP-7** S1 cannot snapshot the ID Maps URL/context through a function (they are inline, no production change allowed in S1): handled by a static source-text assertion plus a builder equality test added in S4 (TC-VM-5.5). The builder's name/signature is not in the PRD.
- **GAP-8** TC-VM-5.18..5.20 test market resolution that does not exist before S2/S4; only the "no market -> ID" half can be written in S1 via existing job shape. Remaining rows are written in S4 in a separate file (never editing S1 files).
- **GAP-9** Province dataset, 34-unit list and compliance string cannot be tested for correctness until the official sources are checked (VM-FR-14, VM-FR-26); tests only assert header/presence and ship-gates (TC-VM-6.21/6.22/20.4).
- **GAP-10** Vietnamese Maps wording is Simulated; no automated or real-run proof (TC-VM-7.16 is manual and out of the feature's scope).
- **GAP-11** UC-VM-14-A1 ("provinces listed from the bundled dataset before any lead has one") is in VM-FR-13 but the filter UI source (API vs client) is unspecified (TC-VM-14.2 is P2 and may be N/A).
- **GAP-12** API-key route for campaign creation may not exist (TC-VM-19.3 may be N/A).
- **GAP-13** Review counts of the existing suites (732 unit, 155 e2e, 857+ keys) are from the brief/PRD and must be re-measured at S1 and recorded here.
- **GAP-14** `G-8` (same number in two markets) and `G-9` (clone to another market) have no product requirement beyond "first wins" documentation (TC-VM-10.6 only); G-9 is out of scope.

### 17.2 PRD / use-case inconsistencies (PRD 2.13 followed in every case)

- **INC-1** UC-VM-15-A3 says the email fallback becomes `Asia/Ho_Chi_Minh` for a VN market; VM-FR-16 and 2.13/A10 keep `Asia/Jakarta` (TC-VM-15.6 follows the PRD).
- **INC-2** UC-VM-15-A4 / header decision uses "first campaign" for the timezone rule; VM-FR-16 says "most recent campaign" (TC-VM-15.2). UC-VM-15 primary flow also still speaks of a stored default at creation; PRD says no stored default (TC-VM-15.5).
- **INC-3** UC-VM-3-E1 says 409 "architect may set 400" and marks `[ARCH]`; VM-FR-24 fixes 409 (TC-VM-3.3).
- **INC-4** Use-case decision table for VM-OQ-2/3 uses `[ARCH]` recommendations (e.g. `regency` = former district, `district` = ward); VM-FR-15 maps `regency` = `city_district|county`, `district` = `suburb|quarter|village` (TC-VM-13.x follow the PRD).
- **INC-5** UC-VM-2 header: "market of most recent campaign" replaced by UI-language default (C-1 resolved in PRD A15); UC-VM-14-A4 retains the stale C-4 wording ("all VN leads"); PRD VM-FR-15 rule used (TC-VM-14.5).
- **INC-6** UC-VM-11-A1 / E2: `service` for stored numbers and `[ARCH: where enforced]` are stale; PRD VM-FR-10/25 fix them (TC-VM-11.3, 11.10-11.14).
- **INC-7** UC-VM-20 places the compliance line; PRD VM-FR-26 adds Decree 13/2023 to the text; UC mentions only 91/2020 (TC-VM-20.2 asserts both).
- **INC-8** UC-VM-9-M11: "capped at 64 chars ... or normalises the first 64"; PRD VM-FR-12 chooses reject (`null`) above 64 (TC-VM-9.14, 9.16 follow the PRD).
- **INC-9** UC-VM-2-A4 says VN "may preselect `vietnamese`"; VM-FR-3 allows preselection but never forcing: not required; TC-VM-2.8 only asserts not forced.
- **INC-10** UC-VM-6-A5 lists separator `cùng với` only in PRD (VM-FR-7b); use case omits it (TC-VM-6.10 includes it).
- **INC-11** Use-case file does not trace VM-FR-24, VM-FR-25, VM-FR-26 explicitly (UC-VM-3/19, UC-VM-11-E2, UC-VM-20 partly cover): test cases derived from the PRD, marked "PRD-only".
- **INC-12** The use-case traceability table lists VM-FR-5 as UC 1, 10, 15, 18; VM-FR-5 (per-campaign column, no lead market) is exercised by TC-VM-1.18, 3.14, 11.9, 18.8 only.

---

## 18. Totals

Test cases (rows with a `TC-VM-` id): **301**. Data rows inside table-driven snapshots (tables 1.2 to 1.5: 60 + 4 + 10 + 8 = 82 literal rows) are not counted separately.

| Level | Count | | Priority | Count |
|-------|-------|-|----------|-------|
| unit | 168 | | P0 | 181 |
| integration | 33 | | P1 | 96 |
| e2e | 47 | | P2 | 24 |
| static | 48 | | | |
| manual | 5 | | | |
