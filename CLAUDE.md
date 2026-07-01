# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# nodejs-apex-oracle

Node.js 22 middleware (Server B `172.25.10.50:3410`) bridging Oracle DB (Server A) ↔ Oracle APEX 24.2 browser clients.

> **IP Server B = `172.25.10.50`** (xác minh `hostname -I` + listener). Docs cũ ghi `172.25.10.38` là SAI — đừng dùng `.38`. `DB_CONNECTION_STRING` trỏ DB ở `172.25.10.18` (máy khác).

## Kiến trúc hệ thống

```
Browser (APEX client — erp.greensys.vn:8211)
  │  apex.server.process → APEX PL/SQL → UTL_HTTP
  ▼
Server A — Oracle APEX 24.2 / ORDS
  │  UTL_HTTP HTTP → Server B :3410
  │  CQN callback TCP (Oracle → Server B :3141)
  │  TCP:1521 oracledb pool
  ▼
Server B — Node.js 22 (172.25.10.50:3410)
  chat-server/server.js
```

**Network rule:** Browser → Node.js **luôn** qua `apex.server.process → APEX PL/SQL → UTL_HTTP`. Không có direct browser → private IP.

**Exception SSE (đã live):** `/api/sse` là kênh SSE trực tiếp `browser → nginx(443) → Node`. Chỉ áp dụng cho kênh NHẬN — action (`send/typing/read/heartbeat`) vẫn qua UTL_HTTP.

## Sub-projects

| Folder | Mô tả | CLAUDE.md |
|--------|-------|-----------|
| `chat-server/` | Node.js backend — Express, CQN, SSE, DB pool | `chat-server/CLAUDE.md` |
| `chat-system/` | Messenger UI — APEX native, FGVD + 22 DA | `chat-system/CLAUDE.md` |
| `doc-chat/` | Doc Chat Modal (page 10022710201) — FGVD + 19 DA | `doc-chat/CLAUDE.md` |
| `drawer-notification/` | Notification page UI prototype — HTML/CSS tĩnh + APEX integration | `drawer-notification/CLAUDE.md` |
| `sse-migration/` | SSE real-time upgrade — ✅ Hoàn thành 2026-06-09 | `sse-migration/CLAUDE.md` |
| `apex-claude-mcp/` | Vibe coding — kết nối Claude Code ↔ APEX 26 + Oracle DB | `apex-claude-mcp/CLAUDE.md` |
| `apex-component-modifier/` | Skill gốc (fork từ avhrst) — tham khảo, chưa customize | `apex-component-modifier/CLAUDE.md` |

## Deployment model

**Không có automated deploy.** Hai máy, copy tay:
- Repo này (Windows dev box) là source bạn edit
- `chat-server/` copy lên Server B → chạy với pm2
- JS/CSS/SQL paste thủ công vào APEX Builder

**APEX frontend split 3 chỗ** (né giới hạn ~32KB/attribute):
- `*.fgvd.js` → **Function and Global Variable Declaration**
- `*.onload.js` → **Execute when Page Loads** (thường chỉ 1 dòng gọi `window.csInit()` / `window.dcInit()`)
- Mỗi user action → **Dynamic Action** (one-liner gọi `window.csOn*` / `window.dcOn*`)
- `*.css` → **Page → CSS → Inline**

## Server B — Chat Server commands

```bash
pm2 start server.js --name chat-server --restart-delay 3000
pm2 restart chat-server
pm2 logs chat-server --lines 20
pm2 status
curl http://localhost:3410/health
```

**Test DB/CQN (chạy từ `chat-server/`):**
```bash
npm run test:connection    # safe khi server đang chạy
npm run test:cqn           # dừng server trước (tranh CQN_PORT 3411)
```

### CQN — mô hình vận hành & recovery (quan trọng)

CQN dùng **2 kênh**: control (outbound Node→Oracle `1521`, để subscribe) và **callback (inbound Oracle→Server B `CQN_PORT=3411`**, để giao notification). Subscribe có thể thành công mà notification vẫn KHÔNG tới nếu kênh callback inbound bị chặn.

- **`PORT=3410` (HTTP), `CQN_PORT=3411`, `CQN_HOST=172.25.10.50`** — phải khác nhau; thick mode bind listener trên `CQN_HOST:CQN_PORT`.
- **Recovery = thoát process, KHÔNG retry in-process** (`cqn.js` `fatalRestart` → `process.exit(1)`): OCI thick mode giữ notification listener suốt đời process, re-subscribe trong cùng process luôn `ORA-24912`/`NJS-003` loop. Chỉ pm2 restart (process mới) mới nhả port. ⇒ **luôn fork mode, 1 instance** — cluster sẽ tranh bind `CQN_PORT`.
- **Bẫy chẩn đoán:** `curl /api/notify/<aus_id>` chạy (HTTP nội bộ → SSE, bypass CQN) KHÔNG chứng minh CQN. Test CQN thật = `UPDATE/INSERT user_notifications` rồi xem log `[Events] notification`. Test reachability từ DB: `utl_tcp.open_connection('172.25.10.50', 3411)`.
- Registration sống phải có callback `HOST=172.25.10.50 PORT=3411` trong `user_change_notification_regs`. Reg trỏ IP khác = mồ côi (xoá bằng `DBMS_CQ_NOTIFICATION.DEREGISTER`, cần DBA grant EXECUTE cho DEV24).

## Feature Status

| Feature | Status |
|---------|--------|
| Notification (CQN + SSE) | ✅ Done |
| Chat System / Messenger | 🚧 Active |
| Doc Chat Modal (page 10022710201) | 🚧 Active |
| SSE Migration (real-time) | ✅ Done — 4 phase hoàn thành 2026-06-09 |
| Menu Tree IG (page 10012010203) | ✅ Done — `docs/menu-tree-ig-setup.md` |
| Kanban Board dynamic columns | ✅ Done — `template_component_plugin_kanban_board (1).sql` |
| Multi-DB real-time hub | 🚧 Active — code xong, chưa deploy; `chat-server/docs/multi-db-research.md` |
| CRM Module (KHTN) | 📋 Planned — `docs/crm.md` |

## Shared Docs

| File | Nội dung |
|------|---------|
| `docs/oracle-db.md` | Schema chat, remote tables, MATERIALIZE pattern, column names |
| `docs/apex-patterns.md` | CSS theming, pageId convention, navigation, UI patterns |
| `docs/pitfalls.md` | Tất cả bẫy đã biết — đọc trước khi code |
| `docs/oracle_db23ai_ai_capabilities.md` | AI capabilities của Oracle DB 23ai trên Server A |
| `docs/menu-tree-ig-setup.md` | Menu Tree IG setup (page 10012010203) |
| `docs/crm.md` | CRM module context (planned) |
| `docs/reviews/` | Review reports |

## Kanban Board Plugin — Dynamic Columns

Plugin `KANBAN_BOARD` (Template Component) hỗ trợ lấy cột từ DB qua AJAX.

**Cơ chế:** Template Component không có PL/SQL render → columns inject qua JS sau khi page load.

**Setup cho region mới:**
1. Tạo **Application Process** `kanbanGetColumns` (dùng `APEX_JSON`, không dùng `JSON_ARRAYAGG RETURNING CLOB` — gây ORA-22922 khi empty):
```sql
DECLARE l_co_id NUMBER := TO_NUMBER(:G_CO_ID); BEGIN
  IF l_co_id IS NULL THEN HTP.p('{"columns":[]}'); RETURN; END IF;
  APEX_JSON.OPEN_OBJECT; APEX_JSON.OPEN_ARRAY('columns');
  FOR r IN (SELECT t.value AS id, t.name AS text, NVL(t.description,'#4A90D9') AS color
            FROM co_list_of_value t
            WHERE t.co_id=l_co_id AND t.status='Y' AND t.code='CLE_STATUS'
            ORDER BY t.order_by) LOOP
    APEX_JSON.OPEN_OBJECT; APEX_JSON.WRITE('id',r.id); APEX_JSON.WRITE('text',r.text); APEX_JSON.WRITE('color',r.color); APEX_JSON.CLOSE_OBJECT;
  END LOOP;
  APEX_JSON.CLOSE_ARRAY; APEX_JSON.CLOSE_OBJECT;
EXCEPTION WHEN OTHERS THEN HTP.p('{"columns":[],"error":"'||SQLERRM||'"}'); END;
```
2. Plugin attribute **`COLUMNSAJAX`** (REPORT scope, TEXT type, group Ajax Settings) — bỏ Required trên STATUS1 ID
3. Region config: `Columns Ajax Process = kanbanGetColumns`, STATUS1..STATUS10 để trống
4. `script.js` đã sửa để đọc `columnsajax` attribute, fetch trước `relocate()`

**Data source columns:** `co_list_of_value` — `value`=id, `name`=text, `description`=color, `order_by`=seq

@docs/oracle-db.md
@docs/apex-patterns.md
@docs/pitfalls.md

## BMad Workflow

| Skill | Khi dùng |
|-------|---------|
| `/bmad-quick-dev` | Build/fix/refactor code |
| `/bmad-investigate` | Trace bug, hiểu code lạ |
| `/bmad-code-review` | Adversarial review |
| `/apex-node-review` | Review flow/API consistency APEX↔Node |

## Vibe Coding — apex-claude-mcp

Dự án kết nối Claude Code trực tiếp với Oracle APEX 26 + Oracle DB 26 qua SQLcl + skill `/apex`.

**Prerequisite:** VPN nội bộ kết nối, SQLcl 25.1+ cài trên máy dev, saved connection `APEX26`.

```powershell
# Test kết nối Oracle (sau khi join VPN)
Test-NetConnection -ComputerName 172.25.10.38 -Port 1521

# Kết nối SQLcl
sql dev24@172.25.10.38:1521/orclpdb1
```

**Skill usage (sau khi setup xong):**
```
/apex PAGE:100 -- show structure
/apex PAGE:100 -- thêm Classic Report danh sách user
/sqlcl -- select count(*) from chat_messengers
```

Xem hướng dẫn đầy đủ: `apex-claude-mcp/docs/setup.md`
