# APEX Patterns

## CSS Theming — Map vào design token hệ thống

CSS của chat (`chat-system/chat-page.css` scope `#chat-root`, `doc-chat/doc-chat.css` scope `#doc-chat-root`) **không hardcode màu**. Bảng màu cục bộ được khai báo MỘT chỗ (khối biến đầu file) rồi map vào token toàn hệ thống ERP, có fallback:

| Biến cục bộ | Map sang token hệ thống |
|-------------|-------------------------|
| `--primary` / `-600` / `-700` | `var(--primary-color, #15674C)` |
| `--primary-50` / `-100`, `--surface-active` | `var(--fourth-color, #E1F0EB)` |
| `--surface` | `var(--white-color, #FFFFFF)` |
| `--border` / `--border-2` | `var(--border-color, #E6E6E6)` |
| `--danger` | `var(--red-color, #D81F25)` |
| `--info` / `--info-50` | `var(--blue-color)` / `var(--blue-light-color)` |
| `--warning` / `--away` | `var(--orange-color, #ECA12B)` |
| `--online` | `var(--green-color, #319574)` |
| `--sh-*` (box-shadow) | nền đen mềm `rgba(0,0,0,…)` |

Quy ước bổ sung:
- **Focus glow** dùng `box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color, #15674C) 15%, transparent)` — đúng công thức focus của hệ thống (không dùng `rgba()` xanh cứng).
- **Active state** (chip/tab/item) dùng bộ 3 dòng: `color: var(--primary-color)`, `background-color: var(--fourth-color)`, `border-color: var(--a-button-state-border-color, var(--a-button-type-border-color, var(--a-button-border-color)))`.
- **Avatar nhóm/chứng từ** dùng nền phẳng `var(--primary-color)` (không gradient). Avatar per-user vẫn dùng `hsl(aus_id*47 % 360, 55%, 52%)`.
- **Type tabs "Nhắn tin/Tạo nhóm"** (`.emp-type-tab`, `.dc-type-tab`) là segmented control kiểu Claude: track `--bg-2`, tab active = thẻ `--surface` + shadow mảnh.
- Đổi màu toàn module → sửa **khối biến đầu file**, không sửa rải rác từng rule.

## Page Item Naming Convention — Critical

**Tất cả APEX page** khai báo trong **Function and Global Variable Declaration**:

```javascript
var pageId = $v('pFlowStepId');
```

Page items đặt tên theo pattern `P${pageId}_ITEM_NAME`. Ví dụ trên page 10022710201:
- `P10022710201_DOC_TYPE`, `P10022710201_CONV_ID`, `P10022710201_MSG_BODY`...

Trong JavaScript, luôn dùng:
```javascript
// Đọc
$v('P' + pageId + '_CONV_ID')

// Ghi
$s('P' + pageId + '_CONV_ID', value)
// hoặc APEX 24.x:
apex.item('P' + pageId + '_CONV_ID').setValue(value)
```

**Không dùng** `$v('P_CONV_ID')` (thiếu pageId prefix) — items không tìm thấy.

---

## Navigation — Opening Pages / Dialogs from JavaScript

### Problem

`apex.util.makeApplicationUrl()` with `itemNames`/`itemValues` does **not** generate an SSP checksum → `APEX.SESSION_STATE.SSP_CHECKSUM_MISSING`. Checksum can only be generated server-side.

### Solution — `redirect_page` Application Process

```sql
DECLARE
  l_url     VARCHAR2(2000);
  l_app     NUMBER := v(apex_application.g_x03);   -- reads APP_ID from item named by g_x03
  l_session NUMBER := v('APP_SESSION');
BEGIN
  l_url := APEX_UTIL.PREPARE_URL(
               p_url           => 'f?p=' || l_app
                                  || ':' || apex_application.g_x01   -- page ID
                                  || ':' || l_session
                                  || '::NO::'
                                  || apex_application.g_x02,         -- ITEM_NAMES:ITEM_VALUES
               p_checksum_type => 'SESSION');
  HTP.p(l_url);
END;
```

| Param | Content |
|-------|---------|
| `x01` | Target page ID |
| `x02` | `ITEM1,ITEM2:val1,val2` — APEX f?p item format (position 7:8) |
| `x03` | Name of application item that holds APP_ID (e.g. `'G_APP_1303_ID'`) |

**JavaScript usage (`globalHandleAjaxProcess` helper):**

```javascript
var triggerEl = this.triggeringElement;   // capture before await — DA context invalid after async

// Navigate current page:
let url = await globalHandleAjaxProcess(['redirect_page', { x01: pageId, x02: 'ITEM:val', x03: 'G_APP_XXXX_ID' }, 'text']);
apex.navigation.redirect(url);

// Open Modal Dialog:
let url = await globalHandleAjaxProcess(['redirect_page', { x01: pageId, x02: 'ITEM:val', x03: 'G_APP_XXXX_ID' }, 'text']);
apex.navigation.dialog(url, { title, height, width, modal: true, resizable: false }, null, triggerEl);
```

**sessionStorage for complex values:** item values containing commas, Unicode, or JSON arrays → store in `sessionStorage` and pass only simple IDs/codes through `x02`.

## ORDS Findings & Constraints

- **URL pattern:** `/ords/dev/` (schema APEX_DEV, mapping `dev` — not `/dev24/`)
- **Cannot call ORDS directly from browser** — global ORDS config requires auth, returns 403. Use `apex.server.process` instead.
- **Parameter Source Types in APEX 24.2 RESTful Services:** only `HTTP Header` and `URI`. Query string params (`:bind_var` in SQL) are auto-bound by ORDS — do not declare them; if declared as HTTP Header, ORDS binds NULL.

## UI Utility Patterns

### moveDrawerButtons — Inline Dialog

Content is in the same document (not iframe):

```javascript
function moveDrawerButtons() {
    var $dialog   = apex.jQuery('#Fm_Cle').closest('.ui-dialog');
    var $closeBtn = $dialog.find('.ui-dialog-titlebar-close');
    if ($dialog.data('drawer-btns-moved')) return;

    var $wrapper = apex.jQuery('<span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px;vertical-align:middle;"></span>');
    $wrapper.append(apex.jQuery('#Btn_Delete')).append(apex.jQuery('#Btn_Save_Cle'));
    $closeBtn.before($wrapper);
    $dialog.data('drawer-btns-moved', true);
}
```

### moveDrawerButtons — iframe Dialog (proxy pattern)

Content loads in `<iframe>` — cannot move DOM cross-frame. Clone buttons as proxies:

```javascript
function moveDrawerButtons() {
    var $iframe   = apex.jQuery('.ui-dialog iframe').first();
    if (!$iframe.length) return;
    var $dialog   = $iframe.closest('.ui-dialog');
    var $closeBtn = $dialog.find('.ui-dialog-titlebar-close');
    if ($dialog.data('drawer-btns-moved')) return;

    var iframeDoc = $iframe[0].contentDocument;
    if (!iframeDoc || iframeDoc.readyState !== 'complete') return;

    var $wrapper = apex.jQuery('<span style="display:inline-flex;align-items:center;gap:4px;margin-right:6px;vertical-align:middle;"></span>');
    ['Btn_Delete', 'Btn_Save_Cle'].forEach(function(id) {
        var srcBtn = iframeDoc.getElementById(id);
        if (!srcBtn) return;
        var $proxy = apex.jQuery(srcBtn.cloneNode(true));
        $proxy[0].style.display = srcBtn.style.display;
        $proxy.on('click', function() { iframeDoc.getElementById(id).click(); });
        // Sync $x_Show/$x_Hide visibility changes
        new MutationObserver(function() { $proxy[0].style.display = srcBtn.style.display; })
            .observe(srcBtn, { attributes: true, attributeFilter: ['style'] });
        $wrapper.append($proxy);
    });
    if (!$wrapper.children().length) return;
    $closeBtn.before($wrapper);
    $dialog.data('drawer-btns-moved', true);
}
```

Call after the iframe has fully loaded. The `data` attribute guard makes it idempotent.

### watchRdsTabs — APEX 24.2 Region Display Selector

Do NOT use `click` event — APEX RDS intercepts it internally. Use `MutationObserver` on `aria-selected`:

```javascript
function watchRdsTabs(callback) {
    var rdsLinks = document.querySelectorAll('#rds .a-RDS-link');
    if (!rdsLinks.length) return;
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(m) {
            if (m.target.getAttribute('aria-selected') === 'true') {
                callback(m.target.getAttribute('href').replace('#', '')); // e.g. 'Fm_Cle'
            }
        });
    });
    rdsLinks.forEach(function(link) {
        observer.observe(link, { attributes: true, attributeFilter: ['aria-selected'] });
    });
    return observer;
}

// Null guard needed — aria-selected may not be set yet at $(document).ready
function getActiveTab() {
    var href = apex.jQuery('#rds .a-RDS-link[aria-selected="true"]').attr('href');
    return href ? href.replace('#', '') : null;
}
```

## APEX JSX Critical Rules

### 1. Every `<button>` must have `type="button"`

APEX wraps the entire page in `<form id="wwvFlowForm">`. Any button without explicit type defaults to `type="submit"` → full page reload on click.

```jsx
// Wrong:
<button className="icon-btn" onClick={fn}>...</button>
// Correct:
<button type="button" className="icon-btn" onClick={fn}>...</button>
```

### 2. Use `click` (not `mousedown`) for outside-click detection

`mousedown` fires before `click` — menu unmounts before React's synthetic `click` fires on the item.

```javascript
document.addEventListener('click', closeHandler);      // correct
// Also add to menu element:
onClick={e => e.stopPropagation()}
```

### 3. `.chat-pane` must have `flex: 1; overflow: hidden`

```css
.chat-pane { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
```

Any scroll container that expands with content instead of scrolling — walk up the ancestor chain for the flex item missing `flex: 1` + `min-height: 0`.

### 4. CSS vs JSX deployment in APEX

- **CSS files** (`styles.css`, `page-styles.css`): paste into Page → CSS → Inline (≤32KB)
- **JSX files**: must be Static Application Files — contain JSX syntax requiring `Babel.transform()` at runtime
