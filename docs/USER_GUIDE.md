# Prospex: Hướng dẫn sử dụng

Hướng dẫn đầy đủ về cách dùng Prospex, từ cài đặt đến thương vụ đầu tiên được chốt.

> **Về các tên trên màn hình.** Hướng dẫn này trích tên nút, tab và nhãn đúng như giao diện tiếng Việt đang hiển thị (bật bằng nút **VI** ở đầu trang). Nếu bạn dùng giao diện tiếng Anh (**EN**), các tên đó nằm ở từ điển `apps/web/src/lib/i18n/en.ts`. Bản dịch tiếng Việt của giao diện và của hướng dẫn này **chưa được người bản ngữ rà soát**; nếu thấy chỗ nào chưa tự nhiên, hãy báo qua issue.

---

## Mục lục

1. [Cài đặt và thiết lập](#1-cài-đặt-và-thiết-lập)
2. [Cấu hình nhà cung cấp AI](#2-cấu-hình-nhà-cung-cấp-ai)
3. [Tạo chiến dịch](#3-tạo-chiến-dịch)
4. [Theo dõi tiến trình thu thập dữ liệu](#4-theo-dõi-tiến-trình-thu-thập-dữ-liệu)
5. [Quản lý khách hàng tiềm năng](#5-quản-lý-khách-hàng-tiềm-năng)
6. [Brief marketing](#6-brief-marketing)
7. [Phong cách AI: tin nhắn mang giọng văn của bạn](#7-phong-cách-ai-tin-nhắn-mang-giọng-văn-của-bạn)
8. [Outbox và WhatsApp](#8-outbox-và-whatsapp)
9. [Pipeline CRM](#9-pipeline-crm)
10. [Phân tích](#10-phân-tích)
11. [Xuất danh sách khách hàng tiềm năng](#11-xuất-danh-sách-khách-hàng-tiềm-năng)
12. [Cài đặt và khóa API](#12-cài-đặt-và-khóa-api)
13. [Khắc phục sự cố](#13-khắc-phục-sự-cố)

---

## 1. Cài đặt và thiết lập

### Yêu cầu

- Node.js 20+ (khuyến nghị 22 LTS)
- pnpm 9+: `npm install -g pnpm`
- Docker Desktop

> **Công nghệ:** Next.js 16, NestJS 10, PostgreSQL 16, Redis 7

### Các bước cài đặt

```bash
# Tải mã nguồn
git clone https://github.com/asiifdev/business-leads-ai-automation.git
cd business-leads-ai-automation

# Cài mọi thư viện
pnpm install

# Sao chép tệp cấu hình
cp .env.example apps/api/.env
cp .env.example packages/database/.env
```

Chỉnh `apps/api/.env`, tối thiểu cần:

```env
DATABASE_URL="postgresql://prospex:prospex@localhost:5432/prospex"
OPENAI_API_KEY=sk-your-key-here   # có thể để trống: các tính năng AI tắt, thu thập dữ liệu và chấm điểm vẫn chạy
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small   # cho Phong cách AI và cơ sở kiến thức
```

### Chạy hạ tầng

```bash
# Khởi động PostgreSQL (có pgvector) và Redis
docker compose up -d

# Áp dụng các migration của cơ sở dữ liệu
pnpm --filter @prospex/database db:deploy
pnpm --filter @prospex/database exec prisma generate

# Cài trình duyệt để thu thập dữ liệu Google Maps và đọc website (chỉ một lần)
pnpm --filter @prospex/api exec playwright install chromium
```

> **Nâng cấp từ bản cũ dùng tiếng Indonesia?** Xem mục "Upgrade notes" trong [README](../README.md#language): lệnh `db:deploy` ở trên cũng áp dụng migration đổi ngôn ngữ mặc định sang tiếng Việt, và các chiến dịch cũ đang lưu `indonesian` sẽ được hiểu là tiếng Anh.

### Chạy ứng dụng

Mở hai terminal:

```bash
# Terminal 1: API backend (cổng 3001)
pnpm --filter @prospex/api dev

# Terminal 2: giao diện web (cổng 3000)
pnpm --filter @prospex/web dev
```

Mở trình duyệt: **http://localhost:3000**

### Ngôn ngữ giao diện

Ở đầu trang và ở trang đăng nhập có nút chọn **EN | VI**. Lựa chọn được lưu trong một cookie của trình duyệt; khi chưa chọn gì, giao diện hiện tiếng Anh. Ngày giờ và số tự đổi theo ngôn ngữ đã chọn. Đây chỉ là ngôn ngữ của giao diện: ngôn ngữ mà AI dùng để soạn tin nhắn được chọn riêng cho từng chiến dịch (xem [mục 3](#ngôn-ngữ-soạn-tin)).

---

## 2. Cấu hình nhà cung cấp AI

Prospex hỗ trợ mọi nhà cung cấp AI tương thích API OpenAI. Soạn bản nháp cần **mô hình chat**, còn Phong cách AI và cơ sở kiến thức cần thêm **mô hình embedding** (`EMBEDDING_MODEL`).

> **Hai nơi để cấu hình AI.** Tệp `.env` của máy chủ (`OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, `EMBEDDING_MODEL`) áp dụng cho mọi không gian làm việc và cần khởi động lại API. Trong **Cài đặt**, tab **AI và khóa API**, mục **Cấu hình AI**, mỗi không gian làm việc có thể lưu khóa, mô hình, mô hình embedding và URL gốc riêng; cấu hình này thay thế `.env` chỉ cho không gian đó và có hiệu lực ngay, không cần khởi động lại. Không gian làm việc chưa có khóa riêng sẽ dùng `.env`.

### OpenAI

```env
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
```

### OpenRouter (truy cập Claude, Gemini, Llama, v.v.)

```env
OPENAI_API_KEY=sk-or-v1-...
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=anthropic/claude-haiku-4-5
```

OpenRouter không có mô hình embedding phù hợp cho mọi mô hình, nên hãy kiểm tra `EMBEDDING_MODEL` bạn chọn có sẵn hay không.

### Ollama (chạy cục bộ, miễn phí, không cần mạng)

```bash
ollama pull gemma4              # mô hình chat
ollama pull qwen3-embedding     # mô hình embedding
```

```env
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
OPENAI_MODEL=gemma4
EMBEDDING_MODEL=qwen3-embedding
```

Mô hình chạy cục bộ mất khoảng 40 giây cho mỗi bản nháp (tùy máy). Các cuộc trò chuyện của bạn không rời khỏi máy.

> **Khi chưa có khóa AI:** thu thập dữ liệu, chấm điểm (theo quy tắc), CRM, phân tích và xuất dữ liệu vẫn hoạt động đầy đủ. Các tính năng AI (soạn bản nháp, Phong cách AI, cơ sở kiến thức) không hoạt động. Prospex không điền sẵn văn bản mẫu thay cho AI.

> **Về chất lượng tiếng Việt.** Văn bản tiếng Việt do AI viết được kiểm tra bằng mã (đủ dấu, xưng hô lịch sự "anh/chị", không dùng tiếng lóng, có từ để hỏi, số như "2.000.000đ" và "4,5 sao"), nhưng mới được thử với câu trả lời giả lập, chưa thử với một mô hình thật, và chưa được người bản ngữ rà soát. Hãy đọc kỹ từng bản nháp trước khi duyệt.

---

## 3. Tạo chiến dịch

Chiến dịch là đơn vị làm việc chính của Prospex. Một chiến dịch là một đợt tìm khách hàng tiềm năng.

### Cách nhanh: để AI điền biểu mẫu

Trang **Chiến dịch mới** mở ra với phần **Tài liệu nguồn** ở bên trái. Tại đây bạn đưa cho AI tài liệu để hiểu sản phẩm hoặc dịch vụ của bạn:

| Nguồn | Cách làm | Ghi chú |
|-------|----------|---------|
| **Website** | Nhập địa chỉ chính, ví dụ `https://www.example.com`, rồi bấm **Đọc website** | Chỉ cần địa chỉ chính. Prospex đọc `llms.txt`, sitemap và các liên kết ở trang chủ, tối đa 40 trang, và mở những trang cần JavaScript bằng một trình duyệt thật. Quá trình chạy ngầm; trạng thái hiện trong danh sách nguồn. |
| **Văn bản** | Tab *Văn bản*, đặt tiêu đề, dán nội dung (bảng giá, câu hỏi thường gặp, mô tả) | Tối thiểu 30 ký tự |
| **Tệp** | Tab *Tệp*, chọn `.pdf`, `.docx`, `.md` hoặc `.txt` | PDF và DOCX tối đa 10 MB (PDF tối đa 60 trang); tệp văn bản 1 MB. PDF dạng ảnh quét (không có chữ) bị từ chối: hãy dán nội dung vào. |

Sau đó đánh dấu các nguồn muốn dùng (nguồn vừa thêm tự được đánh dấu), thêm ghi chú nếu cần (ô **Điều gì khác AI nên biết (không bắt buộc)**), rồi bấm **Phân tích bằng AI và điền biểu mẫu**. Quá trình chạy ngầm và mất vài phút với mô hình cục bộ (khoảng 3 đến 7 phút với gemma4): nút hiện "Đang phân tích, bước 1/3" và bạn có thể rời trang rồi quay lại. Nếu đã từng tạo brief, nút **Điền từ brief đã lưu của tôi (tức thì)** điền biểu mẫu ngay mà không chạy lại AI; chỉ phân tích lại khi các nguồn thay đổi.

Kết quả:

- Biểu mẫu bên phải được điền: tên chiến dịch, loại hình doanh nghiệp mục tiêu, địa điểm, từ khóa tìm kiếm, mô tả dịch vụ, phong cách nội dung và ngôn ngữ. Mỗi trường do AI điền có nhãn **AI đã điền, vui lòng kiểm tra**.
- Phần không xác định được từ nguồn (thường là địa điểm) được **để trống** và liệt kê trong hộp "Không tìm thấy trong các nguồn của bạn, nên để bạn tự điền:".
- Trường bạn đã tự gõ **không bao giờ bị ghi đè**.
- Kiểm tra tất cả, sửa chỗ chưa đúng, rồi bấm **Bắt đầu chiến dịch**.

Kết quả phân tích được lưu thành **Brief marketing** ([mục 6](#6-brief-marketing)), cũng được dùng khi AI đánh giá khách hàng tiềm năng và soạn bản nháp.

### Tự điền biểu mẫu

Bạn vẫn có thể điền biểu mẫu mà không cần nguồn:

| Trường | Ví dụ | Ghi chú |
|--------|-------|---------|
| Tên chiến dịch | "Cho thuê máy ảnh Quý 4 2026" | Tên để nhận biết |
| Loại hình doanh nghiệp mục tiêu | cho thuê máy ảnh | **Loại hình doanh nghiệp bạn muốn tìm**, không phải ngành của chính bạn. Văn bản tự do; không có danh sách cố định vì danh mục Google Maps rất đa dạng. |
| Địa điểm | một thành phố | Thành phố hoặc khu vực mục tiêu. Nhiều khu vực ngăn cách bằng dấu phẩy, dấu chấm phẩy, `/`, `&`, `+`, "dan" hoặc xuống dòng. Thành phố bạn gõ được tìm đúng ở thành phố đó (kết quả cách trung tâm hơn khoảng 50 km bị loại). Gõ **Seluruh Indonesia** để chạy một lượt tìm cho mỗi thành phố của Indonesia, bắt đầu từ thành phố lớn nhất. |
| Từ khóa tìm kiếm | "thuê máy ảnh" | Như bạn gõ trên Google Maps. Có thể nhiều từ khóa. |
| Dịch vụ / sản phẩm của bạn | "Phần mềm quản lý cho thuê dành cho cửa hàng cho thuê máy ảnh" | Điều bạn cung cấp cho các khách hàng tiềm năng này |
| Số kết quả tối đa | 20 | Số khách hàng tiềm năng mục tiêu (10 đến 1.500 trên biểu mẫu; API nhận đến 2.000). Với mục tiêu lớn, dùng "Seluruh Indonesia" và nhiều từ khóa. Chiến dịch dừng ngay khi đạt mục tiêu. |
| Phong cách nội dung | Cân bằng | Chuyên nghiệp / Thân thiện / Cân bằng / Thoải mái |
| Ngôn ngữ | Tiếng Việt | Ngôn ngữ của bản nháp tin nhắn (xem bên dưới) |

Bấm **Bắt đầu chiến dịch**: hệ thống bắt đầu tìm trên Google Maps và chấm điểm kết quả ngay.

> **Giới hạn hiện tại về thị trường.** Phần tìm kiếm Google Maps (ngôn ngữ trình duyệt, danh sách thành phố và khu vực, mã quốc gia điện thoại mặc định `62`) vẫn được điều chỉnh cho thị trường Indonesia và chưa được kiểm thử riêng cho Việt Nam. Hỗ trợ tiếng Việt hiện chỉ áp dụng cho giao diện và cho văn bản AI soạn; Prospex chưa tự tìm khách hàng tiềm năng tại Việt Nam một cách đã được kiểm chứng.

### Ngôn ngữ soạn tin

Trường **Ngôn ngữ** của chiến dịch quyết định ngôn ngữ AI dùng cho mọi thứ của chiến dịch đó: tin nhắn đầu tiên, tin liên hệ lại, bản nháp trả lời, tiêu đề và chân thư email. Hai lựa chọn là **Tiếng Việt** (mặc định) và **Tiếng Anh** (trong giao diện tiếng Anh: Vietnamese và English).

- Mặc định là tiếng Việt. Khi biểu mẫu được điền từ brief đã lưu, trường này lấy ngôn ngữ của brief; bạn luôn có thể đổi lại trước khi bắt đầu.
- Chiến dịch cũ lưu `indonesian` được hiểu là **tiếng Anh**; chiến dịch không bị sửa, bạn chỉ cần tạo chiến dịch mới để soạn bằng tiếng Việt.
- Khách hàng có thể trả lời bằng bất kỳ ngôn ngữ nào: lời từ chối nhận tin và ý định của câu trả lời được hiểu bằng tiếng Việt, tiếng Anh và tiếng Indonesia.

### Mẹo chọn từ khóa

- Gọi tên loại hình kinh doanh như cách Google Maps ghi: `"cửa hàng điện thoại"`, `"phòng khám nha khoa"`, `"cho thuê xe"`.
- Đừng dùng tên dịch vụ của chính bạn (`"dịch vụ thiết kế website"`) hay chức danh (`"giám đốc vận hành"`): đó là những đơn vị cùng làm dịch vụ hoặc là con người, không phải doanh nghiệp được tìm trên Maps. Prospex loại những mục như vậy khỏi gợi ý của AI.
- Thêm vài từ khóa để phủ rộng hơn.
- Cụ thể về vị trí: `"salon làm đẹp quận 1"` tốt hơn `"salon"`.

### Điều kiện thu thập dữ liệu

Việc thu thập dữ liệu dùng trình duyệt Chromium trên máy chủ. Cài một lần bằng `pnpm --filter @prospex/api exec playwright install chromium`. Nếu thiếu trình duyệt hoặc lượt tìm thất bại, chiến dịch có trạng thái **Thất bại** kèm thông báo rõ ràng. Prospex không bao giờ lấp danh sách khách hàng tiềm năng bằng những doanh nghiệp bịa ra.

---

## 4. Theo dõi tiến trình thu thập dữ liệu

Sau khi tạo chiến dịch, trang chi tiết chiến dịch hiển thị tiến trình theo thời gian thực.

### Trạng thái chiến dịch

| Trạng thái | Màu | Ý nghĩa |
|------------|-----|---------|
| Bản nháp | Xám | Chưa bắt đầu |
| Đang chạy | Xanh dương, có vòng quay | Đang thu thập dữ liệu và chấm điểm |
| Hoàn tất | Xanh lá | Xong, đã có khách hàng tiềm năng |
| Thất bại | Đỏ | Thất bại. Nguyên nhân được hiển thị (ví dụ chưa cài trình duyệt); xem thêm log của API |

### Thanh tiến trình

Tiến trình tự cập nhật mỗi 2 giây:

- **0–30%**: khởi tạo và thu thập dữ liệu
- **30–60%**: chấm điểm tất cả khách hàng tiềm năng
- **60–95%**: đánh giá mức độ phù hợp của từng doanh nghiệp với ưu đãi của bạn (cần nhà cung cấp AI) và chuẩn bị ghi chú email và gọi điện cho khách hàng tiềm năng ưu tiên **Cao**
- **100%**: hoàn tất

---

## 5. Quản lý khách hàng tiềm năng

### Trang Khách hàng tiềm năng

Vào **Khách hàng tiềm năng** ở thanh bên để xem tất cả khách hàng tiềm năng của mọi chiến dịch.

**Bộ lọc có sẵn:**

- Ô tìm kiếm: tên, địa chỉ, số điện thoại (gõ "0812" cũng tìm ra số được lưu dạng 62812), website, email, danh mục và khu vực
- **Ưu tiên**: Cao / Trung bình / Thấp
- **Trạng thái CRM**: Mới / Đã liên hệ / Đã trả lời / Quan tâm / Hẹn gặp / Đề xuất / Thắng / Thua
- **Tỉnh / thành phố, Quận / huyện và Phường / xã**: được tính từ tọa độ của từng khách hàng tiềm năng (địa chỉ Google Maps hiếm khi nêu thành phố). Nút **Xác định khu vực của N khách hàng tiềm năng** chạy việc này ngầm; khách hàng tiềm năng từ lần thu thập mới được xử lý tự động. Dịch vụ miễn phí được dùng giới hạn một yêu cầu mỗi giây, nên hàng trăm khách hàng tiềm năng cần vài phút. Đặt `GEOCODER_URL` trỏ tới Nominatim của riêng bạn để nhanh hơn.
- Hai tab **Danh sách / Bản đồ**: danh sách chia trang ("Trang 1/17") và bản đồ hiển thị **tất cả** khách hàng tiềm năng có tọa độ, không chỉ trang đầu.

### Mức ưu tiên

Điểm (0–100) là **chỉ số thứ tự**, không phải dự đoán doanh số. Nó giúp chọn nên liên hệ ai trước.

| Điểm | Ưu tiên | Ý nghĩa |
|------|---------|---------|
| 70–100 | Cao | Liên hệ trước |
| 50–69 | Trung bình | Vào thứ tự thông thường |
| 0–49 | Thấp | Liên hệ khi còn khả năng |

### Điểm đến từ đâu

Chỉ từ dữ liệu thật của lần thu thập, cộng một đánh giá của AI. Không có trọng số ngành hay thành phố nào được viết tay.

| Tín hiệu | Điểm |
|----------|------|
| Cơ sở | 30 |
| Có số điện thoại (liên hệ được) | +15 |
| Có địa chỉ | +3 |
| Đánh giá (trung bình Bayes: đánh giá có ít lượt nhận xét bị kéo về 4,0, nên 5,0 từ 1 nhận xét không thắng 4,5 từ hàng nghìn nhận xét) | +5 / +10 / +15 cho 3,5 / 4,0 / 4,5 |
| Số lượt đánh giá | +2 / +5 / +10 cho 5 / 20 / 100 lượt |
| **Độ phù hợp với ưu đãi của bạn** (AI đánh giá từ tên và danh mục Google Maps thật của doanh nghiệp, so với ưu đãi và brief của bạn) | +20 cao, +8 trung bình, −15 thấp, 0 nếu không được đánh giá |

Lý do đánh giá độ phù hợp hiển thị ở trang chi tiết khách hàng tiềm năng. Tên cũng được xét: doanh nghiệp tên "Cho thuê máy ảnh X" được coi là phù hợp với hệ thống cho thuê dù danh mục Maps chỉ là "Cửa hàng máy ảnh". Việc đánh giá này cần nhà cung cấp AI; mô hình cục bộ nhỏ có thể sai, vì vậy lý do luôn được hiển thị. Khách hàng tiềm năng không có số điện thoại được ghi chú vì không liên hệ được qua WhatsApp.

Danh mục hiển thị ở mỗi khách hàng tiềm năng là **danh mục gốc của Google Maps** (ngôn ngữ theo ngôn ngữ giao diện của Maps).

---

## 6. Brief marketing

Menu **Brief marketing** hiển thị những gì Prospex biết về sản phẩm của bạn: bán gì, bán cho ai, điểm khác biệt và bằng chứng. Brief này do AI viết **từ chính các nguồn của bạn** ([mục 3](#3-tạo-chiến-dịch)) và được mọi chiến dịch và bản nháp đọc.

### Nội dung brief

Tóm tắt (để điền chiến dịch), **Tổng quan**, **Đối tượng**, **Vấn đề**, **Điều làm nên khác biệt**, **Hướng tiếp cận** theo từng loại hình doanh nghiệp (giả thuyết cần thử, không phải sự thật), **Những phản đối có thể gặp**, **Bằng chứng** (con số, khách hàng, lời chứng thực), **Ưu đãi** (giá, lời kêu gọi hành động) và **Giọng thương hiệu**.

### Quy tắc để không bịa

- Sự thật chỉ từ các nguồn. Con số, tên khách hàng, lời chứng thực và giá không tìm thấy trong nguồn bị **loại bỏ** và ghi vào hộp vàng **Thông tin còn thiếu**.
- Điều không xác định được thì để trống, không đoán. Ô trống hiển thị "Không tìm thấy trong các nguồn".
- Trang này hiển thị **các trang AI đã đọc** (ở cuối trang) để bạn đánh giá cơ sở của brief.
- Brief được viết bằng ngôn ngữ bạn chọn (tiếng Việt hoặc tiếng Anh, theo nút EN | VI đang bật lúc tạo). Nguồn có thể bằng bất kỳ ngôn ngữ nào. Brief tiếng Việt thiếu dấu bị từ chối và ghi thành một mục thiếu thay vì được hiển thị.

### Chỉnh sửa và tạo lại

- Bấm **Chỉnh sửa các phần** để sửa mọi phần (danh sách: mỗi dòng một mục), rồi **Lưu thay đổi**. Mỗi lần lưu tăng số phiên bản.
- Bấm **Tạo lại** sau khi thêm nguồn hoặc ghi chú. Việc này thay thế brief trước đó.
- Mô hình AI có thể đặt nhầm nội dung (ví dụ giá vào trường khác). Brief là điểm khởi đầu bạn cần kiểm tra, nhất là phần bằng chứng và ưu đãi.

### Brief được dùng ở đâu

- **Biểu mẫu chiến dịch**: điền tên, loại hình doanh nghiệp mục tiêu, từ khóa, mô tả, phong cách và ngôn ngữ.
- **Điểm khách hàng tiềm năng**: cơ sở của việc đánh giá độ phù hợp.
- **Bản nháp tin nhắn**: hướng tiếp cận hợp với loại hình doanh nghiệp, bằng chứng được phép nhắc (chỉ những gì có trong brief) và những từ cần tránh.
- Nguồn được thêm cũng vào cơ sở kiến thức, nên bản nháp trả lời có thể trích dẫn sự thật của bạn.

Chi tiết kỹ thuật và giới hạn: [marketing-brief.md](marketing-brief.md) (tiếng Anh).

---

## 7. Phong cách AI: tin nhắn mang giọng văn của bạn

Tính năng này không bắt buộc, nhưng làm bản nháp nghe giống bạn hơn là giống một trợ lý AI. Mở menu **Phong cách AI**.

### Cách xuất chat

Trong WhatsApp: mở một cuộc trò chuyện, chọn **Thêm → Xuất chat → Không kèm phương tiện**. Kết quả là tệp `.txt` (hoặc `.zip`). Lặp lại với vài cuộc trò chuyện, nhất là với khách hàng. Càng nhiều cuộc trò chuyện càng chính xác.

> Tệp xuất của WhatsApp tiếng Việt (ngày/tháng, đồng hồ SA/CH, chú thích tiếng Việt cho tin nhắn đã xóa hoặc thiếu phương tiện) đã được hỗ trợ nhưng mới thử với dữ liệu mẫu tự dựng, chưa thử với tệp xuất thật. Nếu một tệp bị đọc sai, hãy báo qua issue.

### Các bước trong Prospex

1. Thả các tệp `.txt` hoặc `.zip` vào khung tải lên, rồi bấm **Đọc tệp**.
2. Chọn tên của bạn trong danh sách người gửi (người viết nhiều nhất đã được chọn sẵn; câu hỏi "Người nào là bạn?").
3. Bấm **Học phong cách của tôi**. Với mô hình cục bộ (Ollama) việc này có thể mất vài phút.
4. Thử ở khung **Thử một tin nhắn**: dán nội dung khách hàng đã viết rồi bấm **Soạn câu trả lời** để xem bản nháp và căn cứ tạo ra nó (thói quen đã áp dụng, các câu trả lời thật của bạn trong tình huống tương tự, thông tin đã tìm thấy). Bản nháp xem thử dùng ngôn ngữ của giao diện đang bật.

### Hệ thống lưu gì

Số liệu thống kê về cách bạn viết và các cặp "tin nhắn của khách → câu trả lời của bạn" đã được ẩn danh (số điện thoại, email và liên kết bị thay thế). **Chat gốc không được lưu.** Nút **Xóa** xóa tất cả. Chi tiết và kết quả thử nghiệm nằm ở [ai-style.md](ai-style.md) (tiếng Anh).

Cần tối thiểu 30 tin nhắn của chính bạn. Nếu bạn đổi mô hình embedding trong cấu hình máy chủ, hãy nhập lại các chat.

### Bản nháp WhatsApp và các ghi chú khác

Tin nhắn WhatsApp không còn được tạo tự động khi thu thập dữ liệu. Bản nháp được soạn từ menu **Outbox** ([mục 8](#8-outbox-và-whatsapp)), dùng dữ liệu thật của khách hàng tiềm năng (đánh giá, số lượt đánh giá, chưa có website), phong cách của bạn và cơ sở kiến thức của bạn. Ở trang chi tiết khách hàng tiềm năng vẫn có ghi chú email, LinkedIn và gọi điện do AI viết cho khách hàng tiềm năng ưu tiên Cao, nếu đã cấu hình nhà cung cấp AI. Khi chưa có nhà cung cấp AI, Prospex không hiển thị văn bản có sẵn.

---

## 8. Outbox và WhatsApp

Menu **Outbox** là nơi chứa mọi tin nhắn gửi đi. Nguyên tắc: **mọi tin nhắn bắt đầu là bản nháp và không được gửi cho đến khi bạn duyệt.**

### Kết nối WhatsApp

1. Bấm **Kết nối WhatsApp**. Mã QR hiện ra.
2. Trên điện thoại: WhatsApp → **Cài đặt → Thiết bị đã liên kết → Liên kết thiết bị**, rồi quét mã.
3. Trạng thái chuyển thành "Đã kết nối: +…".

Hãy dùng **một số điện thoại riêng cho công việc**. Kết nối thiết bị liên kết là không chính thức, và WhatsApp có thể hạn chế số bị coi là tự động. Prospex giảm rủi ro nhưng không thể loại bỏ hoàn toàn.

### Soạn và xem bản nháp

1. Tab **Chờ duyệt** → chọn **Chiến dịch** và **Số lượng** (tối đa 200) → **Soạn bản nháp**. Việc soạn chạy ngầm nên bạn có thể rời trang. Mô hình cục bộ mất khoảng 40 giây cho mỗi bản nháp.
2. Với mỗi bản nháp: **Duyệt**, **Chỉnh sửa** (sửa nội dung trước) hoặc **Từ chối**. Nút **Duyệt tất cả** yêu cầu xác nhận trước ("Xác nhận: duyệt N").
3. Bản nháp có cảnh báo màu vàng cần đọc kỹ: có liên kết, giá, giảm giá hoặc nội dung giống như chỉ dẫn dành cho AI.
4. Tin đã duyệt chuyển sang tab **Hàng đợi** và được gửi từng tin một. Bạn vẫn có thể gỡ tin khỏi hàng đợi (**Xóa khỏi hàng đợi**).

Khách hàng tiềm năng có số không hợp lệ, đã từng được liên hệ hoặc đã từ chối nhận tin sẽ tự bị bỏ qua (thông báo "Đã bỏ qua: …"). Mỗi tin nhắn đầu tiên và tin liên hệ lại kết thúc bằng một dòng xin cho phép khách từ chối, bằng ngôn ngữ của chiến dịch:

- Tiếng Việt: "Nếu anh/chị không muốn nhận tin nhắn, vui lòng trả lời STOP."
- Tiếng Anh: "If you'd rather not hear from me, reply STOP."

Từ **STOP** giữ nguyên ở cả hai ngôn ngữ.

Tin WhatsApp đầu tiên không bị giới hạn số ký tự; điều quan trọng là mỗi câu đều có ích. Trong tiếng Việt, tin mở đầu bằng "Xin chào anh/chị," và người viết xưng "em". Câu đầu tiên nêu bạn là ai và bạn cung cấp gì bằng lời nói hằng ngày. Nếu bạn cung cấp **dịch vụ** (ví dụ một agency làm hệ thống theo yêu cầu), tin giới thiệu công ty, nêu phạm vi dịch vụ bằng tên gọi dễ hiểu, rồi mời trao đổi; không đề nghị "xem mẫu giao diện" hay demo chưa có. Nếu bạn cung cấp **sản phẩm hoàn chỉnh**, tin có thể đề nghị gửi ví dụ hoặc demo. Trong thử nghiệm thật, tin nhắn mở đầu ngay bằng câu hỏi mà không giới thiệu bị tưởng là khách muốn thuê. Hãy đọc từng bản nháp; mô hình nhỏ đôi khi diễn giải sai điểm đánh giá hoặc dùng câu cứng nhắc (bản nháp như vậy được đánh dấu màu vàng).

### Định dạng, tệp đính kèm và xem trước liên kết

- **Định dạng WhatsApp** được giữ nguyên: `*đậm*`, `_nghiêng_`, `~gạch ngang~`, danh sách bằng `- ` và dòng trống giữa các đoạn. Outbox hiển thị mỗi tin như bong bóng WhatsApp: tệp hoặc thẻ liên kết ở trên, nội dung ở dưới, và dòng "STOP" là ghi chú nhỏ.
- **Tệp đính kèm**: khi chỉnh sửa bản nháp (hoặc trong bảng "Một tin nhắn cho nhiều khách hàng tiềm năng"), chọn **Tải tệp lên**: PDF, JPG, PNG, WebP, MP4, DOCX, XLSX hoặc PPTX, tối đa 16 MB. Loại tệp được đọc từ nội dung chứ không phải từ tên. Nội dung tin nhắn trở thành chú thích của tệp; nếu dài hơn 1.024 ký tự (giới hạn của WhatsApp), nội dung được gửi thành một tin riêng ngay sau tệp. Tệp còn được tin đang chờ dùng thì không xóa được. Email chưa hỗ trợ tệp đính kèm.
- **Xem trước liên kết**: liên kết trong tin tự nhận một thẻ (tiêu đề, mô tả, hình) mà bạn thấy trước khi duyệt; có ô để tắt (**Hiện thẻ xem trước cho liên kết**). Trang không đọc được thì gửi không kèm thẻ.

### Một tin nhắn cho nhiều khách hàng tiềm năng

Khi bản nháp riêng cho từng khách chưa như ý và bạn muốn một tin do chính bạn viết cho một loại hình doanh nghiệp (ví dụ mọi cửa hàng cho thuê áo dài):

1. Ở tab **Chờ duyệt**, mở thẻ **Một tin nhắn cho nhiều khách hàng tiềm năng** (nút **Mở**).
2. **1. Chọn khách hàng tiềm năng**: chọn *Loại hình doanh nghiệp* (danh mục Google Maps; con số bên cạnh là số liên hệ được trên tổng số), hoặc tìm theo tên. Khách hàng tiềm năng không có liên hệ hoặc đã được nhắn được đánh dấu và không chọn được. Dùng **Chọn tất cả những ai liên hệ được**.
3. **2. Nội dung tin nhắn**: tự viết, hoặc bấm **Viết bằng AI cho loại hình doanh nghiệp này** (một lần gọi AI cho một mẫu, không phải cho từng người), rồi chỉnh sửa thoải mái. `{nama}` được thay bằng tên doanh nghiệp của từng khách và `{kategori}` bằng loại hình của họ (hai ký hiệu này giữ nguyên tên như vậy trong mọi ngôn ngữ). Với email, điền cả **Tiêu đề**.
4. **3. Tạo bản nháp**: bấm **Tạo N bản nháp**. Mỗi khách có bản nháp riêng ở danh sách **Chờ duyệt** (WhatsApp tự được thêm dòng STOP, email được thêm chân thư). Bạn vẫn duyệt như thường; không có gì được gửi trước đó.

Vì mọi người nhận cùng một nội dung, hãy dùng `{nama}`, gửi theo từng nhóm nhỏ và dàn trải qua vài ngày để số điện thoại được an toàn.

### Tốc độ gửi

Bấm **Giới hạn** để cài đặt:

| Cài đặt | Mặc định | Ghi chú |
|---------|----------|---------|
| Số tin mỗi giờ | 10 | 1 đến 30. Càng thấp càng an toàn. |
| Số tin mỗi ngày | 80 | 1 đến 200 |
| Không gửi từ (giờ) / Không gửi đến (giờ) | 21:00 đến 07:00 | Tin chờ cho đến hết giờ không gửi |
| Múi giờ | Asia/Jakarta | Đổi sang múi giờ của bạn, ví dụ Asia/Ho_Chi_Minh |
| Mã quốc gia mặc định | 62 | Dùng cho số viết không có mã quốc gia. Với số Việt Nam hãy đặt 84. |

Khoảng nghỉ giữa các tin được làm ngẫu nhiên (0,6 đến 1,4 lần mức trung bình) và "đang soạn tin…" hiện trước mỗi tin được gửi. Với cài đặt mặc định, một danh sách 1.500 khách hàng tiềm năng xong sau khoảng **19 ngày**. Nâng giới hạn ngày lên 140 rút còn khoảng 11 ngày. Ở mức 20 tin mỗi giờ và 200 mỗi ngày, 1.000 khách hàng tiềm năng xong sau khoảng 5 ngày. Ở 20 tin mỗi giờ, cứ khoảng ba phút có một tin được gửi; hàng đợi dài chậm là có chủ ý. Hãy bắt đầu với 30 đến 50 khách hàng tiềm năng, xem bao nhiêu người trả lời và số điện thoại còn khỏe không, rồi mới tăng.

Prospex tự tạm dừng gửi sau 3 lần thất bại liên tiếp. Nút **Tạm dừng gửi** cũng có sẵn khi bạn muốn tự dừng; **Tiếp tục gửi** để gửi lại.

### Tin trả lời và liên hệ lại

- **Khách hàng tiềm năng trả lời**: Prospex hiểu ý (quan tâm, muốn hẹn gặp, hỏi về giá, có câu hỏi, chưa phải lúc này, không quan tâm), đẩy trạng thái tiến lên (không bao giờ lùi), đánh dấu "Đang chờ bạn trả lời", hủy các lượt liên hệ lại đang chờ và tạo **bản nháp trả lời** ở tab **Chờ duyệt** kèm tin của khách được trích bên trên. Bản nháp trả lời viết lịch sự và khiêm nhường (bạn là bên chào bán): không emoji, không ra lệnh, không đoán cách xưng hô. Bạn vẫn là người duyệt, và tin trả lời đã duyệt **được gửi ngay, ưu tiên hơn hàng đợi tin đầu tiên** và không bị giới hạn theo giờ.
- **Prospex đọc cả cuộc trò chuyện**: các bong bóng viết sát nhau (cách nhau tối đa 3 phút) được trả lời như một tin; lời chào tự động của cửa hàng và chat cũ chỉ là lịch sử; chú thích ảnh và thẻ liên hệ cũng được đọc. Bản nháp được soạn khoảng 20 giây sau bong bóng cuối, **thay thế bản nháp cũ** còn chờ, và không được tạo nếu bạn đã trả lời.
- **Bạn trả lời từ chính điện thoại của mình**: tin đó được ghi lại (chỉ với số có trong danh sách khách hàng tiềm năng; các cuộc trò chuyện cá nhân khác bị bỏ qua và không được lưu), khách hàng tiềm năng không còn "đang chờ bạn trả lời", bản nháp lỗi thời được thu hồi và các bản nháp sau biết bạn đã nói gì. Các tin này không tính vào giới hạn gửi theo giờ và theo ngày.
- **Được giới thiệu sang một liên hệ khác** ("hãy liên hệ bộ phận quản lý của bên mình", hoặc họ gửi thẻ liên hệ): câu trả lời là lời cảm ơn cố định (hoặc xin số), số được lưu vào nhật ký hoạt động của khách hàng tiềm năng, và nút **Thêm … làm khách hàng tiềm năng** tạo họ thành một khách hàng tiềm năng riêng, chỉ một lần cho cùng một số.
- **Lời chào tự động của cửa hàng** ("Cảm ơn bạn đã liên hệ…", "vui lòng chờ trong giây lát", giờ mở cửa, menu dài; cũng nhận ra các câu tiếng Indonesia như "Terima kasih telah menghubungi…") được nhận ra và chỉ ghi lại: trạng thái không đổi và không tạo bản nháp.
- **Khách hàng nhắn STOP**: các cách nói được nhận ra bằng tiếng Việt, tiếng Anh và tiếng Indonesia, kể cả trong câu ngắn. Ví dụ tiếng Việt: "dừng gửi", "đừng nhắn nữa", "ngừng làm phiền", "hủy đăng ký", "xóa số của tôi"; nếu khách gõ không dấu thì "dung gui", "ngung nhan tin" cũng được nhận ra. Số điện thoại bị chặn vĩnh viễn, mọi tin đang chờ bị hủy và khách hàng tiềm năng được đóng với trạng thái Thua, lý do "Dừng nhận tin (STOP)". Một câu xác nhận như "Đúng, gửi giúp em báo giá" **không** bị coi là từ chối. Một số cách nói mơ hồ ("đừng" đứng một mình, "thôi") cố ý không được tính, nên nếu ai đó từ chối theo cách khác hãy tự xử lý.
- **Khách hàng tiềm năng im lặng**: Prospex soạn bản nháp liên hệ lại sau 3 ngày và thêm một bản nữa sau 5 ngày. Tối đa hai bản. Nút **Kiểm tra tin liên hệ lại** chạy việc này ngay.
- Tin từ số không quen được lưu nhưng không được trả lời. WhatsApp đôi khi ẩn số người gửi; tin đó hiện ở trang **Pipeline**, thẻ "Tin nhắn từ người gửi không xác định", và không khớp được với khách hàng tiềm năng nào, nên nếu nội dung là STOP, hãy tự loại doanh nghiệp đó khỏi danh sách của bạn.

> Tin do khách gửi kèm ảnh hay thẻ liên hệ được lưu với nhãn viết theo kiểu tiếng Indonesia, ví dụ `[Gambar]` hoặc `[Kontak: …]`, và được hiển thị đúng như đã lưu, cả khi bạn dùng giao diện tiếng Việt.

### Tab "Cần chú ý"

Chứa các tin thất bại, ví dụ "Number is not on WhatsApp" (số đó không liên hệ được) hoặc gửi lỗi. Nút **Thử lại** hiện với tin đáng thử lại. Tin bị gián đoạn khi máy chủ khởi động lại được đánh dấu thất bại và **không tự gửi lại**, vì có thể đã được gửi rồi. Hãy kiểm tra WhatsApp trước.

Giải thích kỹ thuật đầy đủ: [whatsapp-outbox.md](whatsapp-outbox.md) (tiếng Anh).

---

### Gửi qua email

Trong Outbox, chọn **Email** ở phía trên danh sách tin. Quy trình giống WhatsApp: AI viết bản nháp và tiêu đề, bạn xem lại, chỉnh sửa rồi duyệt. Không có gì được gửi nếu chưa duyệt.

1. Bấm **Thiết lập email** và điền tài khoản SMTP của bạn (**Máy chủ thư**, **Cổng**, **Tên đăng nhập**, **Mật khẩu**, **Địa chỉ người gửi**) cùng **Địa chỉ bưu chính của người gửi**. Địa chỉ này được in ở cuối mỗi email, và nhiều quốc gia yêu cầu điều đó. Nhiều nhà cung cấp cần *mật khẩu ứng dụng*, không phải mật khẩu thường.
2. Bấm **Kiểm tra kết nối**. Việc này chỉ đăng nhập, không gửi gì.
3. Bấm **Soạn bản nháp**. Khách hàng tiềm năng gửi email được là những người có địa chỉ tìm thấy trên website của họ (xem **Tìm thông tin liên hệ** ở trang chiến dịch và trang khách hàng tiềm năng).
4. Xem lại, duyệt, và email được gửi từng thư một có quãng nghỉ và giờ không gửi tin.

Mỗi email có một liên kết hủy đăng ký. Người đã hủy sẽ không được gửi nữa. Để người nhận mở được liên kết đó, hãy đặt `PUBLIC_API_URL` trên máy chủ thành một địa chỉ https công khai (ví dụ `https://api.example.com/api`). **Khi chưa đặt, việc gửi email bị dừng và việc duyệt bản nháp email bị từ chối**, kèm cảnh báo đỏ ở bảng Email. Liên kết mở ra một trang xác nhận bằng tiếng Việt kèm tiếng Anh; chỉ khi bấm nút **Hủy đăng ký** thì việc hủy mới được ghi nhận.

Email có dạng: lời chào ("Kính gửi Quý khách," trong tiếng Việt, "Hi," trong tiếng Anh), các đoạn ngắn, một lời mời, và lời kết ("Trân trọng," hoặc "Best regards,"). Dòng hủy đăng ký ở chân thư cũng theo ngôn ngữ của chiến dịch. Ở bảng Email bạn có thể điền **Liên kết trong email đầu tiên (không bắt buộc)**; hệ thống thêm nó thành một dòng "Xem thêm: …" (tiếng Anh: "More details: …") trước lời kết. Thư trả lời về hộp thư của chính bạn; Prospex chưa đọc chúng. Hãy cấu hình SPF, DKIM và DMARC cho tên miền gửi, và bắt đầu với số lượng nhỏ. Chi tiết và giới hạn: [email-channel.md](email-channel.md).

## 9. Pipeline CRM

### Trang Pipeline: theo dõi đến khi chốt

Menu **Pipeline** cho thấy toàn bộ hành trình của khách hàng tiềm năng:

- **Bốn con số**: **Tỷ lệ trả lời**, **Tỷ lệ thắng**, **Thương vụ đang mở** (giá trị), giá trị thương vụ **Thắng**. Tỷ lệ trả lời chỉ tính câu trả lời của người thật, không tính lời chào tự động của cửa hàng.
- **Các giai đoạn** từ Mới đến Thắng hoặc Thua, kèm số lượng và giá trị thương vụ.
- **Đang chờ bạn trả lời**: khách hàng tiềm năng đã trả lời và bạn chưa xử lý, kèm ý định của họ (ví dụ "Hỏi về giá"). **Đến hạn liên hệ lại**: ngày do bạn hoặc hệ thống đặt đã qua. **Đã im lặng (không trả lời sau 7 ngày)**: đã liên hệ hơn 7 ngày mà không có trả lời.
- **Theo chiến dịch**: số khách hàng tiềm năng, đã liên hệ, đã trả lời, thắng. **Lý do thua thương vụ**: tính từ cột lý do.
- **Tin nhắn từ người gửi không xác định** (nếu có).
- **Đang chờ họ**: khách hàng tiềm năng đã trả lời (từ giai đoạn Đã trả lời đến Đề xuất) và **bạn là người trả lời sau cùng**, nhưng đã hơn 3 ngày không có phản hồi. Đây chỉ là lời nhắc cho bạn; không có bản nháp tự động, vì những khách như vậy đang trong quá trình (ví dụ được nhờ điền biểu mẫu), không phải khách hàng tiềm năng lạnh.
- **Đọc lại các cuộc trò chuyện**: nút ở đầu trang đọc lại từng cuộc trò chuyện một cách đầy đủ (kể cả những tin bạn trả lời từ điện thoại). Trước hết xuất hiện **bản xem trước**: bao nhiêu cuộc sẽ thay đổi, bao nhiêu cuộc bạn đã trả lời, nhãn mới, giai đoạn được đẩy lên và bản nháp lỗi thời được thu hồi. Không có gì thay đổi cho đến khi bạn bấm **Áp dụng**. Bản xem trước cũng chỉ ra hai điều quan trọng nhất: **khách hàng tiềm năng chỉ gửi lời chào tự động của cửa hàng** (được đưa về "Đã liên hệ", vì đó không phải là trả lời) và **số đã yêu cầu dừng nhưng chưa bị chặn** (sẽ bị chặn và đóng với trạng thái Thua). Nhãn đã cụ thể không bao giờ bị ghi đè bằng "other". Giai đoạn do hệ thống tự gán nhưng hóa ra chưa từng đạt (ví dụ "Hẹn gặp" vì có chữ "lịch") được hạ xuống, còn giai đoạn do bạn tự chọn thì không bao giờ bị hạ. Cuộc trò chuyện tiếp tục bằng những câu trả lời của bạn chưa được ghi lại (nhắn từ điện thoại trước khi có tính năng ghi nhận) được giữ nguyên và báo là "chưa đầy đủ". Ở thẻ "Đang chờ bạn trả lời", nút **Tôi đã trả lời** trên mỗi dòng đánh dấu khách hàng tiềm năng mà bạn đã nhắn lại từ điện thoại. Lời kết lịch sự (ví dụ "ok", "cảm ơn") không được tính là đang chờ trả lời. Kết quả: khách hàng tiềm năng bạn đã trả lời không còn ở trạng thái chờ, nhãn khớp với nội dung cuộc trò chuyện, giai đoạn chỉ tiến lên, và bản nháp cho tin đã qua được thay bằng bản nháp mới nếu vẫn còn điều cần trả lời.

Ở trang chi tiết khách hàng tiềm năng, ngoài trạng thái còn có **Giá trị thương vụ**, **Liên hệ lại vào**, **Vì sao thua?** (xuất hiện khi trạng thái là Thua) và nút **Đánh dấu đã xử lý tin trả lời**, cùng nút **Lưu thông tin thương vụ**. Thương vụ không bao giờ được đóng tự động, trừ yêu cầu dừng (STOP) được đóng với trạng thái Thua.

### Cập nhật trạng thái khách hàng tiềm năng

Ở trang chi tiết khách hàng tiềm năng, bảng **Trạng thái CRM** bên phải:

1. Chọn trạng thái mới trong danh sách thả xuống
2. Bấm **Cập nhật trạng thái**

Trạng thái tự ghi lại thời điểm (ví dụ `contactedAt`, `repliedAt`, `closedAt`).

### Quy trình CRM đề xuất

```
Mới → Đã liên hệ → Đã trả lời → Quan tâm → Hẹn gặp → Đề xuất → Thắng
                                                     ↘ Thua
```

| Trạng thái | Khi nào dùng |
|------------|--------------|
| **Mới** | Vừa tìm thấy, chưa liên hệ |
| **Đã liên hệ** | Đã gửi tin nhắn/email đầu tiên |
| **Đã trả lời** | Khách hàng tiềm năng đã phản hồi |
| **Quan tâm** | Đồng ý với lời đề nghị của bạn (ví dụ "được" khi bạn đề nghị gửi mẫu) hoặc xin ví dụ/thông tin. Tự động tăng từ tin trả lời, không bao giờ lùi |
| **Hẹn gặp** | Đã hẹn họp/demo |
| **Đề xuất** | Đã gửi báo giá |
| **Thắng** | Chốt thương vụ, trở thành khách hàng |
| **Thua** | Không thành, bị từ chối hoặc không phản hồi |

### Nhật ký hoạt động

Mỗi thay đổi trạng thái được tự ghi vào **Nhật ký hoạt động** ở bảng bên phải của trang chi tiết khách hàng tiềm năng. Nhật ký giúp theo dõi lịch sử liên lạc.

---

## 10. Phân tích

Vào **Phân tích** ở thanh bên.

### Chỉ số chính

- **Tổng khách hàng tiềm năng**: tất cả khách hàng tiềm năng của mọi chiến dịch
- **Tỷ lệ chuyển đổi**: phần trăm khách hàng tiềm năng trở thành Thắng
- **Thương vụ thắng**: số thương vụ đã chốt thành công
- **Chiến dịch đang chạy**: chiến dịch đang chạy hoặc đã hoàn tất

### Biểu đồ

**Khách hàng tiềm năng theo ngành**: biểu đồ cột số khách hàng tiềm năng kèm điểm trung bình theo ngành. Hữu ích để biết ngành nào có nhiều khách hàng tiềm năng chất lượng nhất.

**Phễu CRM**: biểu đồ tròn phân bố khách hàng tiềm năng ở từng giai đoạn của pipeline. Nếu nhiều người ở "Đã liên hệ" nhưng ít người ở "Đã trả lời", nghĩa là tin nhắn chưa đủ hấp dẫn.

---

## 11. Xuất danh sách khách hàng tiềm năng

### Từ trang chi tiết chiến dịch

Ở trang `/campaigns/:id` có 3 nút xuất:

| Định dạng | Công dụng |
|-----------|-----------|
| **CSV** | Nhập vào Excel, Google Sheets, CRM khác |
| **JSON** | Tích hợp vào ứng dụng / tự động hóa (Zapier, n8n) |
| **vCard** | Nhập thẳng vào danh bạ điện thoại / Outlook |

### Từ danh sách khách hàng tiềm năng

Ở trang `/leads`, nút **Xuất CSV** ở góc trên bên phải xuất toàn bộ khách hàng tiềm năng.

### Định dạng vCard

Tệp `.vcf` mở thẳng được trên điện thoại để lưu danh bạ:

- Tên doanh nghiệp
- Số điện thoại
- Địa chỉ đầy đủ
- Website
- Điểm AI và mức ưu tiên (ở trường Ghi chú)

---

## 12. Cài đặt và khóa API

### Cấu hình AI

**Cài đặt** → tab **AI và khóa API** → **Cấu hình AI**: khóa, mô hình chat, mô hình embedding và URL gốc cho không gian làm việc đang hoạt động. Được lưu mã hóa trong cơ sở dữ liệu, có hiệu lực ngay không cần khởi động lại, và khóa không bao giờ hiển thị lại sau khi lưu (để trống ô để giữ khóa hiện có). Nút **Kiểm tra kết nối** thực hiện một lần gọi chat và một lần gọi embedding với đúng cấu hình đang dùng. Khi đổi mô hình embedding, các nguồn kiến thức cần **Lập chỉ mục lại ngay** và Phong cách AI cần nhập lại.

### Nhiều doanh nghiệp (không gian làm việc)

Một tài khoản đăng nhập có thể quản lý nhiều doanh nghiệp. Bấm tên không gian làm việc ở góc trên bên trái, chọn doanh nghiệp khác, hoặc **Không gian làm việc mới**. Mỗi không gian làm việc có brief marketing, Phong cách AI, cơ sở kiến thức, số WhatsApp, tài khoản email, khóa AI, chiến dịch, khách hàng tiềm năng và khóa API riêng; không có gì bị lẫn.

### Khóa API Prospex

Để truy cập API của Prospex từ công cụ bên ngoài (Zapier, n8n, script riêng):

1. **Cài đặt** → **Khóa API Prospex**
2. Điền tên khóa (ví dụ: "Zapier", "Production")
3. Bấm **Tạo khóa API**
4. **Sao chép khóa vừa hiện ngay bây giờ**: nó sẽ không hiển thị lại
5. Dùng làm Bearer token: `Authorization: Bearer px_...`

> Với API, trường `language` của chiến dịch, brief, mẫu tin và bản nháp xem thử chỉ nhận `vietnamese` hoặc `english`; `indonesian` trả về lỗi 400 (xem "Upgrade notes" trong [README](../README.md#language)).

### Xóa khóa API

Bấm biểu tượng thùng rác (**Xóa khóa API**) bên phải khóa muốn xóa. Khóa ngừng hoạt động ngay.

---

## 13. Khắc phục sự cố

### API không kết nối được (lỗi ở giao diện)

```
Error: Failed to fetch http://localhost:3001/api/...
```

Hãy kiểm tra API đã chạy:
```bash
pnpm --filter @prospex/api dev
# Phải thấy: "Prospex API running on http://localhost:3001"
```

### Lỗi cơ sở dữ liệu khi khởi động API

```
Error: Can't reach database server at localhost:5432
```

Hãy kiểm tra Docker đang chạy:
```bash
docker compose up -d
docker ps   # phải có prospex_db và prospex_redis
```

### Chiến dịch kẹt ở "Đang chạy"

Tải lại trang. Nếu vẫn "Đang chạy" dù đã rất lâu, khởi động lại API:
```bash
# Ctrl+C trong terminal của API, rồi:
pnpm --filter @prospex/api dev
```

### "Failed to fetch" khi phân tích bằng AI hoặc lỗi 500 từ Ollama

- Việc phân tích giờ chạy ngầm; nếu hiện "Failed to fetch", thường là API vừa khởi động lại (chế độ `--watch` khởi động lại API mỗi khi mã thay đổi). Hãy đợi vài giây và chạy lại. Trang được mở lại sẽ tiếp tục phân tích đang chạy.
- Ollama chỉ phục vụ một yêu cầu một lúc. Đừng chạy phân tích, lập chỉ mục và soạn bản nháp cùng lúc. Ngữ cảnh 16.384 token là đủ (prompt lớn nhất khoảng 7.000) và nhẹ hơn nhiều so với 131.072; trong ứng dụng Ollama hãy đặt *Context length*.
- Với chiến dịch tiếp theo đừng phân tích lại: dùng **Điền từ brief đã lưu của tôi (tức thì)**.

### Email chưa gửi dù đã duyệt

Bảng Email hiển thị cảnh báo đỏ nếu `PUBLIC_API_URL` chưa phải địa chỉ https công khai. Hãy điền địa chỉ công khai của API rồi khởi động lại API. (`ALLOW_LOCAL_UNSUBSCRIBE=true` chỉ dành cho thử cục bộ vào hộp thư của chính bạn.)

### Lỗi Prisma sau khi cập nhật schema

```bash
pnpm --filter @prospex/database db:deploy
pnpm --filter @prospex/database exec prisma generate
```

### Cổng 3000 hoặc 3001 đã được dùng

```bash
# Tìm tiến trình đang dùng cổng
lsof -i :3000
lsof -i :3001

# Dừng tiến trình đó
kill -9 <PID>
```

### Chiến dịch thất bại với thông báo về trình duyệt

"The scraping browser is not installed on the server": chạy `pnpm --filter @prospex/api exec playwright install chromium` trên máy chủ API, rồi chạy lại chiến dịch. Thông báo khác nghĩa là Google Maps không tải được hoặc đã thay đổi; hãy thử lại sau hoặc giảm số từ khóa. Prospex sẽ không lấp kết quả bằng doanh nghiệp bịa ra.

### Website không đọc được ở Tài liệu nguồn

- Thông báo "that address is not allowed": địa chỉ trỏ tới mạng nội bộ hoặc cục bộ. Chỉ đọc được website công khai (cổng 80 và 443).
- Thông báo "almost no text": website nạp nội dung bằng JavaScript. Prospex thử mở bằng trình duyệt; nếu chưa cài Chromium thì hãy cài, hoặc dán văn bản vào.
- Website cần đăng nhập hoặc chặn bot thì không đọc được: hãy dán văn bản hoặc tải tài liệu lên.
- PDF bị từ chối: có thể là bản quét (không có chữ), có mật khẩu, hoặc dài hơn 60 trang.
- Phân tích AI rất lâu hoặc thất bại với mô hình cục bộ: bật `OPENAI_REASONING_EFFORT=none` cho các mô hình có bước suy nghĩ (gemma4, qwen3) và giảm `BRIEF_SOURCE_CHARS` nếu ngữ cảnh của mô hình nhỏ.

### Mã QR WhatsApp không hiện hoặc cứ "Đang kết nối…"

- Hãy chắc máy chủ ra được Internet (WhatsApp Web dùng WebSocket).
- Bấm **Ngắt kết nối**, rồi **Kết nối WhatsApp** lại. Mã đổi sau vài giây; hãy quét mã mới nhất.
- Kiểm tra `WHATSAPP_DISABLED` trong `.env`: giá trị `true` tắt WhatsApp.
- Xem log API để tìm thông báo `WhatsApp closed (code …)`. Sau 8 lần thử kết nối lại, Prospex dừng và hiển thị lỗi trong Outbox.

### Tin đã duyệt nhưng không được gửi

Kiểm tra lần lượt: (1) trạng thái phải là "Đã kết nối" và việc gửi không bị tạm dừng, (2) có đang trong giờ không gửi tin không, (3) đã chạm giới hạn theo giờ hoặc theo ngày chưa (xem các bộ đếm "Trong giờ này" và "Hôm nay"), (4) khoảng nghỉ ngẫu nhiên giữa các tin đã qua chưa. Tab **Hàng đợi** cho thấy thứ tự, và bảng WhatsApp hiển thị giờ không gửi tin cùng các bộ đếm của giờ này và hôm nay.

### Phải quét lại mã QR sau mỗi lần triển khai

Phiên WhatsApp được lưu ở `WA_AUTH_DIR`. Trong môi trường production, thư mục đó phải nằm trên một volume bền vững (`docker-compose.prod.yml` đã gắn sẵn volume `wa_auth`).

### Đặt lại cơ sở dữ liệu (development)

```bash
pnpm --filter @prospex/database exec prisma migrate reset   # xóa dữ liệu và áp dụng lại mọi migration
```

---

## Lối tắt hữu ích

| Thao tác | Cách làm |
|----------|----------|
| Chiến dịch mới | `/campaigns/new` |
| Xem mọi khách hàng tiềm năng | `/leads` |
| Tài liệu Swagger của API | `http://localhost:3001/api/docs` |
| Trình duyệt cơ sở dữ liệu | `pnpm --filter @prospex/database db:studio` |
| Xuất mọi khách hàng tiềm năng | `GET http://localhost:3001/api/export/leads/csv` |

---

_Prospex: nền tảng tự động hóa GTM bằng AI mã nguồn mở_
