# Báo cáo: Hệ thống chuông thông báo real-time

## 1. Tổng quan hệ thống

Hệ thống chuông thông báo có nhiệm vụ đẩy thông báo tức thì từ Oracle Database đến trình duyệt của người dùng khi có dữ liệu mới trong bảng `USER_NOTIFICATIONS`.

### Các thành phần

| Thành phần | Vị trí | Vai trò |
|---|---|---|
| Oracle DB + APEX 24.2 | Server A — `192.168.1.10` | Nguồn dữ liệu, APEX callback |
| Node.js 22 | Server B — `172.25.10.38` | Middleware nhận CQN, giữ long-poll |
| Nginx | Server B — port 443 | SSL proxy (hiện không dùng cho thông báo) |
| Public Server | `103.109.xx.x` (erp.greensys.vn) | Điểm tiếp nhận từ internet |
| Trình duyệt | Máy người dùng | Hiển thị chuông thông báo |

---

## 2. Cách hệ thống hoạt động (giải pháp hiện tại: Long-poll)

### 2.1 Luồng kỹ thuật

```
Oracle DB
  │  INSERT vào USER_NOTIFICATIONS
  │
  ▼
CQN (Continuous Query Notification)
  │  Callback TCP → 172.25.10.38:3141
  │
  ▼
Node.js — cqn.js
  │  Tra rowidCache → lấy aus_id
  │  Gọi notifyWaiters(aus_id)
  │
  ▼
Node.js — server.js (/api/wait/:aus_id)
  │  Giải phóng request đang chờ
  │  Trả về: {"status": "new_notification"}
  │
  ▼
APEX PL/SQL Callback (notificationWait)
  │  UTL_HTTP nhận response từ Node.js
  │  Trả về JSON cho trình duyệt
  │
  ▼
Trình duyệt — global.js
  │  apex.region('notification-menu').refresh()
  └  poll() lại ngay lập tức
```

### 2.2 Cơ chế Long-poll

Long-poll là kỹ thuật trình duyệt gửi request và **server giữ lại** (không trả lời ngay) cho đến khi có sự kiện hoặc hết timeout.

```
Trình duyệt                 APEX Callback              Node.js
    │                            │                         │
    │── apex.server.process ────▶│                         │
    │                            │── UTL_HTTP GET ────────▶│
    │                            │                         │ (giữ 25s)
    │                            │                         │
    │                            │          ← CQN event    │
    │                            │◀── {"new_notification"} │
    │◀── refresh chuông ─────────│                         │
    │                            │                         │
    │── poll() lại ngay ────────▶│                         │
```

**Thời gian:**
- Node.js giữ request tối đa **25 giây**
- APEX callback timeout **28 giây** (buffer 3s)
- Nếu không có thông báo trong 25s → trả về `{"status": "timeout"}` → trình duyệt poll lại
- Nếu có thông báo → trả về ngay lập tức, không cần chờ hết 25s

**Tần suất request:** ~2 request/phút/người dùng

**Hiệu năng:** Code refresh chuông chỉ chạy khi thực sự có thông báo mới. Node.js xử lý bất đồng bộ nên giữ hàng trăm request cùng lúc mà không tốn CPU.

### 2.3 Cơ chế CQN (Continuous Query Notification)

Oracle tự động gửi callback về Server B mỗi khi có thay đổi trên bảng `USER_NOTIFICATIONS`:

```sql
-- Oracle đăng ký subscription hiện tại:
-- net8://(ADDRESS=(PROTOCOL=tcp)(HOST=172.25.10.38)(PORT=3141))
SELECT regid, callback FROM user_change_notification_regs;
```

- **INSERT** → CQN gửi ROWID → Node.js tra cache lấy `aus_id` → push thông báo
- **DELETE** → Node.js xóa khỏi cache
- **>80 ROWIDs/transaction** → Oracle không gửi ROWID → Node.js chạy `handleFullScan()` fallback

---

## 3. Tại sao không thể dùng WebSocket

### 3.1 Vấn đề cốt lõi: Server B là Private IP

```
Trình duyệt (máy người dùng)
    │
    │  wss://172.25.10.38/ws  ← KHÔNG THỂ REACH
    │                            172.25.10.38 là private IP
    ✗
Server B (172.25.10.38) — chỉ trong mạng nội bộ
```

Người dùng truy cập APEX qua `https://erp.greensys.vn` (public IP `103.109.xx.x`). Máy người dùng **không có đường đi** đến `172.25.10.38` vì đây là địa chỉ nội bộ, không expose ra internet.

Đã xác nhận: Khi thử kết nối trực tiếp → `ERR_CONNECTION_TIMED_OUT`.

### 3.2 Vấn đề Mixed Content

Dù có đường đi đến Server B, trình duyệt vẫn block:
- Trang APEX chạy trên `https://`
- WebSocket đến `ws://172.25.10.38:3410` là HTTP không mã hóa
- Trình duyệt chặn Mixed Content (HTTPS page → WS connection)

Nginx trên Server B đã giải quyết vấn đề này bằng SSL proxy (`wss://` → `ws://`), nhưng vẫn không giải quyết được vấn đề private IP.

### 3.3 Vấn đề SSL Certificate

Nginx đã có SSL cert cho `172.25.10.38`:
- SAN: `IP Address:172.25.10.38` ✓
- Còn hạn đến 2036 ✓
- **Nhưng:** Cert self-signed, trình duyệt không tin tưởng mặc định
- Cần người dùng import cert vào từng máy — không khả thi cho môi trường doanh nghiệp nhiều người dùng

---

## 4. Điều kiện để dùng WebSocket

Để WebSocket hoạt động, cần **đồng thời** đáp ứng tất cả điều kiện sau:

### Điều kiện 1: Trình duyệt phải reach được Server B
**Giải pháp:** Một trong các cách sau:
- Cấu hình Public Server (`103.109.xx.x`) proxy WebSocket → `172.25.10.38:3410`
- Mở port forward trên router/firewall từ public IP → Server B

**Yêu cầu:** Quyền truy cập cấu hình Public Server hoặc router mạng

### Điều kiện 2: SSL certificate được tin tưởng
**Giải pháp:** Một trong các cách sau:
- Dùng certificate từ CA công khai (Let's Encrypt) cho domain `erp.greensys.vn`
- Import cert self-signed vào Trusted Root CA trên tất cả máy người dùng

**Yêu cầu:** Nếu dùng Let's Encrypt cần domain và quyền cấu hình nginx với domain đó

### Điều kiện 3: WebSocket URL phải dùng domain, không dùng IP
**Giải pháp:** Đổi từ `wss://172.25.10.38/ws` → `wss://erp.greensys.vn/ws`

**Yêu cầu:** Public Server phải proxy path `/ws` về Server B

### Tóm tắt

| Điều kiện | Trạng thái | Việc cần làm |
|---|---|---|
| Trình duyệt reach Server B | ✗ Chưa đáp ứng | Proxy hoặc port forward qua Public Server |
| SSL cert được trust | ✗ Chưa đáp ứng | Cert cho domain erp.greensys.vn |
| WebSocket URL dùng domain | ✗ Chưa đáp ứng | Đổi URL + cấu hình Public Server |
| Quyền cấu hình Public Server | ✗ Không có | — |

Hiện tại thiếu quyền cấu hình Public Server nên **không thể triển khai WebSocket** mà không có sự hỗ trợ từ quản trị viên mạng.

---

## 5. So sánh Long-poll vs WebSocket

| Tiêu chí | Long-poll (hiện tại) | WebSocket (lý tưởng) |
|---|---|---|
| Độ trễ thông báo | < 1 giây | < 100ms |
| Số request/phút/user | ~2 | 0 (persistent connection) |
| Tải server | Thấp (async) | Rất thấp |
| Tải network | Thấp | Rất thấp |
| Khả năng triển khai | ✓ Hoạt động ngay | ✗ Cần thay đổi hạ tầng |
| Phụ thuộc hạ tầng | Chỉ Server B | Public Server + cert domain |

Long-poll với 25s timeout là giải pháp **thực tế và đủ tốt** cho hệ thống thông báo nội bộ doanh nghiệp. Độ trễ dưới 1 giây là chấp nhận được cho trường hợp sử dụng này.

---

## 6. Cấu hình hiện tại trên Server B

```
Server B (172.25.10.38)
├── /opt/chat-server/
│   ├── server.js          — HTTP server port 3410, CQN integration
│   ├── cqn.js             — Oracle CQN subscription, rowidCache
│   ├── chat.js            — Chat module router
│   └── .env               — PORT=3410, CQN_PORT=3141
├── /etc/nginx/conf.d/notify-ws.conf  — SSL proxy (dự phòng)
└── Firewall ports open: 3410/tcp, 3141/tcp
```

**PM2 process:** `chat-server` — tự động restart, restart-delay 3000ms để tránh EADDRINUSE khi restart nhanh.
