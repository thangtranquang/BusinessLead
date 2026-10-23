import type { knowledgeEn } from "./features-knowledge.en";

export const knowledgeVi: Record<keyof typeof knowledgeEn, string> = {
  "nav.knowledge": "Cơ sở kiến thức",

  "kb.title": "Cơ sở kiến thức",
  "kb.subtitle": "Dữ kiện, bảng giá và chính sách mà AI dựa vào khi soạn bản nháp. AI chỉ nhắc đến những gì có ở đây.",

  "kb.add": "Thêm nguồn",
  "kb.add.title": "Tiêu đề",
  "kb.add.titlePlaceholder": "ví dụ: Bảng giá 2025, Câu hỏi thường gặp, Giới thiệu",
  "kb.add.content": "Nội dung",
  "kb.add.contentPlaceholder": "Dán văn bản bạn muốn AI biết — bảng giá, câu hỏi thường gặp, mô tả dịch vụ, chính sách...",
  "kb.add.kind": "Phân loại",
  "kb.add.kind.text": "Chung",
  "kb.add.kind.pricing": "Bảng giá",
  "kb.add.kind.faq": "Câu hỏi thường gặp",
  "kb.add.kind.policy": "Chính sách",
  "kb.add.submit": "Lưu và lập chỉ mục",
  "kb.add.cancel": "Hủy",

  "kb.empty": "Chưa có nguồn nào. Hãy thêm một nguồn ở trên để AI soạn bản nháp dựa trên thông tin thực tế của bạn.",
  "kb.source.chunks": "{n} đoạn",
  "kb.source.chunks_plural": "{n} đoạn",
  "kb.source.delete": "Xóa",
  "kb.source.delete.confirm": "Xóa nguồn này?",
  "kb.source.status.ready": "Đã lập chỉ mục",
  "kb.source.status.processing": "Đang lập chỉ mục…",
  "kb.source.status.error": "Lỗi",

  "kb.search": "Thử tìm kiếm",
  "kb.search.placeholder": "Hỏi điều mà AI có thể tra cứu…",
  "kb.search.run": "Tìm kiếm",
  "kb.search.noResults": "Không tìm thấy kết quả khớp.",
  "kb.search.confidence": "Độ tin cậy",
  "kb.search.confidence.high": "Cao",
  "kb.search.confidence.low": "Thấp — AI sẽ nói rằng kết quả khớp chưa chắc chắn",
  "kb.search.confidence.none": "Không có — AI sẽ không trích dẫn nội dung này",

  "kb.saved": "Đã lưu và lập chỉ mục nguồn.",
  "kb.deleted": "Đã xóa nguồn.",
  "kb.error.add": "Không lưu được nguồn.",
  "kb.error.delete": "Không xóa được nguồn.",
  "kb.error.load": "Không tải được cơ sở kiến thức.",
  "kb.error.search": "Tìm kiếm không thành công.",
};
