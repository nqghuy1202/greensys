# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`nodejs-apex-oracle` is a Node.js 22 middleware server on **Server B** that bridges Oracle Database (Server A) with Oracle APEX 24.2 browser clients. It handles two independent features:
1. **Notification system** — CQN-triggered long-poll for bell/notification menu
2. **Chat module** — real-time messaging with long-poll events, typing indicators, online status

## System Architecture

```
Browser (APEX client)
  │  apex.server.process(...)  — AJAX over HTTPS to APEX
  ▼
Server A — Oracle DB + APEX 24.2 (192.168.1.10)
  │  UTL_HTTP proxy → Node.js endpoints (APEX bridges HTTPS→HTTP)
  │  CQN callback TCP (Oracle → Server B on CQN_PORT)
  │  TCP:1521  oracledb pool connections
  ▼
Server B — Node.js 22 (172.25.10.38)
  chat-server/server.js  listening on PORT (default 3410)
    ├── /api/wait/:aus_id        (notification long-poll)
    └── /api/chat/*              (chat module — chat.js router)
```

**Why APEX proxy:** Browser cannot call `http://172.25.x.x:3410` directly (Mixed Content on HTTPS). `apex.server.process` goes over HTTPS; APEX calls Node.js via `UTL_HTTP` internally.

## Running the Server

```bash
cd chat-server
node server.js                           # direct
pm2 start server.js --name chat-server   # production
pm2 logs chat-server --lines 20
cd /root && pm2 restart chat-server      # PM2 restart (must cd first)
```

**Expected startup:**
```
[DB] Connection pool created
[CQN] Cache loaded: 42 rows
[CQN] Subscription active on USER_NOTIFICATIONS
[Server] Listening on 0.0.0.0:3410
```

## Test Commands

```bash
node test-connection.js          # DB connection only
node test-cqn.js                 # CQN standalone (stop server.js first)
curl "http://localhost:3410/health"
curl "http://localhost:3410/api/wait/<aus_id>"   # notification long-poll
curl "http://localhost:3410/api/chat/conversations/<aus_id>"
```

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
| POST | `/api/chat/create` | Create DM or CHANNEL |

## Environment Variables (`chat-server/.env`)

| Variable | Example | Notes |
|----------|---------|-------|
| `DB_USER` | `DEV24` | Oracle schema user |
| `DB_PASSWORD` | — | |
| `DB_CONNECTION_STRING` | `192.168.1.10/FREEPDB1` | |
| `PORT` | `3410` | |
| `CQN_HOST` | `172.25.10.38` | Server B IP for CQN callback |
| `CQN_PORT` | `3141` | |
| `DB_POOL_MIN/MAX/INCREMENT` | `2/10/1` | |

## Unicode Encoding — Critical

Oracle's `UTL_HTTP.READ_TEXT` re-interprets UTF-8 bytes using the DB charset (WE8MSWIN1252), breaking multi-byte sequences (e.g., "ư" C6B0 UTF-8 → "Æ°" Latin-1). Fix is in `server.js`: a middleware overrides `res.json()` globally to escape all non-ASCII characters as `\uXXXX` before sending. `\uXXXX` sequences are pure ASCII and survive any charset conversion unchanged; `JSON.parse()` on the client decodes them correctly.

**Do not use regex with Unicode range literals** when editing this middleware — the Edit tool may garble multi-byte chars. Use `charCodeAt()` loops instead (as currently implemented).

## Notification System (CQN)

- CQN uses `ipAddress/port` callback — `clientInitiated: true` requires Oracle 19.4+, not available
- CQN connection has `events: true`; DB queries use **separate pool connection** — never query on CQN connection
- Message structure: `message.queries[0].tables[0].rows[k].rowid` (SUBSCR_QOS_QUERY layout)
- When Oracle delivers >80 ROWIDs in one transaction it sends none — `handleFullScan()` is fallback
- `rowidCache` (Map) loaded from DB on startup; INSERT adds, DELETE reads-and-removes
- `table.operation & oracledb.CQN_OPCODE_DELETE` distinguishes DELETE from INSERT

## Chat Module Architecture

### Backend (`chat-server/chat.js`)

- Express router mounted at `/api/chat` in `server.js`
- `chatWaiters` Map: `aus_id → { res, timeout }` — one long-poll per user (last tab wins)
- `typingState` Map: `conv_id:aus_id → expireHandle` — auto-clears after 4s
- `onlineUsers` Map: `aus_id → Date.now()` — heartbeat within 35s = online
- `deliverToConv(convId, payload, excludeAusId)` — queries `CHAT_PARTICIPANTS` then pushes event to all members except sender
- Oracle returns column names UPPERCASE; `normalize()` lowercases all keys before `res.json()`

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

**JavaScript → Execute when Page Loads** (add `window.CHAT_AUS_ID` line first, before JSX loading):
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

**Why `window.CHAT_AUS_ID`:** `G_AUS_ID` is an APEX Application Item — it has no DOM element. `$v('G_AUS_ID')` returns `""` because `$v()` reads from DOM. `&G_AUS_ID.` is a server-side substitution string replaced before the page is sent to the browser, so it resolves to the actual numeric value. In `apex-app.jsx`: `const currentAusId = Number(window.CHAT_AUS_ID || $v('G_AUS_ID') || 0);`

**Dynamic Actions** (Event: Click, jQuery Selector, Fire on Init: No):

| Selector | JS Code |
|---|---|
| `#Btn_Back` | `window.chatGoBack();` |
| `#Btn_Compose`, `#Btn_Add_DM` | `window.chatOpenNewDM();` |
| `#Btn_CreateGroup`, `#Btn_Add_Channel` | `window.chatOpenNewGroup();` |

These window functions are registered in `apex-app.jsx` via `useEffect` when the App mounts.

## APEX Ajax Callbacks (on Messenger page)

All 11 callbacks are in `docs/chat_apex_callbacks.sql`. Key conventions:

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

## Oracle DB Schema (Chat)

Tables: `CHAT_CONVERSATIONS`, `CHAT_PARTICIPANTS`, `CHAT_MESSENGERS`, `CHAT_MESSENGER_READS`

Full DDL in `docs/chat_ddl.sql`. Key conventions:
- `conv_id` uses `CONV_SEQ.NEXTVAL`, `msg_id` uses `MSG_SEQ.NEXTVAL` — always explicit in INSERT, never DEFAULT
- `create_date` uses `SYSDATE` explicit in INSERT — do not rely on DEFAULT on the table
- `created_by VARCHAR2(100)` = `:G_USER_NAME` (username string, not aus_id number)
- `modified_by VARCHAR2(100)` follows same pattern as `created_by`
- Soft delete on `CHAT_MESSENGERS`: set `delete_date = SYSTIMESTAMP`, never DELETE rows

**CHAT_MESSENGERS column semantics:**

| Column | Type | Meaning | Source |
|--------|------|---------|--------|
| `from_aus_id` | NUMBER NOT NULL | aus_id of the **sender** | `:G_AUS_ID` — used for `isMine` check |
| `aus_id` | NUMBER NULL | aus_id of the **DM partner** (recipient); NULL for CHANNEL | `x04` from frontend |
| `created_by` | VARCHAR2(100) NOT NULL | username string | `:G_USER_NAME` — audit column |

Frontend uses `Number(row.from_aus_id) === currentAusId` to determine if a message is "mine".

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
```

## BMad Development Workflow

| Skill | When to use |
|-------|-------------|
| `/bmad-quick-dev` | Build/fix/refactor any code |
| `/bmad-investigate` | Trace bugs or understand unfamiliar code |
| `/bmad-code-review` | Adversarial code review |

Planning artifacts → `_bmad-output/planning-artifacts/` | Research → `docs/`

Do not edit `_bmad/config.toml` — regenerated on every BMad install.
