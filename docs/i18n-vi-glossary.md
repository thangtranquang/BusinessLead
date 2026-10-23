# Vietnamese glossary and style guide (UI dictionaries)

One Vietnamese term per product concept, so that every screen, the AI prompts and the documentation say the same thing. The dictionaries are `apps/web/src/lib/i18n/vi.ts` and `features-*.vi.ts`; English (`en.ts`, `features-*.en.ts`) is the source of truth and Vietnamese must define every key (enforced by the type and by `tests/e2e/i18n-dictionaries.spec.ts`).

Status: first translation, **not yet reviewed by a native speaker** (release gate, see the QA checklist 3.6 item 11). Terms marked (?) are the ones the reviewer should look at first.

## Register and style rules

| Rule | Decision |
|------|----------|
| Second person in UI text | `bạn` (neutral, polite). Often dropped where Vietnamese reads better without it ("Cài đặt tài khoản", not "Cài đặt tài khoản của bạn"). Never `mày`, `tớ`, slang or abbreviations such as `ko`, `dc`. |
| First person | Avoided. When needed (rare) `chúng tôi`. |
| Capitalisation | Sentence case for buttons, labels, headings and tabs: only the first word and proper nouns are capitalised ("Tạo chiến dịch mới", not "Tạo Chiến Dịch Mới"). |
| Length | Short verb-first buttons ("Lưu", "Duyệt", "Soạn bản nháp"). Do not add words only to match English length. |
| Diacritics | Always present, NFC (precomposed) characters. Modern tone placement: `hủy`, `thủy`, `khỏe`, `hòa`. |
| Placeholders | `{name}` tokens are copied exactly from English, including the template tokens `{nama}` and `{kategori}` (kept on purpose, PRD OQ-5). Their position may move to follow Vietnamese word order. |
| Punctuation | Same as English: straight quotes `"..."`, ellipsis character or three dots exactly as in the English source, `·` and `→` kept. No space before `, . : ; ! ?`. |
| Units | `{n} leads` becomes `{n} khách hàng tiềm năng`; hours are written `giờ`; Vietnamese has no plural form, so keys ending in `_plural` carry the same wording as the singular key. |
| Emoji | Kept exactly as in English. |
| Words never to leave in Indonesian | `Simpan`, `Hapus`, `Kampanye`, `Pelanggan`, `Pesan`, `Kirim`, `Batal`, `Cari`, `Tambah`, `Pengaturan`, `Bahasa`, `Anda`, `Kak` (the spec fails on them). |
| `anh/chị` | Not used in UI text (the UI speaks to the owner as `bạn`). `anh/chị` is the form AI drafts use for the **customer** (PRD FR-22); it appears in prompts, the opt-out line and the email footer, not in these dictionaries. |

## Product names (kept as they are)

`Prospex`, `WhatsApp`, `Outbox` (the review-and-send area; see the term table), `Pipeline` (the CRM board), `CRM`, `Google Maps`, `Gmail`, `Telegram`, `Zapier`, `n8n`, `Make`, `Swagger`, `API`, `REST`, `SMTP`, `LinkedIn`, `OpenAI`, `QR`, `CSV`, `WABA`, `STOP` (the literal word customers reply with), `PPN` (Indonesian VAT, market data), `alatpintar.id`.

## Term table

| English concept | Vietnamese | Notes |
|-----------------|------------|-------|
| lead | khách hàng tiềm năng | Long, but the clearest. Used in sentences, headers and counts alike; no abbreviation. |
| campaign | chiến dịch | |
| outbox | Outbox | Kept as a product name (PRD FR-5, checklist item 4). Alternative if the reviewer prefers a translation: `Hộp thư đi` (?). |
| draft (noun) | bản nháp | "soạn" for the action: "Soạn bản nháp" = Write drafts. |
| approve / approved | duyệt / đã duyệt | "Duyệt tất cả {n}" = Approve all. |
| reject | từ chối | |
| review (tab: items to review) | Chờ duyệt | |
| queue | Hàng đợi | |
| sent | Đã gửi | |
| needs attention | Cần chú ý | |
| follow-up | liên hệ lại | Noun use: "tin liên hệ lại"; label: "Liên hệ lại" (?). |
| reply (verb/noun), replied | trả lời, đã trả lời | "Tỷ lệ trả lời" = Reply rate. |
| first message | Tin nhắn đầu tiên | |
| message | tin nhắn | |
| conversation | cuộc trò chuyện | |
| opt-out / opted out | từ chối nhận tin / đã từ chối nhận tin | The customer-facing keyword stays `STOP`. |
| pipeline (CRM board) | Pipeline | Kept as the board's name (PRD FR-5). |
| funnel | phễu | "Phễu CRM". |
| CRM status | trạng thái CRM | |
| status labels | Mới, Đã liên hệ, Đã trả lời, Hẹn gặp, Đề xuất, Thắng, Thua, Quan tâm | New, Contacted, Replied, Meeting, Proposal, Won, Lost, Interested. `Hẹn gặp` = Meeting, `Đề xuất` = Proposal (?). "Recommendation" is `Khuyến nghị`, so the two never clash. |
| deal | thương vụ | "Thương vụ đang mở" = Open deals; "Thương vụ thắng" for deals won. |
| knowledge base | cơ sở kiến thức | |
| source (knowledge / material) | nguồn | |
| AI Style | Phong cách AI | |
| marketing brief / brief | brief marketing / brief | Loanword used by Vietnamese marketers (?). Page title "Brief marketing". |
| workspace | không gian làm việc | One per business. |
| template (message template) | mẫu | "Một tin nhắn cho nhiều khách hàng tiềm năng" is the bulk-template screen. |
| dashboard | Tổng quan | |
| analytics | Phân tích | |
| integrations | Tích hợp | |
| settings | Cài đặt | |
| sign in / sign out / sign up | Đăng nhập / Đăng xuất / Đăng ký | |
| save / cancel / delete / edit / retry | Lưu / Hủy / Xóa / Chỉnh sửa / Thử lại | |
| search | Tìm kiếm (button), `Tìm ...` in placeholders | |
| score, fit | điểm, độ phù hợp | "Điểm AI" = AI Score. |
| priority (High / Medium / Low) | ưu tiên (Cao / Trung bình / Thấp) | |
| scraping | thu thập dữ liệu | |
| file | tệp | "Chọn tệp", "tệp zip". Not `file`. |
| website | website | Loanword kept ("Đọc website"). |
| offer (brief section) | Ưu đãi | (?) May read as a discount; alternative `Chào bán`. |
| voice / tone (brief) | Giọng thương hiệu / Giọng điệu | |
| recommendation | Khuyến nghị | |
| plan, subscription, licence, key | gói, gói đăng ký, giấy phép, khóa | |
| quiet hours | giờ không gửi tin | "Không gửi từ (giờ)". |
| region levels | Tỉnh / thành phố, Quận / huyện, Phường / xã | Vietnamese administrative levels used for the three area filters (?). |
| chars (characters) | ký tự | |

## Sample sentences (the pattern new strings should follow)

- "Nothing is sent without your approval." -> "Không có tin nào được gửi nếu bạn chưa duyệt."
- "{n} drafts waiting for your review" -> "{n} bản nháp đang chờ bạn xem"
- "Could not load the Outbox" -> "Không tải được Outbox"

## Not in these dictionaries (covered by later slices and the prompts)

The WhatsApp opt-out line, the email footer, the unsubscribe pages and canned replies use `anh/chị` and `Trân trọng,` (PRD FR-22, FR-29, FR-34, FR-42). They are reviewed together with this glossary (QA checklist 3.6 items 5 to 9) and must use the same terms: `bản nháp`, `duyệt`, `từ chối nhận tin`, `STOP`.
