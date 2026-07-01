# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Chat Server — Node.js Backend

Node.js 22 middleware chạy trên **Server B** (`172.25.10.50:3410`). Nhận request từ Oracle APEX qua UTL_HTTP, đẩy event real-time về browser qua SSE, duy trì Oracle CQN subscription.

## Files

```
chat-server/
  server.js        Entry point — Express, khởi tạo pool (registry), endpoints, graceful shutdown
  db-registry.js   Multi-DB registry — đọc db-registry.json → tạo named pool/DB (poolAlias=key)
  chat.js          /api/chat/* router — messages, conversations, typing, presence
  cqn.js           Oracle CQN — subscribe MỌI DB cqn:true (state per-DB), ROWID cache/DB
  events.js        SSE registry + event buffer — key composite dbKey:ausId
  token.js         Verify SSE HMAC-SHA256 token 3-phần dbKey|ausId|exp (mirror APEX `sseToken`)
  db-registry.json       Config DB thật (KHÔNG commit — gitignore; chứa mật khẩu)
  db-registry.example.json  Template registry (copy → db-registry.json)
  test-connection.js  Test DB pool kiểu env cũ (legacy)
  test-registry.js    Test kết nối MỌI DB trong registry, mở đồng thời — `node test-registry.js`
  test-cqn.js         Test CQN standalone 1 DB (dừng server trước — tranh port)
  test-cqn-multidb.js POC share 1 CQN_PORT cho N DB — `node test-cqn-multidb.js`
  test-sse.js      Test /api/sse — `node test-sse.js <aus_id> [dbKey] [host]`, tự mint token
  test-chat.js     Test thủ công /api/chat/* — `node test-chat.js <aus_id> [conv_id] [host]`
  package.json
  .env             Required, không commit — secret + cấu hình gateway (KHÔNG chứa danh sách DB)
  docs/
    notification.md      Chi tiết CQN + long-poll + APEX callbacks
    chat_ddl.sql         DDL 4 bảng chat + sequences
    cqn-setup-guide.md   Hướng dẫn cấp quyền Oracle cho CQN
    oracle-prereqs.md    Lệnh DBA một lần + ORDS scalability notes
    multi-db-research.md  Nghiên cứu kiến trúc multi-DB (Phương án C) + rủi ro + file cần đổi
```

## Multi-DB Registry — Kết nối động (quan trọng)

Danh sách DB **KHÔNG** khai báo trong `.env` (dotenv không cho trùng key). Khai báo trong **`db-registry.json`** (gitignore) — mảng object, thêm DB = thêm 1 khối, không sửa code:

```json
[
  { "key": "dev24", "primary": true, "user": "DEV24", "password": "***",
    "connectString": "172.25.10.18:1521/pdbgc19c", "cqn": true },
  { "key": "tnc", "user": "TNC", "password": "***",
    "connectString": "172.25.10.18:1521/pdbgc19c", "cqn": true }
]
```

- `db-registry.js` `initPools()` tạo 1 named pool/DB (`poolAlias = key`), **mọi pool `events:true`** (thick-mode events-mode do pool đầu quyết định; đặt hết để không lệ thuộc thứ tự).
- `key` = **dbKey** — namespace định danh SSE (`events.js` key = `dbKey:ausId`) và tag CQN. Mỗi schema có `aus_id` RIÊNG nên bắt buộc namespace, nếu không user cùng aus_id ở 2 schema đụng nhau (rò rỉ chéo).
- `cqn:true` → `cqnDbs()` trả DB cần CQN; `cqn.js` subscribe MỌI DB này (state per-DB, share 1 `CQN_PORT`).
- `primary:true` (tối đa 1) → `primaryKey()`; code single-DB còn lại (chat.js `withConn`) dùng primary qua `registry.getPool()`.
- Đổi vị trí file qua env `DB_REGISTRY_PATH`.

**🔴 Ghép nối APEX bắt buộc:** `sseToken` mỗi APEX phải mint token 3-phần `l_body := :G_DB_KEY || '|' || aus_id || '|' || exp` với `G_DB_KEY` = key registry của schema đó (`dev24`/`tnc`). Nếu không, CQN notify theo dbKey thật sẽ KHÔNG khớp namespace SSE → client không nhận. Token cũ 2-phần vẫn chạy tạm dưới `DEFAULT_DB_KEY='default'` (tương thích ngược trong `token.js`).

## Deploy & Run (chạy trên Server B)

```bash
cd /opt/chat-server
pm2 start server.js --name chat-server --restart-delay 3000
pm2 restart chat-server
pm2 logs chat-server --lines 20
pm2 status
```

**Startup log bình thường (multi-DB):**
```
[DB] Pool "dev24" → 172.25.10.18:1521/pdbgc19c (CQN)
[DB] Pool "tnc" → 172.25.10.18:1521/pdbgc19c (CQN)
[DB] 2 pool(s) created. Primary=dev24
[CQN][dev24] Subscription active on USER_NOTIFICATIONS (regId=...)
[CQN][tnc] Subscription active on USER_NOTIFICATIONS (regId=...)
[CQN] Active trên 2 DB: dev24, tnc
[Server] Listening on 0.0.0.0:3410
```

**Test nhanh:**
```bash
npm run test:registry            # Kết nối MỌI DB trong registry (mở đồng thời) — safe khi server chạy
node test-cqn-multidb.js         # POC share CQN_PORT (dừng server trước — tranh port)
node test-sse.js <aus_id> dev24  # Test SSE theo dbKey (mint token 3-phần)
curl http://localhost:3410/health
```

## Environment Variables (`.env`)

> Danh sách DB (user/password/connectString) chuyển sang **`db-registry.json`** — xem mục Multi-DB Registry. `.env` chỉ giữ secret + cấu hình gateway. Runtime KHÔNG còn đọc `DB_USER`/`DB_PASSWORD`/`DB_CONNECTION_STRING` (các script `test-connection.js`/`test-cqn.js` legacy vẫn đọc).

| Biến | Ví dụ | Ghi chú |
|------|-------|---------|
| `G_SSE_SECRET` | — | Khóa HMAC verify token SSE (khớp APEX `CHAT_CONFIG`) |
| `DEFAULT_DB_KEY` | `default` | dbKey namespace mặc định cho token cũ 2-phần |
| `DB_REGISTRY_PATH` | — | (tùy chọn) đường dẫn khác cho db-registry.json |
| `PORT` | `3410` | HTTP server |
| `CQN_HOST` | `172.25.10.50` | Server B IP thật (KHÔNG phải .38 trong docs cũ); Oracle gọi callback về đây |
| `CQN_PORT` | `3411` | Phải khác PORT; cần Server A → Server B:3411 (inbound) mở; share cho MỌI DB cùng instance |
| `DB_POOL_MIN/MAX/INCREMENT` | `2/10/1` | Mặc định cho pool nếu registry entry không ghi đè |

## HTTP Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/health` | Health check |
| GET | `/api/sse` | SSE stream — query `token` (HMAC, verify qua `token.js`) + `lastEventId` cho replay |
| GET | `/api/events/:aus_id` | **Unified long-poll 25s** — notification + chat (legacy, đã thay bằng SSE) |
| GET | `/api/notify/:aus_id` | Manual trigger (debug) |
| GET | `/api/chat/conversations/:aus_id` | Sidebar list (Messenger — không có doc) |
| GET | `/api/chat/messages/:conv_id` | Message history |
| POST | `/api/chat/send` | Gửi tin |
| POST | `/api/chat/read/:conv_id/:aus_id` | Đánh dấu đã đọc |
| POST | `/api/chat/typing/:conv_id/:aus_id` | Typing indicator |
| POST | `/api/chat/heartbeat/:aus_id` | Online presence |
| GET | `/api/chat/online` | Danh sách user online |
| GET | `/api/chat/members/:conv_id` | Thành viên hội thoại |
| POST | `/api/chat/create` | Tạo DM hoặc CHANNEL |
| GET | `/api/chat/doc-conversations` | Hội thoại theo chứng từ (query: doc_type, doc_no, aus_id) |

## Kiến trúc Real-time (hiện tại — SSE)

```
Notification: Oracle DML trên USER_NOTIFICATIONS (INSERT hoặc UPDATE read='Y')
  → cqn.js: rowid → aus_id (rowidCache) → notifyUser(ausId)
  → events.js: deliverToUser → sseWrite(res, seq, payload)
  → browser nhận { type: 'notification' }
  → fetchNotifCount() → APEX callback 'notificationCount' → COUNT(*) WHERE read='N'
  → updateNotifBadge(count)

Chat: POST /api/chat/send
  → chat.js: INSERT DB → deliverToConv(convId, payload, senderAusId)
  → events.js: sseWrite cho mỗi member có SSE conn; buffer nếu offline
  → browser nhận { type: 'message', conv_id, msg: {...} }
  → $(document).trigger('apex:chatEvent', [ev])
```

**Notification bell — không dùng plugin:** Badge `#notif-badge` được inject JS vào `<li class="user-notificaiton">` trong Navigation Bar. Click handler do APEX tự xử lý qua `href="#action$a-dialog-open?..."` (page 11000130215). Không override click.

## Module Internals

### server.js
- `oracledb.initOracleClient()` — yêu cầu Oracle Instant Client trên Server B (`LD_LIBRARY_PATH`)
- Middleware `res.json()` override: escape mọi char > 127 thành `\uXXXX` (fix Oracle UTL_HTTP charset WE8MSWIN1252). **Dùng `charCodeAt()` loop — không dùng regex Unicode range literal** (Edit tool có thể garble multi-byte)
- Express v5: async route errors tự động propagate — không cần `express-async-errors` shim

### db-registry.js
- `initPools()`: đọc + validate `db-registry.json`, tạo 1 named pool/DB (`poolAlias=key`, `events:true`). Ném lỗi nếu trùng key / >1 primary / thiếu field.
- `getConnection(key)` / `getPool(key)`: mặc định = primary; `key` = poolAlias. `cqnDbs()` = các DB `cqn:true`. `closeAll()`: đóng mọi pool khi shutdown.

### events.js
- `sseConnections` Map: **`dbKey:ausId` → res** (`keyOf(dbKey,ausId)`) — 1 SSE conn/user; conn mới đẩy conn cũ ra
- `eventBuffer` Map: cùng key composite; buffer at-least-once `message/read/notification` với `seq` tăng dần — SSE replay theo `Last-Event-ID` (BUFFER_MAX=100, TTL=60s)
- `registerSSE(dbKey, ausId, res, lastEventId)`, `deliverToUser(dbKey, ausId, payload)`
- `notifyUser(ausId, dbKey=DEFAULT_DB_KEY)` — **thứ tự tham số NGƯỢC** với 2 hàm trên (cố ý: giữ chữ ký `_emitFn(ausId)` cho CQN)

### cqn.js — multi-DB (state per-DB)
- `subs` Map: `dbKey → { conn, regId, rowidCache, subscrName }`. `startCQN()` subscribe **mọi DB `cqn:true`** (`subscrName = notifications_watcher_<dbKey>`), share 1 `CQN_PORT`.
- **Subscription SQL:** `SELECT ano_id, aus_id FROM user_notifications WHERE read = 'N'` — filter `read='N'` để CQN fire cả khi UPDATE `read='Y'` (mark-read), không chỉ INSERT/DELETE
- Callback là closure `makeOnMessage(sub)` → route rowid về đúng schema, notify `_emitFn(ausId, sub.dbKey)`. Query aus_id qua `registry.getConnection(sub.dbKey)` (pool của schema đó).
- `fatalRestart` → `process.exit(1)` (pm2 restart) — **all-or-nothing**: 1 sub lỗi thoát cả process (chấp nhận vì cùng instance). CQN connection standalone `events:true`; query dùng pool riêng.
- `>80 ROWID`/transaction → gửi none → `handleFullScan(sub)` fallback (per-DB). Health-check per-DB match callback `CQN_HOST:CQN_PORT`.

### chat.js
- `withConn(fn)`: `registry.getPool()` (primary) → conn → close (TODO: chọn pool theo dbKey khi chat đa-DB)
- `normalize(rows)`: lowercase Oracle UPPERCASE column names
- `participantCache` Map: `conv_id → { ausIds, expiresAt }` — TTL 60s; invalidate khi `/create`
- `typingState` Map: `conv_id:aus_id → expireHandle` — auto-clear sau 4s
- `GET /conversations/:aus_id`: filter `WHERE c.doc_type IS NULL` (Messenger only)

## In-memory State (reset khi pm2 restart)

| State | Impact |
|-------|--------|
| `eventWaiters` | User timeout lần poll tiếp — tự recover |
| `eventBuffer` | Event trong cửa sổ restart có thể mất |
| `rowidCache` | Re-load từ DB lúc startup; DELETE event trong gap có thể miss |
| `typingState` / `participantCache` / `onlineCache` | Harmless — re-query on miss |

## Pitfalls Server

**CQN_PORT ≠ PORT:** oracledb mở TCP listener trên CQN_PORT. Nếu trùng PORT → `EADDRINUSE`.

**IP 172 không phải 127:** `connectString` (trong db-registry.json) và `CQN_HOST` dùng `172.25.x.x`. Gõ nhầm `127.25.x.x` → `ORA-12514` hoặc silent fail.

**dbKey namespace phải khớp 3 nơi:** `key` trong db-registry.json = dbKey trong CQN notify = dbKey trong APEX `sseToken`. Lệch → notification không tới client. Token cũ 2-phần chạy tạm dưới `DEFAULT_DB_KEY`.

**Unicode middleware — charCodeAt only:** Không dùng regex với Unicode range literal trong middleware `res.json()`. Implementation hiện dùng `charCodeAt()` loop — giữ nguyên.

**oracledb thick client:** Nếu `LD_LIBRARY_PATH` / `ORACLE_HOME` sai → crash ngay với `DPI` error.

**UTL_HTTP POST từ Oracle — Connection: close bắt buộc:** Mọi POST callback PL/SQL phải có `Connection: close` header + `WRITE_RAW`. Xem `docs/pitfalls.md`.

## APEX Callbacks liên quan (Page 0)

**`sseToken`** — mint HMAC-SHA256 token cho SSE client, TTL 120s. Secret đọc từ `:G_SSE_SECRET` (Application Item, populated từ `CHAT_CONFIG` table). **Multi-DB:** body 3-phần `:G_DB_KEY || '|' || aus_id || '|' || exp` — `G_DB_KEY` = key registry của schema (dev24/tnc). HMAC ký trên `base64url(body)`.

**`notificationCount`** — Application Process, trả `{ count: N }` — gọi sau mỗi SSE event `{ type:'notification' }`. Resolve aus_id từ `:APP_USER`.

**`chatHeartbeat`** — MERGE vào `CHAT_USER_ONLINE` mỗi 20s, dùng `:G_AUS_ID` (reliable trên Page 0).

**`loadAppConfig`** — Application Process (Before Header), đọc `CHAT_CONFIG WHERE key='SSE_SECRET'` → `:G_SSE_SECRET`.

Source SQL đầy đủ: `chat-system/docs/page0-callbacks.sql`
