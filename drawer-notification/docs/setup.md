# Notification Drawer — Setup Guide (APEX 24.2)

## Tổng quan kiến trúc

```
Page 0 (Global Page)
├── Region "Notif Drawer HTML"  → notif-panel.html    (After Header)
├── CSS Inline                  → notif-panel.css
├── Function & Global Var Decl  → notif-panel.fgvd.js
├── Execute when Page Loads     → notif-panel.onload.js
│
├── Ajax Callback: notifLoad     → notif-callbacks.sql §1
├── Ajax Callback: notifMarkRead → notif-callbacks.sql §2
├── Ajax Callback: notifMarkAll  → notif-callbacks.sql §3
└── Ajax Callback: notifDelete   → notif-callbacks.sql §4

Static Application Files
└── notif-panel.jsx              (upload lên APEX)
```

## Bước 1 — Upload Static Application File

1. **Shared Components → Static Application Files**
2. Upload `notif-panel.jsx`
3. Ghi lại URL (dạng `#APP_FILES#notif-panel.jsx`)
4. Nếu path khác → sửa `fileUrl` trong `notif-panel.fgvd.js`

## Bước 2 — Page 0: CSS

1. Vào **Page 0** → **CSS → Inline**
2. Paste toàn bộ nội dung `notif-panel.css`

## Bước 3 — Page 0: Region HTML

1. Thêm Region mới trên Page 0
   - **Type:** Static Content
   - **Template:** Blank with Attributes (không có title, không có body wrapper)
   - **Position:** After Header (hoặc Body — tuỳ layout APEX theme)
   - **Source:** Paste nội dung `notif-panel.html`

> **Lưu ý:** Bell button trong `notif-panel.html` nên được đặt vào **navigation bar region**  
> của Page 0 để hiển thị đúng vị trí trên header. Có thể tách riêng bell ra một region nhỏ.

## Bước 4 — Page 0: JavaScript

### Function and Global Variable Declaration
Paste toàn bộ `notif-panel.fgvd.js`

### Execute when Page Loads
Paste toàn bộ `notif-panel.onload.js`

## Bước 5 — Ajax Callbacks (Page 0)

Tạo 4 Ajax Callback trên **Page 0** (không phải Application Process):

| Callback name  | PL/SQL source |
|----------------|--------------|
| `notifLoad`    | `notif-callbacks.sql` §1 |
| `notifMarkRead`| `notif-callbacks.sql` §2 |
| `notifMarkAll` | `notif-callbacks.sql` §3 |
| `notifDelete`  | `notif-callbacks.sql` §4 |

**Cách tạo trong APEX 24.2:**
- Page 0 → Processing tab → ⊕ → Ajax Callback
- Name: `notifLoad` (khớp chính xác với tên trong JS)
- PL/SQL Code: paste từng đoạn tương ứng

## Bước 6 — SSE Integration (nếu cần real-time)

Trong FGVD của Page 0 (chỗ khởi tạo SSE đang có), thêm:

```javascript
// Sau khi sseSource được khởi tạo:
if (typeof window.notifSSEInit === 'function') {
  window.notifSSEInit(sseSource);
}
```

Trên Node.js server, emit event khi có thông báo mới:

```javascript
// Trong chat-server/server.js — sau khi insert notification
broadcastSSE({ type: 'notification_new', unread_count: count, aus_id: targetAusId });
```

## Bước 7 — Navigation "Xem chứng từ"

`notif-panel.jsx` hàm `handleView` hiện dùng `n.target_url`. Cần quyết định mapping:

| `owner_table_name` | Page ID | Item |
|-------------------|---------|------|
| `SO_HEADERS` | ? | `P?_SO_ID` |
| `PO_HEADERS` | ? | `P?_PO_ID` |
| ... | ... | ... |

Khi đã có mapping, cập nhật callback `notifLoad` để trả thêm field `target_page_id` và `target_item`.  
Sau đó sửa `handleView` dùng `redirect_page` Application Process (đã có sẵn trong hệ thống).

## Checklist kiểm tra

- [ ] `notif-panel.jsx` đã upload lên Static Application Files
- [ ] Mở browser DevTools → Console: không có lỗi `Babel is not defined`
- [ ] Click bell → drawer slide in từ phải
- [ ] API `notifLoad` trả về JSON có field `items`
- [ ] Items hiển thị đúng status color
- [ ] Hover item → actions "Xem / Đã đọc / Xóa" hiện
- [ ] "Đọc tất cả" → badge count = 0
- [ ] Xóa item → biến khỏi list (soft delete trong DB)
- [ ] SSE push → badge cập nhật không cần reload

## Lưu ý APEX 24.2

- **`pageId: 0`** trong `apexProcess` — bắt buộc khi callback nằm trên Page 0
- **`type="button"`** trên mọi `<button>` — tránh submit form APEX (đã xử lý trong JSX)
- **`RETURNING CLOB`** trong `JSON_ARRAYAGG` — bắt buộc khi list > ~10 items
- **`/*+ MATERIALIZE */`** khi join `app_users` (remote table) với local tables
- `uno.read` dùng `'Y'`/`'N'` — so sánh bằng `!== 'Y'` trong JS (không phải `=== false`)
