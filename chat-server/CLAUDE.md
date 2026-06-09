# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Chat Server — Node.js Backend

Node.js 22 middleware chạy trên **Server B** (`172.25.10.38:3410`). Nhận request từ Oracle APEX qua UTL_HTTP, đẩy event real-time về browser qua long-poll, duy trì Oracle CQN subscription.

## Files

```
chat-server/
  server.js        Entry point — Express setup, DB pool, endpoints, graceful shutdown
  chat.js          /api/chat/* router — messages, conversations, typing, presence
  cqn.js           Oracle CQN subscription + ROWID cache
  events.js        Unified long-poll waiter map + event buffer
  test-connection.js  Test DB pool (safe khi server đang chạy)
  test-cqn.js      Test CQN standalone (dừng server trước — tranh port)
  package.json
  .env             Required, không commit (xem biến bên dưới)
  docs/
    notification.md    Chi tiết CQN + long-poll + APEX callbacks
    chat_ddl.sql       DDL 4 bảng chat + sequences
    cqn-setup-guide.md Hướng dẫn cấp quyền Oracle cho CQN
    oracle-prereqs.md  Lệnh DBA một lần + ORDS scalability notes
```

## Deploy & Run (chạy trên Server B)

```bash
cd /opt/chat-server
pm2 start server.js --name chat-server --restart-delay 3000
pm2 restart chat-server
pm2 logs chat-server --lines 20
pm2 status
```

**Startup log bình thường:**
```
[DB] Connection pool created
[CQN] Cache loaded: N rows
[CQN] Subscription active on USER_NOTIFICATIONS
[Server] Listening on 0.0.0.0:3410
```

**Test nhanh:**
```bash
npm run test:connection          # DB pool only — safe khi server đang chạy
npm run test:cqn                 # Dừng server trước (tranh CQN_PORT)
curl http://localhost:3410/health
curl http://localhost:3410/api/events/<aus_id>
```

## Environment Variables (`.env`)

| Biến | Ví dụ | Ghi chú |
|------|-------|---------|
| `DB_USER` | `dev24` | Oracle schema |
| `DB_PASSWORD` | — | |
| `DB_CONNECTION_STRING` | `172.25.10.18:1521/pdbgc19c` | **172**, không phải 127 |
| `PORT` | `3410` | HTTP server |
| `CQN_HOST` | `172.25.10.38` | Server B IP — **172**, không phải 127 |
| `CQN_PORT` | `3141` | Phải khác PORT |
| `DB_POOL_MIN/MAX/INCREMENT` | `2/10/1` | |

## HTTP Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/health` | Health check |
| GET | `/api/events/:aus_id` | **Unified long-poll 25s** — notification + chat |
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

### events.js
- `sseConnections` Map: `aus_id → res` — 1 SSE conn/user; conn mới đẩy conn cũ ra (ghi event `replaced`)
- `eventBuffer` Map: buffer at-least-once cho `message/read/notification` với `seq` tăng dần — dùng cho SSE replay theo `Last-Event-ID` (BUFFER_MAX=100, TTL=60s)
- `registerSSE()`: flush buffer từ `lastEventId` khi reconnect
- `deliverToUser()`: SSE conn mở → `sseWrite` ngay; không có conn → buffer
- `drainAll()`: ghi event `close` và end mọi SSE conn khi shutdown

### cqn.js
- `rowidCache` Map: rowid → aus_id — load từ DB lúc startup; INSERT thêm, DELETE đọc-và-xóa
- **Subscription SQL:** `SELECT ano_id, aus_id FROM user_notifications WHERE read = 'N'` — filter `WHERE read = 'N'` để CQN fire cả khi UPDATE `read = 'Y'` (mark as read), không chỉ INSERT/DELETE
- Retry tự động sau 15s nếu subscription fail
- Khi Oracle gửi >80 ROWID trong 1 transaction → gửi none → `handleFullScan()` fallback
- CQN connection dùng `events: true`; DB query dùng **pool connection riêng** — không query trên CQN connection
- UPDATE `read = 'Y'` → row rời result set → Oracle báo rowid → `handleRowid()` query aus_id từ row (vẫn tồn tại trong bảng) → `notifyUser(ausId)`

### chat.js
- `withConn(fn)`: get pool conn → gọi fn(conn) → close trong finally
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

**IP 172 không phải 127:** `DB_CONNECTION_STRING` và `CQN_HOST` dùng `172.25.x.x`. Gõ nhầm `127.25.x.x` → `ORA-12514` hoặc silent fail.

**Unicode middleware — charCodeAt only:** Không dùng regex với Unicode range literal trong middleware `res.json()`. Implementation hiện dùng `charCodeAt()` loop — giữ nguyên.

**oracledb thick client:** Nếu `LD_LIBRARY_PATH` / `ORACLE_HOME` sai → crash ngay với `DPI` error.

**UTL_HTTP POST từ Oracle — Connection: close bắt buộc:** Mọi POST callback PL/SQL phải có `Connection: close` header + `WRITE_RAW`. Xem `docs/pitfalls.md`.

## APEX Callbacks liên quan (Page 0)

**`sseToken`** — mint HMAC-SHA256 token cho SSE client, TTL 120s. Secret đọc từ `:G_SSE_SECRET` (Application Item, populated từ `CHAT_CONFIG` table).

**`notificationCount`** — Application Process, trả `{ count: N }` — gọi sau mỗi SSE event `{ type:'notification' }`. Resolve aus_id từ `:APP_USER`.

**`chatHeartbeat`** — MERGE vào `CHAT_USER_ONLINE` mỗi 20s, dùng `:G_AUS_ID` (reliable trên Page 0).

**`loadAppConfig`** — Application Process (Before Header), đọc `CHAT_CONFIG WHERE key='SSE_SECRET'` → `:G_SSE_SECRET`.

Source SQL đầy đủ: `chat-system/docs/page0-callbacks.sql`
