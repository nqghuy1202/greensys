# Chat System v2

Full-page chat UI. Source: `chat-system/`. APEX page type: **Normal** (not Modal).

## Backend (`chat-server/chat.js`)

- Express router mounted at `/api/chat` in `server.js`
- `withConn(fn)` utility: gets pool connection, calls `fn(conn)`, closes in finally — use for all DB queries
- `normalize(rows)` utility: lowercases Oracle UPPERCASE column names before `res.json()`
- Event delivery via `events.js` `deliverToUser` — unified waiter map shared with notification system
- `typingState` Map: `conv_id:aus_id → expireHandle` — auto-clears after 4s
- `onlineUsers` Map: `aus_id → Date.now()` — legacy; presence now also in `CHAT_USER_ONLINE` table
- `participantCache` Map: `conv_id → { ausIds: number[], expiresAt }` — 60s TTL cache of `CHAT_PARTICIPANTS`
- `deliverToConv(convId, payload, excludeAusId)` — reads `participantCache` (or queries DB on miss) then pushes event to all members except sender. Invalidated on `/create`.
- `GET /conversations/:aus_id` filters `WHERE c.doc_type IS NULL` — general Messenger sidebar only
- `POST /create` — reads `req.body.member_aus_ids || req.body.members` to accept both naming conventions

## JSX File Load Order (critical — each file depends on globals from previous)

```
tweaks-panel.jsx → icons.jsx → chat-thread.jsx → page-compose.jsx → page-list.jsx → page-main.jsx → page-app.jsx
```

Additional files in `chat-system/` (not all loaded on main chat page): `info-panel.jsx`, `conversation-list.jsx`, `empty-state.jsx`, `page-rail.jsx`, `erp-bg.jsx`, `app.jsx`.

Files uploaded to `#APP_FILES#chat-system/`.

## Execute when Page Loads

```javascript
window.CHAT_AUS_ID = &G_AUS_ID.;   // APEX substitution — replaced before HTML is sent

// Load React → ReactDOM → Babel sequentially, then JSX files
loadLibsSeq(libs, function () { loadJSXSeq(jsxFiles); });
```

**Do NOT put React/ReactDOM/Babel in "JavaScript → File URLs"** — those load async; Babel won't be ready when `loadNext()` runs → `ReferenceError: Babel is not defined`.

**Why `window.CHAT_AUS_ID`:** `G_AUS_ID` is an Application Item — no DOM element. `$v('G_AUS_ID')` returns `""`. `&G_AUS_ID.` is a server-side substitution replaced before the page is sent.

In `page-app.jsx`: `const currentAusId = Number(window.CHAT_AUS_ID || $v('G_AUS_ID') || 0);`

## page-app.jsx Architecture

- `apexCall(processName, params)` — wraps `apex.server.process` **without `pageId`** (Application Processes)
- `window.PAGE_DATA` and `window.CHAT_DATA` synced every render so child components reading from window get fresh data
- `retryKey` state triggers `useEffect` re-run for "Thử lại" button
- Guard `if (initError || !users['me'])` prevents crash when init fails
- `handleSelect(id)` lazy-loads `chatMsgList` + `chatMemberList` in parallel on first open
- `chat-thread.jsx`: accepts `messages`/`onSend` props; falls back to `window.CHAT_DATA` for standalone demo HTML
- `page-main.jsx`: forwards `messages`/`onSend` down to `ChatThread`; uses `chat.memberCount || chat.members.length`

## Application Processes — Critical Distinction

All chat callbacks are **page-level Ajax Callbacks** trên Messenger page — **không** dùng Application Process.

> **Rule kiến trúc:** Application Process chỉ dùng cho tính năng toàn hệ thống (Page 0 — `appEvents`, `chatHeartbeat`). Mọi feature của một page cụ thể phải là Ajax Callback trên chính page đó.

- **Page-level (đúng):** `apex.server.process(name, data, { pageId: window.pageId, ... })` — `window.pageId` được set trong "Function and Global Variable Declaration": `var pageId = $v('pFlowStepId')`
- **Application Process (sai cho chat):** không có pageId scope, không quản lý được theo page

8 Chat System Ajax Callbacks (tạo trên Messenger page): `chatConvList`, `chatMsgList`, `chatMemberList`, `chatContactList`, `chatSend`, `chatCreate`, `chatRead`, `chatTyping`.
(`chatEvents` removed — real-time delivery now via unified `appEvents` → `apex:chatEvent` jQuery event.)
Full SQL: `docs/chat_apex_callbacks_v2.sql`.

### :APP_USER Pattern (required in all Ajax Callbacks)

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

### chatSend Parameters (x01–x04)

| Param | Value |
|-------|-------|
| `x01` | `conv_id` |
| `x02` | message body text |
| `x03` | `reply_to_msg_id` (empty string if not a reply) |
| `x04` | partner `aus_id` for DM; empty string for CHANNEL |

### Debug Process

```sql
-- Application Process: chatDebug (Ajax Callback)
-- Test from browser console:
--   apex.server.process('chatDebug', {}, { dataType:'json', success: d => console.table(d) })
-- Diagnostics: aus_id=-1 → user_name mismatch; aus_id=-2 → SQL error; app_user='nobody' → session expired
```

## Dynamic Actions (Messenger page)

Event: Click, jQuery Selector, Fire on Init: No

| Selector | JS Code |
|---|---|
| `#Btn_Back` | `window.chatGoBack();` |
| `#Btn_Compose`, `#Btn_Add_DM` | `window.chatOpenNewDM();` |
| `#Btn_CreateGroup`, `#Btn_Add_Channel` | `window.chatOpenNewGroup();` |

## Schema Corrections (column names)

- `DEPARTMENTS.dep_name` — display name (**not** `d.name`)
- `POSITIONS.position_name` — role display name
- `APP_USERS.user_name` — with underscore (**not** `username`)
- Joins: `EMPLOYEES.dep_id → DEPARTMENTS.dep_id`, `EMPLOYEES.emp_position → POSITIONS.pos_id`

## Legacy Chat Frontend (Chat in Apex Oracle 24.2/)

Original 5-file version. Five JSX files loaded sequentially by Babel: `icons.jsx`, `sidebar.jsx`, `chat-center.jsx`, `panel.jsx`, `apex-app.jsx` from `#APP_FILES#chat/`. Same `window.CHAT_AUS_ID = &G_AUS_ID.` substitution. Exports globals: `window.Avatar`, `window.Sidebar`, `window.ChatCenter`, `window.RightPanel`.
