# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# apex-claude-mcp

Vibe coding — kết nối Claude Code trực tiếp với Oracle APEX 26 + Oracle Database qua SQLcl + skill `/apex`.

## Kiến trúc

```
Máy cá nhân (Windows) — edit files tại C:\greensys\apex-claude-mcp\
  │  RDP + Drive Redirect (\\tsclient\C)
  ▼
VM (103.109.xx.xx) — Claude Code + SQLcl chạy tại đây
  │  TCP:1521
  ▼
Oracle APEX 26 + Oracle DB (172.25.10.38:1521/orclpdb1)
  user: dev24 / workspace: DEV
```

**Workflow hàng ngày:**
1. RDP vào VM
2. Mở terminal trên VM, `cd \\tsclient\C\greensys\apex-claude-mcp`
3. Gọi `claude` — vibe coding trực tiếp

## Kết nối Oracle

```powershell
# Test kết nối (chạy trên VM)
Test-NetConnection -ComputerName 172.25.10.38 -Port 1521

# Kết nối SQLcl
sql dev24@172.25.10.38:1521/orclpdb1

# Dùng saved connection (sau khi setup)
sql -name APEX26
```

## Cấu trúc thư mục

| Folder/File | Mô tả |
|-------------|-------|
| `docs/setup.md` | Hướng dẫn cài đặt đầy đủ (SQLcl, Claude Code, saved connection) |
| `scripts/` | Utility scripts |

## Setup checklist (chạy trên VM)

- [ ] `Test-NetConnection -ComputerName 172.25.10.38 -Port 1521` → TcpTestSucceeded: True
- [ ] `sql -version` → SQLcl 25.1+
- [ ] `claude --version` → Claude Code installed
- [ ] Saved connection `APEX26` hoạt động
