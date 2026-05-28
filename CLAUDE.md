# CLAUDE.md

Node.js 22 middleware (Server B `172.25.10.38:3410`) bridging Oracle DB (Server A) ↔ Oracle APEX 24.2 browser clients.

**Network rule:** Browser → Node.js communication **always** goes through `apex.server.process → APEX PL/SQL → UTL_HTTP`. Never propose direct browser → private IP connections.

## Feature Status

| Feature | Status | Details |
|---------|--------|---------|
| Notification (CQN + long-poll) | ✅ Done | `docs/claude/01-notification.md` |
| Chat System v2 (`chat_system_erp/`) | 🚧 Active | `docs/claude/02-chat-system.md` |
| Doc Chat Modal (page 10022710201) | 🚧 Active | `docs/claude/03-doc-chat.md` |
| CRM Module (KHTN) | 📋 Planned | `docs/claude/06-crm.md` |

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
