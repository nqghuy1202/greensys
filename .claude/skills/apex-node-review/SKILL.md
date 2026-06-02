---
name: apex-node-review
description: >-
  Review tính nhất quán kiến trúc, luồng và API của hệ thống Oracle APEX 24.2 ↔ Node.js
  (Browser → apex.server.process → APEX PL/SQL → UTL_HTTP → Node.js). Dùng skill này BẤT CỨ
  KHI NÀO người dùng muốn review lại luồng/code/API, kiểm tra một tính năng hoặc nhánh mới có
  đi đúng luồng đã thiết lập không, thống nhất lại cách hoạt động giữa các module, hoặc nghi ngờ
  code mới đang đẻ ra một luồng khác không nhất quán với luồng cũ. Cũng bắt bug runtime, lỗ hổng
  bảo mật và các pitfall PL/SQL/Node đặc thù của dự án. Kích hoạt cả khi người dùng chỉ nói
  "review lại", "check luồng này", "có nhất quán không", "thống nhất lại cách làm", "sao chỗ này
  làm khác chỗ kia" mà không nêu tên skill.
---

# APEX ↔ Node Flow & Consistency Review

Mục tiêu của skill này **không phải** là một bản review chung chung. Nó giải quyết một nỗi đau cụ
thể của dự án: **mỗi lần thêm nhánh/tính năng mới, code lại đẻ ra một luồng khác, không khớp với
luồng đã thiết lập** — đúng cú pháp nhưng lệch tinh thần kiến trúc ("intent drift"). Linter không
bắt được loại lỗi này; chỉ một người review *hiểu kiến trúc* mới bắt được.

Vì vậy nguyên tắc nền tảng: **không review theo checklist generic — luôn neo vào "nguồn chân lý"
của chính dự án** và so code đang xét với "anh em ruột" đã chạy ổn định.

## Nguồn chân lý (đọc trước khi review)

Khi review bất kỳ thứ gì, coi các tài liệu sau là chuẩn mực. Đọc phần liên quan trước khi kết luận,
đừng dựa vào trí nhớ:

| Nguồn | Vai trò |
|-------|---------|
| `docs/claude/00-core.md` | Ràng buộc mạng + kiến trúc tổng thể (luồng xương sống) |
| `docs/claude/01-notification.md` | CQN + long-poll + `appEvents` |
| `docs/claude/02-chat-system.md` | Chat System (Messenger page) |
| `docs/claude/03-doc-chat.md` | Doc Chat Modal (native APEX) |
| `docs/claude/04-oracle-db.md` | Schema, bảng remote qua DB link, MATERIALIZE |
| `docs/claude/05-apex-patterns.md` | Convention APEX (pageId, naming, navigation, CSS token) |
| `docs/claude/07-pitfalls.md` | **Toàn bộ bẫy đã biết** — dùng cho pass bug/security |
| Code đã implement | `doc-chat/`, `chat-system/chat-page.js`, `chat-server/*.js`, `docs/*native*.sql` |

Nếu một quy ước **không có** trong các tài liệu này nhưng đã xuất hiện nhất quán trong code, coi
code là chuẩn de-facto và nêu rằng convention chưa được ghi lại.

## Luồng xương sống (mọi tính năng phải đi theo)

```
Browser (APEX client)
  │  apex.server.process(name, data, { pageId })   ← page-level callback, có pageId
  ▼
APEX PL/SQL Ajax Callback (trên đúng page đó)
  │  :APP_USER → lookup aus_id        (Page 0 mới được dùng :G_AUS_ID)
  │  UTL_HTTP → http://172.25.10.38:3410/...   (POST: Connection: close + WRITE_RAW)
  ▼
Node.js (chat-server/)  server.js → events.js | chat.js | cqn.js
  │  withConn(fn) cho mọi query · normalize() hạ tên cột · res.json() escape \uXXXX
  ▼
Real-time về: GET /api/events/:aus_id (long-poll hợp nhất) → apex:chatEvent (jQuery)
```

**Luật bất biến tuyệt đối:** Browser **không bao giờ** gọi thẳng IP private `172.25.x.x`. Mọi
giao tiếp browser → Node phải qua `apex.server.process → APEX PL/SQL → UTL_HTTP`. Phát hiện vi
phạm điều này → 🔴 Chặn ngay.

## Quy trình review (6 pha)

Đi tuần tự. Đừng nhảy thẳng vào "soi dòng code" — sức mạnh của skill nằm ở pha 1–4 (dựng luồng &
so anh em ruột), không phải ở việc bắt lỗi cú pháp.

### Pha 1 — Dựng lại luồng (flow reconstruction)

Trace code đang review **xuyên suốt các tầng** nó đi qua, viết ra thành chuỗi bước thực tế:
Browser JS → callback APEX → UTL_HTTP → route Node → DB → đường về. Mục đích: nhìn thấy *cả con
đường*, không chỉ file trước mặt. Phần lớn intent drift lộ ra ngay khi vẽ luồng cạnh luồng cũ.

### Pha 2 — Tìm "anh em ruột" (canonical sibling)

Xác định tính năng **đã có, đã chạy ổn** làm việc gần giống nhất, rồi mở code của nó ra. Đây là
baseline để so. Ví dụ:
- Callback gửi tin mới → so với `docChatSend` (`docs/doc-chat-callbacks.sql`) / `chatSend`.
- Sự kiện real-time mới → so với cách `appEvents` đẩy `apex:chatEvent` (`01-notification.md`).
- Trang native mới → so với cấu trúc Doc Chat (`doc-chat/doc-chat-page.js`).
- Query bảng remote mới → so với pattern MATERIALIZE trong `04-oracle-db.md`.

Nếu **không tìm được anh em ruột**, đó là tín hiệu đáng chú ý: hoặc đây là pattern thật sự mới
(cần ghi convention), hoặc đang đi chệch khỏi một pattern lẽ ra phải tái dùng.

### Pha 3 — Đối chiếu với bộ "mỏ neo nhất quán" (consistency anchors)

Duyệt qua bộ mỏ neo (xem bảng index bên dưới; chi tiết + ví dụ good/drift ở
`references/consistency-anchors.md`). Với mỗi mỏ neo liên quan tới luồng đang xét: code có tuân
không? Có khớp anh em ruột không? Ghi lại **mọi điểm lệch kèm `file:line`**.

### Pha 4 — Phân loại từng điểm lệch (đánh giá 2 chiều) ⭐

Đây là **trái tim** của skill. Với mỗi điểm lệch, **đừng mặc định "code mới phải giống code cũ"**.
Hãy hỏi: cách cũ có còn là cách tốt nhất không?

- **Cách cũ vẫn tốt hơn** → đây là *drift do vô ý*. Đề xuất **kéo code mới về** đúng convention.
  Giải thích *vì sao* convention tồn tại (dẫn pitfall/tài liệu liên quan) để người viết hiểu, không
  phải tuân lệnh suông.
- **Cách mới thật sự tốt hơn** → đừng ép nó giống cái cũ sai. Đề xuất **tiến hóa convention**:
  (1) cập nhật tài liệu trong `docs/claude/*.md`, (2) **liệt kê các chỗ cũ cần migrate** để toàn
  hệ thống đồng bộ về cách mới. Đây chính là "thống nhất lại cho tối ưu" — gom về một mối *và* cho
  phép tiến hóa, thay vì đóng băng cái cũ.
- **Cả hai đều hợp lệ trong ngữ cảnh khác nhau** → nêu rõ ranh giới khi nào dùng cái nào, đề xuất
  ghi ranh giới đó vào tài liệu để lần sau không phải đoán.

Luôn trung thực và giải thích cái **why**. Một nhánh mới đôi khi *phơi bày* rằng cách cũ mới là cái
sai — bỏ lỡ điều đó là bỏ lỡ giá trị lớn nhất của review.

### Pha 5 — Pass bug / security / performance

Sau khi xong tính nhất quán, soi các lỗi thực thi. Dùng `docs/claude/07-pitfalls.md` làm danh mục
chính (PL/SQL, Application Process, Node, JSX/frontend, UTL_HTTP POST). Bổ sung các check chuẩn:
SQL injection / bind variable, xử lý lỗi & rò rỉ connection (thiếu `withConn`/finally), N+1 query,
rò rỉ thông tin nhạy cảm, race condition trong long-poll/typing state.

### Pha 6 — Xuất báo cáo

Chọn định dạng theo quy mô (xem mục **Đầu ra**).

## Bộ mỏ neo nhất quán (index)

Bảng cô đọng — duyệt từng dòng liên quan. Chi tiết "good vs drift" + ví dụ code ở
`references/consistency-anchors.md` (đọc khi cần đối chiếu kỹ).

| # | Mỏ neo | Vi phạm điển hình | Nguồn |
|---|--------|-------------------|-------|
| A1 | Browser → Node **luôn** qua apex.server.process → UTL_HTTP | `fetch('http://172.25.x.x:3410')` từ browser | 00-core |
| A2 | Feature của page → **page-level Ajax Callback + pageId**; chỉ `appEvents`/`chatHeartbeat` là Application Process (Page 0) | App Process cho feature page-specific; gọi không có pageId | 02, 07 |
| A3 | Real-time mới **đi nhờ** `/api/events/:aus_id` + `apex:chatEvent` — không tạo poll loop / endpoint riêng | Thêm long-poll thứ 2, ORDS thread mới | 00, 01 |
| A4 | Trong Ajax Callback: `:APP_USER` → lookup aus_id; `:G_AUS_ID` chỉ tin được ở Page 0 | Dùng `:G_AUS_ID` trong callback page con | 07 |
| A5 | Trang/feature chat mới dùng **native APEX** (vanilla JS + PL/SQL trả HTML), không React/JSX | Thêm JSX mới (đang bị loại bỏ) | 02, 03 |
| A6 | Page item `P${pageId}_NAME`, `var pageId = $v('pFlowStepId')`; JS đọc `$v('P'+pageId+'_X')` | `$v('P_CONV_ID')` thiếu pageId | 05 |
| A7 | Bảng remote (APP_USERS/EMPLOYEES…) → `/*+ MATERIALIZE */`, `RETURNING CLOB`, INTERVAL là bind var | Hàm/INTERVAL literal đẩy sang remote → ORA-02000 | 04, 07 |
| A8 | POST callback: `Connection: close` + `UTL_RAW.CAST_TO_RAW` + `WRITE_RAW` + Content-Length theo byte | `WRITE_TEXT`/`LENGTHB`, thiếu Connection:close → request aborted | 07 |
| A9 | Node: `withConn(fn)` cho mọi query, `normalize()` hạ tên cột, middleware escape `\uXXXX` (charCodeAt) | Query trên CQN connection; trả cột UPPERCASE; regex Unicode trong middleware | 01, 00 |
| A10 | INSERT chat: `CONV_SEQ/MSG_SEQ.NEXTVAL` + `SYSDATE` tường minh; không `RETURNING INTO` trong App Process | Dựa DEFAULT; `RETURNING INTO` → ORA-22816 | 04, 07 |
| A11 | CSS map vào design token hệ thống (`var(--primary-color,…)`), không hardcode màu | Màu hex cứng rải rác | 05 |
| A12 | Button trong APEX **luôn** `type="button"`; outside-click dùng `click` không `mousedown` | Thiếu type → submit reload trang | 05, 07 |
| A13 | Iframe modal nghe `apex:chatEvent` phải bind bằng **`window.parent.apex.jQuery`**, không phải jQuery của iframe | Bind bằng `apex.jQuery` (iframe) lên parent.document → handler không bao giờ chạy ("event tới mà không refresh") | 01, 03 |

## Mức độ phát hiện

- 🔴 **Chặn** — phá luồng xương sống / chắc chắn lỗi runtime / lỗ hổng bảo mật. (A1, A8, A10, SQL injection…)
- 🟡 **Lệch** — chạy được nhưng đi chệch pattern đã thiết lập; sự bất nhất sẽ tích tụ. **Đây là mục tiêu chính của skill.**
- 🔵 **Gợi ý** — cải thiện nhỏ, không bắt buộc.
- 🟢 **Tiến hóa** — cách mới tốt hơn cách cũ; đề xuất cập nhật convention + migrate chỗ cũ (kết quả của Pha 4).

## Đầu ra (theo quy mô)

- **Review nhỏ** (1 file / 1 callback / vài phát hiện): trả lời gọn **ngay trong chat**, nhóm theo
  mức độ, mỗi phát hiện kèm `file:line` + đề xuất sửa cụ thể. Không tạo file.
- **Review lớn** (nhiều file / cả một luồng / ≥ ~6 phát hiện): ghi **file báo cáo** theo
  `templates/report-template.md`. Mặc định lưu vào `docs/reviews/REVIEW-<scope>-<YYYY-MM-DD>.md`
  (hỏi nếu muốn chỗ khác). Cuối báo cáo luôn có mục "Đề xuất thống nhất" tổng hợp các quyết định Pha 4.

Khi không chắc quy mô, hỏi người dùng muốn trả trong chat hay ghi file.

## Nguyên tắc giao tiếp

- Trả lời **bằng tiếng Việt**, giọng đồng nghiệp review cho nhau — thẳng thắn nhưng giải thích *why*.
- Mỗi phát hiện phải **trích dẫn được** (`file:line`) và **hành động được** (đề xuất sửa cụ thể, không
  chung chung).
- Không bịa pitfall. Nếu nghi ngờ một quy ước, **mở tài liệu/code ra kiểm chứng** rồi mới kết luận —
  recall có thể đã cũ so với code hiện tại.
- Phân biệt rõ "đây là lỗi" vs "đây là khác biệt phong cách" — đừng biến review thành áp đặt sở thích.
