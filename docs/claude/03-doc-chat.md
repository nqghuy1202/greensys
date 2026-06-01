# Doc Chat Modal (Trao đổi chứng từ)

Modal embedded in ERP pages (SO, PXK, HD…). Each document has its own conversation scope. APEX Modal Dialog Page ID: **10022710201**.

> **Lưu ý:** Doc Chat Modal (page 10022710201) và Chat System (Messenger page) là **hai page hoàn toàn tách biệt** — khác app ID, khác page ID, khác bộ callbacks. Không nhầm lẫn giữa hai module.

## Kiến trúc mới (Native APEX — không React/JSX/Static Files)

Frontend là **vanilla JavaScript** (`doc-chat/doc-chat-page.js`) chạy trong APEX page. Dữ liệu được server render dưới dạng HTML bởi PL/SQL callbacks và JS swap innerHTML.

```
APEX Page 10022710201
  ├── Function and Global Variable Declaration:
  │     var pageId = $v('pFlowStepId');   ← bắt buộc, convention toàn project
  ├── Page Items (hidden): P10022710201_DOC_TYPE, P10022710201_DOC_NO,
  │   P10022710201_DOC_LABEL, P10022710201_DOC_STATUS, P10022710201_DOC_TOTAL,
  │   P10022710201_CONV_ID, P10022710201_CONV_FILTER, P10022710201_SEARCH_QUERY,
  │   P10022710201_REPLY_TO_MSG_ID
  │   (Trong JS: $v('P' + pageId + '_CONV_ID') — xem 05-apex-patterns.md)
  ├── Static Content Region "doc-chat-root" — skeleton HTML (3-pane layout)
  ├── CSS Inline: doc-chat/doc-chat.css
  └── Execute when Page Loads:
        window.CHAT_AUS_ID = &G_AUS_ID.;
        // paste doc-chat/doc-chat-page.js
```

### Skeleton HTML (paste vào Static Content region source)

```html
<div id="doc-chat-root">
  <div class="modal">
    <div class="modal-body" id="dc-body">

      <!-- LEFT: list-screen + compose-screen (inline, không overlay) -->
      <aside class="convo-pane">

        <!-- (1) Màn hình danh sách -->
        <div id="dc-list-screen" class="dc-screen">
          <div id="dc-conv-list"><div class="dc-loading">Đang tải...</div></div>
          <div class="dc-list-actions">
            <button type="button" class="btn-ghost"   id="dc-btn-dm">
              <span class="fa fa-user"></span> Nhắn tin
            </button>
            <button type="button" class="btn-primary" id="dc-btn-group">
              <span class="fa fa-users"></span> Tạo nhóm
            </button>
          </div>
        </div>

        <!-- (2) Màn hình soạn (inline) — ẩn mặc định -->
        <div id="dc-compose-screen" class="dc-screen dc-compose" style="display:none">
          <div class="dc-compose-head">
            <button type="button" class="icon-btn" id="dc-compose-back" title="Quay lại">
              <span class="fa fa-arrow-left"></span>
            </button>
            <span class="dc-compose-title" id="dc-compose-title">Tạo hội thoại mới</span>
            <button type="button" class="icon-btn" id="dc-compose-close" title="Đóng">
              <span class="fa fa-times"></span>
            </button>
          </div>
          <div class="dc-compose-body" id="dc-create-content">
            <div class="dc-loading">Đang tải danh sách thành viên...</div>
          </div>
          <div class="dc-compose-foot">
            <button type="button" class="btn-ghost"   id="dc-create-cancel">Hủy</button>
            <button type="button" class="btn-primary" id="dc-create-submit">
              <span class="fa fa-check"></span> Tạo hội thoại
            </button>
          </div>
        </div>

      </aside>

      <!-- CENTER: thread + compose -->
      <main class="chat-pane" id="dc-chat-pane">
        <div class="chat-head" id="dc-chat-head">
          <div class="chat-head-info">
            <div class="chat-head-title" id="dc-chat-head-title">Chọn hội thoại</div>
          </div>
          <div class="chat-head-actions">
            <button type="button" class="icon-btn" id="dc-btn-search-toggle" title="Tìm kiếm" style="display:none"><span class="fa fa-search"></span></button>
            <button type="button" class="icon-btn" id="dc-btn-info" title="Thông tin" style="display:none"><span class="fa fa-info-circle"></span></button>
          </div>
        </div>
        <div id="dc-msg-search-bar" style="display:none;padding:6px 16px;border-bottom:1px solid var(--border)">
          <input type="text" id="dc-msg-search-input" placeholder="Tìm kiếm trong hội thoại..." style="width:100%;padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;outline:none"/>
        </div>
        <div class="chat-messages" id="dc-messages">
          <div style="text-align:center;color:var(--text-3);margin-top:60px;font-size:13px">← Chọn hội thoại</div>
        </div>
        <div id="dc-typing" class="typing-row" style="display:none">
          <div class="typing-bubble">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </div>
          <span class="typing-text" id="dc-typing-text"></span>
        </div>
        <div class="composer-wrap" id="dc-compose-area" style="display:none">
          <div class="composer-reply-banner" id="dc-reply-banner" style="display:none">
            <div style="flex:1">↩ <span id="dc-reply-preview" class="preview"></span></div>
            <button type="button" class="icon-btn" id="dc-reply-cancel">×</button>
          </div>
          <div class="composer" id="dc-composer">
            <textarea id="dc-msg-input" class="composer-input" placeholder="Nhập tin nhắn… (Ctrl+Enter)" rows="1"></textarea>
            <div class="composer-bottom">
              <button type="button" class="composer-send" id="dc-btn-send"><span class="fa fa-paper-plane"></span></button>
            </div>
          </div>
        </div>
      </main>

      <!-- RIGHT: info panel -->
      <aside class="info-pane" id="dc-info-pane">
        <div id="dc-info"><div class="dc-loading">Đang tải...</div></div>
      </aside>
    </div>
  </div>
</div>
```

## Ajax Callbacks (page 10022710201 — 7 total)

Tất cả là **page-level Ajax Callbacks** trên page 10022710201.
Gọi từ `doc-chat-page.js` với `pageId: 10022710201`.

### HTML-returning (mới — thay thế JSON callbacks cũ)

Full SQL: `docs/doc-chat-native.sql`

| Callback | x01 | x02 | x03 | x04 | x05 | Returns |
|----------|-----|-----|-----|-----|-----|---------|
| `dcConvListHtml` | doc_type | doc_no | filter (ALL/DM/CHANNEL) | search | — | HTML (conv list) |
| `dcMsgThreadHtml` | conv_id | search_query | — | — | — | HTML (messages) |
| `dcInfoHtml` | conv_id | — | — | — | — | HTML (members panel) |
| `dcContactsHtml` | — | — | — | — | — | HTML (contacts checkboxes) |

### Action-only (giữ nguyên — trả JSON)

Full SQL: `docs/doc-chat-callbacks.sql` (callback #4–7)

| Callback | x01 | x02 | x03 | x04 | x05 | Relay Node? |
|----------|-----|-----|-----|-----|-----|-------------|
| `docChatCreate` | conv_type | name | members (JSON) | doc_type | doc_no | No |
| `docChatSend` | conv_id | body | reply_to_msg_id | partner_aus_id | — | **Yes** |
| `docChatRead` | conv_id | — | — | — | — | **Yes** |
| `docChatTyping` | conv_id | — | — | — | — | **Yes** |

> **`docChatConversations`, `docChatMessages`, `docChatMembers` đã được thay thế** bởi các HTML-returning callbacks mới.

> **`docChatEvents` đã bị xóa** — real-time events nhận qua `$(document).on('apex:chatEvent', handler)` do `global.js` dispatch sau khi `appEvents` (Page 0) long-poll resolve.

## Frontend Files

```
doc-chat/
  doc-chat-page.js     ← Vanilla JS (~230 dòng) — toàn bộ page interaction
  doc-chat.css         ← CSS (~389 dòng, scoped to #doc-chat-root) — giữ nguyên
  demo.html            ← Demo tham khảo (không deploy)

_archive/doc-chat-jsx/ ← JSX cũ (archived, không dùng nữa)
  doc-chat-app.jsx, conversation-list.jsx, chat-thread.jsx,
  info-panel.jsx, empty-state.jsx, icons.jsx
```

## ERP Page Integration (không thay đổi)

Opening modal requires SSP checksum — generated via `redirect_page` Application Process.

Dynamic Action on `#Btn_DocChat` — Execute JavaScript Code:

```javascript
var triggerEl = this.triggeringElement;
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
  x03: 'G_APP_XXXX_ID'
}, 'text']);

apex.navigation.dialog(url, {
  title: 'Trao đổi chứng từ', height: 860, width: 1480, modal: true, resizable: false
}, null, triggerEl);
```

## Function and Global Variable Declaration (APEX Page 10022710201)

```javascript
var pageId = $v('pFlowStepId');
```

## Execute when Page Loads (APEX Page 10022710201)

```javascript
window.CHAT_AUS_ID = &G_AUS_ID.;

// Paste nội dung doc-chat/doc-chat-page.js ở đây
// (không cần loadLibsSeq/loadJSXSeq nữa — không còn JSX)
```

## APEX Migration Checklist

Khi deploy lên server APEX (thay thế phiên bản JSX cũ):

1. **Xóa** phần load JSX trong "Execute when Page Loads" (loadLibsSeq, loadJSXSeq)
2. **Paste** `doc-chat-page.js` vào "Execute when Page Loads" (sau dòng `window.CHAT_AUS_ID = &G_AUS_ID.;`)
3. **Xóa** Static Application Files: `doc-chat/*.jsx`
4. **Tạo** 4 Ajax Callbacks mới: `dcConvListHtml`, `dcMsgThreadHtml`, `dcInfoHtml`, `dcContactsHtml` (SQL: `docs/doc-chat-native.sql`)
5. **Xóa** callbacks cũ: `docChatConversations`, `docChatMessages`, `docChatMembers`, `docChatEvents`
6. **Giữ nguyên**: `docChatCreate`, `docChatSend`, `docChatRead`, `docChatTyping`
7. **Update** Static Content region source: paste skeleton HTML ở trên
8. **Paste** `doc-chat.css` vào Page → CSS → Inline

## Pitfalls đặc thù của Native APEX approach

- **`dc-create-overlay` display**: dùng `style.display = 'grid'` khi show (CSS `.nested-overlay` cần `display:grid` để `place-items:center` hoạt động). Dùng `'none'` để ẩn.
- **`#dc-create-overlay` phải nằm TRONG `.modal`** (không phải ngoài) để `position:absolute; inset:0` bám đúng vào `.modal` (có `position:relative`)
- **innerHTML swap + scroll**: gọi `scrollToBottom()` sau 300ms setTimeout (DOM cần thời gian render)
- **Doc fields**: không pass qua APEX items (quá phức tạp với commas/Unicode) — đọc từ `sessionStorage.getItem('docChatCtx')` trong JS
- **Avatar color**: dùng `hsl(aus_id * 47 % 360, 55%, 52%)` — consistent cross-server và không cần hardcode
- **HTF.ESCAPE_SC**: dùng để escape HTML trong PL/SQL, `REGEXP_REPLACE(str,'[[:cntrl:]]','')` để clean VISCII chars (chỉ áp dụng AFTER MATERIALIZE)
