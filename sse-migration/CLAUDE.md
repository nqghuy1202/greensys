# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# SSE Migration — Real-time Upgrade ✅ HOÀN THÀNH

Thay kênh nhận real-time từ **long-poll** (APEX → ORDS → UTL_HTTP → Node) sang **SSE trực tiếp** (browser → nginx → Node), giải phóng ORDS thread, mục tiêu >100 user online đồng thời.

## Trạng thái (2026-06-09) — TẤT CẢ PHASE XONG

| Phase | Nội dung | Trạng thái |
|-------|---------|-----------|
| **Phase 0** | nginx + certbot TLS `chattest.erp100.vn` → `172.25.10.38:3410` | ✅ Xong |
| **Phase 1** | `token.js`, route `/api/sse`, SSE registry trong `events.js` | ✅ Xong |
| **Phase 2** | APEX `sseToken` callback + `global.js` SSE client | ✅ Xong |
| **Phase 3** | Xóa `appEvents`/`notificationWait` long-poll, rewrite events.js/server.js/global.js | ✅ Xong |

## Quyết định đã chốt (không thay đổi)

| Quyết định | Chi tiết |
|------------|---------|
| Transport | **SSE thuần** (`EventSource` browser, `res.write` Node). Không WebSocket, không Socket.IO |
| Auth | Token HMAC-SHA256 ký từ APEX (`DBMS_CRYPTO`), verify ở Node, truyền qua **query string** |
| Hạ tầng | nginx (`chattest.erp100.vn`) + certbot Let's Encrypt trên Server B |
| Phạm vi | Chỉ kênh NHẬN event. Action (`send/typing/read/heartbeat`) giữ nguyên `apex.server.process → UTL_HTTP` |
| Endpoint | `https://chattest.erp100.vn/api/sse` |
| Secret | Lưu trong Oracle table `CHAT_CONFIG (key, value)`, đọc qua Application Process `loadAppConfig` (Before Header) vào Application Item `G_SSE_SECRET` |

## Kiến trúc SSE (live)

```
Browser (erp.greensys.vn:8211)
  │  new EventSource('https://chattest.erp100.vn/api/sse?token=<HMAC>&lastEventId=<id>')
  ▼
nginx (Server B :443, TLS Let's Encrypt, proxy_buffering off)
  ▼
Node.js localhost:3410  GET /api/sse
  │  verifyToken() → ausId
  │  registerSSE(ausId, res, lastEventId)  → flush buffer từ lastEventId
  │  res.write('id: N\ndata: {...}\n\n')   → heartbeat ': ping' mỗi 25s
  ▼
Browser onmessage → $(document).trigger('apex:chatEvent', [data])
```

## Token Format

```
body  = base64url("<aus_id>|<exp_epoch_seconds>")    ← UTL_RAW.CAST_TO_VARCHAR2 + UTL_ENCODE
sig   = base64url(HMAC_SHA256(body, G_SSE_SECRET))   ← DBMS_CRYPTO.MAC typ=>3 (không phải 2!)
token = body + "." + sig
TTL   = 120 giây
```

**Node verify:** `chat-server/token.js` — `verifyToken(token) → { ausId } | null`

**APEX mint:** Page 0 Ajax Callback `sseToken` — source SQL: `chat-system/docs/page0-callbacks.sql`

## Files liên quan

| File | Vai trò |
|------|---------|
| `chat-server/token.js` | Verify HMAC token |
| `chat-server/events.js` | SSE registry (`sseConnections` Map), `registerSSE`, `deliverToUser`, seq-based replay buffer |
| `chat-server/server.js` | Route `GET /api/sse` — verify token, set SSE headers, heartbeat 25s |
| `chat-system/global.js` | SSE client: `connectSSE()`, `mintToken()`, backoff re-mint |
| `chat-system/docs/page0-callbacks.sql` | SQL cho `sseToken`, `chatHeartbeat`, `notificationCount` |
| `planning/ws-migration-plan.md` | Kế hoạch đầy đủ 4 phase (lịch sử) |

## APEX Callbacks hiện tại (Page 0)

| Callback | Loại | Vai trò |
|----------|------|---------|
| `sseToken` | Ajax Callback | Mint HMAC token cho SSE client |
| `chatHeartbeat` | Ajax Callback | MERGE `CHAT_USER_ONLINE` mỗi 20s — online presence |
| `notificationCount` | Application Process | COUNT `USER_NOTIFICATIONS WHERE read='N'` |
| `loadAppConfig` | Application Process (Before Header) | Đọc `CHAT_CONFIG` → populate `G_SSE_SECRET` |

**Đã xóa:** `appEvents` (long-poll), `notificationWait` (long-poll cũ)

## Env var Server B

```
G_SSE_SECRET=<64-char hex>   # khớp với CHAT_CONFIG WHERE key='SSE_SECRET'
```

## Pitfalls SSE

**`proxy_buffering off` bắt buộc trong nginx** — thiếu là SSE không flush tới browser.

**`typ => 3` không phải `typ => 2`** — `DBMS_CRYPTO.HMAC_SH256 = 3`; `typ => 2` = SHA1 (20 bytes, sai).

**`UTL_RAW.CAST_TO_VARCHAR2` bắt buộc khi base64** — gán RAW thẳng vào VARCHAR2 → Oracle hex-encode, không phải base64.

**Không dùng auto-reconnect của EventSource** — token TTL 120s, auto-reconnect dùng token cũ → kẹt 401. Phải `es.close()` → re-mint → `new EventSource(...)`.

**Application Process `On New Session` không đủ** — session cũ không trigger. Dùng `Before Header` cho `loadAppConfig`.

**`http2 on;` chỉ nginx ≥ 1.25** — nginx 1.20.x dùng `listen 443 ssl http2;` (trên cùng dòng).

## KHÔNG đụng vào

- `cqn.js` — CQN subscription không thay đổi
- `chat-page.fgvd.js`, `doc-chat-page.fgvd.js`
- Mọi action callback PL/SQL (`chatSend`, `docChatTyping`, v.v.)
- Server A (APEX/ORDS)
