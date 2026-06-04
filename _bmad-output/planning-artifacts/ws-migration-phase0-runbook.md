# Phase 0 Runbook — Dựng hạ tầng WSS/TLS (Nhánh A — Server B only)

> **Ràng buộc đã chốt:** toàn bộ trên Server B. KHÔNG đụng OS/proxy Server A → **Nhánh A** (Caddy + domain riêng cho Node). Sửa APEX qua Builder vẫn được (Phase 2).
> Các lệnh dưới chạy **trên Server B (Linux, 172.25.10.38)**. Dev box Windows không chạy được phần này.

---

## Bước 0.1 — Chuẩn bị domain + DNS cho Node (Server B)

Cần 1 domain/subdomain trỏ về IP public Server B. Port 3410 đã public ⇒ Server B có IP public, mở thêm 80/443 được.

Lấy IP public Server B:
```bash
curl -s ifconfig.me ; echo
```

Chọn 1 trong các cách có domain (theo tư vấn ở phần dưới hội thoại):
- **Subdomain của greensys.vn** (nếu kiểm soát được DNS greensys.vn — đây là thay đổi ở nhà cung cấp DNS, KHÔNG phải Server A): thêm A-record `chat.greensys.vn → <IP public Server B>`.
- **Domain rẻ mới** (Cloudflare Registrar/Namecheap ~vài $/năm): A-record về IP Server B.
- **DuckDNS (miễn phí)**: tạo `xxx.duckdns.org → IP Server B` (chỉ nên dùng nội bộ/thử nghiệm).

Kiểm DNS đã trỏ đúng:
```bash
dig +short <domain-da-chon>      # phải ra IP public Server B
```
Mở firewall 80/443 (Let's Encrypt HTTP-01 cần 80):
```bash
sudo ufw allow 80,443/tcp 2>/dev/null || sudo firewall-cmd --add-service=http --add-service=https --permanent && sudo firewall-cmd --reload
```

→ Ghi domain đã chốt vào mục "Kết quả" cuối file.

---

## Bước 0.2 — Kiểm tra reachability Node hiện tại

Trên Server B (local):
```bash
curl -s http://localhost:3410/health
```
Từ ngoài internet (máy bất kỳ) — port 3410 "public" đang là HTTP hay HTTPS:
```bash
curl -v http://<public-host>:3410/health     # HTTP thô?
curl -v https://<public-host>:3410/health    # đã có TLS chưa?
```
Ghi lại: public host là **domain** hay **IP trần**? (TLS Let's Encrypt cần domain; IP trần chỉ Cloudflare cấp được.)

---

## Bước 0.3 — Dựng Nhánh A (Caddy trước Node, domain riêng) — ĐÃ CHỐT

Yêu cầu: có domain (vd `chat.greensys.vn`) trỏ A-record về IP public của Server B; mở 80+443 vào Server B.

Cài Caddy (Debian/Ubuntu):
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:
```
chat.greensys.vn {
    reverse_proxy localhost:3410
    # Caddy tự xin Let's Encrypt và tự xử lý header Upgrade của WebSocket.
}
```
```bash
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```
Endpoint client (ghi vào global.js sau): `wss://chat.greensys.vn/ws`
→ Node phải bật **CORS** cho origin `https://erp.greensys.vn:8211` + verify `Origin` lúc handshake (làm ở Phase 1). Path WS chốt = `/ws`.

---

## Bước 0.4 — Verify acceptance (sau khi dựng A hoặc B)

Cài công cụ test WS:
```bash
# websocat (khuyến nghị, 1 binary)
curl -L https://github.com/vi/websocat/releases/latest/download/websocat.x86_64-unknown-linux-musl -o /usr/local/bin/websocat && chmod +x /usr/local/bin/websocat
# hoặc: npm i -g wscat
```

1) Health qua TLS:
```bash
curl -v https://<endpoint-host>/health          # nhánh A: chat.greensys.vn ; nhánh B: erp.greensys.vn
```
Kỳ vọng: `HTTP/2 200` hoặc `HTTP/1.1 200`, cert hợp lệ (không `-k`).

2) Handshake WS (lúc này Node CHƯA có endpoint /ws → chỉ kiểm tới tầng proxy; bước này lặp lại sau Phase 1):
```bash
websocat -v "wss://<endpoint-host>/<path>"      # A: chat.greensys.vn/ws ; B: erp.greensys.vn/chat-ws
```
Kỳ vọng (sau Phase 1): thấy `101 Switching Protocols`. Hiện tại (trước Phase 1) chấp nhận 404/426 từ Node miễn là KHÔNG phải lỗi TLS/Mixed Content ở tầng proxy.

3) Từ browser, mở DevTools Console trên 1 trang `https://erp.greensys.vn:8211/ords/r/...`:
```js
const ws = new WebSocket('wss://<endpoint-host>/<path>');
ws.onopen  = () => console.log('OPEN', ws.readyState);
ws.onerror = (e) => console.log('ERR', e);
ws.onclose = (e) => console.log('CLOSE', e.code, e.reason);
```
Kỳ vọng: KHÔNG có lỗi `Mixed Content`. Nhánh A: không lỗi CORS (sau khi Node bật CORS Phase 1). `OPEN`/`CLOSE` đều được, miễn không bị browser chặn vì scheme/TLS.

---

## Acceptance Phase 0 (đánh dấu khi xong)
- [x] Nhánh: **A** (Caddy + domain riêng, Server B only) — đã chốt.
- [ ] Domain trỏ đúng IP public Server B (`dig` khớp).
- [ ] Caddy chạy, `curl https://<domain>/health` → 200, TLS Let's Encrypt hợp lệ.
- [ ] `new WebSocket('wss://<domain>/ws')` từ trang ORDS không bị Mixed Content (CLOSE do Node chưa có /ws là chấp nhận được ở Phase 0; OPEN sẽ đạt sau Phase 1).
- [ ] Endpoint chốt cho `global.js`: `WS_URL = wss://________________/ws`

---

## Kết quả (điền vào đây rồi báo lại)

- IP public Server B (`curl ifconfig.me`): ____________________
- Domain đã chốt: ____________________
- `dig <domain>` khớp IP Server B: ____ (Y/N)
- Caddy status: ____________________
- **Endpoint cuối: wss://____________________/ws**
