# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`nodejs-apex-oracle` is a Node.js 22 middleware server that bridges Oracle Database 23ai (Server A) with Oracle APEX 24.2 browser clients using real-time WebSocket notifications. The project uses **BMad Method v6.6.1** for AI-driven agile development. Application source code is still being scaffolded — the architecture is fully researched and documented in `docs/`.

## System Architecture

Two-server topology:

```
Server A (192.168.1.10)          Server B (192.168.1.20)
Oracle DB 23ai + APEX 24.2  ←──  Node.js 22 (this repo)
                             TCP:1521 (CQN subscription)
                            ──►  APEX Browser Clients
                             WebSocket:3140 (Socket.io)
```

**Data flow:**
1. ERP inserts row into `APP_NOTIFICATIONS`, then `USER_NOTIFICATIONS` and commits
2. Oracle detects change via redo log, sends CQN event back through the existing TCP:1521 connection
3. Node.js CQN callback fetches full data (JOIN query), resolves `aus_id → username`
4. Socket.io emits to room `user:{username}` → APEX bell icon refreshes

**Key design decisions (see `docs/`):**
- **CQN with `clientInitiated: true`** — Node.js opens the TCP connection to Oracle, notifications flow back on the same connection. No inbound port needed on Server B.
- **Subscribe only `USER_NOTIFICATIONS`**, not a JOIN — avoids spurious callbacks from `APP_NOTIFICATIONS` inserts
- **`SUBSCR_QOS_QUERY | SUBSCR_QOS_ROWIDS`** — only fires when result set changes, delivers ROWID for targeted fetch
- **Separate pool connection for data fetch** — never query DB from the CQN connection itself
- Node.js must run in **Thick mode** (requires Oracle Instant Client 23.x on Server B)

## Planned File Structure

```
server.js              — entry point: Express + Socket.io + calls startCQN()
cqn.js                 — CQN subscription with auto-reconnect loop (15s retry)
socket/socketManager.js — Socket.io room management, emitToUser(), resolveUsername()
```

## Environment Variables (`.env`)

| Variable | Example | Notes |
|----------|---------|-------|
| `DB_USER` | `DEV24` | Oracle schema user |
| `DB_PASSWORD` | — | |
| `DB_CONNECT_STRING` | `192.168.1.10/FREEPDB1` | host/service_name format |
| `PORT` | `3140` | Socket.io server port |
| `APEX_ORIGINS` | `http://192.168.1.10:8080` | Comma-separated, used for CORS |

## Oracle Prerequisites (Server A — run as DBA)

```sql
GRANT CHANGE NOTIFICATION TO DEV24;
-- Verify: SELECT GRANTEE, PRIVILEGE FROM DBA_SYS_PRIVS WHERE GRANTEE='DEV24';
```

## Oracle Instant Client Setup (Server B — Linux)

```bash
# Install Basic package matching DB version (23.x)
sudo rpm -ivh oracle-instantclient23.5-basic-23.5.0.0.0-1.el8.x86_64.rpm
sudo dnf install -y libaio

# Or manual install:
sudo sh -c "echo /opt/oracle/instantclient_23_5 > /etc/ld.so.conf.d/oracle-instantclient.conf"
sudo ldconfig

# Verify:
ldconfig -p | grep libclntsh

# Test Thick mode:
node test-thick.js   # Expected: "Mode: Thick"
```

**On Linux: call `oracledb.initOracleClient()` with no arguments** — libs must be in system path. `libDir` is only for Windows/macOS.

## CQN Callback Message Structure

With `SUBSCR_QOS_QUERY`, use `message.queries[0].tables[0].rows[k].rowid` — not `message.tables`.

## BMad Development Workflow

1. **Analysis** — `bmad-agent-analyst` (Mary), `bmad-agent-pm` (John), or `bmad-document-project` → `docs/`
2. **Planning** — `bmad-prd`, `bmad-create-ux-design` (Sally), `bmad-agent-architect` (Winston) → `_bmad-output/planning-artifacts/`
3. **Solutioning** — `bmad-create-architecture`, `bmad-create-epics-and-stories`, `bmad-check-implementation-readiness`
4. **Implementation** — `bmad-create-story` → story files, then `bmad-dev-story` or `bmad-quick-dev`, then `bmad-code-review`

Full automated cycle: `/bmad-story-automator`

| Skill | When to use |
|-------|-------------|
| `/bmad-help` | Unsure what to do next |
| `/bmad-quick-dev` | Build/fix/refactor any code |
| `/bmad-investigate` | Trace bugs or understand unfamiliar code |
| `/bmad-code-review` | Adversarial code review |
| `/bmad-sprint-planning` | Generate sprint tracking from epics |
| `/bmad-generate-project-context` | Create `project-context.md` with AI coding rules |

## Key Directories

| Path | Purpose |
|------|---------|
| `docs/` | Architecture research, CQN design decisions |
| `_bmad-output/planning-artifacts/` | PRDs, architecture docs, epics/stories |
| `_bmad-output/implementation-artifacts/` | Story spec files ready for development |
| `_bmad/custom/config.toml` | Team-wide BMad customizations (committed) |
| `_bmad/custom/config.user.toml` | Personal BMad customizations (gitignored) |

## Document Language

Planning artifacts and documentation: **English and Vietnamese** (configured in `_bmad/config.toml`).

## BMad Configuration

- **Do not edit** `_bmad/config.toml` — regenerated on every BMad install
- Team overrides: `_bmad/custom/config.toml`
- Personal overrides: `_bmad/custom/config.user.toml`
