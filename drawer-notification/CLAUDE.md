# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mục đích dự án

Notification Drawer Panel cho hệ thống ERP APEX Oracle 24.2. Tích hợp vào **Page 0** (Global Page). Có 2 render mode song song:

- **JSX Drawer** (`notif-panel.jsx`) — drawer slide-in từ phải, React + Babel runtime
- **Template Component (TC)** (`notif-item-apex.*`) — danh sách thông báo dạng APEX TC rows, load trong iframe dialog

## Xem UI (không cần build/server)

```
src/notification-page.html         — full page preview JSX drawer
src/drawer-notification.html       — drawer tích hợp
src/notif-item-v2-demo.html        — TC row + hover + dot menu
src/notif-read-filter-demo.html    — segmented control tabs
Notification Slide Panel v3.html   — thiết kế mới nhất (tham khảo)
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

TC Page — Static Content Region (Before Footer)
└── #ni-dropdown singleton HTML  (KHÔNG đặt trong Row Template — render 1 lần duy nhất)
TC Page — Static Content Region
└── src/notif-bulk-actions.html  (.nba-wrap + #nba-menu)
```

**`notif-move-btn.js`** — version cũ standalone của `moveNotifButtons()`, đã được tích hợp vào `notif-item-apex.js`. Không dùng song song.

## TC Row Template — Layout v3 (hiện tại)

Layout 3 cột: **Left (dot + icon)** | **Middle (badge + title + summary)** | **Right (menu + time)**

```html
<div class="ni noti-row &IS_READ_CSS. read-&IS_READ."
     data-ano-id="&ANO_ID." data-ahh-id="&AHH_ID."
     onclick="notifItemClick(event, this)" style="cursor:pointer;">
  <div class="noti-left">
    <div class="ni-dot unread-dot"></div>
    <div class="icon-box &TYPE_CSS.">&ICON_SVG!RAW.</div>
  </div>
  <div class="noti-body">
    <div class="meta-info">
      <span class="badge &STATUS_CSS.">&STATUS_LABEL.</span>
      <span class="type-label">&TYPE_NOTIFY.</span>
    </div>
    <h4 class="title">&ANO_NAME.</h4>
    <div class="summary">&ANO_SUMMARY!RAW.</div>
  </div>
  <div class="noti-right">
    <button type="button" class="btn-more ni-menu-btn" onclick="notifMenuOpen(this)">⋯</button>
    <div class="time">&NGAY_TAO.</div>
  </div>
</div>
```

SQL phải trả thêm cột:
```sql
case when uno.read = 'N' then 'is-unread' else 'is-read' end as is_read_css,
case when ahh.ahh_id is null then 'type-he-thong' else 'type-chung-tu' end type_css,
case when ahh.ahh_id is null
  then '<span aria-hidden="true" class="fa fa-alarm-check"></span>'
  else '<span class="fa fa-file-text-o" aria-hidden="true"></span>'
end icon_svg
```

Bỏ 2 JOIN thừa trong TC SQL:
- `LEFT JOIN app_users` — dùng `uno.aus_id` trực tiếp (`app_users` là remote DBLINK, rất tốn kém)
- `LEFT JOIN menus` — không dùng cột nào

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
| `notifItemClick(event, el)` | Click row → navigate (bỏ qua click trên `.ni-menu-btn`) |

## notif-item-apex.js — Cấu trúc

File này là toàn bộ FGVD của TC page. Thứ tự khai báo quan trọng:

1. `apexBulkProcess(name)` — helper chung: `apex.server.process` + refresh `Cr_Ano`
2. `moveNotifButtons()` — detach `#Btn_BulkAction` + `#nba-menu` → parent titlebar
3. `notifSetReadType / notifNavigate / notifItemClick` — helpers
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
5. Rewire `onmouseenter/leave/click` → `iframeWin.*`

`#nba-menu` phải move sang `parent.document.body` vì `position:fixed` tính theo viewport của document chứa element — nếu còn trong iframe, menu bị cắt bởi `overflow:hidden` của dialog.

**`#nba-menu` HTML không được có inline `onmouseenter`/`onmouseleave`** — sau khi move sang parent.document, các inline attribute chạy trong parent.window scope (không tìm thấy function). `moveNotifButtons()` đã rewire qua `.onmouseenter = function(){}` nên không cần inline.

## Template Component (TC) — Cơ chế

SQL substitution `&FIELD.` — các cột bắt buộc: `IS_READ_CSS`, `IS_READ`, `ANO_ID`, `AHH_ID`, `TYPE_CSS`, `ICON_SVG`, `STATUS_CSS`, `STATUS_LABEL`, `TYPE_NOTIFY`, `ANO_NAME`, `ANO_SUMMARY`, `NGAY_TAO`.

**Read filter tab** (segmented control `.ntt-track`):
- `onclick` → `notifSetReadType(this)` → `apex.item('P' + pageId + '_READ').setValue(value)`
- KHÔNG gọi `window.notifSetReadFilter` — hàm đó JSX-only, gây lỗi `querySelectorAll` null ở TC page
- DA trên item `_READ` Change event → refresh TC region

**Dot menu** (`#ni-dropdown` singleton `position:fixed`):
- Đặt trong Static Content Region riêng trên TC page — không đặt trong Row Template (sẽ render N lần)
- `position: fixed` bắt buộc — tọa độ lấy từ `getBoundingClientRect()` là viewport-relative
- `top = r.bottom + 4` (không cộng `scrollY` — chỉ dùng với `position:absolute`)
- `_justOpened` flag + `setTimeout(0)` — tránh document click listener đóng menu ngay sau mở
- `getDropdown()` dùng `!_dd.isConnected` — re-query sau khi region refresh thay thế DOM
- `_activeItem` lưu `{ anoId, ahhId, el }` từ `dataset` string — không lưu DOM reference trực tiếp

**Bulk menu position:** dùng `right: clientWidth - r.right` (không dùng `left`) — button nằm góc phải titlebar.

**SSE listener:** `.off('apex:notifEvent.tc').on('apex:notifEvent.tc', ...)` — namespace `.tc` tránh listener tích lũy khi iframe reload nhiều lần.

**Click navigate:** `.ni` row phải có `onclick="notifItemClick(event, this)"` — thiếu thì click không navigate.

## JSX Component Architecture

`NotifPanel` — component duy nhất với sub-components:
- `NotifItem` — card thông báo, hover: action buttons slide in từ phải
- `SectionLabel` — sticky date group header (HÔM NAY / HÔM QUA / TUẦN TRƯỚC…)
- `EmptyState` — loading spinner + empty/filtered states
- `ActionDropdown` — `ReactDOM.createPortal` vào `document.body`, hover 300ms debounce

**State pattern:** optimistic updates — `setData` trước, gọi `apexProcess` sau.

**`apexProcess(name, data)`** — wrapper Promise cho `apex.server.process` với `pageId: 0`.

## Data Source

**Tables (local):** `app_notifications (ano)`, `user_notifications (uno)`, `approval_histories_headers (ahh)`, `domain (dom)`

**Remote via DBLINK:** `app_users` — tránh JOIN trực tiếp, dùng `uno.aus_id` thay `aus.aus_id`. Nếu bắt buộc join thì dùng `/*+ MATERIALIZE */` trong CTE.

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
| Y | `status-complete` | `#2563EB` |
| I | `status-i` | `#D100BC` |
| A | `status-give-back` | `#84740C` |
| S (system) | `status-waiting` | fallback |

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
- **CSS inject cross-origin:** không dùng `stylesheet.cssRules` để copy CSS sang parent — bị chặn. Hardcode CSS string trực tiếp trong `moveNotifButtons()`
- **`notifSetReadFilter`** chỉ dùng được trong JSX drawer — gọi từ TC page gây `querySelectorAll` null
- **`#ni-dropdown` phải `position:fixed`** — không phải `absolute`. Top tính từ `r.bottom + 4` (không cộng `scrollY`)
- **`#nba-menu` không có inline onmouseenter/onmouseleave** — sau khi move sang parent.document, attribute chạy trong parent.window scope gây `ReferenceError`
- **`onclick` trên `.ni` row bắt buộc** — thiếu `onclick="notifItemClick(event, this)"` thì click không navigate
- **Bỏ JOIN `app_users` và `menus` khỏi TC SQL** — `app_users` là remote DBLINK (tốn kém), `menus` không dùng cột nào

## Setup đầy đủ

Xem `docs/setup.md`.
