# Giải pháp tối ưu ORDS Thread Pool

## Vấn đề

Mỗi user đang mở Chat chiếm **2 ORDS worker thread** đồng thời:

```
notificationWait  ─┐
                   ├─ 2 threads × N users
chatEvents        ─┘

ORDS mặc định: 20–50 threads
→ 15 user chat đồng thời = 30 threads → ORDS bão hòa
→ Các request APEX thông thường bị queue chờ
```

---

## Giải pháp 1 — Tăng ORDS thread pool

**Mức độ:** Dễ — không cần thay đổi code  
**Tác động:** Nâng trần, không giải quyết gốc rễ  
**Làm ngay:** Có

### Cách thực hiện

Trên Server A, tìm file config ORDS:

```bash
find / -name "settings.xml" 2>/dev/null | grep ords
```

Thêm hoặc sửa các entry sau:

```xml
<entry key="jdbc.MaxLimit">100</entry>
<entry key="jdbc.InitialLimit">10</entry>
<entry key="jdbc.MaxStatementsLimit">10</entry>
```

Restart ORDS sau khi sửa.

---

## Giải pháp 2 — Gộp 2 long-poll thành 1 endpoint

**Mức độ:** Trung bình — cần sửa Node.js + APEX + global.js  
**Tác động:** Giảm 50% ORDS thread usage  
**Làm ngay:** Không — cần lên kế hoạch

### Kiến trúc sau khi gộp

```
Hiện tại:  notificationWait + chatEvents = 2 threads/user
Sau fix:   appEvents                     = 1 thread/user
```

### 2a. Node.js — server.js

Thêm `userWaiters` Map và endpoint `/api/events/:aus_id` mới:

```js
const userWaiters = new Map();

function notifyWaiters(ausId) {
    const key = String(ausId);

    // Backward compat: notification waiters cũ
    const list = waiters.get(key) || [];
    list.forEach(({ res, timeout }) => {
        clearTimeout(timeout);
        res.json({ status: 'new_notification' });
    });
    waiters.set(key, []);

    // Unified waiter mới
    const w = userWaiters.get(key);
    if (w) {
        clearTimeout(w.timeout);
        userWaiters.delete(key);
        w.res.json({ notification: true, events: [] });
    }

    if (list.length || w) {
        console.log('[Notify] aus_id=%s notified', key);
    }
}

function deliverToUserUnified(ausId, payload) {
    const key = String(ausId);
    const w   = userWaiters.get(key);
    if (!w) return;
    clearTimeout(w.timeout);
    userWaiters.delete(key);
    w.res.json({ notification: false, events: [payload] });
}

app.get('/api/events/:aus_id', (req, res) => {
    const key = String(req.params.aus_id);

    const old = userWaiters.get(key);
    if (old) {
        clearTimeout(old.timeout);
        old.res.json({ notification: false, events: [], status: 'replaced' });
    }

    const timeout = setTimeout(() => {
        userWaiters.delete(key);
        res.json({ notification: false, events: [], status: 'timeout' });
    }, 25_000);

    userWaiters.set(key, { res, timeout });

    req.on('close', () => {
        const w = userWaiters.get(key);
        if (w && w.res === res) {
            clearTimeout(w.timeout);
            userWaiters.delete(key);
        }
    });
});
```

Sau khi định nghĩa `deliverToUserUnified`, wire vào chat module:

```js
const { router: chatRouter, setUnifiedDeliver } = require('./chat');
setUnifiedDeliver(deliverToUserUnified);
```

### 2b. Node.js — chat.js

Sửa `deliverToUser` để gọi thêm unified waiter, và export `setUnifiedDeliver`:

```js
let _deliverUnified = null;

function deliverToUser(ausId, payload) {
    const key = String(ausId);
    const w   = chatWaiters.get(key);
    if (w) {
        clearTimeout(w.timeout);
        w.res.json({ events: [payload] });
        chatWaiters.delete(key);
    }
    if (typeof _deliverUnified === 'function') {
        _deliverUnified(ausId, payload);
    }
}

module.exports = {
    router,
    chatWaiters,
    onlineUsers,
    setUnifiedDeliver: fn => { _deliverUnified = fn; }
};
```

### 2c. APEX — Ajax Callback `appEvents` (Page 0)

Thay thế cả `notificationWait` và `chatEvents` bằng 1 callback duy nhất:

- **Name:** `appEvents`
- **Point:** Ajax Callback

```sql
DECLARE
    l_req    UTL_HTTP.REQ;
    l_resp   UTL_HTTP.RESP;
    l_body   VARCHAR2(32767) := '';
    l_buffer VARCHAR2(32767);
BEGIN
    OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
    IF :G_AUS_ID IS NULL THEN
        HTP.p('{"notification":false,"events":[],"status":"timeout"}');
        RETURN;
    END IF;
    UTL_HTTP.SET_TRANSFER_TIMEOUT(28);
    l_req  := UTL_HTTP.BEGIN_REQUEST(
                'http://172.25.10.38:3410/api/events/' || :G_AUS_ID,
                'GET', 'HTTP/1.1');
    UTL_HTTP.SET_HEADER(l_req, 'Connection', 'close');
    l_resp := UTL_HTTP.GET_RESPONSE(l_req);
    BEGIN
        LOOP
            UTL_HTTP.READ_TEXT(l_resp, l_buffer, 32767);
            l_body := l_body || l_buffer;
        END LOOP;
    EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL;
    END;
    UTL_HTTP.END_RESPONSE(l_resp);
    HTP.p(l_body);
EXCEPTION
    WHEN OTHERS THEN
        BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
        HTP.p('{"notification":false,"events":[],"status":"timeout"}');
END;
```

### 2d. global.js (Theme JavaScript)

Thay `notificationWait` poll bằng `appEvents` poll duy nhất:

```javascript
(function () {
    'use strict';
    if (window._appPoll) return;

    $(document).ready(function () {
        var ausId = $v('P0_AUS_ID');
        if (!ausId) return;

        window._appPoll = true;
        var _backoff = 5000;

        function poll() {
            apex.server.process('appEvents', {}, {
                dataType: 'json',
                success: function (data) {
                    _backoff = 5000;

                    if (data && data.notification) {
                        apex.region('notification-menu').refresh();
                    }

                    if (data && data.events && data.events.length > 0) {
                        if (typeof window.onChatEvents === 'function') {
                            window.onChatEvents(data.events);
                        }
                    }

                    poll();
                },
                error: function () {
                    setTimeout(poll, _backoff);
                    _backoff = Math.min(_backoff * 2, 60000);
                }
            });
        }

        poll();

        apex.server.process('chatHeartbeat', {});
        setInterval(function () {
            apex.server.process('chatHeartbeat', {});
        }, 20000);
    });
})();
```

### 2e. apex-app.jsx — đăng ký handler thay vì tự poll

Xóa vòng poll `chatEvents` cũ, thay bằng:

```js
window.onChatEvents = function(events) {
    events.forEach(handleChatEvent); // hàm xử lý event hiện có
};
```

---

## Giải pháp 3 — Giảm timeout

**Mức độ:** Dễ  
**Tác động:** Giảm ~30% thời gian giữ thread, tăng 2.5x số round-trip  
**Làm ngay:** Tùy chọn

Sửa `POLL_TIMEOUT` trong `server.js` và `chat.js`:

```js
const POLL_TIMEOUT = 10_000; // giảm từ 25s xuống 10s
```

Sửa timeout trong tất cả APEX callbacks dùng long-poll:

```sql
UTL_HTTP.SET_TRANSFER_TIMEOUT(13); -- giảm từ 28s xuống 13s
```

---

## So sánh các giải pháp

| Giải pháp | ORDS threads | Code thay đổi | Ưu tiên |
|---|---|---|---|
| 1. Tăng thread pool | Không đổi, trần cao hơn | Không có | Làm ngay |
| 2. Gộp 2 poll thành 1 | Giảm 50% | Node.js + APEX + JS | Kế hoạch |
| 3. Giảm timeout | Giảm ~30% | Nhỏ | Tùy chọn |

## Ngưỡng user theo từng giải pháp

| Cấu hình | User đồng thời tối đa |
|---|---|
| Hiện tại (ORDS mặc định 50 threads) | ~10 user |
| Sau Giải pháp 1 (100 threads) | ~25 user |
| Sau Giải pháp 2 (gộp poll) | ~50 user |
| Sau cả 3 giải pháp | ~80–100 user |
