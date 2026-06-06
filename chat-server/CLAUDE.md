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

## Kiến trúc Real-time (hiện tại — long-poll)

```
CQN: Oracle INSERT vào USER_NOTIFICATIONS
  → cqn.js: rowid → aus_id (rowidCache) → notifyUser(ausId)
  → events.js: resolve pending waiter cho aus_id đó
  → browser nhận { type: 'notification' }
  → apex.region('notification-menu').refresh()

Chat: POST /api/chat/send
  → chat.js: INSERT DB → deliverToConv(convId, payload, senderAusId)
  → events.js: resolve waiter cho mỗi member
  → browser nhận { type: 'message', conv_id, msg: {...} }
  → $(document).trigger('apex:chatEvent', [ev])
```

## Module Internals

### server.js
- `oracledb.initOracleClient()` — yêu cầu Oracle Instant Client trên Server B (`LD_LIBRARY_PATH`)
- Middleware `res.json()` override: escape mọi char > 127 thành `\uXXXX` (fix Oracle UTL_HTTP charset WE8MSWIN1252). **Dùng `charCodeAt()` loop — không dùng regex Unicode range literal** (Edit tool có thể garble multi-byte)
- Express v5: async route errors tự động propagate — không cần `express-async-errors` shim

### events.js
- `eventWaiters` Map: `aus_id → [{ res, timeout }]` — 1 waiter/user; conn mới đẩy conn cũ ra
- `eventBuffer` Map: buffer at-least-once cho `message/read/notification` khi không có waiter (BUFFER_MAX=100, TTL=60s)
- `drainAll()`: flush mọi waiter với `{ type:'timeout' }` khi shutdown

### cqn.js
- `rowidCache` Map: rowid → aus_id — load từ DB lúc startup; INSERT thêm, DELETE đọc-và-xóa
- Retry tự động sau 15s nếu subscription fail
- Khi Oracle gửi >80 ROWID trong 1 transaction → gửi none → `handleFullScan()` fallback
- CQN connection dùng `events: true`; DB query dùng **pool connection riêng** — không query trên CQN connection

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

## APEX Callback liên quan (Page 0)

Callback `appEvents` (Page 0) là entry point từ browser:
```
Browser apex.server.process('appEvents')
  → APEX PL/SQL → UTL_HTTP GET /api/events/:aus_id (25s long-poll)
  ← { type, ... }
```

Chi tiết SQL callback + global.js poll loop: `docs/notification.md`
