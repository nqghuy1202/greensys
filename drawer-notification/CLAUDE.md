# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mục đích dự án

Notification Drawer Panel cho hệ thống ERP APEX Oracle 24.2. Tích hợp vào **Page 0** (Global Page). Có 2 render mode song song:

- **JSX Drawer** (`notif-panel.jsx`) — drawer slide-in từ phải, React + Babel runtime
- **Template Component (TC)** (`notif-item-apex.*`) — danh sách thông báo dạng APEX TC rows, load trong iframe dialog

## Xem UI (không cần build/server)

```
src/notification-page.html      — full page preview
src/drawer-notification.html    — drawer tích hợp
src/notif-item-v2-demo.html     — TC row + hover + dot menu
src/notif-read-filter-demo.html — segmented control tabs
```

## Kiến trúc APEX — Nơi paste từng file

```
Page 0 (Global Page)
├── Region "Notif Drawer HTML"  ← src/notif-panel.html       (After Header)
├── CSS Inline                  ← src/notif-panel.css
│                                  + src/notif-item-apex.css  (append)
├── Function & Global Var Decl  ← src/notif-panel.fgvd.js
│                                  + src/notif-item-apex.js   (append)
├── Execute when Page Loads     ← src/notif-panel.onload.js
│
├── Ajax Callback: notifLoad     ← notif-callbacks.sql §1
├── Ajax Callback: notifMarkRead ← notif-callbacks.sql §2
├── Ajax Callback: notifMarkAll  ← notif-callbacks.sql §3
└── Ajax Callback: notifDelete   ← notif-callbacks.sql §4

Static Application Files
└── notif-panel.jsx              (upload → #APP_FILES#notif-panel.jsx)

Template Component (TC — trang thông báo riêng, load trong iframe dialog)
├── Row Template                ← notif-item-apex.html
├── CSS Inline                  ← notif-item-apex.css
└── FGVD                        ← notif-item-apex.js   (tất cả TC logic gom vào đây)
```

**`notif-move-btn.js`** — version cũ standalone của `moveNotifButtons()`, đã được tích hợp vào `notif-item-apex.js`. Không dùng song song.

## JSX Load Chain

`notif-panel.jsx` phải load runtime vì chứa JSX syntax:

1. `notif-panel.onload.js` → `window.notifLoadJSX()`
2. `fetch('#APP_FILES#notif-panel.jsx')` → `Babel.transform(src, { presets: ['react'] })`
3. `new Function(compiled)()` → React mount `<NotifPanel/>` vào `#notif-root`
4. Sau mount → `window.notifInitDropdown()` khởi tạo hover dropdown cho `#Btn_Action`

React/ReactDOM/Babel phải load xong trước bước 2 — load sequentially trong Execute when Page Loads, không dùng File URLs async.

## Window Globals

### `notif-panel.fgvd.js`

| Global | Mô tả |
|--------|-------|
| `window.notifOpen()` | Mở drawer + gọi `notifRefresh` |
| `window.notifClose()` | Đóng drawer |
| `window.notifToggle()` | Toggle drawer |
| `window.notifBadgeUpdate(count)` | Cập nhật badge trên bell icon |
| `window.notifLoadJSX()` | Fetch + Babel + execute JSX |
| `window.notifSSEInit(sseSource)` | Đăng ký listener `notification_new` lên SSE |

### Expose từ JSX sau React mount

| Global | Mô tả |
|--------|-------|
| `window.notifRefresh` | Gọi lại `loadData()` trong component |
| `window.notifSetReadFilter` | Filter client-side — **JSX drawer only**, KHÔNG gọi từ TC page |

### `notif-item-apex.js` (TC mode)

| Global | Mô tả |
|--------|-------|
| `window.notifMenuOpen(btn)` | Mở dot menu ⋯ per item |
| `window.notifMenuView()` | Set page item ANO_ID để navigate |
| `window.notifMenuMarkRead()` | Đánh dấu đã đọc (optimistic UI) |
| `window.notifMenuDelete()` | Xóa thông báo (slide out + soft delete) |
| `window.notifBulkMenuOpen/ScheduleClose/CancelClose` | Hover open/close cho `#Btn_BulkAction` |
| `window.notifBulkMarkAll/DeleteAll` | Bulk actions |
| `notifSetReadType(radio)` | Set page item READ khi đổi tab filter |

## notif-item-apex.js — Cấu trúc

File này là toàn bộ FGVD của TC page. Thứ tự khai báo quan trọng:

1. `apexBulkProcess(name)` — helper chung: `apex.server.process` + refresh `Cr_Ano`
2. `moveNotifButtons()` — detach `#Btn_BulkAction` + `#nba-menu` → parent titlebar
3. `notifSetReadType / notifSetReadFilter / notifNavigate / notifItemClick` — helpers
4. Dot menu IIFE — `notifMenuOpen/View/MarkRead/Delete` + outside-click handler
5. SSE IIFE — bind `apex:notifEvent.tc` lên parent jQuery
6. Bulk menu IIFE — `notifBulkMenuOpen/ScheduleClose/CancelClose/MarkAll/DeleteAll`
7. `document.ready` — gọi `moveNotifButtons()`

## moveNotifButtons — Cơ chế iframe→parent

TC page load trong iframe bên trong `.ui-dialog`. Hàm này:
1. Tìm iframe trong `parent.document` → tìm `.ui-dialog` chứa nó
2. Detach `#Btn_BulkAction` (`.nba-wrap`) + `#nba-menu` khỏi iframe
3. Insert vào titlebar trước `.ui-dialog-titlebar-close`
4. Inject CSS hardcode của `nba-*` vào `parent.document` (không dùng `cssRules` — APEX stylesheet cross-origin bị chặn)
5. Rewire `onmouseenter/leave/click` → `iframeWin.*` (inline attr chạy trong parent scope sau khi move)

`#nba-menu` phải move sang `parent.document.body` (không chỉ titlebar) vì `position:fixed` tính theo viewport của document chứa element — nếu còn trong iframe, menu bị cắt bởi `overflow:hidden` của dialog.

## Template Component (TC) — Cơ chế

SQL trả các field: `STATUS_CSS`, `IS_READ`, `DOC_NUMBER`, `STATUS_LABEL`, `NGAY_TAO`, `ANO_NAME`, `JES_NAME`, `ANO_ID`, `AHH_ID`.

Row template dùng substitution `&FIELD.`:
```html
<div class="ni &STATUS_CSS. read-&IS_READ." data-ano-id="&ANO_ID." data-ahh-id="&AHH_ID.">
```

**Read filter tab** (segmented control `.ntt-track`):
- `onchange` → `notifSetReadType(this)` → `apex.item('P' + pageId + '_READ').setValue(value)`
- KHÔNG gọi `window.notifSetReadFilter` — hàm đó JSX-only, gây lỗi `querySelectorAll` null ở TC page
- DA trên item `_READ` Change event → refresh TC region

**Dot menu** (`#ni-dropdown` singleton `position:fixed`):
- `_justOpened` flag + `setTimeout(0)` — tránh document click listener đóng menu ngay sau mở (`stopPropagation` inline không đủ tin cậy trong APEX)
- `getDropdown()` dùng `!_dd.isConnected` — re-query sau khi region refresh/pagination thay thế DOM
- `_activeItem` lưu `{ anoId, ahhId, el }` từ `dataset` string — không lưu DOM reference trực tiếp

**Bulk menu position:** dùng `right: clientWidth - r.right` (không dùng `left`) — button nằm góc phải titlebar, dùng `left` sẽ tràn ra ngoài viewport.

**SSE listener:** `.off('apex:notifEvent.tc').on('apex:notifEvent.tc', ...)` — namespace `.tc` tránh listener tích lũy khi iframe reload nhiều lần.

## JSX Component Architecture

`NotifPanel` — component duy nhất với sub-components:
- `NotifItem` — card thông báo, hover: action buttons slide in từ phải
- `SectionLabel` — sticky date group header (HÔM NAY / HÔM QUA / TUẦN TRƯỚC…)
- `EmptyState` — loading spinner + empty/filtered states
- `ActionDropdown` — `ReactDOM.createPortal` vào `document.body`, hover 300ms debounce

**State pattern:** optimistic updates — `setData` trước, gọi `apexProcess` sau.

**`apexProcess(name, data)`** — wrapper Promise cho `apex.server.process` với `pageId: 0`.

## Data Source

**Tables (local):** `app_notifications (ano)`, `user_notifications (uno)`, `approval_histories_headers (ahh)`, `je_sources (jes)`, `domain (dom)`

**Remote via DBLINK:** `app_users` — luôn dùng `/*+ MATERIALIZE */` trong CTE.

**Soft delete:** `notifDelete` set `uno.deleted='Y'`. `notifMarkRead` set `uno.read='Y'`.

**Auth pattern bắt buộc trong mọi callback:**
```sql
IF :APP_USER IS NULL OR UPPER(:APP_USER) IN ('NOBODY','ANONYMOUS') THEN
  HTP.p('{"error":"auth"}'); RETURN;
END IF;
WITH remote_user AS (SELECT /*+ MATERIALIZE */ aus_id FROM app_users
  WHERE LOWER(user_name) = LOWER(:APP_USER) AND ROWNUM = 1)
SELECT aus_id INTO l_aus_id FROM remote_user;
```

## Status CSS Mapping

| DB status | CSS class | Color |
|-----------|-----------|-------|
| W | `status-waiting` | `#F18812` |
| N | `status-approved` | `#31956D` |
| R | `status-rejected` | `#FB132F` |
| C | `status-expired` | `#9CA3AF` |
| O | `status-processing` | `#0091F7` |
| L / F | `status-supplement` | `#7C3AED` |
| Y | `status-y` | `#2563EB` |
| I | `status-i` | `#D100BC` |
| A | `status-a` | `#84740C` |

Thêm status mới: cập nhật đồng thời SQL CASE, `NS_CONFIG` trong JSX, và CSS.

## SSE Integration

```javascript
// Trong Page 0 FGVD, sau khi sseSource được khởi tạo:
if (typeof window.notifSSEInit === 'function') {
  window.notifSSEInit(sseSource);
}
```

Server emit `notification_new` với payload `{ unread_count, aus_id }` → badge update + auto-refresh nếu drawer đang mở.

## Bẫy thường gặp

- **`pageId: 0`** bắt buộc trong mọi `apex.server.process` — callbacks nằm trên Page 0
- **`type="button"`** trên mọi `<button>` — tránh submit `wwvFlowForm`
- **`RETURNING CLOB`** trong `JSON_ARRAYAGG` khi list > ~10 items
- **`uno.read`** so sánh bằng string `!== 'Y'`, không phải boolean
- **CSS inject cross-origin:** không dùng `stylesheet.cssRules` để copy CSS sang parent — bị chặn. Hardcode CSS string trực tiếp
- **`notifSetReadFilter`** chỉ dùng được trong JSX drawer — gọi từ TC page gây `querySelectorAll` null
- **Hover CSS** dùng `color-mix(in srgb, var(--fourth-color, #E1F0EB) 50%, white)` để pha nhạt

## Setup đầy đủ

Xem `docs/setup.md`.
