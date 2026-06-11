# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mục đích dự án

Notification Drawer Panel cho hệ thống ERP APEX Oracle 24.2. Tích hợp vào **Page 0** (Global Page) — hiển thị trên mọi page của app.

## Cách xem UI

Mở trực tiếp trong browser (không cần build, không cần server):

```
src/notification-page.html      — trang thông báo full page (bản chính)
src/drawer-notification.html    — bản drawer tích hợp mới nhất
src/notif-item-demo.html        — demo 1 item đơn lẻ + hover effect
src/notif-read-filter-demo.html — demo filter read/unread
```

## Kiến trúc APEX Integration

```
Page 0 (Global Page)
├── Region "Notif Drawer HTML"  ← src/notif-panel.html    (After Header)
├── CSS Inline                  ← src/notif-panel.css
├── Function & Global Var Decl  ← src/notif-panel.fgvd.js
├── Execute when Page Loads     ← src/notif-panel.onload.js
│
├── Ajax Callback: notifLoad     ← notif-callbacks.sql §1
├── Ajax Callback: notifMarkRead ← notif-callbacks.sql §2
├── Ajax Callback: notifMarkAll  ← notif-callbacks.sql §3
└── Ajax Callback: notifDelete   ← notif-callbacks.sql §4

Static Application Files
└── notif-panel.jsx              (upload lên APEX — load qua fetch + Babel.transform)
```

## JSX Load Chain (quan trọng)

`notif-panel.jsx` **không** inline vào Page 0 — chứa JSX syntax nên phải là Static Application File, load runtime qua:

1. `notif-panel.onload.js` gọi `window.notifLoadJSX()`
2. `notifLoadJSX` fetch file từ `#APP_FILES#notif-panel.jsx`, chạy `Babel.transform(src, { presets: ['react'] })`
3. Kết quả compile được `new Function(compiled)()` — execute trong global scope
4. IIFE trong JSX tự mount `<NotifPanel/>` vào `#notif-root` (guard `container._notifRoot` — idempotent)
5. Sau mount, `window.notifInitDropdown()` được gọi để khởi tạo action dropdown

**React/ReactDOM/Babel phải load xong trước bước 2** — load sequentially trong Execute when Page Loads, không dùng File URLs async.

## Window Globals

**Khai báo trong `notif-panel.fgvd.js` (trước JSX load):**

| Global | Mô tả |
|--------|-------|
| `window.notifOpen()` | Mở drawer + gọi `notifRefresh` |
| `window.notifClose()` | Đóng drawer |
| `window.notifToggle()` | Toggle drawer |
| `window.notifBadgeUpdate(count)` | Cập nhật số badge trên bell icon |
| `window.notifLoadJSX()` | Fetch + Babel.transform + execute JSX |
| `window.notifInitDropdown()` | Khởi tạo action dropdown — tự gọi sau JSX load |
| `window.notifSSEInit(sseSource)` | Đăng ký listener `notification_new` lên SSE source |

**Expose từ JSX sau khi React mount:**

| Global | Mô tả |
|--------|-------|
| `window.notifRefresh` | Gọi lại `loadData()` trong component |
| `window.notifMarkAll` | Đánh dấu tất cả đã đọc |
| `window.notifDeleteAll` | Xóa tất cả thông báo |
| `window.notifSetReadFilter` | Set filter đọc/chưa đọc từ bên ngoài |

## JSX Component Architecture

`NotifPanel` — component duy nhất với 3 sub-component:
- `NotifItem` — card thông báo. Hover: time fade out, action buttons slide in từ phải (`translateX`)
- `SectionLabel` — sticky date group header (HÔM NAY / HÔM QUA / TUẦN TRƯỚC…)
- `EmptyState` — loading spinner + empty/filtered states
- `ActionDropdown` — portal render vào `document.body` (thoát `overflow:hidden` của drawer), hover trigger với 300ms timer tránh flicker

**State pattern:** optimistic updates — UI cập nhật ngay (`setData` trước), sau đó mới gọi `apexProcess`. Lỗi Ajax bị bỏ qua silently để tránh rollback flicker.

**`apexProcess(name, data)`** — wrapper Promise cho `apex.server.process` với `pageId: 0`. Mọi Ajax call trong JSX dùng hàm này.

## Data Source

**Tables (local):** `app_notifications (ano)`, `user_notifications (uno)`, `approval_histories_headers (ahh)`, `je_sources (jes)`, `domain (dom)`

**Remote via DBLINK:** `app_users` — luôn dùng `/*+ MATERIALIZE */` trong CTE.

**notifLoad join:**
```
app_notifications → approval_histories_headers (ano.owner_id = ahh.ahh_id)
                  → user_notifications (ano.ano_id = uno.ano_id, uno.aus_id = current user)
                  LEFT JOIN je_sources (ano.jes_id = jes.jes_id)
                  JOIN domain (rv_domain='APPROVAL', rv_low_value = ahh.status)
WHERE uno.deleted='N' AND from_date <= SYSDATE AND (to_date >= SYSDATE OR to_date IS NULL)
```

**Soft delete:** `notifDelete` set `uno.deleted='Y'`. `notifMarkRead` set `uno.read='Y'`.

**Field mapping SQL → JSX:**

| SQL column | JSX field | Dùng để |
|-----------|-----------|---------|
| `ahh.status` | `n.status` | `getNS(status)` → CSS class `ns-*/nd-*/nb-*` |
| `ano.ano_name` | `n.ano_name` | Title card |
| `ahh.doc_number` | `n.doc_number` | Doc link |
| `jes.name` | `n.jes_name` | Sender |
| `uno.read` | `n.is_read` | `!== 'Y'` = unread |
| `date_group_label` | `n.date_group_label` | Section divider |

## Status Config

`NS_CONFIG` trong JSX map code (`W/N/Y/R/A/C/L/F/I/O`) → `{ css, dot, bar }` class names. CSS classes `.ns-*/.nd-*/.nb-*` dùng CSS custom property `--s-c`, `--s-bg`, `--s-bd` set tại class `.s-*` trong `notif-panel.css`.

Thêm status mới: thêm vào `NS_CONFIG` object + thêm CSS class tương ứng.

Thêm tab filter mới: thêm vào mảng `TABS` trong JSX.

## Action Dropdown — Portal Pattern

`ActionDropdown` dùng `ReactDOM.createPortal` render vào `document.body` để thoát `overflow:hidden` của drawer. Hover trigger (mouseenter/mouseleave) với 300ms debounce timer (`timerRef`). Position tính bằng `getBoundingClientRect()` → `position:fixed`.

`notifInitDropdown()` trong `notif-panel.fgvd.js` là bản vanilla JS fallback — cùng logic, dùng khi JSX chưa mount. Sau JSX mount, `Btn_Action` được component `ActionDropdown` render và quản lý.

## Navigation "Xem chứng từ"

`handleView` trong JSX hiện dùng `n.target_url` trực tiếp. Khi cần navigation có SSP checksum, thêm `target_page_id` vào query `notifLoad` và dùng `redirect_page` Application Process (xem `docs/apex-patterns.md`).

## Khi paste vào APEX

Xem `docs/setup.md` cho hướng dẫn đầy đủ.

| File | APEX destination |
|------|----------------|
| `src/notif-panel.html` | Static Content region Page 0 — After Header |
| `src/notif-panel.css` | Page 0 → CSS → Inline |
| `src/notif-panel.fgvd.js` | Page 0 → Function and Global Variable Declaration |
| `src/notif-panel.onload.js` | Page 0 → Execute when Page Loads |
| 4 callbacks từ `notif-callbacks.sql` | Page 0 → Processing → Ajax Callback |
| `notif-panel.jsx` | Shared Components → Static Application Files |

**Bắt buộc:**
- Mọi `<button>` phải có `type="button"` — tránh submit `wwvFlowForm`
- `JSON_ARRAYAGG ... RETURNING CLOB` — bắt buộc khi list > ~10 items
- `/*+ MATERIALIZE */` khi query `app_users` (remote table qua DBLINK)
- `pageId: 0` trong mọi `apexProcess` call — callbacks nằm trên Page 0
- `uno.read` so sánh bằng `!== 'Y'` không phải `=== false`

## SSE Integration

Sau khi SSE source khởi tạo trong Page 0 FGVD:
```javascript
if (typeof window.notifSSEInit === 'function') {
  window.notifSSEInit(sseSource);
}
```

Server emit event `notification_new` với payload `{ unread_count, aus_id }`. Handler cập nhật badge và refresh drawer nếu đang mở.
