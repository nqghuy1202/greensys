# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mục đích dự án

Notification Drawer Panel cho hệ thống ERP APEX Oracle 24.2. Tích hợp vào **Page 0** (Global Page) — hiển thị trên mọi page của app. Đã hoàn thành cả UI tĩnh lẫn React component; đang ở giai đoạn tích hợp APEX.

## Cách xem UI

Mở trực tiếp trong browser (double-click hoặc drag vào browser):

```
src/notification-page.html   — trang thông báo full page (bản chính)
src/notif-item-demo.html     — demo 1 item đơn lẻ + hover effect
Notification Slide Panel v3.html — bản gốc React/JSX để tham khảo thiết kế
```

Không cần build, không cần server.

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

**Luồng khởi tạo React:**
1. `notif-panel.fgvd.js` khai báo `window.notifOpen/Close/Toggle/notifLoadJSX`
2. `notif-panel.onload.js` gọi `window.notifLoadJSX()` — fetch JSX file, Babel transform, `new Function()` execute
3. JSX mount `<NotifPanel/>` vào `#notif-root` (idempotent: kiểm tra `container._notifRoot`)
4. Component expose `window.notifRefresh = loadData` cho SSE handler gọi khi có notification mới

**SSE integration:** Sau khi SSE source khởi tạo (trong global JS), gọi `window.notifSSEInit(sseSource)` — lắng nghe event `notification_new`, cập nhật badge + refresh nếu drawer đang mở.

**Tất cả Ajax Callback đặt `pageId: 0`** — callbacks nằm trên Page 0.

## Cấu trúc file

| File | Mục đích |
|------|---------|
| `src/notification-page.html` | Bản HTML+CSS thuần — preview UI, paste một phần vào APEX |
| `src/notif-item-demo.html` | Demo item đơn, tách riêng để test hover/style |
| `src/notif-panel.html` | HTML structure của drawer — paste vào Static Content region Page 0 |
| `src/notif-panel.css` | CSS scope `#notif-root` — paste vào Page 0 CSS Inline |
| `src/notif-panel.fgvd.js` | FGVD Page 0 — drawer toggle, badge update, JSX loader, SSE hook |
| `src/notif-panel.onload.js` | Execute when Page Loads — gọi `notifLoadJSX()` |
| `src/notif-panel.jsx` | React component chính — upload lên Static Application Files |
| `src/notif-callbacks.sql` | 4 APEX Ajax Callback PL/SQL |
| `docs/setup.md` | Hướng dẫn tích hợp APEX step-by-step + checklist |
| `Notification Slide Panel v3.html` | Bản thiết kế gốc React — nguồn màu sắc & layout |

## Quy tắc thiết kế

**Font:** `'Plus Jakarta Sans'` — load từ Google Fonts.

**Status colors** — 9 loại, lấy từ `globalHighLightFunction` của hệ thống ERP:

| Class | Status | Màu chữ | Màu nền |
|-------|--------|---------|---------|
| `.s-W` | Chờ duyệt | `#F18812` | `#FFE5C7` |
| `.s-N` | Đã duyệt  | `#31956D` | `#E1F0EA` |
| `.s-Y` | Phê duyệt | `#0C34FF` | `#DFE4FF` |
| `.s-R` | Từ chối   | `#FB132F` | `#F4C5CB` |
| `.s-A` | Bổ sung   | `#9D8307` | `#DFE9A8` |
| `.s-C` | Hết hạn   | `#3D403E` | `#CECFCE` |
| `.s-L`/`.s-F` | Bổ sung | `#5100B2` | `#D2C2E6` |
| `.s-I` | Xử lý    | `#D100BC` | `#ECC2E8` |
| `.s-O` | Đang xử lý | `#0091F7` | `#D9EFFF` |

CSS dùng CSS custom properties (`--status-dot`, `--s-c`, `--s-bg`, `--s-bd`) set tại class `.s-*` trên `.notif-item` / `.np-card`.

**Item states:**
- Unread: thêm class `unread`, `border-left` màu theo status, background `#FAFDF9`
- Read: không có class `unread`, `border-left: #EBEBEB`, background `#fff`
- Hover: time fade out (`opacity: 0`), action buttons slide in từ phải

## JSX Component — notif-panel.jsx

`NotifPanel` là React component duy nhất, gồm:
- `NotifItem` — 1 notification card với hover actions (Xem / Đọc / Xóa)
- `SectionLabel` — sticky date group header (HÔM NAY / HÔM QUA / TUẦN TRƯỚC…)
- `EmptyState` — loading spinner + empty/filtered states

**State management:** local React state, optimistic updates (UI cập nhật ngay, sau đó mới gọi server).

**`handleView`** hiện dùng `n.target_url` — chưa có mapping `owner_table_name → page_id`. Khi bổ sung: thêm field `target_page_id` vào query `notifLoad`, dùng `redirect_page` Application Process.

## Khi paste vào APEX

Xem `docs/setup.md` cho hướng dẫn đầy đủ. Tóm tắt nhanh:
- `src/notif-panel.html` → Static Content region Page 0 (After Header)
- `src/notif-panel.css` → Page 0 → CSS → Inline
- `src/notif-panel.fgvd.js` → Page 0 → Function and Global Variable Declaration
- `src/notif-panel.onload.js` → Page 0 → Execute when Page Loads
- 4 Ajax Callback từ `notif-callbacks.sql` → Page 0 → Processing
- `notif-panel.jsx` → upload lên Shared Components → Static Application Files

**Lưu ý APEX bắt buộc:**
- Mọi `<button>` đã có `type="button"` — tránh submit `wwvFlowForm`
- `JSON_ARRAYAGG ... RETURNING CLOB` — bắt buộc khi list > ~10 items
- `/*+ MATERIALIZE */` khi query `app_users` (remote table qua DBLINK)

## DOM Manipulation Patterns (APEX)

### Move button vào dialog titlebar — Modal Drawer (iframe page)

Khi dialog là **modal drawer load page riêng trong iframe**, không dùng `dialogopen` event. Thay vào đó, đặt code trên **page con** (page được load trong drawer) và truy cập DOM của parent qua `window.parent.document`:

**FGVD (page con):**
```javascript
const moveNotifButtons = () => {
    const $parent   = $(window.parent.document);
    const $dialog   = $parent.find('.ui-dialog').filter(':visible').first();
    const $closeBtn = $dialog.find('.ui-dialog-titlebar-close');
    if (!$closeBtn.length || $dialog.data('notif-btns-moved')) return;

    const $btn = $('#Btn_Read_All').detach();
    if (!$btn.length) return;

    const $wrapper = $('<span>').css({ display: 'inline-flex', alignItems: 'center', gap: '4px', marginRight: '6px', verticalAlign: 'middle' });
    $wrapper.append($btn);
    $closeBtn.before($wrapper);
    $dialog.data('notif-btns-moved', true);
};
```

**Execute when Page Loads (page con):**
```javascript
moveNotifButtons();
```

**Điểm mấu chốt:**
- Detach button thật (không clone) → click hoạt động tự nhiên, không cần proxy
- `$dialog.data('notif-btns-moved', true)` — guard idempotent tránh duplicate
- `filter(':visible')` — tránh nhầm dialog ẩn khác trên trang

### Move IG toolbar actions button

```javascript
// Lên Breadcrumb region
const gMoveIGActionToBreadcrumb = (id) => {
    let b = $('#t_Body_title .t-BreadcrumbRegion-buttons.t-BreadcrumbRegion-buttons--end');
    let a = $(`#${id}_ig_toolbar_actions_button`).detach();
    let h = $(`#${id}_ig .a-IG-header`);
    if (!!b && !!a) { b.append(a); a.css('margin-left', '0.375rem'); h.css('display', 'none'); }
};

// Lên Region header
const gMoveIGActionToHeader = (id, idTo = id) => {
    let b = $(`#${idTo}>>.t-Region-headerItems.t-Region-headerItems--buttons`);
    let a = $(`#${id}_ig_toolbar_actions_button`).detach();
    let h = $(`#${id}_ig .a-IG-header`);
    if (!!b && !!a) {
        let m = b.find('span.js-maximizeButtonContainer');
        m.length ? (a.insertBefore(m), a.css('margin-left', '0.375rem')) : b.append(a);
        h.css('display', 'none');
    }
};
```

### Move items vào IG toolbar

```javascript
const globalMoveItemsToIG = (regionStaticId, items = []) => {
    const group = $(`#${regionStaticId}`).find('.a-Toolbar-groupContainer--end .a-Toolbar-group').first();
    if (!group.length) return;
    items.forEach(id => {
        const el = $(`#${id}`);
        if (!el.length || el[0].contains(group[0]) || group.find(`#${id}`).length) return;
        el.addClass('a-Button a-Toolbar-item');
        group.append(el.detach());
    });
};
```

## Data source

Query lấy từ bảng local (`app_notifications`, `user_notifications`, `approval_histories_headers`) join với `app_users` qua DBLINK. Xem `src/notif-callbacks.sql` và `docs/setup.md` để biết pattern MATERIALIZE cần thiết khi join remote table.

Field mapping SQL → UI:

| SQL column | UI field |
|-----------|---------|
| `ahh.status` | class `.s-{status}` trên card |
| `ano.ano_name` | `.notif-title` / `.np-card-title` |
| `ahh.doc_number` | `.notif-doc-link` / `.np-doc-link` |
| `jes.name` | `.np-sender` |
| `uno.read` (`'Y'`/`'N'`) | class `unread` trên card |
| `date_group_label` | section divider label |
