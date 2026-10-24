# Use Cases: Vietnam market support (next to Indonesia)

> Based on [PRD](../PRD.md) section 2 (`VM-FR-n`, `VM-NFR-n`, `VM-AC-n`, `VM-OQ-n`). Baseline: [vietnamese-language_use_cases.md](vietnamese-language_use_cases.md) (section 1, untouched).
>
> Created 2026-10-24: UC-VM-1 through UC-VM-22.

## Tech-lead decisions (final, incorporated below)

| Item | Decision |
|------|----------|
| VM-OQ-1 | Market is **per campaign** (`campaigns.market`, `String`, default `'ID'`, additive migration). Timezone stays **per workspace** (WhatsApp and email accounts). No `lead.market`; leads reach it through `lead.campaign`. |
| VM-OQ-5 | Market is editable **only while the campaign is `draft`**. |
| VM-OQ-6 | `phoneKind` is **computed** (from `phoneE164` plus the campaign market), not stored. No column, no backfill. |
| VM-OQ-2 | New WhatsApp/email accounts get the market's timezone default **at creation only if cheap**; otherwise only the Outbox panel initial value and the email fallback change. **Architect decides**; use cases cover both outcomes (UC-VM-15). |
| VM-OQ-9 | Campaign form market default follows the **UI language**: Vietnamese UI -> `VN`, English UI -> `ID`. This **replaces** the "market of the most recent campaign" rule of VM-FR-18 (see contradiction C-1). |
| VM-OQ-3 / VM-OQ-4 | Region-column mapping for VN and comma-splits-places: **architect decides**. Use cases state the PRD recommendation as the expected result and mark it `[ARCH]`. |

## Decisions made by this document (flag if wrong)

- **Compliance notice (VM-OQ-7)**: shown as **one static line under the Market selector in the campaign form, only while `VN` is selected**, in en and vi, saying that sending unsolicited commercial messages in Vietnam is regulated (Decree 91/2020/ND-CP is named as a risk to review with a qualified adviser), not legal advice. It does not block anything and is not a consent checkbox. The same sentence appears in the README/USER_GUIDE market section. The PRD makes no compliance claim, so the text must say "may apply" and never "compliant".
- **PATCH on non-draft campaign**: **409 Conflict** (state conflict, not a validation error). The architect may choose 400; tests follow the architect's final choice. A campaign of another workspace is 404 in both cases.
- **Invalid `market`**: 400 from the DTO, response normalised by `HttpExceptionFilter`.

All data below is invented (example.com, "Công ty Mẫu"). Numbers such as `0901 234 567` and `028 3822 1234` are placeholders.

Notation: flow tables use `ID | flow | expected result | refs`. `[ARCH]` = depends on an architect decision.

---

## UC-VM-1: Create a campaign with a market

**Actor**: Authenticated workspace member
**Preconditions**: Logged in, active workspace
**Trigger**: `POST /api/campaigns`

### Primary Flow
1. Member submits name, query, location `TP.HCM`, `market: "VN"`.
2. DTO validates `market` against `IsIn(["ID","VN"])`.
3. Campaign is stored with `market = "VN"`, status `draft`, workspace from `@CurrentWorkspace()`.
4. `GET /campaigns` and `GET /campaigns/:id` return `market`.

**Postconditions**: Campaign row has `market = 'VN'`. Output `language` is independent (a VN campaign may have `language: "english"`).

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-1-A1 | `market: "ID"` | Stored `ID`, behaviour as today | VM-FR-1, VM-AC-10 |
| UC-VM-1-A2 | `market` omitted | Stored `ID`, 201 | VM-FR-1, VM-NFR-5, VM-AC-10 |
| UC-VM-1-A3 | VN market + `language: "english"`; ID market + `language: "vietnamese"` | Both accepted, no coupling | VM-FR-3 |
| UC-VM-1-E1 | `market: "XX"`, `"vn"` (lowercase), `"Vietnam"` | 400, nothing stored | VM-FR-1, VM-AC-11 |
| UC-VM-1-E2 | `market: null` or `""` | 400 | VM-FR-1, VM-AC-11 |
| UC-VM-1-E3 | `market: 1` / `["VN"]` / `{}` | 400 | VM-FR-1, VM-NFR-2 |
| UC-VM-1-EC1 | DB row or in-memory value unknown (`"XX"`, null) read by `normalizeMarket` | Treated as `ID`, never interpolated | VM-FR-1, VM-NFR-2 |

---

## UC-VM-2: Campaign form: market selector, defaults, placeholders, compliance line

**Actor**: Workspace member in the web UI
**Preconditions**: Logged in; UI language `en` or `vi`
**Trigger**: Opens "New campaign"

### Primary Flow
1. Form shows a Market selector (Indonesia / Việt Nam, label "Market" / "Thị trường") next to Location, with a hint stating the default rule.
2. Default selection: UI `vi` -> `VN`; UI `en` -> `ID` (same as today for English users).
3. Location placeholder and query-placeholder fallback follow the market: `ID` -> `e.g. Bandung, Jakarta` / fallback `Jakarta`; `VN` -> `ví dụ: TP.HCM, Hà Nội` (vi UI) or `e.g. Ho Chi Minh City, Hanoi` (en UI) / fallback `TP.HCM`.
4. Help under Location names the nationwide keyword (`Seluruh Indonesia` / `toàn quốc`) and states that a comma separates places.
5. Submit sends `market`.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-2-A1 | Owner changes selector `ID` -> `VN` | Placeholders, help and fallback switch immediately; typed values kept; language not forced | VM-FR-18, VM-FR-19, VM-FR-3 |
| UC-VM-2-A2 | English UI, owner who previously created VN campaigns | Default is still `ID` (UI-language rule, not history) | VM-OQ-9 decision, C-1 |
| UC-VM-2-A3 | `VN` selected | Compliance line visible (see header); `ID` selected -> line hidden | VM-OQ-7 decision |
| UC-VM-2-A4 | VN selected, language selector | May preselect `vietnamese`, user can still choose another | VM-FR-3 |
| UC-VM-2-A5 | Campaign detail view | Shows market read-only (like language) | VM-FR-18 |
| UC-VM-2-E1 | Query empty, location empty | Query preview uses market example city, never a hard-coded "Jakarta" for VN | VM-FR-19 |
| UC-VM-2-EC1 | Switch UI language after opening the form | Selected market is not reset by a language switch once the user touched it | VM-FR-18 |

---

## UC-VM-3: Change market of a draft campaign only

**Actor**: Workspace member
**Preconditions**: Campaign belongs to caller's workspace
**Trigger**: `PATCH /api/campaigns/:id` with `market`

### Primary Flow
1. Campaign status is `draft`; member sends `market: "VN"`.
2. Existing field allow-list and workspace-scoped update apply; `market` is saved.
3. Response returns the updated campaign.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-3-E1 | Status `running`, `completed`, `failed` (or any non-draft) | 409 (architect may set 400), market unchanged | VM-AC-11, VM-OQ-5 |
| UC-VM-3-E2 | Campaign of another workspace | 404, unchanged | VM-AC-11, VM-NFR-2 |
| UC-VM-3-E3 | Invalid / null / empty `market` | 400 | VM-FR-1, VM-AC-11 |
| UC-VM-3-E4 | PATCH with other fields only, non-draft | Behaves as today (no new restriction on other fields) | VM-NFR-5 |
| UC-VM-3-EC1 | Same value re-sent on non-draft campaign (`VN` -> `VN`) | Same as E1: rejected (rule is status-based) `[ARCH]` | VM-OQ-5 |
| UC-VM-3-EC2 | Race: start and PATCH concurrently | Either the PATCH wins before start (job carries new market) or it is rejected; a job never runs with a market different from the stored one at start time | VM-OQ-5, VM-FR-6 |

---

## UC-VM-4: Start a campaign: the scraper uses the market profile

**Actor**: Workspace member
**Preconditions**: Draft campaign with `market`
**Trigger**: `POST /api/scraper/campaigns/:id/start`

### Primary Flow
1. Controller reads the campaign market and puts it into `ScraperJobData.market`.
2. `ScraperProcessor` builds both Maps URLs and the browser context from the profile.
3. For `VN`: area URL `.../search/<area>, Việt Nam?hl=vi` (URL-encoded), search URL `.../search/<query>/@<lat>,<lng>,13z?hl=vi`, context `locale: "vi-VN"`, `timezoneId: "Asia/Ho_Chi_Minh"`.
4. For `ID`: `, Indonesia`, `hl=id`, `id-ID`, `Asia/Jakarta`, byte-identical to today.
5. Status goes `draft -> running -> completed|failed` as today.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-4-A1 | Pure URL/context builders asserted without a browser | VN contains `Vi%E1%BB%87t Nam` (encoded `Việt Nam`) and `hl=vi`; ID snapshot unchanged | VM-AC-2, VM-AC-1, VM-FR-6 |
| UC-VM-4-A2 | Area text contains user characters (`&`, `?`, `#`, `/`) | Encoded in the URL; profile suffix/hl are constants, user text cannot add parameters | VM-NFR-2 |
| UC-VM-4-E1 | Campaign not found / other workspace | 404 as today | VM-NFR-2 |
| UC-VM-4-E2 | Campaign already running | Existing behaviour (no new market-specific error) | VM-NFR-5 |
| UC-VM-4-EC1 | Scraper does not translate page text: end-of-list, results and search-box selectors accept Vietnamese (`Bạn đã xem hết danh sách`, `Kết quả`, `Tìm kiếm trên Google Maps`) in addition to existing ones. **Simulated**, unverified until a real run | VM-FR-8(f), VM-NFR-6 |
| UC-VM-4-EC2 | Scrape errors / CAPTCHA | Campaign `failed`, no fabricated leads (UC-VM-8) | VM-NFR-6 |

---

## UC-VM-5: Queued or legacy job without market; Indonesian regression snapshot

**Actor**: System (BullMQ worker)
**Preconditions**: A job exists in Redis from before the upgrade, or a campaign row has an unknown value
**Trigger**: Worker picks the job

### Primary Flow
1. Job data has no `market`.
2. Processor calls `normalizeMarket(undefined)` = `ID`.
3. Run is identical to today.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-5-A1 | Job with `market: "VN"` | VN profile | VM-FR-6 |
| UC-VM-5-E1 | Job with `market: "XX"` / null / number | `ID`, no throw, no interpolation | VM-FR-1, VM-NFR-2, VM-NFR-5 |
| UC-VM-5-A2 | Regression snapshot (committed first, before any change) records ID Maps URLs, context, `INDONESIA_CITIES` (length, order, 70 names), aliases, `planAreas`/`splitAreas`/`stripPlaces` for >= 12 inputs (`Seluruh Indonesia`, `Jogja dan Solo`, `Medan; Batam`, ...) | Passes unchanged after the feature; existing API unit tests pass unchanged | VM-AC-1, VM-NFR-1, VM-FR-4 |
| UC-VM-5-A3 | Existing exports called without a market argument | Same signature and results | VM-FR-4 |
| UC-VM-5-EC1 | Snapshot written after code changes | Process violation: slice 1 must precede changes (checked in review via commit order) | VM-AC-1 |

---

## UC-VM-6: Vietnamese area expansion

**Actor**: System (`planAreas`, `splitAreas`, `stripPlaces` with VN profile)
**Preconditions**: Campaign market `VN`
**Trigger**: Scraper plans areas from `campaign.location`

### Primary Flow
1. Location `toàn quốc` matches the nationwide pattern.
2. Expands to the top cities of the VN list: at least 8, at most the list length, `perSearch` formula unchanged.
3. Each area is searched with the VN suffix.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-6-A1 | Nationwide variants: `cả nước`, `Việt Nam`, `Viet Nam`, `Vietnam`, `nationwide`, `all Vietnam`, `TOÀN QUỐC` | Each expands as nationwide | VM-FR-7a, VM-AC-3 |
| UC-VM-6-A2 | Aliases of HCM: `Ho Chi Minh`, `Ho Chi Minh City`, `HCM`, `HCMC`, `TP.HCM`, `TPHCM`, `TP. HCM`, `Sài Gòn`, `Sai Gon`, `Saigon`, `TP. Hồ Chí Minh`, `Thành phố Hồ Chí Minh` | All resolve to one canonical place (case-insensitive, `đ` folded to `d`, with and without accents) | VM-FR-7c, VM-AC-3 |
| UC-VM-6-A3 | Hà Nội (`Ha Noi`, `Hanoi`, `HN`), Đà Nẵng (`Da Nang`, `Danang`) | One canonical each | VM-FR-7c, VM-AC-3 |
| UC-VM-6-A4 | Unknown place `Phường Bến Nghé` | Stays as typed; only prefixes (`thành phố`, `tp.`, `tỉnh`, `tại`, `ở`) stripped | VM-FR-7b, VM-AC-3 |
| UC-VM-6-A5 | Separators: `Hà Nội và Đà Nẵng`, `HCM hoặc Cần Thơ`, `a; b`, `a | b`, `a / b`, `a + b`, `a & b`, newline | Split into separate places | VM-FR-7b |
| UC-VM-6-A6 | Comma: `Quận 7, TP.HCM` | Two searches (`Quận 7`, `TP.HCM`), each alone (PRD recommendation, no heuristic); `Quận 7 TP.HCM` is one place. Help text tells users this. `[ARCH]` (VM-OQ-4) | VM-FR-19, VM-OQ-4 |
| UC-VM-6-A7 | `stripPlaces`: query `công ty logistics TP.HCM` | Canonical place removed from the phrase, leaves `công ty logistics` | VM-FR-7c |
| UC-VM-6-A8 | Same inputs under `ID` (`Jogja`, `Seluruh Indonesia`) | As today; no Vietnamese alias applies to ID | VM-FR-4, VM-AC-3 |
| UC-VM-6-A9 | VN list contains pre-merger cities (Vũng Tàu, Biên Hòa, Thủ Dầu Một) | Remain valid search terms; list reviewed by the owner (VM-OQ-8) | VM-OQ-8 |
| UC-VM-6-EC1 | Hostile area text: 100,000 chars, repeated `(`, repeated spaces/dots, mixed scripts | Capped at 400 chars before matching, linear time within the test's limit, no regex built from unescaped input | VM-FR-7d, VM-NFR-3 |
| UC-VM-6-EC2 | Empty / whitespace-only location | Existing behaviour for empty location | VM-NFR-1 |
| UC-VM-6-EC3 | Radius filter `DEFAULT_RADIUS_KM = 50` around area centre for VN place not in list | Existing handling for places with no centre (unchanged) | VM-FR-7b |

---

## UC-VM-7: Parse Vietnamese Google Maps results (`hl=vi`)

**Actor**: System (`maps-parse.ts` helpers and browser-side extraction)
**Preconditions**: Market `VN`; fixture HTML is **invented**, never scraped
**Trigger**: A result card is parsed

### Primary Flow
1. Fixture card: name `Công ty Mẫu Logistics`, rating aria-label `4,6 sao`, review text `(1.234)`, category `Đại lý hải quan`, address `12 Đường Mẫu, Phường Bến Nghé, Quận 1`, phone `(028) 3822 1234`, status `Mở cửa lúc 08:00`.
2. Rating = 4.6, reviews = 1234, category = `Đại lý hải quan`, address recognised, phone accepted, status row is not a category and not an address.
3. Phone stored cleaned for VN (84 -> 0 form) consistently.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-7-A1 | Rating `4,6` and `4.6` | 4.6 both | VM-FR-8a, VM-AC-7 |
| UC-VM-7-A2 | Reviews `(1.234)`, `(1,234)`, `1.234 bài đánh giá` | 1234 | VM-FR-8b, VM-AC-7 |
| UC-VM-7-A3 | Bare `(4,6)` | Rating, not a review count | VM-FR-8b |
| UC-VM-7-A4 | Rows `Mở cửa`, `Đóng cửa`, `Mở cửa cả ngày`, `Đóng cửa vĩnh viễn`, `Tạm thời đóng cửa`, `Mở cửa lúc`, `Đóng cửa lúc`, `Đang mở cửa`, `Quảng cáo`, labels `Địa chỉ`, `Điện thoại`, `Trang web` | Never returned as category; hours row not read as address | VM-FR-8c, VM-AC-7 |
| UC-VM-7-A5 | Address words `Đường`, `Phố`, `Số`, `Phường`, `Xã`, `Quận`, `Huyện`, `KCN`, `Ngõ`, `Hẻm`, `Tổ` | Row recognised as address, plus existing Indonesian words | VM-FR-8d, VM-AC-7 |
| UC-VM-7-A6 | Phone shapes `(028) 3822 1234` (leading `(`), `0901 234 567`, `+84 90 123 4567` | All accepted by browser-side text check | VM-FR-8e, VM-AC-7 |
| UC-VM-7-A7 | End of list: `Bạn đã xem hết danh sách` | Loop stops; no infinite scroll | VM-FR-8f |
| UC-VM-7-A8 | Same invented fixtures parsed with ID rules | Pre-existing results; `Mở`/`Đóng` rows unreachable for ID; no Vietnamese word changes an Indonesian parse | VM-FR-8, VM-AC-7, VM-NFR-1 |
| UC-VM-7-E1 | Card with no phone | Lead kept without phone (no invention) | VM-NFR-6, UC-VM-8 |
| UC-VM-7-E2 | Unexpected wording in a real run | Parser degrades to "field missing", never throws; claims labelled **Simulated** in docs | VM-NFR-6, VM-AC-14 |
| UC-VM-7-EC1 | Hostile card text (huge string, unclosed `<`/`(`) | Linear, bounded, time-limited tests added | VM-NFR-3 |
| UC-VM-7-EC2 | Browser-side extraction duplicates helper rules | Market must be passed into the page function so VN/ID cleanup differs (`84...` -> `0...` for VN; `62...` -> `0...` for ID unchanged) | VM-FR-12 |

---

## UC-VM-8: Scraper never fabricates leads; fixture mode per market

**Actor**: System / CI
**Preconditions**: `SCRAPER_MODE=fixture` (tests only)
**Trigger**: Campaign start in fixture mode

### Primary Flow
1. With `SCRAPER_MODE=fixture` and market `VN`, up to 10 leads `[Test data] <query> <n>` are produced, source `fixture`, no phone, no website.
2. Address carries the area text; a nationwide search uses a VN city (for example Hà Nội, TP.HCM), not an Indonesian one.
3. Campaign completes; leads are listed.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-8-A1 | Fixture mode, `ID` | Identical to today | VM-FR-22, VM-NFR-1 |
| UC-VM-8-A2 | Playwright: create VN campaign, start, complete, leads listed, filtered by province | Passes; ID campaigns in same suite unchanged. See gap G-1 on how fixture leads get a province | VM-AC-9 |
| UC-VM-8-E1 | Real mode: Maps blocked, empty, or parsed zero cards | Zero leads, no `[Test data]` or invented leads; campaign result per existing failure rules | CLAUDE.md invariant, VM-NFR-6 |
| UC-VM-8-E2 | Fixture leads | Never contactable (no phone, no website, labelled) | VM-FR-22 |
| UC-VM-8-EC1 | Automated tests | Google Maps is never contacted | VM-FR-22 |

---

## UC-VM-9: Vietnamese phone normalisation

**Actor**: System (`normalizePhone(raw, defaultCountryCode, market)`)
**Preconditions**: Market `VN`
**Trigger**: Any code path normalises a number

### Primary Flow
1. Input `0901 234 567`.
2. Separators (space, dot, dash, parentheses, `+`) removed.
3. Trunk zero replaced by `84`; output digits only: `84901234567`.

### Matrix (VN)
| ID | Input | Expected result | Refs |
|----|-------|-----------------|------|
| UC-VM-9-M1 | `+84 90 123 4567`, `84901234567`, `0901234567`, `090 123 4567`, `090.123.4567`, `090-123-4567`, `0084 901234567` | `84901234567` | VM-FR-9, VM-AC-4 |
| UC-VM-9-M2 | `+84 (0) 90 123 4567`, `+84 090 123 4567` (optional trunk zero after code) | `84901234567` | VM-FR-9, VM-AC-4 |
| UC-VM-9-M3 | Mobile prefixes 03, 05, 07, 08, 09 (for example `0351234567`, `0561234567`, `0701234567`, `0811234567`, `0901234567`) | `84` + 9 digits | VM-FR-10 |
| UC-VM-9-M4 | Landline `(028) 3822 1234`, `028 3822 1234`, `+84 28 3822 1234` | `842838221234` | VM-FR-9, VM-AC-4 |
| UC-VM-9-M5 | `1800 1234`, `1900 1234` (service) | `null` | VM-FR-10, VM-AC-4 |
| UC-VM-9-M6 | 5-digit string, empty, whitespace | `null` | VM-AC-4 |
| UC-VM-9-M7 | Too short national number (8 digits), too long (11+ national digits) | `null` (exact lengths verified by QA against the national plan) | VM-FR-9, VM-OQ numbering item |
| UC-VM-9-M8 | Letters (`0901 ABC 567`, `090123456a`) | `null` | VM-FR-9 |
| UC-VM-9-M9 | `+62 812 0000 0001` | Kept as `62812000000001`, not rewritten | VM-FR-11, VM-AC-4 |
| UC-VM-9-M10 | `+65 6123 4567`, `+1 415 555 0100` | Kept, classed `unknown`, 8-15 digit rule | VM-FR-11 |
| UC-VM-9-M11 | Hostile: 100,000 chars, 10 MB string, nested `((((`, repeated dots/spaces | Input capped at 64 chars before matching; returns `null` (or normalises the first 64 chars per documented rule); finishes within time limit; no memory blowup | VM-FR-12, VM-NFR-3 |
| UC-VM-9-M12 | Indonesian cases (`0812...`, `812...`, `+62...`) with market `ID` or no market | Every existing case unchanged | VM-FR-4, VM-AC-4, VM-NFR-1 |
| UC-VM-9-M13 | `84` bare number without `+` (`84901234567`) in `ID` market | As today (not specially treated) | VM-NFR-1 |

---

## UC-VM-10: Phone normalisation sites use the campaign market

**Actor**: System
**Preconditions**: Leads belong to campaigns with a market
**Trigger**: Save, dedupe, backfill, reachability, inbound match

### Primary Flow
1. Scraped lead of a VN campaign with phone text `(028) 3822 1234` is saved: `phoneE164 = 842838221234`.
2. Same text in an ID campaign is saved as today (`6228...`).
3. Dedupe key (`scraper.processor.ts:18`) uses the market's calling code: `0901234567` and `84901234567` in a VN run are the same lead.
4. A reply from `84901234567@s.whatsapp.net` matches the lead with that `phoneE164`.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-10-A1 | Referral/manual number entered by owner | Account `defaultCountryCode` still wins (fallback `62`), as today | VM-FR-12 |
| UC-VM-10-A2 | Legacy `phoneE164` backfill (`inbound.service.ts`) and template `reachable` check (`template.service.ts`) | Use the lead's campaign market, not the bare default | VM-FR-12 |
| UC-VM-10-A3 | Contact shares a Vietnamese number in text (`wa-text.ts`) | Recognised (`+84`/`0` forms) in addition to `+62`/`08...` | VM-FR-12 |
| UC-VM-10-A4 | Website enrichment finds a `+84...` number | Stored per existing `"+" + digits` rule, normalised without damage `[ARCH: market-aware?]` | VM-FR-12 |
| UC-VM-10-A5 | Same number in an ID and a VN campaign of one workspace | Treated per existing dedupe scope (per workspace/campaign as today); no cross-market rewrite | VM-FR-5, VM-FR-12 |
| UC-VM-10-E1 | Lead of an old campaign (market `ID`) | Unchanged results | VM-NFR-1 |
| UC-VM-10-E2 | `phoneFromJid` of an `84...` JID (8-15 digits) | Accepted as today | VM-AC-6 |
| UC-VM-10-EC1 | Campaign market changed while draft (UC-VM-3) | No leads exist yet, so no stored number depends on the old market | VM-OQ-5 |

---

## UC-VM-11: Phone kind and WhatsApp capability

**Actor**: Workspace member (Outbox, lead list)
**Preconditions**: Leads with `phoneE164` in a VN campaign
**Trigger**: Selecting leads for WhatsApp drafts / viewing reachability

### Primary Flow
1. `phoneKind(e164, "VN")` is computed (never stored).
2. `84901234567` -> `mobile` (WhatsApp-capable heuristic): offered for bulk selection; real check stays `onWhatsApp()` at send time.
3. `842838221234` -> `landline`: lead is stored but not selectable for WhatsApp bulk drafts; reason "landline: cannot be reached on WhatsApp" shown in the Outbox lead list and lead detail; `reachable` is false.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-11-A1 | Prefix table: 03/05/07/08/09 -> `mobile`; 02x -> `landline`; 1800/1900 -> `service` (never reaches storage because normalise returns null) | As listed | VM-FR-10, VM-AC-5 |
| UC-VM-11-A2 | `ID` numbers | `unknown`, no filtering, existing behaviour | VM-FR-10, VM-AC-5 |
| UC-VM-11-A3 | International `+65...` in VN campaign | `unknown`; not blocked | VM-FR-11 |
| UC-VM-11-A4 | Landline lead has an email | Still usable on the email channel; status text names the other channel; skipped for WhatsApp with a clear status, not an error | VM-FR-10 |
| UC-VM-11-E1 | Mobile number not on WhatsApp | Approve/send flow as today: `resolve` fails at send time, message failed with existing reason; no pre-send network call added | VM-FR-10, VM-NFR-4 |
| UC-VM-11-E2 | Landline lead forced into a draft via API | Approve path still enforces opt-out and existing checks; WhatsApp send of a landline is refused/unreachable `[ARCH: where enforced]` | VM-FR-10 |
| UC-VM-11-EC1 | Lead without phone | `unknown`/no phone, existing "no phone" status | VM-FR-17 |
| UC-VM-11-EC2 | Email-channel queries on `outbound_messages` | WhatsApp code keeps `channel: "whatsapp"` filter | CLAUDE.md invariant |

---

## UC-VM-12: Lead scoring with WhatsApp capability

**Actor**: System (`LeadIntelligenceService`)
**Preconditions**: Lead with phone, campaign market known
**Trigger**: Scoring a scraped lead

### Primary Flow
1. VN lead with mobile `84901234567`: +15 phone factor awarded (weight unchanged).
2. VN lead with landline `842838221234`: no phone points; factor text "Landline: cannot be reached on WhatsApp".

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-12-A1 | ID lead with any phone | +15 as today; scores byte-identical | VM-FR-17, VM-NFR-1 |
| UC-VM-12-A2 | VN lead without phone | Factor text "No phone number" as today | VM-FR-17 |
| UC-VM-12-A3 | Address +3 and other factors | Unchanged | VM-FR-17 |
| UC-VM-12-A4 | `FitService` with a Vietnamese brief | Unchanged code, works per section 1 | VM-FR-17 |
| UC-VM-12-E1 | No city/industry weights introduced | Code review/grep gate: no `Jakarta`, `Hồ Chí Minh`, `Rp` weights | VM-FR-17, CLAUDE.md |
| UC-VM-12-EC1 | International number in VN campaign (`unknown`) | Treated as reachable (as `unknown` for ID) `[ARCH]` | VM-FR-11, VM-FR-17 |

---

## UC-VM-13: Region from geocoder for Vietnam

**Actor**: System (`GeoService`, `regionFromNominatim`)
**Preconditions**: Lead with coordinates, geocoder enabled, market VN
**Trigger**: Lead saved / geocoded

### Primary Flow
1. Nominatim `reverse` is called with `accept-language=vi` (profile `geocoderLanguage`); rate limit 1 per 1.1 s and 0.005-degree cache unchanged.
2. Answer `country_code: "vn"`, state `Thành phố Hồ Chí Minh`.
3. Result `province = "Hồ Chí Minh"` (prefix `Thành phố`/`Tỉnh` removed); `regency`/`district` per architect `[ARCH, VM-OQ-3]`: recommendation `regency` = former district (`quận`/`huyện`) if returned else empty, `district` = ward/commune.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-13-A1 | `Tỉnh Đồng Nai` | `Đồng Nai` | VM-FR-13 |
| UC-VM-13-A2 | Pre-merger name returned by older data (e.g. a district formerly in Bình Dương) | Mapped to current unit only if covered by the verified mapping; else kept as returned | VM-FR-14 |
| UC-VM-13-A3 | Dataset header cites official resolution, effective date (1 July 2025), access date | Test asserts header exists; list not shipped before verification | VM-FR-14, VM-AC-8 |
| UC-VM-13-A4 | ID answer (`country_code: "id"`) | Behaves as today incl. Jakarta/Yogyakarta special cases; `accept-language=id` | VM-FR-4, VM-FR-13, VM-AC-8 |
| UC-VM-13-E1 | `country_code: "ke"` (or any other) | `null` | VM-AC-8 |
| UC-VM-13-E2 | Unknown region (no state/province, or name not in dataset) | Name kept as returned if present, else `null`; lead saved without region, no error | VM-FR-13 |
| UC-VM-13-E3 | `GEOCODER_DISABLED=true` or Nominatim failure | No region, lead still saved | VM-NFR-4 |
| UC-VM-13-EC1 | Missing `country_code` | Passes through as today for ID; for VN follows same rule `[ARCH]` | VM-FR-13 |
| UC-VM-13-EC2 | No extra network call per lead | Verified by cache/rate tests unchanged | VM-NFR-4 |

---

## UC-VM-14: Region filter and map for Vietnamese leads

**Actor**: Workspace member (Leads page)
**Preconditions**: Leads exist with VN regions
**Trigger**: Opens leads, applies region filter

### Primary Flow
1. Region filter lists regions present in the lead set (province, regency, district), including Vietnamese names.
2. `GET /leads?province=Hồ Chí Minh` returns matching leads of the caller's workspace.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-14-A1 | Province list before any lead has one | Lists provinces from the bundled dataset | VM-FR-13 |
| UC-VM-14-A2 | Labels for the three levels | Unchanged unless the architect relabels for VN `[ARCH]` | VM-FR-15, VM-OQ-3 |
| UC-VM-14-A3 | Map: leads with coordinates | Centres on first lead with coordinates (existing) | VM-FR-15 |
| UC-VM-14-A4 | Map: workspace whose leads are all VN with no coordinates | Centres on Hồ Chí Minh City; otherwise Jakarta (unchanged). See contradiction C-4 | VM-FR-15 |
| UC-VM-14-E1 | Filter by region of another workspace | No cross-workspace rows | VM-NFR-2 |
| UC-VM-14-EC1 | Filter value with accents typed with/without diacritics | Exact match as stored (no new fuzzy behaviour required) | VM-FR-15 |

---

## UC-VM-15: Quiet hours and timezone default

**Actor**: Workspace owner / system
**Preconditions**: Workspace with or without WhatsApp/email account
**Trigger**: Account created, panel opened, email sent with no account

### Primary Flow
1. A new `WhatsappAccount`/`EmailAccount` is created for a workspace whose campaigns are VN.
2. Timezone default is `Asia/Ho_Chi_Minh` (VM-OQ-2: stored at creation if the architect finds it cheap, else shown as the panel's initial value only and applied as email fallback).
3. Quiet hours (21:00-07:00 WhatsApp, email UI default 20-7) unchanged; owner edits as today; API validates timezone with `Intl.DateTimeFormat`.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-15-A1 | Existing accounts | Stored values unchanged | VM-FR-16, VM-AC-13 |
| UC-VM-15-A2 | ID workspace / no campaigns | `Asia/Jakarta` as today | VM-FR-4, VM-FR-16 |
| UC-VM-15-A3 | Email send with no account and known VN market | Fallback `Asia/Ho_Chi_Minh` instead of `Asia/Jakarta`; hours effectively identical (both UTC+7, no DST) | VM-FR-16 |
| UC-VM-15-A4 | Workspace with both ID and VN campaigns | Rule uses the market of the first campaign, owner can edit; no auto change later (account timezone per workspace) | VM-FR-5, VM-FR-16, C-2 |
| UC-VM-15-A5 | `send-policy.ts` `decide()` tests | Unchanged and passing | VM-AC-13 |
| UC-VM-15-E1 | `PATCH /messaging/account` or `/email/account` with `timezone: "Mars/Base"` | 400 as today | VM-FR-16 |
| UC-VM-15-EC1 | Send at 22:00 UTC+7 | Held by quiet hours identically for either zone name | VM-FR-16 |

---

## UC-VM-16: UI strings in English and Vietnamese

**Actor**: Developer / user
**Preconditions**: Market UI built
**Trigger**: Build and render

### Primary Flow
1. All new strings (market label/hint, placeholders, help text, landline reason, panel notice, compliance line, market names) exist in the `en` dictionary and in `vi`.
2. Compile-time rule: Vietnamese must define every key; `tsc --noEmit` on web fails otherwise.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-16-A1 | Market names | `Indonesia` / `Việt Nam` as proper nouns in both languages | VM-FR-20 |
| UC-VM-16-A2 | Server components | Import only from `lib/i18n/lang.ts` | VM-FR-20 |
| UC-VM-16-E1 | Missing `vi` key | Typecheck failure (gate) | VM-FR-20, VM-AC-10 |
| UC-VM-16-EC1 | Indonesian-language UI keys (`id.ts`) | Existing compile rule: id dictionary also defines every key if still present | VM-FR-20 |

---

## UC-VM-17: WhatsApp panel `defaultCountryCode` notice

**Actor**: Workspace owner
**Preconditions**: At least one `VN` campaign; WhatsApp account `defaultCountryCode = "62"`
**Trigger**: Opens Outbox WhatsApp panel

### Primary Flow
1. Panel shows a one-line notice: scraped leads use the campaign's market; this field applies to numbers typed by hand.
2. Saved value is not rewritten.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-17-A1 | Code already `84` or no VN campaign | No notice | VM-FR-21 |
| UC-VM-17-A2 | Owner edits code and timezone | Editable as today | VM-FR-21, VM-FR-16 |
| UC-VM-17-E1 | No WhatsApp account yet | No notice, panel as today | VM-FR-21 |

---

## UC-VM-18: Migration

**Actor**: DevOps
**Preconditions**: Scratch database (the shared dev database is not touched by the slice)
**Trigger**: `db:deploy` / `prisma migrate`

### Primary Flow
1. Migration adds `campaigns.market TEXT NOT NULL DEFAULT 'ID'`.
2. Existing campaign rows read `ID`; no data rewrite; no table lock beyond the additive column.
3. `prisma migrate diff` shows no drift; Prisma client regenerated.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-18-A1 | Migration folder contains commented reverse SQL `ALTER TABLE "campaigns" DROP COLUMN "market"` | Reverse restores previous schema | VM-FR-23, VM-AC-12 |
| UC-VM-18-A2 | Insert via old code path (no market) | Default `ID` applies | VM-NFR-5 |
| UC-VM-18-E1 | Negative control (introduce drift) | `migrate diff` exits non-zero | VM-FR-23 |
| UC-VM-18-EC1 | No new columns on `leads`, `whatsapp_accounts`, `email_accounts` (unless architect adds a default for VM-OQ-2) | Confirmed by diff | VM-FR-5, VM-OQ-6 |

---

## UC-VM-19: Auth boundaries and validation

**Actor**: Unauthenticated, wrong-workspace, valid member
**Preconditions**: API running
**Trigger**: Calls to campaign, scraper and leads routes

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-19-A1 | `POST /campaigns` without token | 401 as today | VM-NFR-2 |
| UC-VM-19-A2 | `PATCH /campaigns/:id` without token | 401 | VM-NFR-2 |
| UC-VM-19-A3 | Campaign of another workspace: GET, PATCH, start | 404; `market` never returned outside own routes | VM-NFR-2, VM-AC-11 |
| UC-VM-19-A4 | API key auth (`ApiKeyGuard`) creating campaign with `market` | Same validation and scoping | VM-NFR-2 |
| UC-VM-19-A5 | Extra unknown properties with `market` | Stripped by `whitelist`, `market` kept if valid | VM-NFR-5 |
| UC-VM-19-A6 | Throttle (60 req/60 s) | Unchanged | VM-NFR-5 |
| UC-VM-19-E1 | Invalid `market` (see UC-VM-1-E1/E2/E3) | 400 | VM-AC-11 |
| UC-VM-19-E2 | PATCH non-draft | 409 | VM-OQ-5 |
| UC-VM-19-EC1 | Stored/queued unknown `market` | Reads as `ID`; not used in URL, prompt or SQL | VM-NFR-2 |
| UC-VM-19-EC2 | Anything opening a user URL | Still through `url-fetch.ts`/`SafeProxy`; market adds no new fetch | VM-NFR-2 |
| UC-VM-19-EC3 | Existing clients omit `market` | No request fails | VM-NFR-5 |

---

## UC-VM-20: Compliance notice for Vietnam

**Actor**: Workspace owner
**Preconditions**: Campaign form with `VN` selected
**Trigger**: Select VN

### Primary Flow
1. One static line under the Market selector warns that unsolicited commercial messages are regulated in Vietnam, names Decree 91/2020/ND-CP as a rule to review with a qualified adviser, and says it is not legal advice.
2. Nothing is blocked; approval, absolute opt-out and pacing unchanged.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-20-A1 | Language | Present in `en` and `vi` | VM-FR-20, VM-OQ-7 |
| UC-VM-20-A2 | `ID` selected | Hidden | VM-OQ-7 |
| UC-VM-20-E1 | Docs | README/USER_GUIDE section repeats it as "risk", never "compliant" or "legal" | VM-OQ-7, VM-AC-14 |
| UC-VM-20-EC1 | Decree wording unverified | Text uses "may apply" and no article numbers/penalties | VM-OQ-7 |

---

## UC-VM-21: Documentation deliverables

**Actor**: Tech writer / reviewer
**Preconditions**: Feature code done
**Trigger**: merge-ready

### Primary Flow
1. `README.md`: replace "still tuned for Indonesia" bullet; document `market` field and `SCRAPER_MODE=fixture` per market; **Simulated** label.
2. `docs/features.md`: rows for Vietnam area search/Maps parsing (**Simulated**), phone/WhatsApp capability (verified for what tests run), regions (dataset source and date); real-run requirements stated.
3. `docs/architecture.md` "Markets" section; `docs/USER_GUIDE.md` (Location rows, market block rewritten, timezone row, "Thị trường" row, comma rule, landline note); `docs/whatsapp-outbox.md` phone rules; PRD 1.8/1.14 pointers; `CHANGELOG.md` one plain-language entry (Added: Vietnam market; no Indonesian change).

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-21-A1 | Claims checked against code (endpoints, env vars, behaviour) | No unverified claim | VM-AC-14, VM-NFR-6 |
| UC-VM-21-A2 | Gates | API and web `tsc --noEmit`, API unit tests, `pipeline-check.ts`, Playwright pass | VM-AC-14 |
| UC-VM-21-E1 | Any doc says Vietnamese discovery is verified | Fails review | VM-NFR-6, VM-AC-14 |
| UC-VM-21-EC1 | Root `CLAUDE.md` invariant addition | Needs user approval; not changed by slices | PRD 2.12 |
| UC-VM-21-EC2 | No real data in docs/fixtures/changelog | Only invented examples | CLAUDE.md conventions |

---

## UC-VM-22: Regression of Vietnamese language support and Indonesian use

**Actor**: Any user; QA
**Preconditions**: Section 1 branch baseline
**Trigger**: Full test run

### Primary Flow
1. Vietnamese UI, Vietnamese drafts and language selection behave exactly as in section 1.
2. Indonesian campaign end to end (create default, start, scrape, score, send policy) is unchanged.

### Flows
| ID | Flow | Expected result | Refs |
|----|------|-----------------|------|
| UC-VM-22-A1 | Existing unit tests (732 per PRD, re-measured at slice start) | Pass unchanged | VM-NFR-1 |
| UC-VM-22-A2 | Existing Playwright specs for language and leads | Pass unchanged | VM-NFR-1, VM-AC-9 |
| UC-VM-22-A3 | Output language independent of market | Language rules of section 1 untouched | VM-FR-3 |
| UC-VM-22-A4 | English UI default market `ID` | Same as pre-feature experience | VM-OQ-9 decision |
| UC-VM-22-E1 | Any ID output differs from the snapshot | Release blocker | VM-NFR-1, VM-AC-1 |
| UC-VM-22-EC1 | Performance on 1,500-lead campaign | No measurable slowdown, no added per-lead network call | VM-NFR-4 |

---

## Traceability matrix

| Requirement | Use cases |
|-------------|-----------|
| VM-FR-1 | 1, 3, 5, 19 |
| VM-FR-2 | 4, 5, 6, 13, 15 |
| VM-FR-3 | 1, 2, 22 |
| VM-FR-4 | 5, 6, 9, 13, 15 |
| VM-FR-5 | 1, 10, 15, 18 |
| VM-FR-6 | 3, 4, 5 |
| VM-FR-7 | 6 |
| VM-FR-8 | 4, 7 |
| VM-FR-9 | 9 |
| VM-FR-10 | 9, 11 |
| VM-FR-11 | 9, 11, 12 |
| VM-FR-12 | 7, 9, 10 |
| VM-FR-13 | 13, 14 |
| VM-FR-14 | 13 |
| VM-FR-15 | 14 |
| VM-FR-16 | 15, 17 |
| VM-FR-17 | 11, 12 |
| VM-FR-18 | 2 |
| VM-FR-19 | 2, 6 |
| VM-FR-20 | 16, 20 |
| VM-FR-21 | 17 |
| VM-FR-22 | 8 |
| VM-FR-23 | 18 |
| VM-NFR-1 | 5, 8, 9, 12, 22 |
| VM-NFR-2 | 1, 4, 5, 19 |
| VM-NFR-3 | 6, 7, 9 |
| VM-NFR-4 | 11, 13, 22 |
| VM-NFR-5 | 1, 5, 18, 19 |
| VM-NFR-6 | 4, 7, 8, 21 |
| VM-AC-1 | 5, 22 |
| VM-AC-2 | 4 |
| VM-AC-3 | 6 |
| VM-AC-4 | 9 |
| VM-AC-5 | 11 |
| VM-AC-6 | 10 |
| VM-AC-7 | 7 |
| VM-AC-8 | 13 |
| VM-AC-9 | 8, 22 |
| VM-AC-10 | 1, 2, 16 |
| VM-AC-11 | 1, 3, 19 |
| VM-AC-12 | 18 |
| VM-AC-13 | 15 |
| VM-AC-14 | 7, 20, 21 |
| VM-OQ-1/2/3/4/5/6/9 | header decisions; 1, 15, 13, 6, 3, 11, 2 |
| VM-OQ-7 | 20 |
| VM-OQ-8 | 6 |

## Contradictions found in the PRD

- **C-1** `VM-FR-18` says the form default is "the market of the owner's most recent campaign; if none, `VN` when the interface language is Vietnamese". The tech-lead decision on `VM-OQ-9` is UI-language only. `VM-FR-18` and `VM-AC-10` ("the default follows VM-FR-18") must be rewritten.
- **C-2** `VM-FR-16` says the account default comes from "the first campaign" and is set at creation; `VM-OQ-2` recommends the lighter option (panel/fallback only); `VM-AC-13` asserts a **stored** default. With market per campaign and timezone per workspace, a mixed ID/VN workspace is ambiguous. Pending the architect decision, `VM-AC-13` is conditional.
- **C-3** `VM-FR-10` says `phoneKind` returns `service` for 1800/1900, but also that `normalizePhone` returns `null` for them, so `service` is unreachable for stored leads (only usable on raw input).
- **C-4** `VM-FR-15`: "The leads map default centre stays Jakarta when there are no coordinates (unchanged), except that a workspace whose leads all belong to VN campaigns centres on the first lead with coordinates (existing behaviour) and otherwise on Ho Chi Minh City." This is internally inconsistent (first lead with coordinates is not an exception; "all VN" needs a campaign join while leads have no market column).
- **C-5** `VM-AC-4` says "each of the nine shapes in VM-FR-9": VM-FR-9 lists seven mobile shapes plus two trunk-zero variants; the count only works if both trunk-zero forms are included (treated as such in UC-VM-9).
- **C-6** `VM-FR-12` requires the browser-side phone clean-up (`google-maps.scraper.ts:232`) to be market-specific, but 2.3 shows it runs inside the page and has no market input; `VM-FR-6` does not list it among the values passed in.

## Gaps

- **G-1** `VM-AC-9` requires fixture VN leads to be "filtered by province", but `VM-FR-22` says fixture leads have no phone/website and says nothing about coordinates or region; with `GEOCODER_DISABLED=true` in CI they have no province. Define whether fixture leads carry a fixed region per market.
- **G-2** Error status for PATCH on a non-draft campaign is not specified (`VM-AC-11` says only "works only while draft"); 409 assumed.
- **G-3** The Compliance notice location is not in the PRD (`VM-OQ-7` adds "no compliance claim"); placed in the form by decision above.
- **G-4** No requirement on where WhatsApp-send of a landline is blocked server-side (UI selection only is stated in `VM-FR-10`, `VM-AC-5`).
- **G-5** Behaviour for `unknown` kind (international numbers) in VN scoring and bulk selection is only implied.
- **G-6** Phone input cap: `VM-NFR-3` says 64 characters; `VM-FR-12` says "documented length"; behaviour above the cap (reject vs truncate) is unspecified. UC-VM-9-M11 accepts either if documented.
- **G-7** Website enrichment (`enrichment.service.ts`, `contact-extract.ts` `+digits`) and contact-page keywords (`liên hệ`, `giới thiệu`, 2.3) have no FR; no UC beyond UC-VM-10-A4.
- **G-8** Cross-market duplicate behaviour of one number in an ID and a VN campaign is unspecified.
- **G-9** Cloning or re-running a started campaign with a different market (since market is locked after draft) has no requirement.
- **G-10** `VM-FR-19` places the `ID` location placeholder in both languages; the English/Vietnamese UI variants for ID are unspecified.
