# Core Architecture

## Network Constraint — Critical

**Server B (`172.25.10.38`) is a private IP. Browsers cannot reach it directly.**

ALL browser → Node.js communication must go through:
```
Browser → apex.server.process (HTTPS) → APEX PL/SQL callback → UTL_HTTP (HTTP) → Node.js
```

Never propose direct browser → `http://172.25.x.x:3410` connections (Mixed Content + unreachable). All new features must follow the `apex.server.process → UTL_HTTP` pattern.

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
npm install
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
| `DB_CONNECTION_STRING` | `172.25.10.18:1521/pdbgc19c` | **172**, not 127 — common typo |
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
| POST | `/api/chat/create` | Create DM or CHANNEL |
| GET | `/api/chat/doc-conversations` | Doc-scoped conversations (query: doc_type, doc_no, aus_id) |

## Unicode Encoding — Critical

Oracle's `UTL_HTTP.READ_TEXT` re-interprets UTF-8 bytes using the DB charset (WE8MSWIN1252), breaking multi-byte sequences. Fix in `server.js`: middleware overrides `res.json()` globally to escape all non-ASCII chars as `\uXXXX` before sending.

**Do not use regex with Unicode range literals** in this middleware — use `charCodeAt()` loops (as currently implemented). See `07-pitfalls.md`.
