# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Chat System — Messenger UI

Full-page chat 3 cột (sidebar / thread / info panel). APEX page type: **Normal**. Deploy bằng **FGVD + Dynamic Action** — không React, không JSX, không Static Files.

## Files

```
chat-system/
  chat-page.fgvd.js        ← paste vào "Function and Global Variable Declaration"
  chat-page.onload.js      ← paste vào "Execute when Page Loads" (chỉ window.csInit())
  chat-page.css            ← paste vào Page → CSS → Inline
  global.js                ← Theme global JS (SSE client + notification bell)
  sse-worker.js            ← SharedWorker — upload lên Static Application Files
  application_process.sql  ← NGUỒN THẬT — 5 Application Process (Page 0, không pageId):
                              chatHeartbeat, getUrlNodeJs, loadAppConfig, notificationCount, sseToken
  docs/
    da-setup.md           Bảng 22 Dynamic Actions + checklist deploy
    native.sql            9 page-level Ajax Callbacks SQL đầy đủ
    page0-callbacks.sql   ⚠️ LỖI THỜI — bản nháp cũ, thiếu fix g_x01 fallback và thiếu
                           getUrlNodeJs/loadAppConfig. Đừng copy từ đây — dùng application_process.sql.
    native-plan.md        Nhật ký migration JSX→native (lịch sử, không phải kiến trúc hiện tại)
    callbacks-v2.sql      Legacy JSX callbacks (tham khảo)
```

**Không có lệnh build/test/lint** — dự án paste-tay vào APEX Builder, không phải npm project.
Trước khi paste JS, kiểm tra cú pháp cục bộ: `node --check global.js`, `node --check sse-worker.js`,
`node --check chat-page.fgvd.js`.

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

## global.js + sse-worker.js — SSE Client & Notification Bell

`global.js` chạy trên **mọi page** (inject qua Theme). Dùng **SharedWorker** (`sse-worker.js`) để tối ưu multi-tab:

```
Tab A ──┐
Tab B ──┼── MessagePort ──► sse-worker.js (SharedWorker)
Tab C ──┘                       │
                                ├── 1 SSE connection duy nhất (EventSource)
                                ├── Token cache — mint lại khi còn < 30s TTL
                                └── heartbeat_tick → chỉ "leader" gửi chatHeartbeat
```

**Flow mint token:** Worker không có APEX session → gửi `mint_token` tới leader → tab gọi `apex.server.process('sseToken', { x01: $v('P0_AUS_ID') })` → trả kết quả về worker.

**Leader = port có ping gần nhất** (`pickLeader()`), KHÔNG phải `ports[0]` cố định — vì `postMessage`
tới port đã đóng không throw, nên luôn dùng tab đầu tiên có thể gửi heartbeat/mint vào "lỗ đen" tới
~50s (tới khi prune). Áp dụng cho cả `sendHeartbeat` và `requestTokenFromTab`.

**Lifecycle khi 0 tab:** `pauseSSE()` đóng EventSource + dừng mọi timer khi `ports.length === 0`
(gọi từ `sendHeartbeat`, `requestTokenFromTab`, `scheduleReconnect`) — tránh worker chạy vô hạn
(SSE conn + mint loop) sau khi user đóng hết tab. Tab mới gửi `init` sẽ khởi động lại.

**Race double-connect:** cờ `_connecting` set NGAY khi vào `connectSSE()` (trước khi `getToken` async
trả về) để chặn 2 tab cùng gửi `init` gần như đồng thời tạo 2 `EventSource` (cái cũ orphan, không
bao giờ `close()`).

**Worker URL — không cần Page 0:** `workerScriptUrl()` tự dò thẻ `<script src=".../global.js">` (URL đã được APEX resolve đúng) rồi đổi tên → `sse-worker.js` cùng thư mục. KHÔNG còn cần `window.APP_FILES = '#APP_FILES#'` ở Page 0 FGVD (substitution không chạy trong file tĩnh; `apex.env.APP_FILES = undefined` ở APEX 24.2). Fallback khi không tìm thấy script tag: resolve `sse-worker.js` tương đối so với `window.location.href`.

`sseToken`, `chatHeartbeat`, `notificationCount`, `getUrlNodeJs` đều là **Application Process**
(không pageId) vì global.js chạy trên mọi page. `:G_AUS_ID` không tin cậy trong Application Process
AJAX context — `sseToken`/`chatHeartbeat` ưu tiên `apex_application.g_x01` (global.js gửi
`x01: $v('P0_AUS_ID')`), fallback `:G_AUS_ID`. `notificationCount` resolve qua `:APP_USER` lookup
(không tin `g_x01` từ client cho việc đếm — security).

**Tab liveliness:** Tab ping worker mỗi 25s. Worker prune port chết (không ping > 50s) trước mỗi
heartbeat tick / chọn leader. `dropPort()` gỡ đồng thời `ports[]` và `portPings` Map khi
`postMessage` lỗi (tránh rò entry).

**Cache cứng đầu:** sửa `sse-worker.js` xong phải **Terminate worker thủ công**
(`chrome://inspect/#workers`) hoặc đóng hết tab — browser cache SharedWorker rất chặt, không tự
reload khi file thay đổi.

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

**sseToken trả chuỗi rỗng:** Nguyên nhân phổ biến là `:G_AUS_ID` = NULL (unreliable trong Application Process). Fix: truyền `x01: $v('P0_AUS_ID')` từ JS, SQL dùng `COALESCE(NULLIF(TO_NUMBER(apex_application.g_x01), 0), TO_NUMBER(:G_AUS_ID))`.

**SharedWorker không reload khi sửa file:** Browser cache worker aggressively. Để force reload: `chrome://inspect/#workers` → Terminate, hoặc đóng hết tab rồi mở lại.
