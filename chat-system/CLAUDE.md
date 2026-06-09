# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Chat System — Messenger UI

Full-page chat 3 cột (sidebar / thread / info panel). APEX page type: **Normal**. Deploy bằng **FGVD + Dynamic Action** — không React, không JSX, không Static Files.

## Files

```
chat-system/
  chat-page.fgvd.js     ← paste vào "Function and Global Variable Declaration"
  chat-page.onload.js   ← paste vào "Execute when Page Loads" (chỉ window.csInit())
  chat-page.css         ← paste vào Page → CSS → Inline
  global.js             ← Theme global JS (SSE client + notification bell)
  docs/
    da-setup.md         Bảng 22 Dynamic Actions + checklist deploy
    native.sql          9 page-level Ajax Callbacks SQL đầy đủ
    page0-callbacks.sql 3 Page 0 / Application Process callbacks (sseToken, chatHeartbeat, notificationCount)
    callbacks-v2.sql    Legacy JSX callbacks (tham khảo)
```

## Deploy lên APEX

### 1 — Function and Global Variable Declaration
Paste toàn bộ `chat-page.fgvd.js`. **Quan trọng:** `window.CHAT_AUS_ID = &G_AUS_ID.` và `var pageId = $v('pFlowStepId')` phải nằm ở **đầu FGVD**, không phải Execute-on-load — IIFE đọc AUS_ID ngay khi FGVD chạy, trước Execute-on-load.

### 2 — Execute when Page Loads
Paste `chat-page.onload.js` (chỉ `window.csInit();`).

### 3 — Dynamic Actions (22 DA)
Xem bảng đầy đủ trong `docs/da-setup.md`. Quy ước bắt buộc cho **mọi DA**:
- Selection Type: `jQuery Selector`, Event Scope: **`Dynamic`**, Static Container: `#chat-root`
- `Dynamic` bắt buộc vì phần tử được render bằng `innerHTML` — Scope `Static` sẽ bỏ qua click trên phần tử mới tải
- Fire on Initialization: `No`
- Luôn truyền `this.triggeringElement` và `this.browserEvent` vào hàm

Event `input` (search, auto-resize, tên nhóm): dùng **Custom event** tên `input`, không phải Key Release — để bắt cả paste.

### 4 — CSS
Paste `chat-page.css` vào Page → CSS → Inline (~32KB limit).

### 5 — Schema (chạy 1 lần)
```sql
ALTER TABLE CHAT_PARTICIPANTS ADD (
  is_pinned NUMBER(1) DEFAULT 0 NOT NULL
    CONSTRAINT chk_part_pinned CHECK (is_pinned IN (0,1)));
```

## Ajax Callbacks (9 — tạo trên Messenger page, không phải Application Process)

| Callback | Loại | Params |
|----------|------|--------|
| `chatConvListHtml` | HTML | x01=filter(ALL/DM/GROUP/DOC), x02=search, x03=quick(UNREAD/PINNED) |
| `chatMsgThreadHtml` | HTML | x01=conv_id |
| `chatMembersHtml` | HTML | x01=conv_id |
| `chatContactsHtml` | HTML | — |
| `chatSend` | JSON | x01=conv_id, x02=body, x03=reply_to_msg_id, x04=partner_aus_id |
| `chatCreate` | JSON | x01=conv_type, x02=name, x03=members JSON array |
| `chatRead` | JSON | x01=conv_id |
| `chatTyping` | JSON | x01=conv_id |
| `chatPin` | JSON | x01=conv_id, x02=1/0 |

HTML callbacks trả HTML fragment trực tiếp inject vào `innerHTML`. Action callbacks relay qua UTL_HTTP đến Node.js `172.25.10.38:3410`.

**Gọi từ JS — luôn có pageId:**
```javascript
apex.server.process('chatSend', { x01: convId, x02: body, x03: '', x04: '' }, {
    pageId: window.pageId,
    dataType: 'json',
    success: function(data) { ... }
});
// HTML callbacks dùng dataType: 'text'
```

## Kiến trúc Frontend

```
FGVD (chat-page.fgvd.js — IIFE)
  ├── State: activeConvId, AUS_ID, selectedMembers, replyToMsgId, typingUsers
  ├── csInit()              — load conv list, bind apex:chatEvent
  ├── csHtml(proc, params, targetId)  — gọi HTML callback → innerHTML
  ├── csJson(proc, params, cb)        — gọi action callback → JSON
  ├── csOnConvClick()       — load chatMsgThreadHtml + chatMembersHtml
  ├── csOnSend()            — gửi tin qua chatSend
  ├── csOnTyping() debounced — chatTyping → chatTyping_stop
  ├── csOnSearchInput()     — debounced reload chatConvListHtml
  └── window.csOn*          — expose tất cả handlers cho DA

apex:chatEvent listener (giữ trong FGVD, không làm DA):
  type=message    → reload chatMsgThreadHtml nếu đúng conv
  type=typing     → hiện typing bubble
  type=typing_stop → ẩn bubble
  type=read       → update read receipts
```

3 binding giữ trong FGVD (không làm DA): `apex:chatEvent`, outside-click `closeTypeMenu`, outside-click `closeConvMenu`. DA không dùng `document`-level events vì thứ tự chạy mong manh với `stopPropagation`.

## global.js — SSE Client & Notification Bell

`global.js` chạy trên **mọi page** (inject qua Theme). Trách nhiệm:
- Mint SSE token qua `apex.server.process('sseToken')` → kết nối `EventSource` đến `https://chattest.erp100.vn/api/sse`
- `handleEvent`: `notification` → `fetchNotifCount()`; `message/typing/read` → trigger `apex:chatEvent` trên document
- Inject badge `#notif-badge` vào `.user-notificaiton` (typo trong APEX — 1 chữ i)
- `chatHeartbeat` mỗi 20s → track online presence

`sseToken` và `notificationCount` phải là **Application Process** (không pageId) vì global.js chạy trên mọi page.

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

Xem chi tiết trong `docs/oracle-db.md` (thư mục cha). Tóm tắt: mọi query JOIN `APP_USERS/EMPLOYEES/DEPARTMENTS/POSITIONS` phải dùng `/*+ MATERIALIZE */` trong CTE, `REGEXP_REPLACE(col, '[[:cntrl:]]', '')` trên text columns, `RETURNING CLOB` trên `JSON_ARRAYAGG`.

## Pitfalls đặc thù Chat System

**pageId bắt buộc:** Mọi callback chat là page-level. Thiếu `pageId` → APEX tìm Application Process → parsererror.

**window.csOn* cho DA:** DA chạy global scope, không thấy hàm private trong IIFE. Luôn dùng `window.csOn*`.

**CHAT_AUS_ID đọc sai = 0:** Nếu set `window.CHAT_AUS_ID` ở Execute-on-load thay vì đầu FGVD → IIFE đọc undefined → AUS_ID = 0 → isMine check sai, read receipts sai.

**chatPin không relay Node:** Ghim là trạng thái riêng mỗi user (`CHAT_PARTICIPANTS.is_pinned`) — cập nhật local DB trực tiếp, không push SSE event.

**chatContactsHtml — không bọc container:** Callback chỉ trả HTML bên trong `#cs-member-suggest-list`, KHÔNG bọc lại thẻ `<div id="cs-member-suggest-list">` — sẽ trùng ID và lồng sai.
