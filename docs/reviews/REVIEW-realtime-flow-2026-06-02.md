# Báo cáo Review — Luồng real-time chat (2026-06-02)

> Skill: `apex-node-review`. Câu hỏi: *"Tại sao không thể chat real-time được với luồng hiện tại?"*
> Phạm vi: chuỗi đẩy/nhận sự kiện real-time của Chat System + Doc Chat qua kênh hợp nhất
> `/api/events/:aus_id` → `apex:chatEvent`.

> **Trạng thái: ✅ ĐÃ GIẢI QUYẾT.** Root cause quyết định là **#4 (cross-frame jQuery)** — xác minh
> live: bind bằng `window.parent.apex.jQuery` nhận đủ `message`/`read`/`typing` trên `parent.document`,
> còn code cũ bind bằng jQuery iframe nên handler không chạy. Fix #4 (`doc-chat-page.js`) + ① + ② +
> ③ đã áp dụng. Bài học đã đưa vào skill `apex-node-review` thành **mỏ neo A13**.
> Còn lại: các bước deploy thủ công ở §6 (re-paste `doc-chat-page.js`, `global.js`; `pm2 restart`).

## 1. Phạm vi & luồng đã dựng (Pha 1–2)

**Luồng thực tế (GỬI → NHẬN):**

```
GỬI
  chat.js POST /send → deliverToConv(conv_id, {type:'message',...}, sender)     chat.js:324
    → deliverToUser(ausId, payload)                                              events.js:34
        → eventWaiters.get(aus_id)?  KHÔNG → return; (RỚT)                       events.js:37
                                     CÓ   → res.json(payload) + DELETE waiter    events.js:38-40

NHẬN
  global.js (Theme — chạy MỌI page kể cả iframe) poll /api/events/:aus_id
    → $(document).trigger('apex:chatEvent', [data])   ← dispatch trên document CỦA WINDOW poll
        Messenger (Normal page): nghe trên $(document) của chính nó   chat-page.js:27,245    ✅
        Doc Chat (iframe):       nghe trên window.parent.document      doc-chat-page.js:27-29,283
```

**Anh em ruột so sánh:** trang **Messenger** (`chat-system/chat-page.js`) — cùng cơ chế nhận
`apex:chatEvent`, nhưng là Normal page một-window nên **tự hoạt động đúng**. Doc Chat tái dùng đúng
kênh đó nhưng chạy trong iframe → phá giả định nền của kênh. Đây là điểm drift.

**Bản chất kênh:** `/api/events/:aus_id` thiết kế cho **notification** — 1 poll/user, **lossy chấp
nhận được** (chuông tự query lại DB ở lần CQN kế). Chat "đi nhờ" theo convention **A3** nhưng mang 2
thực tế mới: (a) một user có **nhiều context APEX cùng poll** (trang cha + modal iframe + đa tab);
(b) tín hiệu chat **không được rớt âm thầm**. Mô hình **1 waiter/aus_id** (`events.js`) đụng cả hai.

## 2. Tổng quan phát hiện

| # | Mức | Mỏ neo | Vị trí | Tóm tắt |
|---|-----|--------|--------|---------|
| 1 | 🔴 Chặn | A3 | `events.js:9-23`, global.js | Poll war: trang cha & iframe cùng aus_id liên tục đá nhau (`replaced`), event rớt vào khoảng trống |
| 2 | 🔴 Chặn | A3 | `doc-chat-page.js:27-29,283` | Event bị bắn vào document của iframe trong khi handler nghe trên parent.document → mất |
| 3 | 🟡 Lệch | A3 | `events.js:34-41` | Kênh lossy single-shot, chat không có cơ chế bù → rớt 1 tín hiệu = mất tin tới khi reselect |
| 4 | 🔴 Chặn | (mới) | `doc-chat-page.js:27-29,283` + `})(apex.jQuery)` | **Cross-frame jQuery**: handler bind bằng iframe-jQuery lên parent.document, nhưng global.js trang cha `.trigger()` bằng parent-jQuery → custom event không vượt 2 instance jQuery → handler KHÔNG BAO GIỜ chạy. Đây là root cause "event tới mà modal không refresh". |

Tổng: 🔴 3 · 🟡 1 · 🔵 0 · 🟢 0

> **Phát hiện #4 (bổ sung 2026-06-02 sau khi xác minh live):** Người dùng nhận được response
> `{type:'message', conv_id:73, msg:{...}}` (poll Hop 1–3 PASS) nhưng modal không cập nhật. Trace ra:
> `doc-chat-page.js` được gọi `})(apex.jQuery)` nên `$` = jQuery **của iframe**; nó bind handler
> `apex:chatEvent` lên `parent.document` bằng jQuery iframe. `global.js` ở trang cha lại `.trigger()`
> bằng jQuery **của trang cha**. jQuery lưu event handler dưới `expando` riêng từng instance →
> trigger của parent-jQuery không thấy handler do iframe-jQuery đăng ký → **không chạy**. Đây là lỗi
> quyết định; ① và ② cần thiết nhưng chưa đủ. **Fix:** bind bằng `window.parent.apex.jQuery`.

## 3. Chi tiết phát hiện

### [🔴 Chặn] #1 — Poll war giữa trang cha và iframe (`events.js:9-23`)

- **Hiện trạng:** Modal Doc Chat mở trong iframe; iframe cũng load Theme → cũng chạy `global.js` →
  cũng poll `/api/events/:aus_id` với **cùng aus_id** như trang cha. `addWaiter` chỉ cho 1 waiter/user
  (`events.js:12-16`): poll mới đá poll cũ ra bằng `{type:'replaced'}`. `global.js` không xử lý
  `replaced` → rơi xuống `poll()` gọi lại ngay → hai bên churn liên tục.
- **Vì sao quan trọng:** Trong khoảng đá-rồi-poll-lại (một vòng Browser→APEX→UTL_HTTP→Node), **không
  ai giữ waiter** → `deliverToUser` gặp `if (!w) return` (`events.js:37`) → tín hiệu rớt.
- **Đề xuất sửa:** iframe không tự poll (xem §4 ①).

### [🔴 Chặn] #2 — Event bắn vào nhầm document (`doc-chat-page.js:27-29,283`)

- **Hiện trạng:** Khi poll của **iframe** thắng & resolve, `global.js` trong iframe
  `trigger('apex:chatEvent')` trên **document của iframe**. Nhưng `doc-chat-page.js:283` chỉ nghe trên
  **parent.document**, không nghe document của chính nó → event vào chỗ không ai nghe.
- **Vì sao quan trọng:** Doc Chat chỉ nhận được khi poll của **trang cha** thắng → ~một nửa tín hiệu
  (đã ít vì #1) rơi vào hư không.
- **Đề xuất sửa:** triệt tiêu cùng #1 — iframe không poll thì chỉ còn trang cha dispatch trên
  parent.document, đúng chỗ Doc Chat đang nghe.

### [🟡 Lệch] #3 — Kênh lossy, chat thiếu cơ chế bù (`events.js:34-41`)

- **Hiện trạng:** `deliverToUser` không có waiter → `return` (bỏ gói). Notification chịu được vì tự
  query lại DB; chat **không có catch-up định kỳ**.
- **Anh em ruột:** notification dùng CQN re-fire + bell refresh để tự lành. Chat chỉ `loadThread()`
  khi *nhận được* tín hiệu — không nhận = không refresh tới lần sau / reselect.
- **Phán quyết Pha 4:** ☑ Tiến hóa convention (cách cũ — kênh lossy — không khớp nhu cầu chat). Bù
  bằng buffer ở server (xem §4 ②).

## 4. Đề xuất thống nhất (Pha 4)

> Không phải "kéo code mới về cho giống cũ". Chính convention cũ (1 poll lossy/user) mới không khớp
> chat; nhánh Doc Chat phơi bày điều đó. Giữ quyết định kiến trúc **1 poll/user** (tiết kiệm ORDS
> thread — xem `08-archive.md`) nhưng vá hai lỗ hổng.

### ① Chặn poll war — iframe không tự poll *(đã áp dụng)*
`global.js` chỉ poll ở **top window**; page trong iframe đi nhờ poll của trang cha:
```javascript
if (window.parent && window.parent !== window) return;
```
→ Diệt #1 và #2. Doc Chat vốn nghe trên `parent.document` nên vẫn nhận đủ. ORDS vẫn 1 thread/user.
Cập nhật bản chuẩn: `docs/claude/01-notification.md`.

### ② Vá tính lossy — buffer event theo aus_id *(đã áp dụng)*
`events.js`: khi không có waiter đang đỗ, **xếp hàng** event (thay vì bỏ); poll kế tiếp rút từ hàng
đợi (at-least-once qua khoảng re-poll). Chỉ buffer event "durable" (`message`, `read`,
`notification`); `typing`/`typing_stop` tự hết hạn ở client nên không buffer. Gộp notification liên
tiếp. Cap 100 event / TTL 60s mỗi user để chặn phình bộ nhớ.

### ③ Ghi lại ranh giới *(đã áp dụng)*
Thêm ghi chú vào `docs/claude/01-notification.md`: kênh `appEvents` là **lossy single-shot**,
feature cần đảm bảo nhận gói phải tự bù qua re-fetch/buffer, và **iframe không tự poll**.

### ④ Cross-frame jQuery — bind bằng jQuery trang cha *(đã áp dụng)*
`doc-chat-page.js`: khi trong iframe, lắng nghe `apex:chatEvent` bằng `window.parent.apex.jQuery`
thay vì `apex.jQuery` của iframe. Đây là điều kiện đủ để handler thực sự chạy khi trang cha trigger.
Không cần đổi `global.js`/Messenger (Messenger cùng frame nên không dính).

### Giới hạn còn lại (ngoài phạm vi lần này)
**Đa tab cùng user** vẫn churn (mỗi addWaiter đá tab kia). Với ②, event không *mất* nhưng chỉ tới
**một** tab đang đỗ tại thời điểm đó, không fan-out mọi tab. Fan-out đúng cần nhiều waiter/user +
cursor — đánh đổi ORDS thread, nên để lại làm việc sau. Đã ghi nhận, không sửa bây giờ để giữ ngân
sách ORDS.

## 5. Bug / Security / Performance (Pha 5)

| # | Mức | Loại | Vị trí | Ghi chú |
|---|-----|------|--------|---------|
| - | 🔵 | Memory | `events.js` (sau ②) | Buffer có cap + TTL — đã chặn phình. OK. |
| - | ✅ | A8 POST | `docs/doc-chat-callbacks.sql` docChatSend | (Chưa review lần này — đề xuất kiểm `Connection: close` + `WRITE_RAW` ở relay) |
| - | ✅ | A4 | callbacks chat | (Chưa review lần này) |

> Pass này chỉ phủ luồng real-time. Các callback PL/SQL (A4/A7/A8/A10) chưa nằm trong phạm vi câu hỏi
> — đề xuất một lượt review riêng cho `docs/doc-chat-callbacks.sql` + `chat_apex_callbacks_v2.sql`.

## 6. Việc cần làm

1. [x] ① `global.js` iframe guard — cập nhật `docs/claude/01-notification.md`
2. [x] ② `events.js` buffer at-least-once
3. [x] ③ Ghi chú ranh giới kênh lossy vào `docs/claude/01-notification.md`
4. [x] ④ `doc-chat-page.js` bind `apex:chatEvent` bằng `window.parent.apex.jQuery` (**root cause #4**)
5. [ ] **APEX — page 10022710201:** dán lại `doc-chat/doc-chat-page.js` vào "Execute when Page Loads" (fix #4)
6. [ ] **APEX — Theme:** dán lại `global.js` đã sửa vào Theme JavaScript (fix ①)
7. [ ] **Server B:** `pm2 restart chat-server` để nạp `events.js` mới (fix ②)
8. [ ] **Verify:** 2 user, gửi tin từ user kia → modal hiện **ngay** không cần bấm lại
9. [ ] (Sau) Review riêng các callback PL/SQL chat; cân nhắc fan-out đa-tab
