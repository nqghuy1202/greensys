# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Doc Chat Modal — Trao đổi chứng từ

Modal chat gắn với từng chứng từ ERP (SO, PXK, HD…). APEX Modal Dialog Page ID: **10022710201**. Deploy bằng **FGVD + Dynamic Action** — không React, không JSX, không Static Files.

> Module này hoàn toàn tách biệt với Chat System (Messenger). Khác app ID, khác page ID, khác bộ callbacks.

## Build Commands

```powershell
# Rebuild tailwind.min.css sau khi sửa doc-chat.html hoặc preview.html
cd D:\greensys\doc-chat
npm run build          # one-shot minified output → tailwind.min.css (~26KB)
npm run watch          # watch mode khi đang chỉnh CSS
```

Tailwind v4 CLI (`@tailwindcss/cli`). Config: `tailwind.input.css` với `@source` directives — `tailwind.config.js` là v3 format và bị bỏ qua bởi v4.

## Files

```
doc-chat/
  doc-chat-page.fgvd.js   ← DEPLOY: paste vào "Function and Global Variable Declaration"
  doc-chat-page.onload.js ← DEPLOY: paste vào "Execute when Page Loads" (1 dòng: window.dcInit())
  doc-chat.css            ← DEPLOY: paste vào Page → CSS → Inline
  doc-chat.html           ← DEPLOY: upload lên APEX Static Application Files
  tailwind.min.css        ← DEPLOY: upload lên APEX Static Application Files
  preview.html            ← Preview local — mở thẳng, không cần APEX
  docs/
    da-setup.md           ← ⚠️ OUTDATED (kể từ Nexus redesign) — selector names cũ
    native.sql            ← 4 HTML-returning callbacks (Nexus class names ✅)
    callbacks.sql         ← 8 callbacks (4 JSON-returning LEGACY + 4 action) — phần JSON-returning không còn dùng trong Nexus
```

## Kiến trúc Frontend

### Startup flow

```
dcInit()
  → đọc sessionStorage['docChatCtx'] (doc_type, doc_no, label, status, total)
  → $s() page items: P10022710201_DOC_TYPE, _DOC_NO, _DOC_LABEL…
  → fetch(apex.env.APP_IMAGES + 'doc-chat.html')  ← từ APEX Static Application Files
  → root.innerHTML = html; setupAfterInject(); loadConvList(); loadInfo()
```

`doc-chat.html` là toàn bộ HTML skeleton — KHÔNG hard-code vào APEX page, phải upload lên Static Application Files và fetch tại runtime. Dùng `apex.env.APP_IMAGES` (không phải `APP_FILES`) làm prefix.

### 3-panel layout

```
#doc-chat-root
  └── .dc-layout (display:flex)
        ├── .dc-left  (width:268px) — Left panel
        │     └── #lp-track  (slider, translateX per screen)
        │           ├── #lp-s1  Conversation list + filter tabs
        │           ├── #lp-s2  New DM — contact picker (.lp-cr items)
        │           ├── #lp-s3  Group — member multi-select (.gm-row items)
        │           └── #lp-s4  Group info form (name + create button)
        ├── .dc-center (flex:1)  — Messages + composer
        └── .dc-right  (width:272px) — Voucher card + members list
```

**Slider navigation:** `lpGoTo(n)` → `#lp-track { transform: translateX(-268px * n) }`. Không dùng display:none để ẩn screens.

### FGVD architecture (doc-chat-page.fgvd.js)

Toàn bộ logic trong một IIFE `(function($){...})(apex.jQuery)`. State vars: `activeConvId`, `activeFilter`, `showInfo`, `typingUsers/Timers`, `selectedMembers`, `isSending`.

**Hai binding giữ lại trong FGVD (không làm DA):**
- `$eventDoc.on('apex:chatEvent', onChatEvent)` — phải dùng jQuery của trang cha; DA không lấy được trigger payload
- `$(window).on('unload', …)` — cleanup handler khi modal đóng

**Public API (window.dcOn*)** — tất cả 25+ handler expose qua `window.*` để DA gọi được từ global scope.

### Cross-frame event binding

Doc Chat chạy trong **iframe** APEX modal. jQuery custom event không cross instances:

```javascript
// Sai — KHÔNG bao giờ được gọi:
$(document).on('apex:chatEvent', handler);

// Đúng (đã implement trong FGVD):
var $eventDoc = (eventWin.apex && eventWin.apex.jQuery)
  ? eventWin.apex.jQuery(eventWin.document) : $(document);
$eventDoc.on('apex:chatEvent', onChatEvent);
```

`global.js` trên trang cha trigger event: `apex.jQuery(parent.document).trigger('apex:chatEvent', ev)`.

## Ajax Callbacks (tất cả PAGE-LEVEL trên page 10022710201)

### HTML-returning (trả HTML, JS swap innerHTML)

| Callback | Params | Target element | File |
|---|---|---|---|
| `dcConvListHtml` | x01=doc_type, x02=doc_no, x03=filter, x04=search | `#lp-conv-list` | native.sql §1 |
| `dcMsgThreadHtml` | x01=conv_id, x02=search_query | `#dc-messages` | native.sql §2 |
| `dcInfoHtml` | x01=conv_id | `#dc-right-panel` | native.sql §3 |
| `dcContactsHtml` | x01=format(DM\|GROUP) | `#lp-s2-list` hoặc `#lp-s3-list` | native.sql §4 |

`dcInfoHtml` chỉ output shell HTML — JS `injectDocFields()` patch content từ `sessionStorage['docChatCtx']` sau khi load.

### Action callbacks

| Callback | Relay Node? | Notes |
|---|---|---|
| `docChatCreate` | No | DM dedup: tìm conv hiện có trước khi INSERT |
| `docChatSend` | Yes — POST /api/chat/send | Dùng `UTL_RAW.CAST_TO_RAW` + `Connection: close` |
| `docChatRead` | Yes — POST /api/chat/read/:conv_id/:aus_id | Fire-and-forget |
| `docChatTyping` | Yes — POST /api/chat/typing/:conv_id/:aus_id | Fire-and-forget |

**Tất cả POST relay sang Node.js phải có:**
```sql
UTL_HTTP.SET_HEADER(l_req, 'Connection', 'close');  -- bắt buộc, tránh request aborted
UTL_HTTP.WRITE_RAW(l_req, UTL_RAW.CAST_TO_RAW(l_payload));  -- không dùng WRITE_TEXT
```

```javascript
// Gọi callback từ FGVD — pageId hardcode 10022710201:
apex.server.process('dcMsgThreadHtml', { x01: convId }, {
    pageId: PAGE_ID,   // const PAGE_ID = 10022710201
    dataType: 'text',
    success: function(html) { document.getElementById('dc-messages').innerHTML = html; }
});
```

## Dynamic Actions — Selector chuẩn (Nexus)

**da-setup.md bị lỗi thời.** Selector thực tế trong FGVD (Nexus class names):

| DA | Event | jQuery Selector | window.dcOn* |
|---|---|---|---|
| 1 | Click | `.dc-conv-item[data-conv-id]` | `dcOnConvClick` |
| 2 | Click | `.dc-filter-tab[data-filter]` | `dcOnFilter` |
| 3 | Custom `input` | `#dc-conv-search` | `dcOnConvSearch` |
| 4 | Click | `#dc-btn-search-toggle` | `dcOnSearchToggle` |
| 5 | Custom `input` | `#dc-msg-search-input` | `dcOnMsgSearch` |
| 6 | Click | `#dc-btn-toggle-rp` | `dcOnToggleInfo` |
| 7 | Click | `.msg-action-btn[data-action="reply"]` | `dcOnReplyStart` |
| 8 | Click | `.dc-rp-close` | `dcOnReplyCancel` |
| 9 | Click | `#dc-send-btn` | `dcOnSend` |
| 10 | Key Down | `#dc-chat-input` | `dcOnMsgKeydown` |
| 11 | Custom `input` | `#dc-chat-input` | `dcOnMsgAutosize` (no-op) |
| 12 | Click | `.gm-row` | `dcOnMemberToggle` |
| 13 | Click | `.lp-gc-x` | `dcOnChipRemove` |
| 14 | Custom `input` | `#lp-s2-search, #lp-s3-search` | `dcOnContactSearch` |
| 15 | (no-op) | — | `dcOnTypeTab` |
| 16 | Click | pencil/compose btn in S1 header | `dcOnOpenDM` |
| 17 | Click | "Tạo nhóm" btn in S2 | `dcOnGoToGroupMembers` |
| 18 | Click | "Tiếp theo" btn in S3 | `dcOnGroupNext` |
| 19 | Click | `#lp-create-btn` | `dcOnSubmitCreate` |

Plus back buttons: `dcOnCloseCompose` / `dcOnGroupBack` / `dcOnGroupInfoBack`; DM contact click: `dcOnDMContactSelect`; group name input: `dcOnGroupNameInput`.

**Quy ước DA:** Selection Type = jQuery Selector, Event Scope = Dynamic, Static Container = `#doc-chat-root`, Fire on Init = No.

**Input là contenteditable** `#dc-chat-input` — đọc `innerText`, không phải `.value`.

## CSS Design System (doc-chat.css)

Scoped trong `#doc-chat-root`. Sửa màu chỉ qua khối `:root` đầu file — không sửa rải rác.

| Token | Map sang ERP |
|---|---|
| `--c-main` | `var(--primary-color, #15674C)` |
| `--c-tint` | `var(--fourth-color, #E1F0EB)` |
| `--c-border` | `color-mix(in srgb, var(--primary-color) 30%, transparent)` |
| `--n-50`…`--n-900` | Slate neutral scale |

Avatar: DM dùng `hsl(aus_id*47%360, 55%, 52%)` — inline style từ PL/SQL. Group/doc dùng nền phẳng `var(--c-main)`, không gradient.

## Deploy lên APEX — Checklist

1. Upload `doc-chat.html` → Shared Components → Static Application Files
2. Upload `tailwind.min.css` → Shared Components → Static Application Files
3. Page → JavaScript → File URLs:
   ```
   https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap
   #APP_FILES#tailwind.min.css
   ```
4. Page → CSS → Inline: paste `doc-chat.css`
5. Function and Global Variable Declaration: paste `doc-chat-page.fgvd.js`
6. Execute when Page Loads: paste `doc-chat-page.onload.js` (`window.dcInit();`)
7. Tạo Dynamic Actions theo bảng trên
8. Tạo 7 Ajax Callbacks trên page 10022710201 (xem native.sql + callbacks.sql)

## Page Items (hidden, trên page 10022710201)

| Item | Đọc/ghi từ JS |
|---|---|
| `P10022710201_DOC_TYPE` | `$v('P' + pageId + '_DOC_TYPE')` |
| `P10022710201_DOC_NO` | `$v('P' + pageId + '_DOC_NO')` |
| `P10022710201_CONV_ID` | `$s('P' + pageId + '_CONV_ID', convId)` |
| `P10022710201_REPLY_TO_MSG_ID` | reply context |
| `P10022710201_SEARCH_QUERY` | conv list search text |

## Mở Modal từ ERP Page

```javascript
var triggerEl = this.triggeringElement;   // capture TRƯỚC await
sessionStorage.setItem('docChatCtx', JSON.stringify({
    doc_type: 'SO', doc_no: 'SO-2601/010',
    doc_label: 'Đơn hàng bán', doc_status: '...', doc_total: '...'
}));
let url = await globalHandleAjaxProcess(['redirect_page', {
    x01: 10022710201,
    x02: 'P_DOC_TYPE,P_DOC_NO:SO,SO-2601/010',
    x03: 'G_APP_XXXX_ID'
}, 'text']);
apex.navigation.dialog(url, { title: '...', height: 860, width: 1480,
    modal: true, resizable: false }, null, triggerEl);
```

`sessionStorage` là bắt buộc vì doc fields chứa Unicode và dấu phẩy — không pass an toàn qua APEX URL params.

## PL/SQL Patterns bắt buộc

**Auth pattern (mọi callback):**
```sql
IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
  HTP.p('{"error":"auth"}'); RETURN;
END IF;
SELECT aus_id INTO l_aus_id FROM APP_USERS WHERE LOWER(user_name) = LOWER(:APP_USER);
```

**MATERIALIZE (mọi JOIN với remote tables APP_USERS/EMPLOYEES):**
```sql
WITH data AS (
  SELECT /*+ MATERIALIZE */
    u.aus_id,
    REGEXP_REPLACE(NVL(e.full_name,'Unknown'), '[[:cntrl:]]', '') AS full_name
  FROM APP_USERS u JOIN EMPLOYEES e ON e.emp_id = u.emp_id ...
)
```

**INTERVAL với remote tables — dùng PL/SQL variable:**
```sql
DECLARE l_online_cutoff TIMESTAMP := SYSTIMESTAMP - INTERVAL '35' SECOND;
-- dùng l_online_cutoff trong WHERE clause, không viết INTERVAL literal trong SQL
```

**conv_id/msg_id:** luôn explicit `CONV_SEQ.NEXTVAL` / `MSG_SEQ.NEXTVAL` trong INSERT. `RETURNING INTO` không hoạt động trong Application Process (ORA-22816) — lấy NEXTVAL vào biến trước.

## Pitfalls đặc thù module này

- **`docChatSend` POST relay:** thiếu `Connection: close` + `WRITE_RAW` → `BadRequestError: request aborted` ở Node.js.
- **Tailwind preflight:** safe vì doc-chat chạy trong iframe — không ảnh hưởng APEX trang cha.
- **Rebuild Tailwind:** sau khi thêm Tailwind utility class mới vào `doc-chat.html` hoặc `preview.html` phải chạy `npm run build` lại.
- **`scrollToBottom` sau 300ms:** `setTimeout(scrollToBottom, 300)` sau swap innerHTML — DOM cần render trước khi `scrollHeight` chính xác.
