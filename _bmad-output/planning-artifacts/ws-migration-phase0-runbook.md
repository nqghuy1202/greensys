# Phase 0 Runbook — Dựng hạ tầng TLS/SSE (nginx có sẵn — Server B only)

> **Tên file giữ `ws-migration-*` vì lý do lịch sử.** Transport đã chốt là **SSE** (xem `ws-migration-plan.md`).
> **Ràng buộc:** toàn bộ trên Server B. KHÔNG đụng OS/proxy Server A. Sửa APEX qua Builder vẫn được (Phase 2).
> **Hạ tầng đã khảo sát (2026-06-04):** Oracle Linux 8.10 · IP public `103.109.xx.xx` · nginx **đã cài sẵn, rảnh** (có `http_ssl_module` + `http_v2_module`, config chỉ default stock) · certbot **chưa** cài · firewall mở 1521/5432/2410/3410/3141, **chưa** mở 80/443.
> Các lệnh chạy **trên Server B (Oracle Linux 8, 172.25.10.38 / public 103.109.xx.xx)**. Dev box Windows không chạy phần này.

> **Quy ước biến:** đặt 1 lần rồi dùng lại — khi domain được chốt chỉ sửa dòng này:
> ```bash
> SSE_HOST="chat.greensys.vn"     # ⚠ CHỜ XÁC NHẬN — khả năng subdomain do người phụ trách server cấp
> SERVER_B_IP="103.109.xx.xx"     # IP public Server B (curl ifconfig.me)
> ```

---

## Bước 0.1 — Domain + DNS (GATE — chưa làm bước sau khi chưa xong)

Cần 1 A-record `SSE_HOST → SERVER_B_IP`. Đang chờ người phụ trách server (khả năng subdomain `greensys.vn`).

**Yêu cầu gửi người quản DNS:** thêm 1 bản ghi:
- Type `A` · Host `chat` (→ `chat.greensys.vn`) · trỏ về `103.109.xx.xx` · TTL mặc định
- Nếu DNS ở Cloudflare: để **DNS only** (không bật proxy cam) — để certbot lấy cert trực tiếp.
- Không ảnh hưởng bản ghi `erp.greensys.vn`; không cần đụng Server A; cert do Server B tự lo.

Kiểm DNS đã trỏ đúng (chạy tới khi khớp mới đi tiếp):
```bash
dig +short "$SSE_HOST"        # phải ra đúng 103.109.xx.xx
```

---

## Bước 0.2 — Mở firewall 80/443 (firewalld)

Let's Encrypt HTTP-01 cần 80; SSE/TLS chạy trên 443.
```bash
sudo firewall-cmd --add-service=http --add-service=https --permanent
sudo firewall-cmd --reload
sudo firewall-cmd --list-services        # xác nhận có http https
```

---

## Bước 0.3 — Cài certbot (plugin nginx) trên Oracle Linux 8

```bash
sudo dnf install -y epel-release
sudo dnf install -y certbot python3-certbot-nginx
certbot --version
```

> Nếu `epel-release` không có: `sudo dnf config-manager --set-enabled ol8_developer_EPEL` (tên repo có thể khác theo channel OL8).

---

## Bước 0.4 — Thêm server block nginx cho SSE

Tạo file mới (không đụng default stock). nginx hiện include `/etc/nginx/conf.d/*.conf`.

`/etc/nginx/conf.d/chat-sse.conf` (HTTP tạm — certbot sẽ tự thêm phần TLS/redirect):
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name chat.greensys.vn;      # ⚠ đổi theo SSE_HOST đã chốt

    # health đi thẳng Node
    location /health {
        proxy_pass http://127.0.0.1:3410;
    }

    # endpoint SSE — directive đặc thù, BẮT BUỘC đúng
    location /api/sse {
        proxy_pass            http://127.0.0.1:3410;
        proxy_http_version    1.1;
        proxy_set_header      Host $host;
        proxy_set_header      X-Real-IP $remote_addr;
        proxy_set_header      X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header      X-Forwarded-Proto $scheme;

        proxy_buffering       off;     # ⚠ thiếu cái này SSE KHÔNG flush — lỗi phổ biến nhất
        proxy_cache           off;
        chunked_transfer_encoding off;
        proxy_read_timeout    3600s;   # giữ stream lâu
        proxy_send_timeout    3600s;
    }
}
```
Kiểm cú pháp + reload:
```bash
sudo nginx -t && sudo systemctl reload nginx
```

> **Không log token:** sau khi chạy, cân nhắc tắt log query-string cho `/api/sse` (token nằm ở query). Có thể đặt `access_log off;` trong block `location /api/sse` hoặc dùng log_format ẩn query.

---

## Bước 0.5 — Xin cert Let's Encrypt (certbot tự sửa nginx)

```bash
sudo certbot --nginx -d chat.greensys.vn       # ⚠ đổi theo SSE_HOST
```
certbot sẽ: lấy cert qua HTTP-01, **tự thêm `listen 443 ssl`** vào block trên, và thường thêm redirect 80→443. Sau đó **bật HTTP/2 thủ công** (gỡ giới hạn 6 kết nối/domain — quan trọng cho SSE đa tab):
```bash
# Trong block listen 443 ssl mà certbot tạo, thêm 'http2 on;' (cú pháp nginx >=1.25),
# hoặc sửa thành 'listen 443 ssl http2;' (cú pháp cũ). Kiểm phiên bản:
nginx -v
sudo nginx -t && sudo systemctl reload nginx
```
Tự gia hạn cert:
```bash
systemctl status certbot-renew.timer --no-pager 2>/dev/null || systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

---

## Bước 0.6 — Verify acceptance

1) Health qua TLS hợp lệ:
```bash
curl -v "https://$SSE_HOST/health"      # kỳ vọng 200, cert hợp lệ, KHÔNG cần -k
```

2) Tới endpoint SSE (Phase 0: Node chưa có `/api/sse` → 401/404 là CHẤP NHẬN, miễn không lỗi TLS):
```bash
curl -N -v "https://$SSE_HOST/api/sse?token=test"
```

3) Từ browser, Console trên 1 trang `https://erp.greensys.vn:8211/ords/r/...`:
```js
const es = new EventSource('https://chat.greensys.vn/api/sse?token=test'); // đổi theo SSE_HOST
es.onopen  = () => console.log('OPEN', es.readyState);
es.onerror = (e) => console.log('ERR/CLOSE', es.readyState);
```
Kỳ vọng: **KHÔNG** lỗi `Mixed Content`. ERR do Node chưa có `/api/sse` (401) là chấp nhận được ở Phase 0; OPEN sẽ đạt sau Phase 1.

---

## Acceptance Phase 0 (đánh dấu khi xong)
- [x] Đường: **nginx có sẵn + certbot** (Server B only) — đã chốt (bỏ Caddy).
- [ ] Domain `SSE_HOST` chốt + `dig` khớp `103.109.xx.xx`.
- [ ] Firewall mở 80/443.
- [ ] certbot cấp cert; `curl https://<SSE_HOST>/health` → 200 TLS hợp lệ.
- [ ] `http2 on` đã bật trong block 443.
- [ ] `new EventSource('https://<SSE_HOST>/api/sse')` từ trang ORDS không Mixed Content (401/404 do Node chưa có endpoint là OK).
- [ ] Endpoint chốt cho `global.js`: `SSE_URL = https://________________/api/sse`

---

## Kết quả (điền vào đây rồi báo lại)

- IP public Server B (`curl ifconfig.me`): `103.109.xx.xx`
- OS: Oracle Linux 8.10
- nginx có sẵn: có (`http_ssl_module` + `http_v2_module`), config default stock
- certbot: ____ (đã cài Y/N)
- Domain đã chốt (`SSE_HOST`): ____________________
- `dig <SSE_HOST>` khớp IP Server B: ____ (Y/N)
- IP tĩnh hay động: ____________________
- nginx `nginx -t` + reload OK: ____ (Y/N)
- **Endpoint cuối: https://____________________/api/sse**
