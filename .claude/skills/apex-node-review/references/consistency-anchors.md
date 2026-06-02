# Mỏ neo nhất quán — chi tiết & ví dụ

Đọc file này khi cần đối chiếu kỹ một điểm lệch trong Pha 3. Mỗi mỏ neo có: **bản chất**, dạng
**đúng (good)**, dạng **lệch (drift)** thường gặp, và **vì sao** convention tồn tại (để giải thích
trong Pha 4, không ra lệnh suông).

## Mục lục

- [A1 — Browser không gọi thẳng IP private](#a1)
- [A2 — Page-level Callback vs Application Process](#a2)
- [A3 — Real-time đi nhờ poll hợp nhất](#a3)
- [A4 — :APP_USER vs :G_AUS_ID](#a4)
- [A5 — Native APEX, không JSX mới](#a5)
- [A6 — Page item naming + pageId](#a6)
- [A7 — Bảng remote: MATERIALIZE / CLOB / INTERVAL](#a7)
- [A8 — POST callback: Connection close + WRITE_RAW](#a8)
- [A9 — Node: withConn / normalize / Unicode middleware](#a9)
- [A10 — INSERT chat: NEXTVAL / SYSDATE / không RETURNING INTO](#a10)
- [A11 — CSS map vào design token](#a11)
- [A12 — Button type + outside-click](#a12)
- [A13 — Iframe modal: bind apex:chatEvent bằng jQuery trang cha](#a13)

---

<a id="a1"></a>
## A1 — Browser không gọi thẳng IP private

**Bản chất:** Server B (`172.25.10.38`) là IP private; browser không tới được, và HTTPS→HTTP là
Mixed Content. Mọi giao tiếp browser → Node phải qua `apex.server.process → APEX PL/SQL → UTL_HTTP`.

**Good:** `apex.server.process('docChatSend', {...}, { pageId })` → callback PL/SQL → UTL_HTTP.

**Drift:** `fetch('http://172.25.10.38:3410/api/...')` hoặc `XMLHttpRequest` tới IP private ngay
trong JS trình duyệt. → 🔴 Chặn.

**Why:** Không chỉ "xấu" — nó *không chạy được* từ máy người dùng và vỡ Mixed Content. Đây là ràng
buộc mạng cứng, không phải sở thích.

---

<a id="a2"></a>
## A2 — Page-level Callback vs Application Process

**Bản chất:** Feature của một page cụ thể → Ajax Callback **đặt trên chính page đó**, JS gọi kèm
`pageId`. Application Process (Page 0, không pageId) **chỉ** dành cho thứ toàn hệ thống: `appEvents`,
`chatHeartbeat`.

**Good:**
```javascript
apex.server.process('chatSend', data, { pageId: window.pageId, dataType: 'json' });
// window.pageId = $v('pFlowStepId') khai báo trong Function and Global Variable Declaration
```

**Drift:** Tạo Application Process cho một feature riêng của page (vd `chatSend` làm App Process),
hoặc gọi `apex.server.process('chatSend', data, { dataType:'json' })` **thiếu pageId**.

**Why:** Trong APEX 24.2, gọi `apex.server.process` với pageId của page khác → `parsererror`
("Process not found"). App Process không có page scope nên không quản lý được theo page và dễ
xung đột tên. Xem `07-pitfalls.md` mục "pageId in apex.server.process".

---

<a id="a3"></a>
## A3 — Real-time đi nhờ poll hợp nhất

**Bản chất:** Chỉ có **một** endpoint long-poll `/api/events/:aus_id` — một ORDS thread/user. Tính
năng real-time mới (typing, read receipt, presence…) phải **đi nhờ** kênh này và nhận qua sự kiện
jQuery `apex:chatEvent`, **không** tạo poll loop hay endpoint long-poll thứ hai.

**Good (frontend):**
```javascript
$(document).on('apex:chatEvent', function (e, ev) {
  if (ev.type === 'typing') { /* ... */ }
});
```
**Good (Node):** thêm `type` mới vào payload đẩy qua `events.js` `deliverToUser`/`deliverToConv`.

**Drift:** Thêm `apex.server.process('myFeatureWait', ...)` chạy long-poll riêng, hoặc route Node
`/api/myfeature/wait/:id` mở thread ORDS thứ hai. → 🟡 Lệch (nặng — tái phát đúng bottleneck ORDS
mà dự án vừa gỡ bằng cách hợp nhất 2 poll thành 1).

**Why:** Mỗi user vốn giữ ORDS thread cho poll. Tách poll riêng nhân đôi thread → bão hòa pool
(~15 user). Cả kiến trúc đã merge về một endpoint để chịu tải; nhánh mới phá điều đó là lùi lại.
Xem `00-core.md` (Unified Long-poll) + `08-archive.md` (ORDS Scalability).

---

<a id="a4"></a>
## A4 — :APP_USER vs :G_AUS_ID

**Bản chất:** Trong Ajax Callback của page con, `:G_AUS_ID` thường NULL ở context AJAX. Phải dùng
`:APP_USER` rồi lookup. Ngoại lệ: callback trên **Page 0** (`chatHeartbeat`, `appEvents`) thì
`:G_AUS_ID` tin được.

**Good:**
```sql
IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
  HTP.p('{"error":"auth"}'); RETURN;
END IF;
BEGIN
  SELECT aus_id INTO l_aus_id FROM APP_USERS WHERE LOWER(user_name) = LOWER(:APP_USER);
EXCEPTION WHEN NO_DATA_FOUND THEN
  HTP.p('{"error":"user_not_found"}'); RETURN;
END;
```

**Drift:** Dùng `:G_AUS_ID` trực tiếp trong callback page con để xác định người dùng. → 🟡/🔴 (sai
danh tính → có thể lộ/nhầm dữ liệu giữa user).

**Why:** Application Item không được gửi tin cậy trong session AJAX của page con. Xem `07-pitfalls.md`.

---

<a id="a5"></a>
## A5 — Native APEX, không JSX mới

**Bản chất:** Hướng hiện tại là **native APEX**: vanilla JS + PL/SQL trả HTML, JS swap innerHTML.
Doc Chat đã chuyển xong; Chat System đang chuyển JSX → native. **Không thêm code React/JSX mới.**

**Good:** Callback PL/SQL trả HTML (vd `dcConvListHtml`), JS thuần trong `doc-chat-page.js` /
`chat-page.js`.

**Drift:** Thêm file `.jsx` mới, thêm `Babel.transform`, hoặc dựng feature mới bằng React component.
→ 🟡 Lệch (đi ngược hướng di trú đang diễn ra; `_archive/` là nơi JSX cũ về hưu).

**Why:** JSX cần Babel runtime, Static Application Files, load tuần tự phức tạp và đang bị loại bỏ.
Thêm JSX mới làm phình thứ sắp xóa. Xem `02-chat-system.md`, `03-doc-chat.md`.

---

<a id="a6"></a>
## A6 — Page item naming + pageId

**Bản chất:** Mọi page khai báo `var pageId = $v('pFlowStepId')`. Page item theo pattern
`P${pageId}_NAME`. JS đọc/ghi luôn kèm prefix pageId.

**Good:** `$v('P' + pageId + '_CONV_ID')` / `apex.item('P'+pageId+'_CONV_ID').setValue(v)`.

**Drift:** `$v('P_CONV_ID')` (thiếu pageId) → item không tìm thấy, trả `""` âm thầm. Hoặc hardcode
số page (`$v('P10022710201_CONV_ID')`) trong code lẽ ra phải tái dùng nhiều page.

**Why:** Convention toàn dự án để code page portable và tránh `$v()` trả rỗng âm thầm. Xem
`05-apex-patterns.md`.

---

<a id="a7"></a>
## A7 — Bảng remote: MATERIALIZE / CLOB / INTERVAL

**Bản chất:** `APP_USERS`, `EMPLOYEES`, `DEPARTMENTS`, `POSITIONS` nằm ở instance khác qua
`DBLINK.GIACAT.VN`. Hàm SQL trên cột remote bị đẩy sang server remote → `ORA-02000/02063`.

**Good:**
```sql
WITH remote_data AS (
  SELECT /*+ MATERIALIZE */ u.aus_id, NVL(e.full_name,'Unknown') AS full_name, u.user_name
  FROM APP_USERS u JOIN EMPLOYEES e ON e.emp_id = u.emp_id WHERE ...
)
SELECT JSON_ARRAYAGG(JSON_OBJECT(
  'full_name' VALUE REGEXP_REPLACE(r.full_name,'[[:cntrl:]]','')  -- sau MATERIALIZE
  ...) RETURNING CLOB)
FROM remote_data r LEFT JOIN local_table lt ON lt.aus_id = r.aus_id;
```
INTERVAL phải là bind var: `l_cutoff TIMESTAMP := SYSTIMESTAMP - INTERVAL '35' SECOND;`

**Drift:** `REGEXP_REPLACE`/`INTERVAL '35' SECOND` literal đặt thẳng trong SQL chạm bảng remote;
FK constraint qua DB link; quên `RETURNING CLOB` ở list >~10 phần tử (JSON bị cắt 4000 ký tự);
khai `l_result CLOB` rồi `HTP.p(l_result)` (Oracle bọc CLOB trong dấu nháy → JSON hỏng).

**Why:** Tránh ORA-02000, VISCII control char (JSON `Bad control character`), và JSON bị truncate.
Xem `04-oracle-db.md` + `07-pitfalls.md`.

---

<a id="a8"></a>
## A8 — POST callback: Connection close + WRITE_RAW

**Bản chất:** UTL_HTTP POST phải gửi `Connection: close`, đếm Content-Length theo **byte thực**, và
ghi bằng `WRITE_RAW`.

**Good:**
```sql
l_req := UTL_HTTP.BEGIN_REQUEST(l_url, 'POST', 'HTTP/1.1');
UTL_HTTP.SET_HEADER(l_req, 'Content-Type', 'application/json; charset=utf-8');
UTL_HTTP.SET_HEADER(l_req, 'Connection',   'close');
UTL_HTTP.SET_HEADER(l_req, 'Content-Length', TO_CHAR(UTL_RAW.LENGTH(UTL_RAW.CAST_TO_RAW(l_payload))));
UTL_HTTP.WRITE_RAW(l_req, UTL_RAW.CAST_TO_RAW(l_payload));
```

**Drift:** Thiếu `Connection: close` (keep-alive → `BadRequestError: request aborted` ở Node
`raw-body`); dùng `WRITE_TEXT`/`LENGTHB` (charset DB WE8MSWIN1252 → Content-Length lệch byte thực).
→ 🔴 Chặn (POST sẽ fail không ổn định).

**Why:** HTTP/1.1 mặc định keep-alive; body parser Node thấy socket đóng sớm thì abort. Xem
`07-pitfalls.md` mục "UTL_HTTP POST". GET callback (appEvents, docChatRead/Typing) dùng `WRITE_TEXT`
là đúng vì không có body.

---

<a id="a9"></a>
## A9 — Node: withConn / normalize / Unicode middleware

**Bản chất:**
- Mọi query DB qua `withConn(fn)` (lấy connection từ pool, đóng trong finally).
- `normalize(rows)` hạ tên cột Oracle UPPERCASE trước `res.json()`.
- CQN connection (`events: true`) **không** dùng để query — query trên connection pool riêng.
- Middleware override `res.json()` escape mọi ký tự non-ASCII thành `\uXXXX` bằng vòng lặp
  `charCodeAt()` — **không** regex range Unicode.

**Drift:** Tự `getConnection`/`pool.getConnection` rồi quên `conn.close()` trong finally (rò rỉ
connection); trả cột UPPERCASE thẳng cho frontend (lệch `from_aus_id` vs `FROM_AUS_ID`); query trên
CQN connection; sửa middleware Unicode bằng regex range. → 🟡/🔴.

**Why:** Rò rỉ connection làm cạn pool; tên cột không nhất quán làm frontend `Number(row.from_aus_id)`
trả NaN; regex Unicode trong middleware bị Edit làm hỏng multi-byte (xem `00-core.md`,
`07-pitfalls.md`).

---

<a id="a10"></a>
## A10 — INSERT chat: NEXTVAL / SYSDATE / không RETURNING INTO

**Good:**
```sql
l_conv_id := CONV_SEQ.NEXTVAL;
INSERT INTO CHAT_CONVERSATIONS (conv_id, ..., create_date) VALUES (l_conv_id, ..., SYSDATE);
```
Soft delete: set `delete_date = SYSTIMESTAMP`, không DELETE row.

**Drift:** `INSERT ... RETURNING conv_id INTO l_conv_id` trong Application Process → `ORA-22816`;
dựa vào table DEFAULT cho `conv_id`/`create_date`; DELETE cứng row chat.

**Why:** RETURNING INTO không chạy trong App Process; DEFAULT không đáng tin trên đường này. Xem
`04-oracle-db.md`, `07-pitfalls.md`.

---

<a id="a11"></a>
## A11 — CSS map vào design token

**Bản chất:** CSS chat (`chat-page.css` scope `#chat-root`, `doc-chat.css` scope `#doc-chat-root`)
khai báo bảng màu cục bộ **một chỗ** (khối biến đầu file) rồi map vào token hệ thống ERP có fallback,
vd `--primary: var(--primary-color, #15674C)`. Không hardcode màu rải rác.

**Drift:** Màu hex cứng (`#15674C`, `rgba(...)` xanh cứng) nằm rải trong từng rule; focus glow dùng
`rgba()` thay vì `color-mix(... var(--primary-color) ...)`. → 🔵/🟡.

**Why:** Đổi theme toàn module chỉ cần sửa khối biến đầu file; hardcode làm theme lệch giữa các
server. Xem `05-apex-patterns.md`.

---

<a id="a12"></a>
## A12 — Button type + outside-click

**Bản chất:** APEX bọc cả page trong `<form id="wwvFlowForm">`. Button thiếu `type` mặc định
`type="submit"` → reload trang. Outside-click detection dùng `click`, không `mousedown`.

**Drift:** `<button class="icon-btn" onclick=...>` thiếu `type="button"`; `document.addEventListener
('mousedown', closeHandler)` làm menu unmount trước khi click item kích hoạt. → 🟡.

**Why:** Submit reload phá UX; `mousedown` fire trước `click` nên handler không chạy. Xem
`05-apex-patterns.md`, `07-pitfalls.md`.

---

<a id="a13"></a>
## A13 — Iframe modal: bind apex:chatEvent bằng jQuery trang cha

**Bản chất:** Doc Chat modal (page 10022710201) chạy trong **iframe**. `global.js` ở **trang cha**
bắn `apex:chatEvent` bằng `.trigger()` của **jQuery trang cha**, trên `parent.document`. Page trong
iframe muốn nghe được phải bind handler bằng **đúng jQuery của trang cha**, không phải `apex.jQuery`
của iframe.

**Good:**
```javascript
var inIframe  = (window.parent && window.parent !== window);
var eventWin  = inIframe ? window.parent : window;
var $evt      = (eventWin.apex && eventWin.apex.jQuery) ? eventWin.apex.jQuery : $;
var $eventDoc = $evt(eventWin.document);
$eventDoc.on('apex:chatEvent', onChatEvent);   // bind bằng jQuery trang cha
```

**Drift:** Bên trong IIFE `(function($){…})(apex.jQuery)` của iframe, làm
`$(window.parent.document).on('apex:chatEvent', …)` — tức bind bằng jQuery **của iframe** lên parent
document. → 🔴 Handler **không bao giờ chạy**: event tới `parent.document` đầy đủ (poll OK) nhưng UI
đứng im. Triệu chứng đánh lừa: DevTools thấy response `{type:'message'}` về tới nơi mà modal vẫn không
refresh.

**Why:** jQuery custom event (`.trigger`) **không vượt qua 2 instance jQuery khác nhau**. Mỗi jQuery
lưu handler trong data store riêng theo `expando` (gồm version + số random, duy nhất mỗi lần load).
Trang cha và iframe là 2 document → 2 `apex.jQuery` → 2 `expando`. Handler do iframe-jQuery đăng ký nằm
dưới expando của iframe; `parentJQuery.trigger()` chỉ tra store của parent-jQuery → không thấy → không
gọi. (Event DOM native thì vượt frame được; nhưng `.trigger()` custom là synthetic, chỉ gọi handler
đăng ký qua *cùng* instance jQuery trên element đó.)

**Kiểm chứng nhanh (không cần deploy):** trong console của iframe, bind thử bằng parent-jQuery
`window.parent.apex.jQuery(window.parent.document).on('apex:chatEvent', (e,d)=>console.log(d))` rồi gửi
tin — nếu thấy log nghĩa là event vẫn tới parent.document, chỉ là code cũ bind sai instance.

> Phát hiện từ review luồng real-time 2026-06-02 (`docs/reviews/REVIEW-realtime-flow-2026-06-02.md`).
> Messenger (Normal page, cùng frame) không dính; chỉ page mở dạng iframe modal mới gặp.
