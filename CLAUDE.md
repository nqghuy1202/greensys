# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Node.js 22 middleware (Server B `172.25.10.38:3410`) bridging Oracle DB (Server A) ↔ Oracle APEX 24.2 browser clients.

**Network rule:** Browser → Node.js communication **always** goes through `apex.server.process → APEX PL/SQL → UTL_HTTP`. Never propose direct browser → private IP connections.

## Server Commands

```bash
# All commands run from chat-server/
cd /opt/chat-server

pm2 start server.js --name chat-server --restart-delay 3000
pm2 restart chat-server
pm2 logs chat-server --lines 20
pm2 status

npm run test:connection   # DB pool only (safe while server is running)
npm run test:cqn          # CQN standalone — stop server first (port conflict)

curl http://localhost:3410/health
curl http://localhost:3410/api/events/<aus_id>   # unified long-poll test
```

**Expected startup log:**
```
[DB] Connection pool created
[CQN] Cache loaded: N rows
[CQN] Subscription active on USER_NOTIFICATIONS
[Server] Listening on 0.0.0.0:3410
```

## Feature Status

| Feature | Status | Details |
|---------|--------|---------|
| Notification (CQN + long-poll) | ✅ Done | `docs/claude/01-notification.md` |
| Chat System v2 (`chat-system/`) | 🚧 Active | `docs/claude/02-chat-system.md` |
| Doc Chat Modal (page 10022710201) | 🚧 Active | `docs/claude/03-doc-chat.md` — inline compose done (2026-05-30) |
| CRM Module (KHTN) | 📋 Planned | `docs/claude/06-crm.md` |

## Repository Structure

```
chat-server/          Node.js server (runs on Server B)
  server.js           Entry point — Express + CQN startup
  events.js           Unified long-poll waiter (notification + chat events)
  chat.js             /api/chat/* router
  cqn.js              Oracle CQN subscription + ROWID cache

chat-system/          Chat System Messenger (APEX JSX frontend)
doc-chat/             Doc Chat Modal (native APEX frontend)
  doc-chat-page.js    Vanilla JS — all page interactions
  doc-chat.css        CSS scoped to #doc-chat-root

docs/
  claude/             Context docs loaded into every session (see @refs below)
  doc-chat-native.sql 4 HTML-returning PL/SQL callbacks for Doc Chat
  doc-chat-callbacks.sql 4 JSON action callbacks for Doc Chat

_archive/             Legacy code (Socket.IO era, JSX files) — do not edit
```

## Real-time Architecture

```
Browser → apex.server.process('appEvents') → APEX PL/SQL (Page 0)
  → UTL_HTTP → GET /api/events/:aus_id (Node.js, 25s long-poll)
  ← { type: 'notification' | 'message' | 'typing' | 'typing_stop' | 'timeout' }

Global JS (global.js):
  type='notification' → apex.region('notification-menu').refresh()
  type='message|typing|...' → $(document).trigger('apex:chatEvent', [ev])

Chat System page-app.jsx + Doc Chat doc-chat-page.js both listen:
  $(document).on('apex:chatEvent', handler)
```

## BMad Development Workflow

| Skill | When to use |
|-------|-------------|
| `/bmad-quick-dev` | Build/fix/refactor any code |
| `/bmad-investigate` | Trace bugs or understand unfamiliar code |
| `/bmad-code-review` | Adversarial code review |

Planning artifacts → `_bmad-output/planning-artifacts/` | Research → `docs/`

---

@docs/claude/00-core.md
@docs/claude/01-notification.md
@docs/claude/02-chat-system.md
@docs/claude/03-doc-chat.md
@docs/claude/04-oracle-db.md
@docs/claude/05-apex-patterns.md
@docs/claude/06-crm.md
@docs/claude/07-pitfalls.md
