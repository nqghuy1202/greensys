# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`nodejs-apex-oracle` is a Node.js 22 middleware server on **Server B** that bridges Oracle Database (Server A) with Oracle APEX 24.2 browser clients. It handles three independent features:
1. **Notification system** — CQN-triggered long-poll push for bell/notification menu
2. **Chat module** — real-time messaging with long-poll events, typing indicators, online status
3. **Doc Chat Modal** — "Trao đổi chứng từ" modal embedded in ERP pages (SO, PXK, HD…); each document has its own conversation scope

## Network Constraint — Critical

**Server B (`172.25.10.38`) is a private IP. Browsers cannot reach it directly.**

ALL browser → Node.js communication must go through:
```
Browser → apex.server.process (HTTPS) → APEX PL/SQL callback → UTL_HTTP (HTTP) → Node.js
```

Never propose direct browser → `http://172.25.x.x:3410` connections (Mixed Content + unreachable). The nginx WebSocket proxy exists on Server B but is unused because the browser cannot reach the private IP either. All new features must follow the `apex.server.process` → `UTL_HTTP` pattern.

## System Architecture

```
Browser (APEX client)
  │  apex.server.process(...)  — AJAX over HTTPS to APEX
  ▼
Server A — Oracle APEX 24.2 (erp.greensys.vn:8211)
  │  PL/SQL Ajax Callbacks → UTL_HTTP → Server B :3410
  │  CQN callback TCP (Oracle → Server B on CQN_PORT 3141)
  │  TCP:1521  oracledb pool connections
  ▼
Server B — Node.js 22 (172.25.10.38)
  chat-server/server.js  listening on PORT 3410
    ├── GET  /health
    ├── GET  /api/wait/:aus_id         (notification long-poll — 25s)
    ├── GET  /api/notify/:aus_id       (manual trigger)
    └── /api/chat/*                    (chat module — chat.js router)
```

## Running the Server

```bash
cd /opt/chat-server
npm install                              # install dependencies first time
pm2 start server.js --name chat-server --restart-delay 3000
pm2 logs chat-server --lines 20
pm2 restart chat-server
pm2 status
```

**Expected startup:**
```
[DB] Connection pool created
[CQN] Cache loaded: N rows
[CQN] Subscription active on USER_NOTIFICATIONS
[Server] Listening on 0.0.0.0:3410
```

**Port conflict (`EADDRINUSE`):** Usually caused by `CQN_PORT` equaling `PORT`. oracledb opens a TCP listener on `CQN_PORT` — keep them separate (`PORT=3410`, `CQN_PORT=3141`).

**Graceful shutdown:** `server.js` handles `SIGTERM`/`SIGINT` — drains all pending long-poll waiters (sends `timeout` response), closes HTTP server, then closes DB pool. pm2 sends `SIGTERM` on `pm2 restart`.

## Test Commands

```bash
# From chat-server/ directory
npm run test:connection          # DB connection only
npm run test:cqn                 # CQN standalone (stop server first)
curl "http://localhost:3410/health"
curl "http://localhost:3410/api/wait/<aus_id>"
curl "http://localhost:3410/api/chat/conversations/<aus_id>"
```

## Environment Variables (`chat-server/.env`)

| Variable | Example | Notes |
|----------|---------|-------|
| `DB_USER` | `dev24` | Oracle schema user |
| `DB_PASSWORD` | — | |
| `DB_CONNECTION_STRING` | `172.25.10.18:1521/pdbgc19c` | **172**, not 127 — common typo causes ORA-12514 |
| `PORT` | `3410` | HTTP server port |
| `CQN_HOST` | `172.25.10.38` | Server B IP — **172**, not 127 |
| `CQN_PORT` | `3141` | Must differ from PORT |
| `DB_POOL_MIN/MAX/INCREMENT` | `2/10/1` | |

## HTTP Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| GET | `/api/wait/:aus_id` | Notification long-poll (25s) |
| GET | `/api/notify/:aus_id` | Manual notification trigger |
| GET | `/api/chat/conversations/:aus_id` | Sidebar list |
| GET | `/api/chat/messages/:conv_id` | Message history |
| POST | `/api/chat/send` | Send message |
| GET | `/api/chat/events/:aus_id` | Chat long-poll (25s) |
| POST | `/api/chat/read/:conv_id/:aus_id` | Mark read |
| POST | `/api/chat/typing/:conv_id/:aus_id` | Typing indicator |
| POST | `/api/chat/heartbeat/:aus_id` | Online presence |
| GET | `/api/chat/online` | Online user list |
| GET | `/api/chat/members/:conv_id` | Conversation members |
| POST | `/api/chat/create` | Create DM or CHANNEL (accepts doc_type, doc_no) |
| GET | `/api/chat/doc-conversations` | Conversations for a specific document (query: doc_type, doc_no, aus_id) |

## Unicode Encoding — Critical

Oracle's `UTL_HTTP.READ_TEXT` re-interprets UTF-8 bytes using the DB charset (WE8MSWIN1252), breaking multi-byte sequences (e.g., "ư" C6B0 UTF-8 → "Æ°" Latin-1). Fix is in `server.js`: a middleware overrides `res.json()` globally to escape all non-ASCII characters as `\uXXXX` before sending. `\uXXXX` sequences are pure ASCII and survive any charset conversion unchanged; `JSON.parse()` on the client decodes them correctly.

**Do not use regex with Unicode range literals** when editing this middleware — the Edit tool may garble multi-byte chars. Use `charCodeAt()` loops instead (as currently implemented).

## Notification System (CQN + Long-poll)

**`chat-server/cqn.js`** — standalone module, `require('./cqn')` in server.js. Exports `startCQN(emitFn)`. Manages: `rowidCache` Map (rowid → aus_id loaded at startup), CQN subscription lifecycle, `RETRY_INTERVAL_MS=15s` auto-reconnect. Calls `emitFn(ausId)` which maps to `notifyWaiters` in server.js.

- CQN uses `ipAddress/port` callback — `clientInitiated: true` requires Oracle 19.4+, not available
- CQN connection has `events: true`; DB queries use **separate pool connection** — never query on CQN connection
- Message structure: `message.queries[0].tables[0].rows[k].rowid` (SUBSCR_QOS_QUERY layout)
- When Oracle delivers >80 ROWIDs in one transaction it sends none — `handleFullScan()` is fallback
- `rowidCache` (Map) loaded from DB on startup; INSERT adds, DELETE reads-and-removes
- `table.operation & oracledb.CQN_OPCODE_DELETE` distinguishes DELETE from INSERT

**Long-poll push flow:** CQN fires → `notifyWaiters(ausId)` → resolves pending `/api/wait/:aus_id` response. Browser loop: APEX callback (`notificationWait`) → UTL_HTTP → `/api/wait/:aus_id` (holds 25s) → returns → browser refreshes bell → immediately polls again.

**`waiters`** Map in `server.js`: `aus_id(string) → [{ res, timeout }]` — resolved on CQN event or 25s timeout. Uses `Map` (not plain object). `req.on('close')` cleans up early if browser navigates away.

## APEX Theme global.js (Notification Long-poll)

Paste into `Shared Components → Themes → Edit → JavaScript` (runs on every page):

```javascript
(function () {
    'use strict';
    if (window._notifyPoll) return;

    $(document).ready(function () {
        var ausId = $v('P0_AUS_ID');
        if (!ausId) return;

        window._notifyPoll = true;
        var _backoff = 5000;

        function poll() {
            apex.server.process('notificationWait', {}, {
                dataType: 'json',
                success: function (data) {
                    _backoff = 5000;
                    if (data && data.status === 'new_notification') {
                        apex.region('notification-menu').refresh();
                    }
                    poll();
                },
                error: function () {
                    setTimeout(poll, _backoff);
                    _backoff = Math.min(_backoff * 2, 60000); // exponential backoff, max 60s
                }
            });
        }
        poll();

        // Online presence heartbeat — mỗi 20s (cần Ajax Callback chatHeartbeat trên Page 0)
        apex.server.process('chatHeartbeat', {});
        setInterval(function () { apex.server.process('chatHeartbeat', {}); }, 20000);
    });
})();
```

**`P0_AUS_ID`** is a Page 0 hidden item (has a DOM element, so `$v()` works). Do not use `G_AUS_ID` Application Item here — `$v('G_AUS_ID')` always returns `""`.

## APEX Ajax Callbacks

### notificationWait (Page 0 — runs on every page)

```sql
DECLARE
    l_url    VARCHAR2(500);
    l_req    UTL_HTTP.REQ;
    l_resp   UTL_HTTP.RESP;
    l_body   VARCHAR2(32767) := '';
    l_buffer VARCHAR2(32767);
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
    IF :G_AUS_ID IS NULL THEN
        HTP.p('{"status":"timeout"}');
        RETURN;
    END IF;
    l_url := 'http://172.25.10.38:3410/api/wait/' || :G_AUS_ID;
    UTL_HTTP.SET_TRANSFER_TIMEOUT(28);
    l_req  := UTL_HTTP.BEGIN_REQUEST(l_url, 'GET', 'HTTP/1.1');
    UTL_HTTP.SET_HEADER(l_req, 'Connection', 'close');
    l_resp := UTL_HTTP.GET_RESPONSE(l_req);
    BEGIN
        LOOP
            UTL_HTTP.READ_TEXT(l_resp, l_buffer, 32767);
            l_body := l_body || l_buffer;
        END LOOP;
    EXCEPTION
        WHEN UTL_HTTP.END_OF_BODY THEN NULL;
    END;
    UTL_HTTP.END_RESPONSE(l_resp);
    HTP.p(l_body);
EXCEPTION
    WHEN OTHERS THEN
        BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
        HTP.p('{"status":"timeout"}');
END;
```

### chatHeartbeat (Page 0 — called from global.js every 20s)

Writes presence directly to `CHAT_USER_ONLINE` — no UTL_HTTP relay needed:

```sql
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  IF :G_AUS_ID IS NULL THEN
    HTP.p('{"status":"skip"}'); RETURN;
  END IF;

  MERGE INTO CHAT_USER_ONLINE o
  USING (SELECT :G_AUS_ID AS aus_id FROM DUAL) src
    ON  (o.aus_id = src.aus_id)
  WHEN MATCHED     THEN UPDATE SET last_seen = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (aus_id, last_seen)
                        VALUES (src.aus_id, SYSTIMESTAMP);
  COMMIT;

  HTP.p('{"status":"ok"}');
END;
```

### Chat callbacks (Messenger page)

All callbacks are in `docs/chat_apex_callbacks_v2.sql` (v2, Application Processes) and `docs/chat_apex_callbacks.sql` (v1, page-level, legacy). Key conventions:

- Every callback starts with `OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');`
- Parameters use `apex_application.g_x01`, `g_x02`, `g_x03` (not `:x01` bind syntax)
- Current user's aus_id: `:G_AUS_ID` (Application Item) — **not** `:P0_AUS_ID`
- `chatGetConversations` guards `IF :G_AUS_ID IS NULL` before calling Node.js
- Long-poll callback `chatEvents` uses `UTL_HTTP.SET_TRANSFER_TIMEOUT(28)` — 3s buffer over Node's 25s
- **Never use `TO_NUMBER()` inside CASE expressions** when building JSON or URL strings — causes ORA-06502 on mixed VARCHAR2+NUMBER types. Use string values directly.

**chatSend parameters** (x01–x04):

| Param | Value |
|-------|-------|
| `x01` | `conv_id` |
| `x02` | message body text |
| `x03` | `reply_to_msg_id` (empty string if not a reply) |
| `x04` | partner `aus_id` for DM; empty string for CHANNEL |

## Chat Module Architecture

### Backend (`chat-server/chat.js`)

- Express router mounted at `/api/chat` in `server.js`
- `withConn(fn)` utility: gets pool connection, calls `fn(conn)`, closes connection in finally — use for all DB queries
- `normalize(rows)` utility: lowercases all Oracle UPPERCASE column names before `res.json()`
- `chatWaiters` Map: `aus_id → { res, timeout }` — one long-poll per user (last tab wins)
- `typingState` Map: `conv_id:aus_id → expireHandle` — auto-clears after 4s
- `onlineUsers` Map: `aus_id → Date.now()` — heartbeat within 35s = online (legacy; presence now also in `CHAT_USER_ONLINE` table)
- `participantCache` Map: `conv_id → { ausIds: number[], expiresAt }` — 60s TTL cache of `CHAT_PARTICIPANTS`
- `deliverToConv(convId, payload, excludeAusId)` — reads `participantCache` (or queries DB on miss) then pushes event to all members except sender. Invalidated on `/create`.
- `GET /conversations/:aus_id` filters `WHERE c.doc_type IS NULL` — excludes doc-scoped conversations from the general Messenger sidebar
- `GET /doc-conversations` — new endpoint; query params: `doc_type`, `doc_no`, `aus_id`; returns conversations scoped to that document
- `POST /create` — accepts optional `doc_type` + `doc_no`; DM dedup is scope-aware (same user pair can have separate DMs per document). Body field for member list is `member_aus_ids` in Node.js, but PL/SQL `chatCreate` callback sends it as `"members"` — code reads `req.body.member_aus_ids || req.body.members` to accept both.

### Frontend (`Chat in Apex Oracle 24.2/`)

Five JSX files loaded sequentially by Babel at runtime (no build step):

```
icons.jsx       — SVG icon components (Icons.*)
sidebar.jsx     — Sidebar + ConvItem + Avatar components; window.Avatar, window.Sidebar
chat-center.jsx — ChatCenter + MessageGroup + Composer components; window.ChatCenter
panel.jsx       — RightPanel + MembersTab + FilesTab + LinkedDocsTab; window.RightPanel
apex-app.jsx    — App root; all apex.server.process calls; React.render
```

Load order matters — each file depends on globals exported by the previous ones via `window.*`.

### APEX Page Setup (Messenger page)

**JavaScript → Execute when Page Loads:**
```js
window.CHAT_AUS_ID = &G_AUS_ID.;   // APEX substitution — server replaces before HTML is sent

(function () {
  var base = '#APP_FILES#chat/';
  var dataScript = document.createElement('script');
  dataScript.src = base + 'data.js';
  dataScript.onload = loadJSXFiles;
  document.body.appendChild(dataScript);

  function loadJSXFiles() {
    var files = ['icons.jsx','sidebar.jsx','chat-center.jsx','panel.jsx','apex-app.jsx'];
    var idx = 0;
    function loadNext() {
      if (idx >= files.length) return;
      var fname = files[idx];
      fetch(base + fname).then(r => r.text()).then(code => {
        var el = document.createElement('script');
        el.textContent = Babel.transform(code, { presets: ['react'], filename: fname }).code;
        document.body.appendChild(el);
        idx++; loadNext();
      });
    }
    loadNext();
  }
})();
```

**Why `window.CHAT_AUS_ID`:** `G_AUS_ID` is an APEX Application Item — it has no DOM element. `$v('G_AUS_ID')` returns `""` because `$v()` reads from DOM. `&G_AUS_ID.` is a server-side substitution string replaced before the page is sent to the browser. In `apex-app.jsx`: `const currentAusId = Number(window.CHAT_AUS_ID || $v('G_AUS_ID') || 0);`

**Dynamic Actions** (Event: Click, jQuery Selector, Fire on Init: No):

| Selector | JS Code |
|---|---|
| `#Btn_Back` | `window.chatGoBack();` |
| `#Btn_Compose`, `#Btn_Add_DM` | `window.chatOpenNewDM();` |
| `#Btn_CreateGroup`, `#Btn_Add_Channel` | `window.chatOpenNewGroup();` |

## Oracle DB Schema (Chat)

Tables: `CHAT_CONVERSATIONS`, `CHAT_PARTICIPANTS`, `CHAT_MESSENGERS`, `CHAT_MESSENGER_READS`, `CHAT_USER_ONLINE`

Full DDL in `docs/chat_ddl.sql`. Key conventions:
- `conv_id` uses `CONV_SEQ.NEXTVAL`, `msg_id` uses `MSG_SEQ.NEXTVAL` — always explicit in INSERT, never DEFAULT
- `create_date` uses `SYSDATE` explicit in INSERT — do not rely on DEFAULT on the table
- `created_by VARCHAR2(100)` = `:G_USER_NAME` (username string, not aus_id number)
- Soft delete on `CHAT_MESSENGERS`: set `delete_date = SYSTIMESTAMP`, never DELETE rows

**CHAT_MESSENGERS column semantics:**

| Column | Type | Meaning | Source |
|--------|------|---------|--------|
| `from_aus_id` | NUMBER NOT NULL | aus_id of the **sender** | `:G_AUS_ID` — used for `isMine` check |
| `aus_id` | NUMBER NULL | aus_id of the **DM partner** (recipient); NULL for CHANNEL | `x04` from frontend |
| `created_by` | VARCHAR2(100) NOT NULL | username string | `:G_USER_NAME` — audit column |

Frontend uses `Number(row.from_aus_id) === currentAusId` to determine if a message is "mine".

**CHAT_CONVERSATIONS — additional columns (doc-chat feature):**

| Column | Type | Meaning |
|--------|------|---------|
| `doc_type` | VARCHAR2(50) NULL | Document type: SO, PXK, HD… `NULL` = general conversation |
| `doc_no` | VARCHAR2(100) NULL | Document number e.g. `SO-2601/010`. `NULL` = general conversation |

`doc_type IS NULL AND doc_no IS NULL` → general Messenger conversation.  
`doc_type IS NOT NULL` → document-scoped, only shown in Doc Chat Modal.

**CHAT_USER_ONLINE table:** Replaces Node.js in-memory `onlineUsers` Map so PL/SQL can query presence directly.

| Column | Type | Notes |
|--------|------|-------|
| `aus_id` | NUMBER PK | No FK — APP_USERS is a remote table (see Remote Tables section) |
| `last_seen` | TIMESTAMP | Updated by `chatHeartbeat` MERGE every 20s |

`last_seen >= SYSTIMESTAMP - INTERVAL '35' SECOND` = online.

DDL to run (once, as DEV24):
```sql
ALTER TABLE CHAT_CONVERSATIONS ADD (doc_type VARCHAR2(50), doc_no VARCHAR2(100));
CREATE INDEX idx_chat_conv_doc ON CHAT_CONVERSATIONS(doc_type, doc_no);
-- No FK constraint: APP_USERS is a remote table, FK across DB link is not allowed
CREATE TABLE CHAT_USER_ONLINE (
  aus_id    NUMBER    NOT NULL,
  last_seen TIMESTAMP NOT NULL,
  CONSTRAINT pk_chat_user_online PRIMARY KEY (aus_id)
);
```

## Remote Tables via DB Link — Critical

`APP_USERS`, `EMPLOYEES`, `DEPARTMENTS`, `POSITIONS` are **not local tables**. They live in a separate Oracle instance accessed via database link `DBLINK.GIACAT.VN`. This has three important consequences:

1. **FK constraints across DB link are illegal.** `CHAT_USER_ONLINE` has no FK to `APP_USERS`.
2. **SQL functions applied to remote columns are pushed to the remote server.** If the remote Oracle doesn't support the function or syntax, you get `ORA-02000 / ORA-02063 preceding line from DBLINK.GIACAT.VN`.
   - Affected: `REGEXP_REPLACE`, `INTERVAL` literals inside SQL (not PL/SQL), and similar Oracle-specific syntax.
3. **VISCII encoding.** Employee names in the remote DB were encoded in VISCII (old Vietnamese encoding). Some VISCII glyphs map to bytes < 0x20 (control characters), which Oracle writes verbatim into JSON output, producing `SyntaxError: Bad control character in string literal`.

### MATERIALIZE pattern — required for remote text columns

Any SQL that needs to call `REGEXP_REPLACE` (or other local functions) on remote columns **must** materialize the remote data first:

```sql
WITH remote_data AS (
  SELECT /*+ MATERIALIZE */
         u.aus_id,
         NVL(e.full_name, 'Unknown') AS full_name,
         u.user_name
  FROM   APP_USERS u
  JOIN   EMPLOYEES e ON e.emp_id = u.emp_id
  WHERE  ...
)
SELECT JSON_ARRAYAGG(
    JSON_OBJECT(
      'full_name' VALUE REGEXP_REPLACE(r.full_name, '[[:cntrl:]]', ''),
      ...
    )
    RETURNING CLOB
  )
FROM   remote_data r
LEFT JOIN local_table lt ON lt.aus_id = r.aus_id;
```

`/*+ MATERIALIZE */` forces Oracle to execute the CTE against the remote DB first, storing the result locally, before running the outer query. Without it, Oracle may push the outer `REGEXP_REPLACE` or `INTERVAL` binds to the remote server → `ORA-02000`.

### RETURNING CLOB on JSON_ARRAYAGG

Always add `RETURNING CLOB` to `JSON_ARRAYAGG` when the result list could exceed 4000 chars (any list with > ~10 users):

```sql
JSON_ARRAYAGG(JSON_OBJECT(...) ORDER BY ... RETURNING CLOB)
```

When used inside `SELECT ... INTO varchar2_var`, Oracle 19c implicitly converts CLOB → VARCHAR2(32767). Do NOT declare `l_result CLOB` and pass directly to `HTP.p()` — Oracle wraps CLOB values in quotes inside JSON output, turning `{"key":[...]}` into `{"key":"[...]"}`.

### PL/SQL INTERVAL bind variable

Never write `SYSTIMESTAMP - INTERVAL '35' SECOND` inside a SQL statement that touches remote tables — the literal gets sent to the remote DB and causes `ORA-02000`. Use a PL/SQL variable instead:

```sql
DECLARE
  l_online_cutoff TIMESTAMP := SYSTIMESTAMP - INTERVAL '35' SECOND;
BEGIN
  -- Use l_online_cutoff in SQL — it's a bind value, not a literal pushed to remote
  SELECT ... WHERE o.last_seen >= l_online_cutoff ...
```

## User Display Name

```sql
SELECT e.full_name
FROM   app_users u
JOIN   employees e ON e.emp_id = u.emp_id
WHERE  u.aus_id = :aus_id
```

`app_users.emp_id` → FK to `employees.emp_id` (PK). `employees.full_name` is the display name.
`app_users.user_name` — login name column has underscore (`user_name`, **not** `username`).

## Oracle Prerequisites (one-time, run as DBA)

```sql
GRANT CHANGE NOTIFICATION TO DEV24;

BEGIN
  DBMS_NETWORK_ACL_ADMIN.APPEND_HOST_ACE(
    host => '172.25.10.38', lower_port => 3141, upper_port => 3141,
    ace  => xs$ace_type(privilege_list => xs$name_list('connect'),
                        principal_name => 'DEV24',
                        principal_type => xs_acl.ptype_db)
  );
  COMMIT;
END;
/

-- Remove stale CQN subscription if ORA-29970 occurs
BEGIN DBMS_CQ_NOTIFICATION.DEREGISTER(
  (SELECT regid FROM user_change_notification_regs
   WHERE table_name = 'DEV24.USER_NOTIFICATIONS' FETCH FIRST 1 ROW ONLY));
END;
/

-- Verify ACL and CQN subscription
SELECT host, lower_port, upper_port, privilege, principal_name
FROM   dba_network_acl_privileges JOIN dba_network_acls USING (acl);

SELECT regid, callback FROM user_change_notification_regs;
```

## ORDS Scalability — Known Bottleneck

Each active chat user holds **2 ORDS worker threads** simultaneously (notificationWait + chatEvents). Default ORDS thread pool is 20–50 → ~15 concurrent users saturates it.

**Quick fix:** Increase ORDS `jdbc.MaxLimit` to 100 in `settings.xml` on Server A (no code change).

**Architectural fix:** Merge both polls into single `/api/events/:aus_id` endpoint (halves thread usage). Full implementation plan in `docs/ords-scalability-solutions.md`.

| Config | Max concurrent users |
|--------|---------------------|
| Default (50 threads) | ~10 |
| jdbc.MaxLimit=100 | ~25 |
| Merged poll endpoint | ~50 |

## Doc Chat Modal ("Trao đổi chứng từ")

Modal that opens from the right sidebar of ERP pages (SO, PXK, HD…). Each document has its own conversation scope. Full plan: `docs/doc-chat-modal-plan.md`. Prototype: `Chat in ERP System (Apex Oracle 24.2)/`.

### Data loading architecture

| Operation | Flow | Reason |
|-----------|------|--------|
| Load conversations, messages, members | `apex.server.process` → PL/SQL → DB direct (JSON_ARRAYAGG) | No Node.js relay; low latency |
| Send message | `apex.server.process` → UTL_HTTP → Node.js | Needs real-time push to waiters |
| Long-poll events | `apex.server.process` → UTL_HTTP → Node.js 25s | In-memory waiter queue |
| Typing, Read | `apex.server.process` → UTL_HTTP → Node.js | Node.js holds state |
| Create conversation | `apex.server.process` → PL/SQL → DB direct | No Node.js needed |

### APEX Setup

- **Modal Page ID: `10022710201`** (Modal Dialog page — all doc-chat callbacks go here)
- Cross-page calls from ERP pages: `apex.server.process('name', data, { pageId: 10022710201 })`

### Ajax Callbacks on Modal Page 10022710201

| Callback | x01 | x02 | x03 | x04 | x05 | Relay Node? |
|----------|-----|-----|-----|-----|-----|-------------|
| `docChatConversations` | aus_id | doc_type | doc_no | — | — | No — PL/SQL → DB |
| `docChatMessages` | conv_id | before_id | limit | — | — | No — PL/SQL → DB |
| `docChatMembers` | conv_id | — | — | — | — | No — PL/SQL → DB |
| `docChatCreate` | conv_type | name | members (JSON) | doc_type | doc_no | No — PL/SQL → DB |
| `docChatSend` | conv_id | body | reply_to_msg_id | partner_aus_id | — | **Yes** |
| `docChatRead` | conv_id | — | — | — | — | **Yes** |
| `docChatTyping` | conv_id | — | — | — | — | **Yes** |
| `docChatEvents` | — | — | — | — | — | **Yes** (25s long-poll, uses `:APP_USER`) |

Full PL/SQL for all 8 callbacks (with MATERIALIZE fixes and INTERVAL variable fix): `docs/doc-chat-callbacks.sql`.

### Frontend (`#APP_FILES#doc-chat/`)

Seven files loaded sequentially via Babel at runtime (same pattern as Chat module):

```
doc-chat.css              ← design tokens, 3-pane layout, bubble styles
icons.jsx                 ← SVG icon components (reuse from chat/)
conversation-list.jsx     ← left pane: search, tabs, group/DM list
chat-thread.jsx           ← center pane: messages, composer, @mention
info-panel.jsx            ← right pane: doc summary card, members, files
empty-state.jsx           ← empty state + create group modal
doc-chat-app.jsx          ← entry point; exposes window.openDocChat(context)
```

### ERP Page Integration

Each ERP page sets `window.DOC_CHAT_CONTEXT` with doc fields, then lazy-loads the modal on button click:

```javascript
window.DOC_CHAT_CONTEXT = {
  doc_type: 'SO', doc_no: '&P15_SO_NO.',
  doc_label: 'Đơn hàng bán', doc_status: '&P15_STATUS.',
  doc_fields: [['Đối tượng', '&P15_CUSTOMER_NAME.'], ...]
};
window.openDocChatLazy = function() { /* lazy-load JSX files then call openDocChat */ };
```

Dynamic Action: Click on `#Btn_DocChat` → `window.openDocChatLazy();`

### apexCall utility (in doc-chat-app.jsx)

```javascript
const MODAL_PAGE_ID = 10022710201;
function apexCall(processName, params = {}) {
  return new Promise((resolve, reject) => {
    apex.server.process(processName,
      { x01: params.x01||'', x02: params.x02||'', x03: params.x03||'',
        x04: params.x04||'', x05: params.x05||'' },
      { dataType: 'json', pageId: MODAL_PAGE_ID,
        success: resolve, error: (_, err) => reject(new Error(err)) });
  });
}
```

## Chat UI v2 — Chat hệ thống Page

Full-page chat UI built with React 18 + JSX (runtime Babel transpile, no build step). Source: `chat_system_erp/`. APEX page type: **Normal** (not Modal).

### JSX file load order (critical — each file depends on globals from previous)

```
tweaks-panel.jsx → icons.jsx → chat-thread.jsx → page-compose.jsx → page-list.jsx → page-main.jsx → page-app.jsx
```

Additional files in `chat_system_erp/` (not all loaded on main chat page): `info-panel.jsx`, `conversation-list.jsx`, `empty-state.jsx`, `page-rail.jsx`, `erp-bg.jsx`, `app.jsx`.

Files uploaded to `#APP_FILES#chat-system/`. Loaded via `fetch()` + `Babel.transform()` in "Execute when Page Loads". **Do not put React/ReactDOM/Babel in "JavaScript → File URLs"** — those load async; Babel won't be ready when `loadNext()` runs → `ReferenceError: Babel is not defined`. Load all three libs sequentially inside Execute when Page Loads first, then load JSX files.

```javascript
window.CHAT_AUS_ID = &G_AUS_ID.;   // only this — no CHAT_PAGE_ID needed

// Load React → ReactDOM → Babel sequentially, then JSX files
loadLibsSeq(libs, function () { loadJSXSeq(jsxFiles); });
```

### page-app.jsx architecture

- `apexCall(processName, params)` — wraps `apex.server.process` **without `pageId`** (uses Application Processes, not page-level)
- `window.PAGE_DATA` and `window.CHAT_DATA` synced every render so child components reading from window get fresh data
- `retryKey` state triggers `useEffect` re-run for "Thử lại" button
- Guard `if (initError || !users['me'])` prevents crash when init fails
- `handleSelect(id)` lazy-loads `chatMsgList` + `chatMemberList` in parallel on first open
- `chat-thread.jsx`: accepts `messages: msgsProp, onSend: onSendProp` props — if provided, uses APEX data; falls back to `window.CHAT_DATA` for standalone demo HTML
- `page-main.jsx`: forwards `messages`/`onSend` down to `ChatThread`; uses `chat.memberCount || chat.members.length`

### APEX Application Processes — critical distinction

Chat callbacks are **Application Processes** (Shared Components → Application Processes, type: Ajax Callback), **not** page-level Ajax Callbacks.

- Page-level: requires correct `pageId` in `apex.server.process` call — error-prone, gives `Error: APEX` if `pageId` is 0 or wrong
- Application Process: no `pageId` needed, callable from any page, reusable across Chat page and Doc Chat Modal

9 processes: `chatConvList`, `chatMsgList`, `chatMemberList`, `chatContactList`, `chatSend`, `chatCreate`, `chatRead`, `chatTyping`, `chatEvents`. Full SQL: `docs/chat_apex_callbacks_v2.sql`.

### `:APP_USER` instead of `:G_AUS_ID` in Application Processes

`:G_AUS_ID` (Application Item) is unreliable in Application Processes — often NULL in AJAX session context. Use `:APP_USER` (always set by APEX auth) + query aus_id from DB:

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

This pattern replaces `l_aus_id := TO_NUMBER(:G_AUS_ID)` in all 9 callbacks. `:G_AUS_ID` can still be used in **page-level** callbacks (notificationWait, chatHeartbeat on Page 0) where the page session state is reliably sent.

**Debug process:** Create Application Process `chatDebug` (Ajax Callback):
```sql
-- Returns: app_user, aus_id, g_aus_id, ok
-- Test from console: apex.server.process('chatDebug', {}, { dataType:'json', success: d => console.table(d) })
-- aus_id=-1 → user_name mismatch; aus_id=-2 → SQL error; app_user='nobody' → session expired
```

### Schema corrections

- `DEPARTMENTS.dep_name` — display name column (**not** `d.name` — common mistake)
- `POSITIONS.position_name` — role display name
- `APP_USERS.user_name` — login name (underscore, not `username`)
- Joins: `EMPLOYEES.dep_id → DEPARTMENTS.dep_id`, `EMPLOYEES.emp_position → POSITIONS.pos_id`

### APEX JSX — Critical Rules

**1. Every `<button>` must have `type="button"`**

APEX wraps the entire page in a `<form id="wwvFlowForm">`. Any `<button>` without an explicit `type` defaults to `type="submit"`, which submits the APEX form on click (full page reload). This applies to all JSX files in `chat_system_erp/`.

```jsx
// Wrong — will submit APEX page form
<button className="icon-btn" onClick={fn}>...</button>

// Correct
<button type="button" className="icon-btn" onClick={fn}>...</button>
```

**2. Use `click` (not `mousedown`) for outside-click detection in dropdowns**

When a dropdown menu item has an `onClick` handler but the outside-click detector uses `mousedown` on `document`, the menu unmounts before React's synthetic `click` fires on the item — the handler never runs.

```javascript
// Wrong — mousedown fires before click; menu unmounts before item's onClick runs
document.addEventListener('mousedown', closeHandler);

// Correct — item's onClick runs first (then stopPropagation on menu prevents doc click)
document.addEventListener('click', closeHandler);
```

The menu element must also have `onClick={e => e.stopPropagation()}` so clicking inside the menu does not trigger the document close handler.

**3. `.chat-pane` must have `flex: 1; overflow: hidden`**

The layout chain `.page-app` (grid, 100vh) → `.main-pane` (flex column) → `.chat-pane` (flex column) → `.chat-messages` (flex: 1, overflow-y: auto). If `.chat-pane` lacks `flex: 1`, it has no bounded height and `.chat-messages` grows with content instead of scrolling. Current fix in `chat_system_erp/styles.css`:

```css
.chat-pane { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
```

Any scroll container inside a flex/grid layout that expands with content instead of scrolling — walk up the ancestor chain and find the flex item missing `flex: 1` + `min-height: 0`.

**4. CSS vs JSX deployment**

- **CSS files** (`styles.css`, `page-styles.css`): can be pasted directly into **Page → CSS → Inline** in APEX (no file upload). Combined size ~23KB, within APEX's 32KB inline limit.
- **JSX files**: must remain as Static Application Files — they contain JSX syntax that requires `Babel.transform()` at runtime via `fetch()`. Cannot be inlined in APEX JavaScript section.

## ORDS — Findings & Constraints

- **URL pattern:** `/ords/dev/` (schema APEX_DEV, mapping `dev` — not `/dev24/`)
- **Cannot call ORDS directly from browser** — global ORDS server config on this environment requires auth for all endpoints. Returns 403 even when module is Published with no privilege mapping. Cannot override from APEX UI; requires server-level access.
- **Use `apex.server.process` instead** — auth via APEX session, no CORS, no Mixed Content issues.
- **Parameter Source Types in APEX 24.2 RESTful Services:** only `HTTP Header` and `URI` available. There is no "Query String" option. Query string params (`:bind_var` in SQL) are auto-bound by ORDS without explicit declaration — do not declare them as HTTP Header or ORDS will bind NULL.

## BMad Development Workflow

| Skill | When to use |
|-------|-------------|
| `/bmad-quick-dev` | Build/fix/refactor any code |
| `/bmad-investigate` | Trace bugs or understand unfamiliar code |
| `/bmad-code-review` | Adversarial code review |

Planning artifacts → `_bmad-output/planning-artifacts/` | Research → `docs/`

Do not edit `_bmad/config.toml` — regenerated on every BMad install.
