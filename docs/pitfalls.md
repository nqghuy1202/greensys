# Pitfalls & Gotchas

## SSE / DBMS_CRYPTO

### PLS-00512 — Cannot directly access remote package variable

`DBMS_CRYPTO.HMAC_SH256` là package constant, không dùng trực tiếp được trong APEX Application Process. Dùng giá trị số thay thế:

```sql
-- Sai:
typ => DBMS_CRYPTO.HMAC_SH256
-- Đúng:
typ => 2   -- DBMS_CRYPTO.HMAC_SH256 = 2
```

All known traps in this project. Check before coding.

## Oracle / PL/SQL

### ORA-22816 — RETURNING INTO in Application Processes

`INSERT ... RETURNING INTO` does not work inside APEX Application Processes.

```sql
-- Wrong:
INSERT INTO CHAT_CONVERSATIONS (conv_id, ...) VALUES (CONV_SEQ.NEXTVAL, ...)
RETURNING conv_id INTO l_conv_id;

-- Correct:
l_conv_id := CONV_SEQ.NEXTVAL;
INSERT INTO CHAT_CONVERSATIONS (conv_id, ...) VALUES (l_conv_id, ...);
```

### ORA-06502 — TO_NUMBER inside CASE expressions

Never use `TO_NUMBER()` inside CASE expressions when building JSON or URL strings — causes mixed VARCHAR2+NUMBER type error. Use string values directly.

### ORA-02000 — INTERVAL literal with remote tables

Never write `SYSTIMESTAMP - INTERVAL '35' SECOND` in SQL that touches remote tables (APP_USERS, EMPLOYEES etc via DBLINK.GIACAT.VN). The literal gets pushed to the remote server.

```sql
-- Wrong (SQL touching remote tables):
WHERE o.last_seen >= SYSTIMESTAMP - INTERVAL '35' SECOND

-- Correct (PL/SQL variable is a bind value, not a literal):
DECLARE
  l_cutoff TIMESTAMP := SYSTIMESTAMP - INTERVAL '35' SECOND;
BEGIN
  SELECT ... WHERE o.last_seen >= l_cutoff ...
```

### ORA-02000 — REGEXP_REPLACE on remote columns

Functions applied to remote columns are pushed to the remote server. Must use `/*+ MATERIALIZE */` hint to execute CTE locally first. See `04-oracle-db.md`.

### VISCII control characters in employee names

Employee names from the remote DB may contain bytes < 0x20. Fix in the outer query after MATERIALIZE:

```sql
REGEXP_REPLACE(r.full_name, '[[:cntrl:]]', '')
```

### RETURNING CLOB on JSON_ARRAYAGG

Add `RETURNING CLOB` for any result list with > ~10 items (>4000 chars). Do NOT declare `l_result CLOB` and pass directly to `HTP.p()` — Oracle wraps CLOB values in quotes, turning `{"key":[...]}` into `{"key":"[...]"}`.

### conv_id / msg_id must be explicit in INSERT

Always use `CONV_SEQ.NEXTVAL` / `MSG_SEQ.NEXTVAL` explicitly in INSERT. Never rely on table DEFAULT.

### create_date must be explicit in INSERT

Use `SYSDATE` explicit in INSERT — do not rely on table DEFAULT.

## APEX Application Processes

### :APP_USER vs :G_AUS_ID

`:G_AUS_ID` is unreliable in Application Processes — often NULL in AJAX session context. Always use `:APP_USER` + lookup:

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

**Exception:** page-level callbacks on Page 0 (`notificationWait`, `chatHeartbeat`) — `:G_AUS_ID` is reliable there.

### pageId in apex.server.process — Rule kiến trúc

**Rule bất biến:** Feature của page nào thì Ajax Callback phải nằm trên page đó, JS gọi với `pageId`.

```javascript
// Đúng — callback nằm trên chính page đang chạy:
apex.server.process('chatSend', data, { pageId: window.pageId, dataType: 'json', ... });

// Sai — Application Process cho feature page-specific:
apex.server.process('chatSend', data, { dataType: 'json', ... });  // không có pageId
```

`window.pageId` được set trong "Function and Global Variable Declaration" của mọi page: `var pageId = $v('pFlowStepId')`.

**Chỉ dùng Application Process (không pageId) cho:**
- `appEvents` — Page 0, long-poll toàn hệ thống
- `chatHeartbeat` — Page 0, online presence toàn hệ thống

`apex.server.process` với `pageId` của một page khác → `parsererror` ("Process not found") trong APEX 24.2.

### $v('G_AUS_ID') always returns ""

`G_AUS_ID` is an Application Item — it has no DOM element. `$v()` reads from DOM.

- Use `&G_AUS_ID.` server-side substitution (replaced before HTML is sent to browser)
- Or `$v('P0_AUS_ID')` — Page 0 hidden item which does have a DOM element

## Server / Node.js

### CQN_PORT must differ from PORT

oracledb opens a TCP listener on `CQN_PORT`. If `CQN_PORT === PORT` → `EADDRINUSE`. Keep `PORT=3410`, `CQN_PORT=3141`.

### IP address typo — 172 not 127

`DB_CONNECTION_STRING` and `CQN_HOST` use `172.25.x.x`. Typing `127.25.x.x` causes `ORA-12514` (DB) or silent connection failure (CQN).

### Unicode middleware — charCodeAt only

Do NOT use regex with Unicode range literals in the `res.json()` escape middleware — the Edit tool may garble multi-byte chars. The current implementation uses `charCodeAt()` loops; keep it that way.

## APEX JSX / Frontend

### Every `<button>` must have `type="button"`

APEX wraps the entire page in `<form id="wwvFlowForm">`. A button without explicit type defaults to `type="submit"` → full page reload on click.

```jsx
// Wrong:
<button className="icon-btn" onClick={fn}>...</button>

// Correct:
<button type="button" className="icon-btn" onClick={fn}>...</button>
```

### mousedown vs click for dropdown outside-click detection

`mousedown` fires before `click`. If the outside-click detector uses `mousedown` on `document`, the menu unmounts before React's synthetic `click` fires on the menu item — the handler never runs.

```javascript
// Wrong:
document.addEventListener('mousedown', closeHandler);

// Correct:
document.addEventListener('click', closeHandler);
// Also add to the menu element:
onClick={e => e.stopPropagation()}
```

### Scroll container not scrolling (expands instead)

Symptom: `.chat-messages` or similar grows with content instead of scrolling. Root cause: a flex ancestor is missing `flex: 1` + `min-height: 0`. Walk up the ancestor chain.

```css
.chat-pane { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
```

### React/ReactDOM/Babel in "JavaScript → File URLs"

These load asynchronously. If Babel is in File URLs, `loadNext()` runs before Babel is available → `ReferenceError: Babel is not defined`. Load all three libs sequentially in "Execute when Page Loads" first, then load JSX files.

### APEX navigation — SSP checksum missing

`apex.util.makeApplicationUrl()` with `itemNames/itemValues` does NOT generate an SSP checksum → `APEX.SESSION_STATE.SSP_CHECKSUM_MISSING`. Checksum must be generated server-side via `APEX_UTIL.PREPARE_URL` in the `redirect_page` Application Process. See `05-apex-patterns.md`.

### sessionStorage for complex APEX URL values

Values containing commas (currency amounts), Unicode, or JSON arrays cannot be safely passed through APEX URL params. Store in `sessionStorage` and pass only simple IDs/codes through `x02`.

### CSS vs JSX deployment in APEX

- **CSS files**: can be pasted into Page → CSS → Inline (APEX limit ~32KB)
- **JSX files**: must remain as Static Application Files — contain JSX syntax requiring `Babel.transform()` at runtime via `fetch()`

### IIFE scope — Dynamic Actions cannot call private functions

`dcJson`, `closeCompose`, `loadConvList`, `selectConv`, `sendMessage` etc. are private inside the `(function($){...})(apex.jQuery)` IIFE in `doc-chat-page.js`. Dynamic Action "Execute JavaScript Code" runs in global scope → `ReferenceError: dcJson is not defined`.

**Fix:** Expose via `window.dc*` at the bottom of the IIFE (already done in `doc-chat-page.js`). In DA code, use `window.dcCloseCompose()`, `window.dcSendMessage()`, etc. — never bare function names.

```javascript
// DA code — correct:
window.dcSendMessage();
window.dcLoadConvList(function() { window.dcSelectConv(convId); });

// In-IIFE code — correct (dcJson visible here):
dcJson('docChatCreate', { ... }, function(data) { ... });
```

## UTL_HTTP — POST requests

### BadRequestError: request aborted — thiếu `Connection: close`

HTTP/1.1 mặc định keep-alive. Khi Oracle gửi POST mà không có `Connection: close`, Node.js body parser (`raw-body`) thấy socket đóng sớm → `BadRequestError: request aborted`.

**Fix bắt buộc cho mọi POST callback:**

```sql
l_req := UTL_HTTP.BEGIN_REQUEST(l_url, 'POST', 'HTTP/1.1');
UTL_HTTP.SET_HEADER(l_req, 'Content-Type',   'application/json; charset=utf-8');
UTL_HTTP.SET_HEADER(l_req, 'Connection',     'close');                                    -- bắt buộc
UTL_HTTP.SET_HEADER(l_req, 'Content-Length',  TO_CHAR(UTL_RAW.LENGTH(UTL_RAW.CAST_TO_RAW(l_payload))));
UTL_HTTP.WRITE_RAW(l_req, UTL_RAW.CAST_TO_RAW(l_payload));                               -- WRITE_RAW, không phải WRITE_TEXT
```

- `Connection: close` — tránh keep-alive gây abort
- `UTL_RAW.CAST_TO_RAW` + `WRITE_RAW` — đếm và gửi đúng UTF-8 bytes
- `LENGTHB` / `WRITE_TEXT` — sai vì dùng charset DB (WE8MSWIN1252), Content-Length lệch với byte thực tế

Callbacks GET (appEvents, docChatRead, docChatTyping) dùng `WRITE_TEXT` là đúng vì không có body.
