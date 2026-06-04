# Kế hoạch chuyển Long-poll → WebSocket (`ws`)

> Trạng thái: **Phase 0 đang chạy** (hạ tầng WSS/TLS trên Server B).
> Ngày tạo: 2026-06-04. Auth đã chốt: token HMAC ký từ APEX. Transport đã chốt: WebSocket thuần (`ws`), không Socket.IO.

## Mục tiêu

Thay kênh nhận real-time hiện tại (browser → `apex.server.process` → APEX PL/SQL → `UTL_HTTP` → Node long-poll 25s) bằng **WebSocket trực tiếp browser → Node**, để:
- Server chỉ "động" khi có tín hiệu (không re-poll mỗi 25s).
- Giải phóng ORDS thread (mỗi user đang giữ 1 thread; WS bỏ qua ORDS).

## Nguyên tắc bất biến

- Transport: WebSocket thuần (`ws`). KHÔNG Socket.IO (đã archive).
- Phạm vi Phase 1: chỉ kênh **NHẬN event** (`notification | message | typing | typing_stop | read`). Action (`send/typing/read/create/heartbeat`) GIỮ NGUYÊN `apex.server.process → UTL_HTTP`.
- Auth: token HMAC ký từ APEX, verify ở Node.
- KHÔNG đụng: `chat-page.js`, `doc-chat-page.js`, logic `cqn.js`, mọi action callback PL/SQL.
- Chạy song song long-poll cũ; chỉ cutover sau khi test. Rollback = bật lại đoạn poll trong `global.js`.

## Khái niệm mấu chốt (tránh hiểu nhầm)

`https://erp.greensys.vn:8211/ords/r/...` (URL trang APEX/ORDS) và WebSocket là **2 kết nối khác nhau tới 2 server khác nhau**. URL trang GIỮ NGUYÊN HTTPS. WSS là kết nối **mới** do JS tự mở tới Node qua endpoint riêng. ORDS KHÔNG proxy WS sang Node — WSS phải đi qua endpoint/proxy do ta cấu hình trỏ thẳng vào Node `172.25.10.38:3410`.

---

## Ràng buộc đã chốt (2026-06-04)

**Tất cả hạ tầng làm trên Server B.** KHÔNG đụng OS/proxy/ORDS của Server A. Sửa ứng dụng APEX qua APEX Builder (global.js, callback `wsToken`) VẪN được — đó là workflow thường ngày, không phải "đụng Server A" ở mức máy chủ. → **Nhánh B bị loại** (cần route ở proxy Server A). **Khoá Nhánh A.**

## PHASE 0 — Hạ tầng WSS/TLS (gating, TOÀN BỘ trên Server B)

### Nhánh A (ĐÃ CHỐT) — Caddy + domain riêng cho Node
- Caddy trước Node (Server B): `chat.greensys.vn { reverse_proxy localhost:3410 }` — tự Let's Encrypt + tự xử lý `Upgrade`.
- Endpoint client: `wss://chat.greensys.vn/ws` (tên domain cụ thể chốt ở 0.1).
- Cần bật **CORS** ở Node cho origin `https://erp.greensys.vn:8211` (cross-origin).
- Yêu cầu: 1 domain/subdomain trỏ A-record về IP public Server B + mở port 80/443. (Port 3410 đã public ⇒ Server B có IP public, mở thêm port được.)

> Code Phase 1–2 KHÔNG phụ thuộc hạ tầng — chỉ cần hằng `WS_URL` ở `global.js`.

### Acceptance Phase 0
- [ ] `curl -v https://<endpoint>/health` → 200 qua TLS hợp lệ.
- [ ] Handshake WS (`websocat`/`wscat`) lên `wss://<endpoint>/<path>` → `101 Switching Protocols`.
- [ ] Từ Console trang `erp.greensys.vn`: `new WebSocket('wss://<endpoint>/...')` → `readyState===1`, không Mixed Content, không CORS.

Chi tiết lệnh + config: `ws-migration-phase0-runbook.md`.

---

## PHASE 1 — Node.js WebSocket server

### 1.1 Dependency & env
- `chat-server/`: `npm i ws`
- `.env` thêm `WS_SECRET=<bí mật mạnh>` (trùng tuyệt đối với secret bên APEX).

### 1.2 `chat-server/token.js` (mới) — verify token
- `verifyToken(token) → { ausId } | null`: tách `body.sig`; `expected = base64url(HMAC_SHA256(body, WS_SECRET))`; so sánh timing-safe (`crypto.timingSafeEqual`); decode `body`; kiểm `exp > now`.

**Định dạng token (chốt cứng):**
```
body  = base64url( "<aus_id>|<exp_epoch_seconds>" )
sig   = base64url( HMAC_SHA256( body , WS_SECRET ) )
token = body + "." + sig
```

### 1.3 `chat-server/server.js`
- `WebSocketServer({ noServer: true })`; `server.on('upgrade')`:
  - Chỉ path `/ws` (hoặc `/chat-ws`), khác → `socket.destroy()`.
  - Kiểm `Origin` == `https://erp.greensys.vn:8211`.
  - Lấy `token` từ query → `verifyToken` → sai thì 401 + destroy; đúng → `handleUpgrade` + `registerConnection(ausId, ws)`.
- Ping/pong 30s: `isAlive===false` → `terminate()`; còn lại set false + `ping()`; `on('pong')` set true.
- Shutdown: đóng tất cả WS (close 1001) trước khi đóng HTTP/pool.
- Giữ `/api/events/:aus_id` long-poll song song tới Phase 3.

### 1.4 `chat-server/events.js`
- Registry `connections: Map<aus_id, ws>` (Phase 1: 1 conn/user; conn mới đẩy conn cũ ra với close 4000 "replaced").
- `registerConnection`: đóng conn cũ; lưu mới; **flush buffer** nếu có; `on('close')` xoá nếu còn trỏ đúng ws.
- `deliverToUser`: conn OPEN → `ws.send(JSON.stringify(payload))`; không có → giữ buffer at-least-once cũ (`BUFFERABLE`: message/read/notification).
- `notifyUser`, `bufferEvent`, `pruneBuffer`, `BUFFER_*` giữ ý tưởng. `cqn.js` không đổi.

### 1.5 Test
- Mint token thủ công (script Node, cùng `WS_SECRET`); `websocat "wss://<endpoint>/ws?token=..."`; trigger `GET /api/notify/:aus_id` → thấy push. Test token sai/hết hạn/origin lạ/rớt mạng.

### Acceptance Phase 1
- [ ] Verify token đúng/sai/hết hạn chuẩn.
- [ ] Event tới đúng user; offline → buffer rồi flush khi reconnect.
- [ ] Ping/pong dọn conn chết; SIGTERM đóng sạch.
- [ ] Long-poll cũ vẫn chạy song song.

---

## PHASE 2 — APEX token-mint + WS client

### 2.1 DBA (1 lần)
- `GRANT EXECUTE ON DBMS_CRYPTO TO DEV24;`

### 2.2 Page 0 Ajax Callback `wsToken`
- `:G_AUS_ID` (tin cậy ở Page 0); `exp := now_epoch + 120`.
- `body := base64url(:G_AUS_ID || '|' || exp)`.
- `sig := base64url( DBMS_CRYPTO.MAC( UTL_RAW.CAST_TO_RAW(body), DBMS_CRYPTO.HMAC_SH256, UTL_RAW.CAST_TO_RAW(:WS_SECRET) ) )`.
- `base64url`: `UTL_ENCODE.BASE64_ENCODE` → `REPLACE +→-`, `/→_`, bỏ `=` và newline (khớp `Buffer.toString('base64url')`).
- Secret APEX ở 1 Application Item/substitution `WS_SECRET`, không hardcode rải rác.

### 2.3 `global.js` — WS client (chưa xoá poll cũ)
- Iframe guard giữ nguyên: `if (window.parent !== window) return;`.
- `connectWS()`: `wsToken` → `new WebSocket('wss://<endpoint>/ws?token=...')`.
  - `onmessage`: `notification` → refresh chuông; `message|typing|typing_stop|read` → `$(document).trigger('apex:chatEvent', [data])`.
  - `onclose/onerror`: reconnect backoff (5s→×2→60s), mỗi lần re-mint token.
  - Client ping nhẹ định kỳ (chống proxy idle-timeout).
- `chatHeartbeat` giữ nguyên. Feature flag `USE_WS` để bật WS / fallback poll.

### 2.4 Test E2E
- DevTools thấy WS `101` pending. Gửi tin B→A nhận tức thì. Notification refresh chuông. Doc Chat iframe vẫn nhận (ăn ké parent). Đa tab → `replaced`. Rớt mạng → reconnect + re-mint.

### Acceptance Phase 2
- [ ] WS mở từ ORDS thật, không Mixed Content/CORS.
- [ ] 4 loại event đúng nơi; Doc Chat iframe chạy.
- [ ] Reconnect + re-mint khi mạng chập chờn.
- [ ] `USE_WS=false` quay lại long-poll ngay.

---

## PHASE 3 — Cutover & dọn dẹp

1. `USE_WS=true` toàn bộ; xoá đoạn poll `appEvents` trong `global.js`.
2. Theo dõi 1–2 ngày: reconnect, conn chết, đa tab, RAM Node, log handshake.
3. Khi ổn: xoá callback `appEvents` (Page 0); xoá `GET /api/events/:aus_id` + buffer-cho-gap; hạ `jdbc.MaxLimit` về mặc định.
4. Cập nhật docs `00/01/02/03/07` (thêm pitfalls WS: thiếu `Upgrade` ở proxy, token query, reconnect backoff, ping/pong).

---

## Bảng file/đối tượng bị tác động

| Nơi | Hành động | Phase |
|---|---|---|
| Reverse proxy (A: Caddy / B: route `/chat-ws`) | tạo | 0 |
| `chat-server/.env` | +`WS_SECRET` | 1 |
| `chat-server/token.js` | tạo mới | 1 |
| `chat-server/server.js` | +WS upgrade, ping/pong, shutdown | 1 |
| `chat-server/events.js` | registry `connections`, `ws.send` | 1 |
| `cqn.js`, `chat.js`, action callbacks | không đổi | — |
| APEX Page 0 callback `wsToken` | tạo mới (DBMS_CRYPTO) | 2 |
| Theme `global.js` | WS client + reconnect + re-mint + flag | 2 |
| `chat-page.js`, `doc-chat-page.js` | không đổi | — |
| `appEvents` + `/api/events/:aus_id` | xoá | 3 |
| `docs/claude/*` | cập nhật | 3 |

## Rollback
- Phase 2: `USE_WS=false` → poll cũ ngay.
- Phase 3 (sau xoá): revert commit `global.js` + khôi phục `appEvents`.

## Điểm còn mở
1. Nhánh A hay B — chờ xác nhận hạ tầng trước cổng 8211. **(đang xử lý ở Phase 0)**
2. TTL token 120s — chốt tạm 120s.
3. Đa tab: Phase 1 giữ 1 conn/user (parity); fan-out mọi tab để milestone sau.
