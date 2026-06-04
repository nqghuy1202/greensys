# Chat System (Messenger) — Setup bằng Dynamic Action

Chuyển `chat-system/chat-page.js` (1 IIFE ~29.5KB nhồi vào "Execute when Page Loads") sang
mô hình **FGVD + Dynamic Action** để né giới hạn ký tự của thuộc tính trang.

## Phân bổ code (3 chỗ)

| Chỗ trong APEX | Nội dung | File nguồn |
|---|---|---|
| **Function and Global Variable Declaration** | Toàn bộ state + hàm + 3 binding giữ lại (apex:chatEvent, 2 outside-click). Expose `window.cs*`. | `chat-system/chat-page.fgvd.js` |
| **Execute when Page Loads** | Chỉ `window.csInit();` | `chat-system/chat-page.onload.js` |
| **Dynamic Actions** | 22 DA, mỗi DA gọi 1 hàm `window.csOn*`. | Bảng dưới |

> `window.CHAT_AUS_ID = &G_AUS_ID.;` và `var pageId = $v('pFlowStepId');` đã nằm ở **đầu FGVD**
> (KHÔNG để ở Execute-on-load nữa) — vì FGVD chạy trước, IIFE đọc `AUS_ID` ngay lúc đó.

## Quy ước chung cho MỌI DA (đặt giống nhau cho khỏi sai)

- **Selection Type:** `jQuery Selector`
- **Event Scope:** `Dynamic` — và **Static Container (jQuery Selector):** `#chat-root`
  - ⚠ Bắt buộc với phần tử do server render bằng `innerHTML` (`.convo-item`, `.emp-item`,
    `.msg-hover-action`, `.emp-chip`, menu "..."). Để `Static` thì click vào phần tử mới tải sẽ
    **không chạy**. Đặt `Dynamic` cho tất cả là an toàn (phần tử tĩnh cũng nằm trong `#chat-root`).
- **Fire on Initialization:** `No`
- **True Action:** `Execute JavaScript Code` (không có Condition, Affected Elements để trống).
- Trong ô JS, luôn truyền: `this.triggeringElement` (phần tử) và `this.browserEvent` (event gốc).

## Sự kiện `input` trong APEX

APEX không có sẵn event "Input". Với các ô cần lọc/realtime (search, tên nhóm, auto-resize), chọn
**Event = `Custom`**, **Custom Event = `input`**. `input` có bubble nên hoạt động với Scope Dynamic.

---

## Bảng 22 Dynamic Action

| # | Tên DA | Event | jQuery Selector | Ô "Execute JavaScript Code" |
|---|--------|-------|-----------------|------------------------------|
| 1 | Mở/đóng dropdown loại | Click | `#cs-type-dd` | `window.csOnTypeDdToggle(this.triggeringElement, this.browserEvent);` |
| 2 | Chọn loại hội thoại | Click | `#cs-type-menu .lp-type-menu-item` | `window.csOnTypeMenuSelect(this.triggeringElement, this.browserEvent);` |
| 3 | Chip lọc nhanh | Click | `.lp-quick-chip[data-quick]` | `window.csOnQuickChip(this.triggeringElement, this.browserEvent);` |
| 4 | Mở menu hội thoại | Click | `.convo-menu[data-conv-menu]` | `window.csOnConvoMenuOpen(this.triggeringElement, this.browserEvent);` |
| 5 | Chọn mục menu hội thoại | Click | `#cs-convo-menu .cs-convo-menu-item` | `window.csOnConvoMenuItem(this.triggeringElement, this.browserEvent);` |
| 6 | Chọn hội thoại | Click | `.convo-item[data-conv-id]` | `window.csOnConvClick(this.triggeringElement, this.browserEvent);` |
| 7 | Tìm kiếm sidebar | Custom `input` | `#cs-search` | `window.csOnSearchInput(this.triggeringElement, this.browserEvent);` |
| 8 | Bắt đầu trả lời | Click | `.msg-hover-action[data-reply-id]` | `window.csOnReplyStart(this.triggeringElement, this.browserEvent);` |
| 9 | Hủy trả lời | Click | `#cs-reply-cancel` | `window.csOnReplyCancel(this.triggeringElement, this.browserEvent);` |
| 10 | Gửi tin nhắn | Click | `#cs-btn-send` | `window.csOnSend(this.triggeringElement, this.browserEvent);` |
| 11 | Phím trong ô nhập | Key Down | `#cs-msg-input` | `window.csOnMsgKeydown(this.triggeringElement, this.browserEvent);` |
| 12 | Tự giãn ô nhập | Custom `input` | `#cs-msg-input` | `window.csOnMsgAutosize(this.triggeringElement, this.browserEvent);` |
| 13 | Bật/tắt panel thông tin | Click | `#cs-btn-info` | `window.csOnToggleInfo(this.triggeringElement, this.browserEvent);` |
| 14 | Mở soạn tin cá nhân | Click | `#cs-btn-dm, #cs-btn-compose` | `window.csOnOpenDM(this.triggeringElement, this.browserEvent);` |
| 15 | Mở soạn nhóm | Click | `#cs-btn-group` | `window.csOnOpenGroup(this.triggeringElement, this.browserEvent);` |
| 16 | Đóng màn hình soạn | Click | `#cs-compose-back, #cs-compose-close, #cs-compose-cancel` | `window.csOnCloseCompose(this.triggeringElement, this.browserEvent);` |
| 17 | Đổi tab loại (soạn) | Click | `.emp-type-tab[data-conv-type]` | `window.csOnTypeTab(this.triggeringElement, this.browserEvent);` |
| 18 | Chọn/bỏ thành viên | Click | `#cs-member-suggest-list .emp-item` | `window.csOnMemberToggle(this.triggeringElement, this.browserEvent);` |
| 19 | Bỏ chip thành viên | Click | `.emp-chip .x` | `window.csOnChipRemove(this.triggeringElement, this.browserEvent);` |
| 20 | Nhập tên nhóm | Custom `input` | `#cs-create-name` | `window.csOnCreateNameInput(this.triggeringElement, this.browserEvent);` |
| 21 | Tìm danh bạ | Custom `input` | `#cs-contact-search` | `window.csOnContactSearch(this.triggeringElement, this.browserEvent);` |
| 22 | Tạo hội thoại | Click | `#cs-btn-create` | `window.csOnSubmitCreate(this.triggeringElement, this.browserEvent);` |

### Lưu ý từng DA
- **#11 (Key Down):** chỉ `Ctrl+Enter` mới gửi; phím khác → báo typing. Logic kiểm tra `ev.ctrlKey`
  nằm trong hàm, KHÔNG cần đặt "When Key" trong DA — để trống, để mọi phím đều gọi hàm.
- **#7, #12, #20, #21:** dùng `Custom` event tên `input` (không phải Key Release) để bắt cả paste.
- **#2, #4, #5, #8, #19:** hàm tự gọi `ev.stopPropagation()` để không bị 2 binding outside-click
  (giữ trong FGVD) đóng menu/đụng nhau. Đây là lý do phải truyền `this.browserEvent`.

---

## KHÔNG làm DA — giữ trong FGVD (đã có sẵn trong file)

| Binding | Vì sao không làm DA |
|---|---|
| `$eventDoc.on('apex:chatEvent', onChatEvent)` | Custom event mang payload qua `$(document).trigger(ev,[data])`. DA "Custom Event" không lấy được tham số thứ 2 của jQuery trigger. Muốn làm DA phải đổi `global.js` sang `apex.event.trigger` (ngoài phạm vi Messenger). |
| `$(document).on('click', closeTypeMenu)` | Outside-click đóng dropdown loại. Dựa vào `stopPropagation` của DA#1 để không đóng ngay khi mở. Tách DA trên `document` → thứ tự chạy mong manh. |
| `$(document).on('click', closeConvMenu)` | Outside-click đóng menu "...". Lý do như trên. |

---

## Checklist deploy (paste tay vào APEX — Messenger page)

1. **Function and Global Variable Declaration:** xóa nội dung cũ, paste toàn bộ `chat-page.fgvd.js`.
2. **Execute when Page Loads:** xóa nội dung cũ (cả IIFE `chat-page.js` lẫn dòng `window.CHAT_AUS_ID=…`
   nếu còn), paste `chat-page.onload.js` (chỉ `window.csInit();`).
3. **Tạo 22 Dynamic Action** theo bảng trên (Selection Type / Scope Dynamic / Container `#chat-root` /
   Fire on Init = No như mục "Quy ước chung").
4. **Giữ nguyên:** skeleton HTML region `#chat-root`, CSS Inline, và 9 Ajax Callback hiện có
   (`chatConvListHtml`, `chatMsgThreadHtml`, `chatMembersHtml`, `chatContactsHtml`, `chatSend`,
   `chatCreate`, `chatRead`, `chatTyping`, `chatPin`). DA chỉ thay lớp gắn sự kiện ở client.
5. **Xóa** các Dynamic Action cũ trỏ `window.chatGoBack/chatOpenNewDM/chatOpenNewGroup` nếu có —
   thay bằng DA#14/#15 ở trên (nút Back/Compose/Add giờ map vào `csOnOpenDM/csOnOpenGroup/closeCompose`).

## Kiểm thử nhanh sau khi deploy
- Mở page → sidebar load danh sách (csInit).
- Click 1 hội thoại (phần tử innerHTML) → mở thread ⇒ xác nhận **Scope Dynamic** đúng.
- Gõ vào ô tin → textarea giãn (DA#12 input) + sau 0.6s gọi typing (DA#11).
- Ctrl+Enter → gửi. Click "Tạo nhóm" → chọn thành viên (innerHTML) → tạo.
- Mở dropdown loại → click ra ngoài đóng (binding FGVD). Realtime: nhờ tab khác gửi tin → thread tự cập nhật (apex:chatEvent FGVD).
