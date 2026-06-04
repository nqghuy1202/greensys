# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Node.js 22 middleware (Server B `172.25.10.38:3410`) bridging Oracle DB (Server A) ↔ Oracle APEX 24.2 browser clients.

**Network rule:** Browser → Node.js communication **always** goes through `apex.server.process → APEX PL/SQL → UTL_HTTP`. Never propose direct browser → private IP connections.

## Deployment model — read first

Two machines, **no automated deploy** between them:
- **This repo is the source you edit** (Windows dev box, `C:\nodejs-apex-oracle`). The `cd /opt/chat-server` commands below run **on Server B** (Linux) — `chat-server/` is copied there and run with pm2; do **not** expect pm2/npm to run against the live server from this box.
- **Frontend + SQL are pasted into APEX by hand** — there is no migration tool:
  - `docs/*.sql` PL/SQL → APEX **page-level Ajax Callbacks** (or Page 0 Application Processes for system-wide ones).
  - **JS for chat-system + doc-chat is split 3 ways to dodge APEX's ~32KB per-attribute limit** (the canonical direction since 2026-06-04): `*.fgvd.js` → **Function and Global Variable Declaration** (all state + functions in one IIFE, handlers exposed as `window.csOn*`/`dcOn*`); `*.onload.js` → **"Execute when Page Loads"** (only `csInit()`/`dcInit()`); every user interaction is a **Dynamic Action** whose JS is a one-liner calling the exposed function. The original whole-file `chat-page.js`/`doc-chat-page.js` are kept as reference only. DA tables + paste checklists: `docs/chat-system-da-setup.md`, `docs/doc-chat-da-setup.md`.
  - `*.css` → page **CSS → Inline** (~32KB limit).
  - Editing a `.sql`/`.js`/`.css` here has **no effect until pasted into APEX**. Keep JS/CSS comments minimal — a past paste hit APEX's stored-source character limit.

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

`chat-server/.env` is required (not committed). Variables: `DB_USER`, `DB_PASSWORD`, `DB_CONNECTION_STRING`, `PORT=3410`, `CQN_HOST=172.25.10.38`, `CQN_PORT=3141`, `DB_POOL_MIN/MAX/INCREMENT`. See `docs/claude/00-core.md` for full table.

## Feature Status

| Feature | Status | Details |
|---------|--------|---------|
| Notification (CQN + long-poll) | ✅ Done | `docs/claude/01-notification.md` |
| Chat System v2 (`chat-system/`) | 🚧 Active | `docs/claude/02-chat-system.md`. Native APEX, vanilla JS deployed via **FGVD + 22 Dynamic Actions** (`docs/chat-system-da-setup.md`); HTML callbacks `docs/chat-system-native.sql` (9 page-level callbacks); `*.jsx` is legacy. |
| Doc Chat Modal (page 10022710201) | 🚧 Active | `docs/claude/03-doc-chat.md` — native APEX, deployed via **FGVD + 19 Dynamic Actions** (`docs/doc-chat-da-setup.md`); filter tabs done (2026-06-01) |
| WebSocket migration (real-time) | 🚧 Phase 0 | Replace long-poll `appEvents` with **direct browser→Node WebSocket** (`ws`, not Socket.IO). Auth = HMAC token minted by APEX. Server-B-only infra (Caddy + own domain, "Nhánh A"). Plan + runbook: `_bmad-output/planning-artifacts/ws-migration-plan.md`, `…-phase0-runbook.md`. Actions stay on `UTL_HTTP`; `chat-page.js`/`doc-chat-page.js` unchanged. |
| CRM Module (KHTN) | 📋 Planned | `docs/claude/06-crm.md` |

## Repository Structure

```
chat-server/          Node.js server (runs on Server B)
  server.js           Entry point — Express + CQN startup
  events.js           Unified long-poll waiter (notification + chat events)
  chat.js             /api/chat/* router
  cqn.js              Oracle CQN subscription + ROWID cache

chat-system/          Chat System Messenger (Messenger page)
  chat-page.fgvd.js   → "Function and Global Variable Declaration" (state + fns + window.csOn*)
  chat-page.onload.js → "Execute when Page Loads" (just window.csInit())
  chat-page.js        Whole-file reference only (pre-FGVD/DA split)
  chat-page.css       CSS scoped to #chat-root
  *.jsx               Legacy React/JSX version (being phased out)
doc-chat/             Doc Chat Modal (native APEX frontend)
  doc-chat-page.fgvd.js   → "Function and Global Variable Declaration" (state + fns + window.dcOn*)
  doc-chat-page.onload.js → "Execute when Page Loads" (just window.dcInit())
  doc-chat-page.js        Whole-file reference only (pre-FGVD/DA split)
  doc-chat.css            CSS scoped to #doc-chat-root

docs/
  claude/             Context docs loaded into every session (see @refs below)
  reviews/            Review reports (apex-node-review output) — REVIEW-<scope>-<date>.md
  chat-system-native.sql      8 page-level callbacks (4 HTML-returning + 4 action) for Messenger native
  chat-system-native-plan.md  Conversion plan + 3-pane skeleton HTML for Messenger native
  chat-system-da-setup.md     FGVD + 22 Dynamic Action mapping + paste checklist (Messenger)
  doc-chat-native.sql 4 HTML-returning PL/SQL callbacks for Doc Chat
  doc-chat-callbacks.sql 4 JSON action callbacks for Doc Chat
  doc-chat-da-setup.md        FGVD + 19 Dynamic Action mapping + paste checklist (Doc Chat)
  chat_ddl.sql        Chat tables DDL
  chat_apex_callbacks_v2.sql Chat System callbacks (JSON; legacy JSX era)

_archive/             Legacy code (Socket.IO era, JSX files) — do not edit
apex-component-modifier/  Separate nested git repo — independent project, do not modify
```

## Real-time Architecture

```
Browser → apex.server.process('appEvents') → APEX PL/SQL (Page 0)
  → UTL_HTTP → GET /api/events/:aus_id (Node.js, 25s long-poll)
  ← { type: 'notification' | 'message' | 'typing' | 'typing_stop' | 'read' | 'replaced' | 'timeout' }

Global JS (global.js, runs on every page; iframes do NOT poll — they ride the parent's poll):
  type='notification' → apex.region('notification-menu').refresh()
  type='message|typing|read|...' → $(document).trigger('apex:chatEvent', [ev])

Chat System chat-page.js (Messenger, same frame) + Doc Chat doc-chat-page.js (iframe) listen:
  $(document).on('apex:chatEvent', handler)
```

⚠ **Cross-frame trap:** Doc Chat runs inside an **iframe**. It must bind the `apex:chatEvent`
listener via `window.parent.apex.jQuery(window.parent.document)` — the **parent's** jQuery instance,
NOT the iframe's `apex.jQuery`. jQuery custom events (`.trigger`) do not cross jQuery instances, so a
handler bound by the iframe's jQuery is never invoked by the parent's trigger ("event arrives, UI
doesn't update"). See `docs/claude/01-notification.md` and `docs/reviews/REVIEW-realtime-flow-2026-06-02.md`.

`/api/events/:aus_id` is the **unified** endpoint — one ORDS thread per user. The old separate `notificationWait` + `chatEvents` polls (2 threads/user) have been merged here. The endpoint is **lossy single-shot** (one waiter/user); chat events that arrive with no waiter parked are buffered in `events.js` (at-least-once across the re-poll gap) — notifications self-heal via DB re-query.

## BMad Development Workflow

| Skill | When to use |
|-------|-------------|
| `/bmad-quick-dev` | Build/fix/refactor any code |
| `/bmad-investigate` | Trace bugs or understand unfamiliar code |
| `/bmad-code-review` | Adversarial code review |
| `/apex-node-review` | Review flow/API consistency for this APEX↔Node stack; catches "intent drift" when a new branch diverges from the established flow (project skill, `.claude/skills/apex-node-review/`) |

Planning artifacts → `_bmad-output/planning-artifacts/` | Research → `docs/` | Review reports → `docs/reviews/`

---

@docs/claude/00-core.md
@docs/claude/01-notification.md
@docs/claude/02-chat-system.md
@docs/claude/03-doc-chat.md
@docs/claude/04-oracle-db.md
@docs/claude/05-apex-patterns.md
@docs/claude/06-crm.md
@docs/claude/07-pitfalls.md
@docs/claude/08-archive.md
