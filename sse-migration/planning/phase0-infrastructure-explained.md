# Phase 0 — Giải thích hạ tầng cần cài đặt

> Tài liệu này giải thích **những thứ sẽ cài trong Phase 0**, chúng là gì và làm gì.
> Lệnh thực thi chi tiết xem ở `ws-migration-phase0-runbook.md`.

---

## Bối cảnh — Tại sao Phase 0 cần thiết

`erp.greensys.vn:8211` (trang APEX) chạy **HTTPS**. Nếu JavaScript trên trang đó mở:

```js
new EventSource('http://chat.greensys.vn:3410/api/sse')
```

Browser sẽ **chặn ngay** với lỗi **Mixed Content** — trang HTTPS không được phép kết nối tới tài nguyên HTTP. Đây là chính sách bảo mật bắt buộc của mọi browser hiện đại.

→ Phải có `https://chat.greensys.vn/api/sse` (HTTPS, port 443) thì SSE mới hoạt động.

---

## Những thứ sẽ cài

### 1. nginx (đã có sẵn trên Server B — chỉ cần cấu hình)

**nginx là gì?**
Một web server kiêm **reverse proxy**. "Reverse proxy" nghĩa là nó đứng giữa internet và ứng dụng Node.js: nhận request từ bên ngoài, xử lý TLS, rồi chuyển vào Node.js bên trong.

**Luồng dữ liệu sau khi cấu hình:**

```
Browser (HTTPS :443)
    │
    ▼
nginx — nhận kết nối, xác thực TLS, giải mã
    │
    ▼  proxy_buffering off  (bắt buộc cho SSE)
Node.js localhost:3410 (HTTP thuần, chỉ nội bộ)
```

**nginx làm gì cụ thể:**
- Nhận kết nối HTTPS từ browser trên port 443
- Xác thực chứng chỉ TLS (dùng cert từ certbot)
- Chuyển tiếp request vào Node.js tại `localhost:3410`
- Với SSE: cấu hình `proxy_buffering off` để dữ liệu được đẩy tức thì xuống browser, không bị giữ lại chờ gộp batch

**Việc cần làm:** Thêm 1 file config mới `/etc/nginx/conf.d/chat-sse.conf`. Không đụng config mặc định.

---

### 2. certbot (chưa có — cần cài)

**certbot là gì?**
Công cụ dòng lệnh do EFF (Electronic Frontier Foundation) tạo ra. Nhiệm vụ duy nhất: **tự động xin, cài, và gia hạn chứng chỉ TLS từ Let's Encrypt**.

**Chứng chỉ TLS là gì?**
Một file chứa khóa mã hóa và danh tính của server, được ký bởi một tổ chức uy tín (Certificate Authority). Browser kiểm tra chữ ký này để xác nhận "đây đúng là server của chat.greensys.vn". Không có cert hợp lệ → browser hiện cảnh báo đỏ và chặn kết nối.

**Cách certbot hoạt động (HTTP-01 challenge):**

```
certbot chạy trên Server B
  │
  ├─ 1. Tạo file thử thách ngẫu nhiên:
  │      http://chat.greensys.vn/.well-known/acme-challenge/abc123xyz
  │
  ├─ 2. Gửi yêu cầu lên Let's Encrypt:
  │      "Tôi là chủ chat.greensys.vn — hãy gọi vào để xác nhận"
  │
  ├─ 3. Let's Encrypt gọi vào port 80 để lấy file thử thách
  │      → Server B trả đúng → Let's Encrypt tin → phát cert
  │
  └─ 4. certbot lưu cert tại:
         /etc/letsencrypt/live/chat.greensys.vn/fullchain.pem  ← cert công khai
         /etc/letsencrypt/live/chat.greensys.vn/privkey.pem    ← khóa riêng
         certbot tự cập nhật nginx config để trỏ vào 2 file này
```

**Vì sao phải mở port 80 trước?**
Bước 3 — Let's Encrypt gọi vào qua HTTP (port 80). Nếu firewall chặn port 80, certbot thất bại và không lấy được cert.

**Cert có thời hạn 90 ngày.** certbot cài một systemd timer tự gia hạn định kỳ — không cần làm tay.

**Cài bằng:**
```bash
sudo dnf install -y epel-release
sudo dnf install -y certbot python3-certbot-nginx
```

---

### 3. Let's Encrypt (dịch vụ online — không cài, chỉ dùng)

**Let's Encrypt là gì?**
Một Certificate Authority (CA) phi lợi nhuận, cấp cert TLS **miễn phí** và tự động. Trước đây cert TLS tốn $100–300/năm và phải làm thủ công. Let's Encrypt ra đời 2016, hiện bảo vệ hơn 300 triệu website.

Mọi browser hiện đại (Chrome, Firefox, Safari, Edge) đều tin tưởng Let's Encrypt trong danh sách CA mặc định — cert của họ hợp lệ hoàn toàn, không kém gì cert trả tiền.

**Không cài gì thêm** — certbot tự liên lạc với Let's Encrypt.

---

### 4. HTTP/2 (bật trong nginx — không cài thêm)

**HTTP/2 là gì?**
Phiên bản nâng cấp của giao thức HTTP, ra đời 2015. Nginx trên Server B đã có sẵn module `http_v2_module` — chỉ cần bật bằng cấu hình.

**Tại sao HTTP/2 quan trọng cho SSE?**

| | HTTP/1.1 | HTTP/2 |
|--|----------|--------|
| Kết nối song song / domain | **tối đa 6** | **Không giới hạn** (multiplexing) |
| Cơ chế | Mỗi request 1 TCP connection | Nhiều stream trên 1 TCP connection |

Mỗi tab browser mở một kết nối SSE. Nếu user mở 7 tab trang APEX cùng lúc, tab thứ 7 bị treo vì đã chạm giới hạn 6 kết nối/domain của HTTP/1.1. HTTP/2 dùng một TCP connection duy nhất với nhiều stream → không còn giới hạn này.

**Bật bằng cách thêm vào nginx config:**
```nginx
http2 on;    # nginx >= 1.25
# hoặc:
listen 443 ssl http2;    # nginx < 1.25
```

---

## Toàn cảnh sau khi Phase 0 hoàn thành

```
                    Internet
                       │
              ┌────────▼────────┐
              │  chat.greensys  │  port 443 (HTTPS)
              │     .vn         │  TLS cert từ Let's Encrypt
              │    nginx        │  HTTP/2 on
              └────────┬────────┘
                       │  proxy_buffering off
                       │  http://localhost:3410
              ┌────────▼────────┐
              │   Node.js       │  port 3410
              │   server.js     │  (Phase 1 sẽ thêm /api/sse)
              └─────────────────┘
```

---

## Điều thay đổi vs. không thay đổi

**Thay đổi:**
- Browser có thể mở `new EventSource('https://chat.greensys.vn/api/sse')` — HTTPS, không Mixed Content
- TLS do nginx xử lý — Node.js không cần biết gì về SSL
- Port 80 và 443 được mở trên firewall

**Không thay đổi:**
- Node.js code — không sửa gì (Phase 0 thuần hạ tầng)
- APEX / ORDS — không đụng gì
- Long-poll `appEvents` — vẫn chạy bình thường
- Port 3410 vẫn mở như cũ

---

## Tóm tắt

| Thứ | Có sẵn? | Việc làm |
|-----|---------|---------|
| nginx | ✅ Đã có | Thêm file `/etc/nginx/conf.d/chat-sse.conf` |
| Firewall port 80/443 | ❌ Chưa mở | `firewall-cmd --add-service=http --add-service=https` |
| certbot | ❌ Chưa có | `dnf install certbot python3-certbot-nginx` |
| TLS cert (Let's Encrypt) | ❌ Chưa có | `certbot --nginx -d chat.greensys.vn` (tự động) |
| HTTP/2 | ❌ Chưa bật | Thêm `http2 on;` vào nginx config |

---

## Điều kiện tiên quyết để Phase 0 thành công

1. **DNS đã trỏ đúng** — `dig chat.greensys.vn` ra IP public của Server B ✅ (đã xong)
2. **IP Server B là tĩnh** — A-record trỏ cứng vào IP này. Nếu IP động thì cert sẽ hỏng khi IP đổi.
3. **Port 80 mở được từ internet** — Let's Encrypt cần gọi vào để xác thực domain.
