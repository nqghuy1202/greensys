# Chat System → Native APEX Conversion Plan

## Bối cảnh

Chuyển Chat System (Messenger page) từ React/JSX/Babel sang **native APEX** (vanilla JS + HTML-returning PL/SQL callbacks) — cùng pattern với Doc Chat Modal (page 10022710201).

**Rule kiến trúc bất biến:**
- Application Process + global.js → **chỉ** cho tính năng toàn hệ thống (Page 0: `appEvents`, `chatHeartbeat`)
- Feature của page nào → Ajax Callback trên **chính page đó**, JS gọi với `pageId: window.pageId`

---

## Cập nhật 2026-06-02 — Compose inline (giống doc-chat)

Soạn tin mới trong chat-system đã chuyển từ **modal overlay** sang **inline screen-swap** y hệt doc-chat:
- `openCompose/closeCompose` ([chat-page.js](../chat-system/chat-page.js)) ẩn `#cs-list-screen` / hiện `#cs-compose-screen` trong cùng cột trái (không còn `.open` overlay + backdrop).
- 2 nút riêng `#cs-btn-dm` ("Nhắn tin") và `#cs-btn-group` ("Tạo nhóm") ở footer list-screen (`.cs-list-actions`). `#cs-btn-compose` ở head giữ lại → mở DM.
- Compose-screen có head (back/close/title) · body (type tabs + group fields + search + member list) · foot (cancel/submit).
- CSS: bỏ `#cs-compose-screen{position:fixed}` + `.emp-modal`; thêm `.cs-compose`, `.cs-compose-head/body/foot`, `.cs-list-actions`.
- **Backend không đổi** — 4 HTML callbacks + `chatContactsHtml` (chỉ render member list) giữ nguyên.
- Skeleton HTML mới: xem mục [Layout skeleton](#layout-skeleton-3-pane) bên dưới (đã cập nhật).

> Deploy: chỉ cần cập nhật lại **Static Content region** (skeleton), **CSS Inline** và **Execute when Page Loads** (chat-page.js). Callbacks không phải tạo lại.

---

## Trạng thái hiện tại (sau session 2026-06-01)

### Đã hoàn thành (local files)

| File | Thay đổi |
|------|---------|
| `docs/chat_apex_callbacks_v2.sql` | `chatConvList/MsgList/MemberList`: VARCHAR2→CLOB + chunked output; thêm `WHERE doc_type IS NULL`; `chatSend` thêm `username`; `chatCreate/Read/Typing` thêm `Connection: close`; header comment đúng rule |
| `doc-chat/doc-chat-page.js` | 6 setter `$v()` → `$s()` |
| `chat-server/chat.js` | Xóa dead endpoint `POST /heartbeat/:aus_id` |
| `chat-system/page-app.jsx` | `apexCall()` thêm `pageId: window.pageId` |
| `docs/claude/02-chat-system.md` | Cập nhật rule: page-level callbacks, không Application Process |
| `docs/claude/07-pitfalls.md` | Cập nhật rule pageId |

### Chờ deploy lên APEX

1. Xóa 8 Application Processes cũ của Chat System trong Shared Components
2. Tạo lại 8 callbacks trực tiếp trên Messenger page (Page → Ajax Callbacks):
   `chatConvList`, `chatMsgList`, `chatMemberList`, `chatContactList`, `chatSend`, `chatCreate`, `chatRead`, `chatTyping`
   - SQL: copy từ `docs/chat_apex_callbacks_v2.sql`
3. Paste `global.js` vào `Shared Components → Themes → [Theme] → JavaScript`
4. Update `doc-chat-page.js` trên APEX page 10022710201

---

## Kế hoạch chuyển đổi sang Native APEX

### Files cần tạo mới

| File | Mô tả |
|------|-------|
| `chat-system/chat-page.js` | Vanilla JS thay toàn bộ JSX (~500-600 dòng) |
| `chat-system/chat-page.css` | CSS scoped `#chat-root` |
| `docs/chat-system-native.sql` | HTML-returning + action callbacks (page-level) |

### Files JSX có thể archive sau khi xong

```
_archive/chat-system-jsx/
  page-app.jsx, page-main.jsx, page-list.jsx, page-compose.jsx
  chat-thread.jsx, info-panel.jsx, icons.jsx, tweaks-panel.jsx
  conversation-list.jsx, empty-state.jsx, page-rail.jsx, page-rail.jsx
  app.jsx, erp-bg.jsx
```

---

## Layout skeleton (3-pane)

```html
<div id="chat-root">

  <!-- ═══ SIDEBAR ═══════════════════════════════════════════════════════ -->
  <aside class="chat-sidebar">

    <!-- Screen 1: Danh sách hội thoại -->
    <div id="cs-list-screen" class="cs-screen">

      <div class="cs-sidebar-head">
        <div class="cs-search-wrap">
          <span class="fa fa-search"></span>
          <input type="text" id="cs-search" placeholder="Tìm kiếm hội thoại..."/>
        </div>
        <button type="button" id="cs-btn-compose" title="Nhắn tin mới">
          <span class="fa fa-edit"></span>
        </button>
      </div>

      <div class="lp-filter-row">
        <!-- Type dropdown -->
        <div class="lp-type-dd" id="cs-type-dd">
          <span class="label-prefix">Loại:</span>
          <span id="cs-type-label">Tất cả</span>
          <span class="count-pill" id="cs-type-count" style="display:none"></span>
          <span class="fa fa-chevron-down ico-chev"></span>
          <div class="lp-type-menu" id="cs-type-menu" style="display:none">
            <div class="lp-type-menu-item selected" data-type="all">
              <div class="ico all"><span class="fa fa-th-large"></span></div>
              <span class="lbl">Tất cả</span>
              <span class="cnt" id="cs-cnt-all"></span>
            </div>
            <div class="lp-type-menu-item" data-type="dm">
              <div class="ico dm"><span class="fa fa-user"></span></div>
              <span class="lbl">Cá nhân</span>
              <span class="cnt" id="cs-cnt-dm"></span>
            </div>
            <div class="lp-type-menu-item" data-type="group">
              <div class="ico group"><span class="fa fa-users"></span></div>
              <span class="lbl">Nhóm</span>
              <span class="cnt" id="cs-cnt-group"></span>
            </div>
            <div class="lp-type-menu-item" data-type="doc">
              <div class="ico doc"><span class="fa fa-file-text-o"></span></div>
              <span class="lbl">Chứng từ</span>
              <span class="cnt" id="cs-cnt-doc"></span>
            </div>
          </div>
        </div>
        <!-- Quick chips -->
        <span class="lp-quick-chip" data-quick="unread">Chưa đọc</span>
        <span class="lp-quick-chip" data-quick="pinned">
          <span class="fa fa-thumb-tack" style="font-size:10px"></span> Ghim
        </span>
        <span class="lp-quick-chip" data-quick="mention">@Tôi</span>
      </div>

      <div id="cs-conv-list"><div class="cs-loading">Đang tải...</div></div>

      <!-- 2 nút riêng (giống doc-chat): Nhắn tin / Tạo nhóm -->
      <div class="cs-list-actions">
        <button type="button" class="btn-ghost"   id="cs-btn-dm">
          <span class="fa fa-user"></span> Nhắn tin
        </button>
        <button type="button" class="btn-primary" id="cs-btn-group">
          <span class="fa fa-users"></span> Tạo nhóm
        </button>
      </div>

    </div><!-- /#cs-list-screen -->

    <!-- Compose screen: INLINE — swap với list-screen trong cùng cột trái. -->
    <div id="cs-compose-screen" class="cs-screen cs-compose" style="display:none">

      <!-- Header: back + tiêu đề (JS set theo loại) + đóng -->
      <div class="cs-compose-head">
        <button type="button" class="icon-btn" id="cs-compose-back" title="Quay lại">
          <span class="fa fa-arrow-left"></span>
        </button>
        <span class="cs-compose-title" id="cs-compose-title">Nhắn tin mới</span>
        <button type="button" class="icon-btn" id="cs-compose-close" title="Đóng">
          <span class="fa fa-times"></span>
        </button>
      </div>

      <!-- Body: type tabs + group fields + search + member list -->
      <div class="cs-compose-body">

        <div class="emp-type-tabs">
          <button type="button" class="emp-type-tab active" data-conv-type="DM">
            <span class="fa fa-user"></span> Nhắn tin
          </button>
          <button type="button" class="emp-type-tab" data-conv-type="CHANNEL">
            <span class="fa fa-users"></span> Tạo nhóm
          </button>
        </div>

        <!-- Group-only fields (ẩn khi DM) -->
        <div id="cs-group-fields" style="display:none">
          <div class="form-field" style="gap:4px">
            <label class="form-label">Tên nhóm</label>
            <input type="text" id="cs-create-name" class="form-input" placeholder="VD: Phòng Kinh doanh, Triển khai dự án X..."/>
          </div>
          <div class="form-field" style="gap:4px">
            <label class="form-label">Thành viên đã chọn (<span id="cs-selected-count">0</span>)</label>
            <div class="emp-selected-row empty" id="cs-selected-chips"></div>
          </div>
        </div>

        <!-- Search -->
        <div class="list-search">
          <span class="fa fa-search"></span>
          <input type="text" id="cs-contact-search" placeholder="Tìm theo tên hoặc phòng ban..."/>
        </div>

        <!-- Employee list (filled by chatContactsHtml) -->
        <div class="emp-modal-list" id="cs-member-suggest-list">
          <div class="cs-loading">Đang tải...</div>
        </div>

      </div><!-- /.cs-compose-body -->

      <!-- Footer: Huỷ + nút chính (số đếm cập nhật bằng JS) -->
      <div class="cs-compose-foot">
        <button type="button" class="btn-ghost" id="cs-compose-cancel">Huỷ</button>
        <button type="button" class="btn-primary" id="cs-btn-create" disabled>
          <span class="fa fa-paper-plane" id="cs-create-icon"></span>
          <span id="cs-create-label">Bắt đầu trao đổi</span>
        </button>
      </div>

    </div><!-- /#cs-compose-screen -->

  </aside><!-- /.chat-sidebar -->

  <!-- ═══ THREAD ════════════════════════════════════════════════════════ -->
  <main class="chat-thread" id="cs-thread">

    <div class="cs-thread-head" id="cs-thread-head">
      <div class="cs-thread-info">
        <div class="cs-thread-title" id="cs-thread-title">Chọn hội thoại</div>
      </div>
      <div class="cs-thread-actions">
        <button type="button" class="icon-btn" id="cs-btn-info" title="Thông tin">
          <span class="fa fa-info-circle"></span>
        </button>
      </div>
    </div>

    <div id="cs-messages">
      <div class="cs-empty-state">← Chọn hội thoại để bắt đầu</div>
    </div>

    <div id="cs-typing" class="cs-typing-row" style="display:none"></div>

    <div id="cs-compose-area" class="cs-composer-wrap" style="display:none">
      <div id="cs-reply-banner" class="cs-reply-banner" style="display:none">
        <div style="flex:1">↩ <span id="cs-reply-preview" class="preview"></span></div>
        <button type="button" class="icon-btn" id="cs-reply-cancel">×</button>
      </div>
      <div class="cs-composer" id="cs-composer">
        <textarea id="cs-msg-input" class="cs-composer-input" placeholder="Nhập tin nhắn… (Ctrl+Enter)" rows="1"></textarea>
        <div class="cs-composer-bottom">
          <button type="button" class="btn-primary" id="cs-btn-send">
            <span class="fa fa-paper-plane"></span> Gửi
          </button>
        </div>
      </div>
    </div>

  </main><!-- /.chat-thread -->

  <!-- ═══ INFO PANE ═══════════════════════════════════════════════════ -->
  <aside class="chat-info" id="cs-info-pane">
    <div id="cs-info-content"><div class="cs-loading">Đang tải...</div></div>
  </aside>

</div><!-- /#chat-root -->
```

---

## SQL Callbacks cần viết (`docs/chat-system-native.sql`)

### HTML-returning (mới — thay thế JSON callbacks)

| Callback | x01 | x02 | x03 | x04 | Returns |
|----------|-----|-----|-----|-----|---------|
| `chatConvListHtml` | filter (ALL/DM/GROUP/DOC) | search | — | — | HTML conv list |
| `chatMsgThreadHtml` | conv_id | before_id (load more) | — | — | HTML messages |
| `chatMembersHtml` | conv_id | — | — | — | HTML info panel |
| `chatContactsHtml` | conv_type (DM/CHANNEL) | — | — | — | HTML contacts picker |

### Action-only (giữ nguyên từ `chat_apex_callbacks_v2.sql`)

| Callback | x01 | x02 | x03 | x04 | Relay Node? |
|----------|-----|-----|-----|-----|-------------|
| `chatSend` | conv_id | body | reply_to_msg_id | partner_aus_id | **Yes** POST /api/chat/send |
| `chatCreate` | conv_type | name | members JSON | — | **Yes** POST /api/chat/create |
| `chatRead` | conv_id | — | — | — | **Yes** POST /api/chat/read |
| `chatTyping` | conv_id | — | — | — | **Yes** POST /api/chat/typing |

---

## JS Structure (`chat-system/chat-page.js`)

```javascript
(function($) {
  'use strict';

  var PAGE_ID      = window.pageId;   // set in "Function and Global Variable Declaration"
  var AUS_ID       = Number(window.CHAT_AUS_ID || 0);
  var activeConvId = null;
  var activeTab    = 'all';           // all | dm | group | doc
  var showInfo     = true;
  var isSending    = false;
  var lastSentAt   = 0;
  var typingUsers  = {};
  var typingTimers = {};

  // ── APEX helpers ──────────────────────────────────────────────
  function csHtml(proc, params, targetId, onDone) { /* dcHtml pattern */ }
  function csJson(proc, params, onSuccess, onError) { /* dcJson pattern */ }

  // ── Data loaders ──────────────────────────────────────────────
  function loadConvList(onDone) { /* chatConvListHtml */ }
  function loadThread() { /* chatMsgThreadHtml */ }
  function loadInfo() { /* chatMembersHtml */ }
  function loadContacts(convType, onDone) { /* chatContactsHtml */ }

  // ── Actions ───────────────────────────────────────────────────
  function selectConv(convId) { /* highlight + loadThread + loadInfo + chatRead */ }
  function sendMessage() { /* chatSend */ }
  function openCompose(convType) { /* show compose screen */ }
  function closeCompose() { /* show list screen */ }
  function submitCreate() { /* chatCreate */ }

  // ── Real-time (same pattern as doc-chat-page.js) ──────────────
  var $eventDoc = (window.parent && window.parent !== window)
                  ? $(window.parent.document) : $(document);
  function onChatEvent(_, ev) { /* message/typing/typing_stop/read */ }
  $eventDoc.on('apex:chatEvent', onChatEvent);

  // ── Rail navigation ───────────────────────────────────────────
  $(document).on('click', '.rail-tab[data-tab]', function() {
    activeTab = $(this).data('tab');
    loadConvList();
  });

  // ── Event bindings ────────────────────────────────────────────
  // ... (delegated events for conv selection, send, reply, compose, etc.)

  // ── Public API ────────────────────────────────────────────────
  window.csSelectConv  = selectConv;
  window.csOpenCompose = openCompose;
  window.csSendMessage = sendMessage;

  // ── Init ──────────────────────────────────────────────────────
  $(document).ready(function() {
    loadConvList();
    loadInfo();
  });

})(apex.jQuery);
```

---

## APEX Page Setup (Messenger page)

### Function and Global Variable Declaration
```javascript
var pageId = $v('pFlowStepId');
```

### Execute when Page Loads
```javascript
window.CHAT_AUS_ID = &G_AUS_ID.;
// Paste nội dung chat-system/chat-page.js ở đây
```

### Static Content Region
- ID: `chat-root`
- Source: paste skeleton HTML ở trên

### CSS → Inline
- Paste nội dung `chat-system/chat-page.css`

### Ajax Callbacks (tạo trực tiếp trên page)
- `chatConvListHtml`, `chatMsgThreadHtml`, `chatMembersHtml`, `chatContactsHtml`
- `chatSend`, `chatCreate`, `chatRead`, `chatTyping`

---

## PL/SQL patterns tham chiếu

### HTML callback pattern (giống `dcConvListHtml`)
```sql
DECLARE
  l_aus_id  NUMBER;
  l_filter  VARCHAR2(20) := NVL(NULLIF(TRIM(apex_application.g_x01),''), 'ALL');
  l_search  VARCHAR2(200) := TRIM(apex_application.g_x02);
BEGIN
  OWA_UTIL.MIME_HEADER('text/html', TRUE, 'UTF-8');
  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('<div class="cs-error">Phiên làm việc hết hạn</div>'); RETURN;
  END IF;
  SELECT aus_id INTO l_aus_id FROM APP_USERS
  WHERE LOWER(user_name) = LOWER(:APP_USER);
  -- build HTML...
  HTP.p(html);
END;
```

### Avatar color (consistent với Doc Chat)
```sql
-- PL/SQL: 'hsl(' || MOD(aus_id * 47, 360) || ',55%,52%)'
-- JS:     'hsl(' + (ausId * 47 % 360) + ',55%,52%)'
```

### MATERIALIZE pattern (remote tables APP_USERS, EMPLOYEES)
```sql
WITH remote AS (
  SELECT /*+ MATERIALIZE */
         u.aus_id, NVL(e.full_name, 'Unknown') AS full_name, u.user_name
  FROM   APP_USERS u JOIN EMPLOYEES e ON e.emp_id = u.emp_id
  WHERE  ...
)
SELECT REGEXP_REPLACE(r.full_name, '[[:cntrl:]]', '') FROM remote r ...
```

---

## Tham chiếu

- Doc Chat implementation: `doc-chat/doc-chat-page.js`, `docs/doc-chat-native.sql`
- Node.js API: `chat-server/chat.js` (endpoints `/api/chat/*`)
- Architecture rules: `docs/claude/07-pitfalls.md`
- DB schema: `docs/claude/04-oracle-db.md`
