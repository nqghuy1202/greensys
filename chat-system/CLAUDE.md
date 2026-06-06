# Chat System — Messenger UI

Full-page chat 3 cột (sidebar danh sách / thread / info panel). APEX page type: **Normal** (không phải Modal). Deploy bằng **FGVD + Dynamic Action** — không React, không JSX, không Static Files.

## Files

```
chat-system/
  chat-page.fgvd.js     ← ACTIVE: paste vào "Function and Global Variable Declaration"
  chat-page.onload.js   ← ACTIVE: paste vào "Execute when Page Loads" (chỉ window.csInit())
  chat-page.css         ← ACTIVE: paste vào Page → CSS → Inline
  screenshots/          Ảnh chụp UI tham khảo
  CLAUDE.md             ← file này
  docs/
    da-setup.md         Bảng 22 Dynamic Actions + paste checklist
    native.sql          8 page-level Ajax Callbacks (SQL đầy đủ)
    native-plan.md      Kế hoạch chuyển từ JSX sang native (tham khảo)
    callbacks-v2.sql    Callbacks thời JSX (legacy reference)
```

## Deploy lên APEX — Quy trình 3 bước

### Bước 1 — Function and Global Variable Declaration
Paste toàn bộ `chat-page.fgvd.js`. File này chứa:
- `var pageId = $v('pFlowStepId');` (bắt buộc đầu file)
- Toàn bộ state + helper functions (trong IIFE)
- Expose `window.csOn*` cho Dynamic Actions gọi
- Binding `apex:chatEvent` và `unload` (giữ trong FGVD, không phải DA)

### Bước 2 — Execute when Page Loads
Paste `chat-page.onload.js` (chỉ 1 dòng: `window.csInit();`).

### Bước 3 — Dynamic Actions (22 DA)
Xem bảng đầy đủ trong `docs/da-setup.md`. Mỗi DA là:
- Event: Custom, jQuery Selector hoặc Click
- Fire on Init: No (trừ các DA init)
- JS Code: một lớp gọi `window.csOn*()`

### CSS
Paste `chat-page.css` vào Page → CSS → Inline (giới hạn ~32KB).

## Ajax Callbacks (8 — tạo trên Messenger page, không phải Application Process)

| Callback | Mô tả | Params |
|----------|-------|--------|
| `chatConvList` | Danh sách hội thoại (sidebar) | — |
| `chatMsgList` | Lịch sử tin nhắn | x01: conv_id |
| `chatMemberList` | Thành viên hội thoại | x01: conv_id |
| `chatContactList` | Danh sách liên lạc (tạo DM/nhóm) | — |
| `chatSend` | Gửi tin nhắn | x01: conv_id, x02: body, x03: reply_to_msg_id, x04: partner_aus_id |
| `chatCreate` | Tạo DM hoặc CHANNEL | — |
| `chatRead` | Đánh dấu đã đọc | x01: conv_id |
| `chatTyping` | Typing indicator | x01: conv_id |

SQL đầy đủ: `docs/native.sql`

**Gọi từ JS — luôn dùng pageId:**
```javascript
apex.server.process('chatSend', { x01: convId, x02: body, x03: '', x04: '' }, {
    pageId: window.pageId,   // bắt buộc
    dataType: 'json',
    success: function(data) { ... }
});
```

## Kiến trúc Frontend

```
FGVD (chat-page.fgvd.js)
  ├── State: currentConvId, currentAusId, messageCache, participantCache
  ├── csInit() — khởi tạo, load conv list, bind apex:chatEvent
  ├── csOnConvSelect(convId) — load thread + members
  ├── csOnSend() — gửi tin, optimistic update
  ├── csOnTyping() — debounced typing indicator
  ├── csOnSearch(query) — search in thread
  └── window.csOn* — expose tất cả handlers

apex:chatEvent listener (trong FGVD):
  type=message    → append tin vào thread nếu đúng conv, reload sidebar badge
  type=typing     → hiện typing bubble
  type=typing_stop → ẩn bubble
  type=read       → update read receipts
```

## :APP_USER Pattern (bắt buộc trong mọi callback)

```sql
IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
  HTP.p('{"error":"auth"}'); RETURN;
END IF;
BEGIN
  SELECT aus_id INTO l_aus_id FROM APP_USERS
  WHERE LOWER(user_name) = LOWER(:APP_USER);
EXCEPTION WHEN NO_DATA_FOUND THEN
  HTP.p('{"error":"user_not_found"}'); RETURN;
END;
```

## MATERIALIZE Pattern (bắt buộc khi JOIN remote tables)

`APP_USERS`, `EMPLOYEES`, `DEPARTMENTS`, `POSITIONS` là remote tables qua DBLINK. Phải dùng `/*+ MATERIALIZE */`:

```sql
WITH remote_data AS (
  SELECT /*+ MATERIALIZE */
         u.aus_id,
         REGEXP_REPLACE(NVL(e.full_name,'Unknown'),'[[:cntrl:]]','') AS full_name
  FROM   APP_USERS u JOIN EMPLOYEES e ON e.emp_id = u.emp_id
  WHERE  ...
)
SELECT JSON_ARRAYAGG(
    JSON_OBJECT('full_name' VALUE r.full_name, ...) RETURNING CLOB
  )
FROM remote_data r LEFT JOIN local_table lt ON lt.aus_id = r.aus_id;
```

## Schema Chat — Tên cột chuẩn

| Bảng | Cột | Ghi chú |
|------|-----|---------|
| `CHAT_CONVERSATIONS` | `conv_type` | `'DM'` hoặc `'CHANNEL'` |
| `CHAT_CONVERSATIONS` | `doc_type`, `doc_no` | NULL = Messenger; NOT NULL = Doc Chat |
| `CHAT_MESSENGERS` | `from_aus_id` | Sender (dùng check isMine) |
| `CHAT_MESSENGERS` | `aus_id` | DM partner; NULL cho CHANNEL |
| `CHAT_MESSENGERS` | `created_by` | username string (`:G_USER_NAME`) |
| `DEPARTMENTS` | `dep_name` | Không phải `name` |
| `POSITIONS` | `position_name` | |
| `APP_USERS` | `user_name` | Có underscore — không phải `username` |

## Pitfalls Chat System

**pageId bắt buộc trong apex.server.process:** Thiếu `pageId` → APEX tìm Application Process → "Process not found" → parsererror. Mọi callback chat là page-level, phải pass `pageId`.

**window.csOn* chứ không phải hàm private:** Dynamic Action chạy trong global scope. Hàm trong IIFE không thể gọi trực tiếp — phải dùng `window.csOn*` đã expose.

**conv_id / msg_id:** Luôn dùng `CONV_SEQ.NEXTVAL` / `MSG_SEQ.NEXTVAL` explicit trong INSERT. Không dùng DEFAULT.

**create_date:** Explicit `SYSDATE` trong INSERT — không dùng DEFAULT.

**RETURNING INTO:** Không dùng trong APEX Application Process (ORA-22816). Gán sequence trước:
```sql
l_conv_id := CONV_SEQ.NEXTVAL;
INSERT INTO CHAT_CONVERSATIONS (conv_id, ...) VALUES (l_conv_id, ...);
```

**INTERVAL literal + remote tables:** Không viết `SYSTIMESTAMP - INTERVAL '35' SECOND` trong SQL chạm remote table — push xuống remote server gây ORA-02000. Dùng PL/SQL variable.

## CSS — Token hệ thống

`chat-page.css` không hardcode màu — map vào ERP design tokens:

| Biến cục bộ | Token hệ thống |
|-------------|---------------|
| `--primary` | `var(--primary-color, #15674C)` |
| `--surface` | `var(--white-color, #FFFFFF)` |
| `--border` | `var(--border-color, #E6E6E6)` |
| `--danger` | `var(--red-color, #D81F25)` |

Đổi màu toàn module → sửa khối biến đầu file, không sửa từng rule.
