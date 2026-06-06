# SSE Migration — Real-time Upgrade

Thay kênh nhận real-time từ **long-poll** (APEX → ORDS → UTL_HTTP → Node) sang **SSE trực tiếp** (browser → nginx → Node), giải phóng ORDS thread, mục tiêu >100 user online đồng thời.

**Trạng thái: Phase 0 bị chặn** — provider firewall chưa mở port 80/443 inbound. Cần nhờ phòng hệ thống mở port 80 TCP cho `103.109.xx.xx`.

## Quyết định đã chốt (không thay đổi)

| Quyết định | Chi tiết |
|------------|---------|
| Transport | **SSE thuần** (`EventSource` browser, `res.write` Node). Không WebSocket, không Socket.IO |
| Auth | Token HMAC-SHA256 ký từ APEX (`DBMS_CRYPTO`), verify ở Node, truyền qua **query string** (EventSource không set được custom header) |
| Hạ tầng | **nginx có sẵn trên Server B** + certbot Let's Encrypt. Không Caddy, không đụng Server A |
| Phạm vi | Chỉ kênh NHẬN event. Action (`send/typing/read/heartbeat`) **giữ nguyên** `apex.server.process → UTL_HTTP` |
| Endpoint | `https://chat.greensys.vn/api/sse` (SSE) — độc lập với ORDS |

## Files

```
sse-migration/
  CLAUDE.md                    ← file này
  planning/
    ws-migration-plan.md            ← kế hoạch đầy đủ 4 phase
    ws-migration-phase0-runbook.md  ← lệnh step-by-step cho Phase 0
    phase0-infrastructure-explained.md  ← giải thích nginx/certbot/TLS cho người mới
```

> Tên file giữ `ws-migration-*` vì lý do lịch sử — transport đã đổi sang SSE từ 2026-06-04.

## Kiến trúc SSE (sau migration)

```
Browser (erp.greensys.vn:8211)
  │  new EventSource('https://chat.greensys.vn/api/sse?token=<HMAC>&lastEventId=<id>')
  ▼
nginx (Server B :443, TLS Let's Encrypt)
  proxy_buffering off / proxy_read_timeout 65s / http2 on
  ▼
Node.js localhost:3410  GET /api/sse
  │  verifyToken() → ausId
  │  registerConnection(ausId, res)
  │  res.write('id: N\ndata: {...}\n\n')
  ▼
Browser onmessage → $(document).trigger('apex:chatEvent', [data])
```

## Lộ trình 4 Phase

| Phase | Nội dung | Trạng thái |
|-------|---------|-----------|
| **Phase 0** | nginx + certbot TLS trên Server B | 🚧 Chờ DNS |
| **Phase 1** | Node.js `GET /api/sse` + `token.js` + cập nhật `events.js` | ⬜ Chưa |
| **Phase 2** | APEX `sseToken` callback + `global.js` SSE client + feature flag `USE_SSE` | ⬜ Chưa |
| **Phase 3** | Cutover (bật `USE_SSE=true`), xóa long-poll, dọn dẹp | ⬜ Chưa |

## Phase 0 — Acceptance Criteria

- [x] `dig chat.greensys.vn` → `103.109.xx.xx` (DNS đã xong)
- [x] nginx 1.14.1 đã cài, config `/etc/nginx/conf.d/chat-sse.conf` đã tạo
- [x] certbot đã cài (`python3-certbot-nginx`)
- [x] OS firewall đã mở http/https (`firewall-cmd`)
- [ ] **ĐANG CHẶN:** Provider firewall mở port 80/443 inbound (nhờ phòng hệ thống)
- [ ] `sudo certbot --nginx -d chat.greensys.vn` thành công
- [ ] `curl -v https://chat.greensys.vn/health` → 200, TLS hợp lệ (không `-k`)
- [ ] Từ console `erp.greensys.vn`: `new EventSource('https://chat.greensys.vn/api/sse')` → không Mixed Content (401/404 từ Node là OK ở Phase 0)

Chi tiết lệnh: `planning/ws-migration-phase0-runbook.md`

## Phase 1 — Files cần tạo/sửa

| File | Thay đổi |
|------|---------|
| `chat-server/token.js` | Mới — `verifyToken(token) → {ausId} \| null` |
| `chat-server/server.js` | Thêm `GET /api/sse` route (giữ long-poll song song) |
| `chat-server/events.js` | Thêm `connections` Map, `registerConnection`, cập nhật `deliverToUser` ghi SSE |
| `chat-server/.env` | Thêm `SSE_SECRET=<bí mật mạnh>` |

**Token format (chốt cứng):**
```
body  = base64url("<aus_id>|<exp_epoch_seconds>")
sig   = base64url(HMAC_SHA256(body, SSE_SECRET))
token = body + "." + sig
```

## Phase 2 — APEX changes

| APEX | Nội dung |
|------|---------|
| Page 0 callback `sseToken` | Mint HMAC token dùng `DBMS_CRYPTO.MAC` + `DBMS_CRYPTO.HMAC_SH256` |
| `global.js` (Theme) | `connectSSE()` → `sseToken` → `new EventSource(...)` với backoff + re-mint khi error |
| Application Item | `SSE_SECRET` — không hardcode trong callback |

**Quan trọng:** Không dùng auto-reconnect của EventSource — token cũ hết hạn (120s) → kẹt 401. Phải `es.close()` → re-mint → `new EventSource(...)`.

## KHÔNG đụng vào

- `cqn.js` — CQN subscription không thay đổi
- `chat-page.fgvd.js`, `doc-chat-page.fgvd.js` — không cần sửa
- Mọi action callback PL/SQL (`chatSend`, `docChatTyping`, v.v.)
- Server A (APEX/ORDS) — chỉ sửa qua APEX Builder bình thường
- Long-poll `GET /api/events/:aus_id` — giữ song song cho tới Phase 3

## nginx config snippet (Phase 0)

> **nginx 1.14.1** trên Server B — dùng cú pháp `listen 443 ssl http2;` (KHÔNG dùng `http2 on;` — chỉ có nginx ≥ 1.25 mới hỗ trợ).

File hiện có: `/etc/nginx/conf.d/chat-sse.conf` (certbot sẽ tự thêm block 443 sau khi chạy). Sau certbot, sửa thủ công:

```bash
sudo sed -i 's/listen 443 ssl;/listen 443 ssl http2;/' /etc/nginx/conf.d/chat-sse.conf
sudo nginx -t && sudo systemctl reload nginx
```

Config mẫu đầy đủ sau certbot:
```nginx
server {
    listen 443 ssl http2;              # ← http2 trên cùng dòng, không phải dòng riêng
    server_name chat.greensys.vn;

    ssl_certificate     /etc/letsencrypt/live/chat.greensys.vn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.greensys.vn/privkey.pem;

    location /api/sse {
        proxy_pass            http://127.0.0.1:3410;
        proxy_http_version    1.1;
        proxy_buffering       off;     # bắt buộc cho SSE — thiếu là không flush
        proxy_cache           off;
        proxy_read_timeout    3600s;
        proxy_set_header      Host $host;
        proxy_set_header      X-Real-IP $remote_addr;
        proxy_set_header      X-Forwarded-Proto $scheme;
        add_header            X-Accel-Buffering no;
    }

    location / {
        proxy_pass http://127.0.0.1:3410;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
server {
    listen 80;
    server_name chat.greensys.vn;
    return 301 https://$host$request_uri;
}
```

## Phát hiện kiến trúc quan trọng (2026-06-06)

**Server A → Server B nội bộ hoạt động:**
- Long-poll callback `appEvents` gọi `http://172.25.10.38:3410/api/events/:aus_id` qua UTL_HTTP — đã xác nhận hoạt động
- Test từ SQL Workshop thất bại ORA-29273 vì Oracle ACL chỉ cấp cho schema APEX, không cho SQL Workshop schema
- Khi test UTL_HTTP phải chạy từ APEX Application Process, không phải anonymous block SQL Workshop

**Port 3410 public — không cần thiết cho long-poll:**
Long-poll đi qua IP nội bộ `172.25.10.38`, không qua public port 3410. Port 3410 public hiện là rủi ro bảo mật (endpoint Node.js không có auth). Nên đóng sau Phase 3 nếu dùng port 443 cho SSE.

**Oracle Wallet trên Server A:**
`CreateWatermarkPdf` dùng wallet tại `file:/u01/app/oracle/wallet` để gọi server khác (`172.25.10.205:3000`), không phải chat-server. Chat callbacks dùng UTL_HTTP HTTP thuần. Wallet không liên quan SSE migration.

**Provider firewall vs OS firewall:**
Server B có 2 lớp firewall độc lập. OS firewall (`firewalld`) đã mở http/https. Provider firewall (quản lý qua web panel nhà cung cấp VPS) vẫn chặn — user không có quyền, cần phòng hệ thống.
