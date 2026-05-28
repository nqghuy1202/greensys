# Doc Chat Modal (Trao đổi chứng từ)

Modal embedded in ERP pages (SO, PXK, HD…). Each document has its own conversation scope. APEX Modal Dialog Page ID: **10022710201**.

> **Lưu ý:** Doc Chat Modal (page 10022710201) và Chat System (Messenger page) là **hai page hoàn toàn tách biệt** — khác app ID, khác page ID, khác bộ Application Processes. Không nhầm lẫn giữa hai module.

## Data Loading Architecture

| Operation | Flow | Reason |
|-----------|------|--------|
| Load conversations, messages, members | `apex.server.process` → PL/SQL → DB direct | No Node.js relay; low latency |
| Send message | `apex.server.process` → UTL_HTTP → Node.js | Real-time push to waiters |
| Long-poll events | `apex.server.process` → UTL_HTTP → Node.js 25s | In-memory waiter queue |
| Typing, Read | `apex.server.process` → UTL_HTTP → Node.js | Node.js holds state |
| Create conversation | `apex.server.process` → PL/SQL → DB direct | No Node.js needed |

## Ajax Callbacks (page 10022710201 — 8 callbacks)

**All are page-level Ajax Callbacks** trên page 10022710201 (Processing → Ajax Callback). Full SQL with MATERIALIZE and INTERVAL fixes: `docs/doc-chat-callbacks.sql`.

Gọi từ `doc-chat-app.jsx` qua `apexCall()` với `pageId: 10022710201`. Hoạt động đúng vì JSX chạy trên chính page 10022710201 — không phải gọi cross-page.

| Callback | x01 | x02 | x03 | x04 | x05 | Relay Node? |
|----------|-----|-----|-----|-----|-----|-------------|
| `docChatConversations` | aus_id | doc_type | doc_no | — | — | No |
| `docChatMessages` | conv_id | before_id | limit | — | — | No |
| `docChatMembers` | conv_id | — | — | — | — | No |
| `docChatCreate` | conv_type | name | members (JSON) | doc_type | doc_no | No |
| `docChatSend` | conv_id | body | reply_to_msg_id | partner_aus_id | — | **Yes** |
| `docChatRead` | conv_id | — | — | — | — | **Yes** |
| `docChatTyping` | conv_id | — | — | — | — | **Yes** |
| `docChatEvents` | *(ignored)* | — | — | — | — | **Yes** (25s, uses `:APP_USER`) |

All callbacks use `:APP_USER` + lookup pattern (not `:G_AUS_ID`) — see `07-pitfalls.md`.

> **Dependency ngoài:** `doc-chat-app.jsx` còn gọi `chatContactList` (Application Process của Chat System) qua `apexCallApp()` — hàm riêng không có `pageId`. Khi deploy Doc Chat Modal sang app mới, `chatContactList` phải được deploy theo.

## Frontend (`#APP_FILES#doc-chat/`)

Seven files loaded sequentially via Babel at runtime (same pattern as Chat module):

```
doc-chat.css              ← design tokens, 3-pane layout (scoped to #doc-chat-root)
icons.jsx                 ← SVG icon components
conversation-list.jsx     ← left pane: search, tabs, group/DM list
chat-thread.jsx           ← center pane: messages, composer, @mention
info-panel.jsx            ← right pane: doc summary card, members, files
empty-state.jsx           ← empty state + create group modal
doc-chat-app.jsx          ← entry point; auto-renders into #doc-chat-root on page load
```

`demo.html` — standalone browser demo with mock data, no APEX/Oracle needed.

## APEX Modal Dialog Page Setup

- **Page Items (Hidden):** `P_DOC_TYPE`, `P_DOC_NO`, `P_DOC_LABEL`, `P_DOC_STATUS`, `P_DOC_TOTAL`, `P_DOC_FIELDS`
- **Region:** Static Content → `<div id="doc-chat-root" style="width:100%;height:100%;"></div>` (Template: Blank with Attributes)
- **CSS → Inline:** paste `doc-chat/doc-chat.css`
- **Execute when Page Loads:** `window.CHAT_AUS_ID = &G_AUS_ID.;` then load React → ReactDOM → Babel → 6 JSX files sequentially via `fetch()` + `Babel.transform()`
- **Dialog Width:** 1480, **Height:** 860

`doc-chat-app.jsx` reads context from `sessionStorage` key `docChatCtx` first (rich data), falls back to `$v('P_DOC_TYPE')` / `$v('P_DOC_NO')`. Calls `apex.navigation.dialog.close()` on close.

## ERP Page Integration

Opening modal requires SSP checksum — generated via `redirect_page` Application Process.

Dynamic Action on `#Btn_DocChat` — Execute JavaScript Code:

```javascript
var triggerEl = this.triggeringElement;   // capture before await

var docCtx = {
  doc_type: 'SO', doc_no: '&P15_SO_NO.',
  doc_label: 'Đơn hàng bán', doc_status: '&P15_STATUS.',
  doc_total: '&P15_TOTAL.',
  doc_fields: [['Đối tượng', '&P15_CUSTOMER_NAME.'], /* ... */]
};
sessionStorage.setItem('docChatCtx', JSON.stringify(docCtx));

let url = await globalHandleAjaxProcess(['redirect_page', {
  x01: 10022710201,
  x02: `P_DOC_TYPE,P_DOC_NO:${docCtx.doc_type},${docCtx.doc_no}`,
  x03: 'G_APP_XXXX_ID'   // app item holding APP_ID of current application
}, 'text']);

apex.navigation.dialog(url, {
  title: 'Trao đổi chứng từ', height: 860, width: 1480, modal: true, resizable: false
}, null, triggerEl);
```

Complex values (doc_total, doc_fields with commas/Unicode) go through `sessionStorage`; only simple identifiers through `x02`.

## apexCall Utilities (in doc-chat-app.jsx)

Hai hàm tách biệt:

```javascript
const MODAL_PAGE_ID = 10022710201;

// 8 doc-chat callbacks — page-level, pageId bắt buộc
function apexCall(processName, params = {}) {
  return new Promise((resolve, reject) => {
    apex.server.process(processName,
      { x01: params.x01||'', x02: params.x02||'', x03: params.x03||'',
        x04: params.x04||'', x05: params.x05||'' },
      { dataType: 'json',
        pageId:   MODAL_PAGE_ID,
        success:  resolve,
        error: (jqXHR, err) => reject(new Error(jqXHR.responseText || err)) });
  });
}

// chatContactList (App Process từ Chat System) — không có pageId
function apexCallApp(processName, params = {}) {
  return new Promise((resolve, reject) => {
    apex.server.process(processName,
      { x01: params.x01||'', x02: params.x02||'', x03: params.x03||'',
        x04: params.x04||'', x05: params.x05||'' },
      { dataType: 'json',
        success:  resolve,
        error: (jqXHR, err) => reject(new Error(jqXHR.responseText || err)) });
  });
}
```

`jqXHR.responseText` surfaces the actual Oracle error (e.g. `ORA-00904`) instead of the generic `'APEX'` string.
