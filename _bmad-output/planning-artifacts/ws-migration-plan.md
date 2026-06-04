# Kế hoạch chuyển Long-poll → SSE (Server-Sent Events)

> **Tên file giữ `ws-migration-*` vì lý do lịch sử.** Transport đã đổi từ WebSocket sang **SSE** (2026-06-04).
> Trạng thái: **Phase 0 đang chạy** (hạ tầng TLS trên Server B).
> Auth đã chốt: token HMAC ký từ APEX. Transport đã chốt: **SSE qua `EventSource`** (không WebSocket, không Socket.IO).

## Vì sao SSE (không WebSocket)

Quyết định chốt 2026-06-04 sau khi làm rõ nhu cầu:
- Consumer real-time = **trình duyệt APEX client (JS)**, không phải PL/SQL Server A.
- Kênh real-time **chỉ cần 1 chiều** (Node → browser). Action (`send/typing/read/create/heartbeat`) **giữ nguyên** `apex.server.process → UTL_HTTP`.
- WebSocket chỉ thắng khi cần đẩy dữ liệu *từ browser lên qua chính kênh đó* — nhu cầu này **không có**.

→ SSE hợp đúng mô hình "chỉ nhận", đơn giản hơn WS: không thư viện `ws`, không tự quản ping/pong protocol, proxy nginx đơn giản, `Last-Event-ID` hỗ trợ replay sự kiện sẵn.

## Mục tiêu

Thay kênh nhận real-time hiện tại (browser → `apex.server.process` → APEX PL/SQL → `UTL_HTTP` → Node long-poll 25s) bằng **SSE trực tiếp browser → Node**, để:
- Server chỉ "động" khi có tín hiệu (không re-poll mỗi 25s).
- Giải phóng ORDS thread (mỗi user đang giữ 1 thread; SSE bỏ qua ORDS). Mục tiêu quy mô: **>100 user online đồng thời**.

## Nguyên tắc bất biến

- Transport: **SSE thuần** (`EventSource` phía browser, `res.write` phía Node). KHÔNG WebSocket, KHÔNG Socket.IO.
- Phạm vi Phase 1: chỉ kênh **NHẬN event** (`notification | message | typing | typing_stop | read`). Action GIỮ NGUYÊN `apex.server.process → UTL_HTTP`.
- Auth: token HMAC ký từ APEX, verify ở Node, truyền qua **query string** (EventSource không set được custom header).
- KHÔNG đụng: `chat-page.js`, `doc-chat-page.js`, logic `cqn.js`, mọi action callback PL/SQL.
- Chạy song song long-poll cũ; chỉ cutover sau khi test. Rollback = bật lại đoạn poll trong `global.js`.

## Khái niệm mấu chốt (tránh hiểu nhầm)

`https://erp.greensys.vn:8211/ords/r/...` (URL trang APEX/ORDS) và SSE là **2 kết nối khác nhau tới 2 server khác nhau**. URL trang GIỮ NGUYÊN HTTPS qua Server A. SSE là kết nối **mới** do JS tự mở (`new EventSource(...)`) tới Node qua endpoint riêng trên Server B. ORDS KHÔNG proxy SSE — SSE đi qua **nginx (đã có sẵn trên Server B)** với TLS riêng, trỏ thẳng `localhost:3410`.

---

## Ràng buộc đã chốt (2026-06-04)

**Tất cả hạ tầng làm trên Server B.** KHÔNG đụng OS/proxy/ORDS của Server A. Sửa ứng dụng APEX qua APEX Builder (global.js, callback `sseToken`) VẪN được — workflow thường ngày.

**Hạ tầng Server B (đã khảo sát):**
- OS: **Oracle Linux 8.10** (`el8`) → `dnf` + `firewalld`.
- IP public: `103.109.xx.xx` (port 3410 đã public; 80/443 **chưa** mở inbound).
- **nginx đã cài sẵn** (do dự án cài trước cho WebSocket, hiện rảnh) — có `http_ssl_module` + `http_v2_module`. Config hiện chỉ là default stock (`listen 80 default_server`), **không có server block thật** → thêm 1 file `/etc/nginx/conf.d/` là sạch.
- `certbot` **chưa** cài.

→ **Bỏ Caddy** (kế hoạch cũ). Dùng **nginx có sẵn + certbot** làm reverse proxy TLS. Không cài thêm web server (tránh tranh cổng 80/443).

## PHASE 0 — Hạ tầng TLS/SSE (gating, TOÀN BỘ trên Server B)

### Đường đã chốt — nginx (có sẵn) + Let's Encrypt cho domain riêng của Node

```
Browser (trang erp.greensys.vn:8211)
   │  new EventSource('https://<SSE_HOST>/api/sse?token=...')   ← kết nối MỚI, độc lập ORDS
   ▼
nginx (Server B :443, TLS Let's Encrypt) ── proxy_buffering off ──► Node localhost:3410
```

- `SSE_HOST` = **chờ xác nhận**, mặc định `chat.greensys.vn` (khả năng cao là subdomain do người phụ trách server cấp). A-record trỏ về `103.109.xx.xx`.
- Endpoint client: `https://<SSE_HOST>/api/sse`.
- Node bật **CORS** cho origin `https://erp.greensys.vn:8211` (cross-origin) + verify `Origin` lúc kết nối.
- nginx **bắt buộc**: `http2 on` (gỡ giới hạn 6 kết nối/domain của HTTP/1.1), `proxy_buffering off` (thiếu cái này SSE không flush), `proxy_read_timeout` dài, header `X-Accel-Buffering: no`.

> Code Phase 1–2 KHÔNG phụ thuộc hạ tầng — chỉ cần hằng `SSE_URL` ở `global.js`.

### Acceptance Phase 0
- [ ] Nhánh: **nginx có sẵn + certbot** (Server B only) — đã chốt.
- [ ] `dig <SSE_HOST>` ra đúng `103.109.xx.xx`.
- [ ] `curl -v https://<SSE_HOST>/health` → 200 qua TLS hợp lệ (không `-k`).
- [ ] Từ Console trang `erp.greensys.vn`: `new EventSource('https://<SSE_HOST>/api/sse')` → không Mixed Content, không CORS (sau Phase 1 sẽ thấy stream mở; Phase 0 chấp nhận 401/404 từ Node miễn không lỗi TLS).

Chi tiết lệnh + config: `ws-migration-phase0-runbook.md`.

---

## PHASE 1 — Node.js SSE endpoint

### 1.1 Dependency & env
- `chat-server/`: **không cần thêm thư viện** (SSE dùng `res.write` native). Cài CORS nếu muốn: `npm i cors` (hoặc tự set header).
- `.env` thêm `SSE_SECRET=<bí mật mạnh>` (trùng tuyệt đối với secret bên APEX).

### 1.2 `chat-server/token.js` (mới) — verify token
- `verifyToken(token) → { ausId } | null`: tách `body.sig`; `expected = base64url(HMAC_SHA256(body, SSE_SECRET))`; so sánh timing-safe (`crypto.timingSafeEqual`); decode `body`; kiểm `exp > now`.

**Định dạng token (chốt cứng — giống bản WS):**
```
body  = base64url( "<aus_id>|<exp_epoch_seconds>" )
sig   = base64url( HMAC_SHA256( body , SSE_SECRET ) )
token = body + "." + sig
```

### 1.3 `chat-server/server.js`
- Route `GET /api/sse`:
  - Kiểm `Origin` == `https://erp.greensys.vn:8211` → sai thì 403.
  - Lấy `token` từ query → `verifyToken` → sai/hết hạn thì `401` + end.
  - Set header SSE: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`. CORS: `Access-Control-Allow-Origin: https://erp.greensys.vn:8211`.
  - `registerConnection(ausId, res)`; đọc `lastEventId` từ query (hoặc header `Last-Event-ID`) → flush sự kiện đã buffer kể từ ID đó.
  - `req.on('close')` → gỡ khỏi registry.
- Heartbeat: `setInterval` ghi `: ping\n\n` mỗi 25s cho mọi conn (chống proxy idle-timeout). Conn ghi lỗi → gỡ.
- Shutdown: ghi event `close`/end mọi conn trước khi đóng HTTP/pool.
- Giữ `/api/events/:aus_id` long-poll song song tới Phase 3.

### 1.4 `chat-server/events.js`
- Registry `connections: Map<aus_id, res>` (Phase 1: 1 conn/user; conn mới đẩy conn cũ ra — ghi event `replaced` rồi end).
- `registerConnection`: end conn cũ; lưu mới; **flush buffer** theo `lastEventId`; gỡ trên `close` nếu còn trỏ đúng res.
- `deliverToUser`: conn mở → `res.write('id: ' + seq + '\ndata: ' + JSON.stringify(payload) + '\n\n')`; không có → giữ buffer at-least-once (`BUFFERABLE`: message/read/notification). Mỗi sự kiện gắn `seq` tăng dần để `Last-Event-ID` replay đúng.
- `notifyUser`, `bufferEvent`, `pruneBuffer`, `BUFFER_*` giữ ý tưởng. `cqn.js` không đổi.

### 1.5 Test
- Mint token thủ công (script Node, cùng `SSE_SECRET`); `curl -N "https://<SSE_HOST>/api/sse?token=..."` (thấy stream `data: ...`); trigger `GET /api/notify/:aus_id` → thấy push. Test token sai/hết hạn/origin lạ/rớt mạng.

### Acceptance Phase 1
- [ ] Verify token đúng/sai/hết hạn chuẩn.
- [ ] Event tới đúng user; offline → buffer rồi flush theo `lastEventId` khi reconnect.
- [ ] Heartbeat giữ conn sống; conn chết được dọn; SIGTERM đóng sạch.
- [ ] Long-poll cũ vẫn chạy song song.

---

## PHASE 2 — APEX token-mint + SSE client

### 2.1 DBA (1 lần)
- `GRANT EXECUTE ON DBMS_CRYPTO TO DEV24;`

### 2.2 Page 0 Ajax Callback `sseToken`
- `:G_AUS_ID` (tin cậy ở Page 0); `exp := now_epoch + 120`.
- `body := base64url(:G_AUS_ID || '|' || exp)`.
- `sig := base64url( DBMS_CRYPTO.MAC( UTL_RAW.CAST_TO_RAW(body), DBMS_CRYPTO.HMAC_SH256, UTL_RAW.CAST_TO_RAW(:SSE_SECRET) ) )`.
- `base64url`: `UTL_ENCODE.BASE64_ENCODE` → `REPLACE +→-`, `/→_`, bỏ `=` và newline (khớp `Buffer.toString('base64url')`).
- Secret APEX ở 1 Application Item/substitution `SSE_SECRET`, không hardcode rải rác.

### 2.3 `global.js` — SSE client (chưa xoá poll cũ)
- Iframe guard giữ nguyên: `if (window.parent !== window) return;`.
- `connectSSE()`: gọi `sseToken` → `new EventSource('https://<SSE_HOST>/api/sse?token=...&lastEventId=' + _lastId)`.
  - `onmessage`: parse JSON; lưu `_lastId = ev.lastEventId`; `notification` → refresh chuông; `message|typing|typing_stop|read` → `$(document).trigger('apex:chatEvent', [data])`.
  - **`onerror`**: `es.close()` → **re-mint token** → `connectSSE()` lại với backoff (5s→×2→60s). **KHÔNG** dựa vào auto-reconnect của EventSource (token cũ hết hạn → kẹt 401).
  - Theo dõi `_lastId` để truyền lại khi reconnect (replay).
- `chatHeartbeat` giữ nguyên. Feature flag `USE_SSE` để bật SSE / fallback poll.

### 2.4 Test E2E
- DevTools thấy request `/api/sse` ở trạng thái pending (EventStream). Gửi tin B→A nhận tức thì. Notification refresh chuông. Doc Chat iframe vẫn nhận (ăn ké parent). Đa tab → conn mới đẩy cũ (`replaced`). Rớt mạng → reconnect + re-mint + replay theo `lastEventId`.

### Acceptance Phase 2
- [ ] SSE mở từ trang ORDS thật, không Mixed Content/CORS.
- [ ] 4 loại event đúng nơi; Doc Chat iframe chạy.
- [ ] Reconnect + re-mint + replay khi mạng chập chờn.
- [ ] `USE_SSE=false` quay lại long-poll ngay.

---

## PHASE 3 — Cutover & dọn dẹp

1. `USE_SSE=true` toàn bộ; xoá đoạn poll `appEvents` trong `global.js`.
2. Theo dõi 1–2 ngày: reconnect, conn chết, đa tab, RAM Node, log nginx.
3. Khi ổn: xoá callback `appEvents` (Page 0); xoá `GET /api/events/:aus_id` + buffer-cho-gap; hạ `jdbc.MaxLimit` về mặc định.
4. Cập nhật docs `00/01/02/03/07` (thêm pitfalls SSE: thiếu `proxy_buffering off`, thiếu `http2 on`, token query hết hạn khi auto-reconnect, heartbeat chống idle).

---

## Bảng file/đối tượng bị tác động

| Nơi | Hành động | Phase |
|---|---|---|
| nginx (Server B, có sẵn) + certbot | thêm server block `<SSE_HOST>` + cert | 0 |
| firewall (Server B) | mở 80/443 inbound | 0 |
| `chat-server/.env` | +`SSE_SECRET` | 1 |
| `chat-server/token.js` | tạo mới | 1 |
| `chat-server/server.js` | +route `/api/sse`, heartbeat, CORS, shutdown | 1 |
| `chat-server/events.js` | registry `connections` (res), `res.write`, seq/Last-Event-ID | 1 |
| `cqn.js`, `chat.js`, action callbacks | không đổi | — |
| APEX Page 0 callback `sseToken` | tạo mới (DBMS_CRYPTO) | 2 |
| Theme `global.js` | SSE client + reconnect + re-mint + flag | 2 |
| `chat-page.js`, `doc-chat-page.js` | không đổi | — |
| `appEvents` + `/api/events/:aus_id` | xoá | 3 |
| `docs/claude/*` | cập nhật | 3 |

## Rollback
- Phase 2: `USE_SSE=false` → poll cũ ngay.
- Phase 3 (sau xoá): revert commit `global.js` + khôi phục `appEvents`.

## Điểm còn mở
1. **Domain `SSE_HOST`** — chờ người phụ trách server cấp (khả năng subdomain `chat.greensys.vn`). **Gate duy nhất còn lại của Phase 0.**
2. IP `103.109.xx.xx` tĩnh hay động — cần xác nhận (A-record trỏ cứng vào IP này).
3. TTL token 120s — chốt tạm 120s.
4. Đa tab: Phase 1 giữ 1 conn/user (parity); fan-out mọi tab để milestone sau.
