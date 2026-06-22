# Review: chat-server — Flow, Exception & Performance

- **Phạm vi:** `chat-server/` — `server.js`, `cqn.js`, `events.js`, `token.js`, `chat.js`
- **Ngày:** 2026-06-22
- **Trọng tâm:** (1) bug runtime / exception chưa xử lý / connection leak / type mismatch; (2) performance luồng SSE; (3) performance SQL
- **Trạng thái:** Review xong — CHƯA sửa code. Chờ duyệt lộ trình.

## Mức độ
🔴 Chặn (lỗi runtime/bảo mật) · 🟡 Lệch pattern · 🔵 Gợi ý · 🟢 Tiến hóa

---

## Bảng findings (theo độ ưu tiên)

| # | Mức | File:line | Vấn đề | Đề xuất |
|---|-----|-----------|--------|---------|
| F1 | 🔴 | `cqn.js:143` | Health check query `user_change_notification_regs` — view này **không có cột `subscription_name`** → ORA-00904 mỗi 5 phút. Lưới an toàn "subscription drop → restart" chết hoàn toàn. | Lưu `regId` từ `conn.subscribe()` rồi query `user_change_notification_regs WHERE regid = :id`. |
| F2 | 🔴 | `chat.js:56` + `:443`, `:673`, `:631` | **Self-echo:** `deliverToConv` so sánh `ausId !== excludeAusId` (number từ DB vs giá trị thô `req.body`). `/send`, `/broadcast-message`, `/attach` truyền `aus_id` **không qua `Number()`** → nếu APEX gửi string `"123"` thì `123 !== "123"` = true → người gửi nhận lại chính tin của mình (duplicate). | Ép kiểu một chỗ trong `deliverToConv`: `const ex = Number(excludeAusId)` rồi so `Number(ausId) !== ex`. |
| F3 | 🟡 | `chat.js:62-128`, `:187-253` | `/conversations` & `/doc-conversations`: 4 correlated scalar-subquery **per-row** (display_name, dm_partner_aus_id, unread_count, member_count). `display_name`/`dm_partner` join bảng remote (APP_USERS/EMPLOYEES qua DBLINK) → **mỗi conversation = 1+ round-trip remote**. Vi phạm A7 (remote cần MATERIALIZE). | Tách phần remote thành CTE `/*+ MATERIALIZE */` rồi LEFT JOIN; gộp unread/member_count bằng analytic/JOIN aggregate thay vì scalar subquery. |
| F4 | 🟡 | `chat.js:133-182` | `/unread-summary`: scalar subquery `unread_count` per conversation. Bounded theo số conv của user nhưng vẫn N lần quét CHAT_MESSENGERS. | Rewrite bằng JOIN + `GROUP BY` hoặc `COUNT(...) OVER`. |
| F5 | 🔵 | `server.js:61-64` | `/api/notify/:aus_id` không auth — bất kỳ ai chạm port 3410 đều trigger được notification tới aus_id bất kỳ. Tác động thấp (chỉ ping count refetch) nhưng là endpoint hở. | Gỡ khi production, hoặc gate bằng token/`NODE_ENV`. |
| F6 | 🔵 | `cqn.js:80-97` | `handleFullScan` lọc `create_date >= SYSDATE - INTERVAL '5' MINUTE` → bỏ sót notification cũ hơn 5 phút bị mark-read (UPDATE read='Y' không có ROWID). Hiếm nhưng có thể miss event. | Nới cửa sổ hoặc fallback theo `modify_date`; tài liệu hoá giới hạn. |
| F7 | 🔵 | `chat.js:34-50, 915` | `participantCache` (TTL 60s) chỉ invalidate ở `/create`. Nếu thành viên được thêm/xoá ngoài luồng này (APEX trực tiếp), member mới không nhận event / member cũ vẫn nhận trong tối đa 60s. | Thêm route/hook invalidate khi đổi thành viên; hoặc giảm TTL cho conv vừa đổi. |
| F8 | 🔵 | `server.js:113-124` | Graceful shutdown không đóng `_cqnConn` (chỉ drain SSE + pool). Process exit nên vô hại, nhưng không sạch. | Export hàm `stopCQN()` đóng `_cqnConn` + clear `_healthTimer`, gọi trong `shutdown()`. |
| F9 | 🔵 | `chat.js:728-731` | `onlineCache` trả `cached:true` ở nhánh hit nhưng không có field `cached` ở nhánh miss — không nhất quán response shape (cosmetic). | Thêm `cached:false` ở nhánh miss cho đồng nhất. |
| F10 | 🔵 | `cqn.js:190-196, 153` | Khả năng double-schedule `startCQN`: nếu `on('error')` và `checkSubscriptionHealth` cùng fire có thể tạo 2 timer retry. Thấp vì mỗi nhánh clear `_healthTimer`, nhưng không clear timer retry của nhau. | Dùng 1 cờ `_restarting` guard re-entry. |

### Điểm đã làm ĐÚNG (xác nhận, không cần sửa)
- ✅ CQN dùng connection riêng `events:true`, query qua pool — đúng A9 (không query trên CQN conn).
- ✅ SSE `sseWrite` dùng `JSON.stringify` thẳng, KHÔNG qua middleware `\uXXXX` — đúng, vì SSE đi browser↔Node trực tiếp (UTF-8), không qua charset Oracle.
- ✅ Middleware `res.json()` escape bằng `charCodeAt` loop — đúng pitfall (không regex Unicode).
- ✅ Mọi query DB qua `withConn(fn)` + `finally close` — không thấy connection leak.
- ✅ Bind variable đầy đủ, không thấy SQL injection.
- ✅ INSERT chat dùng `MSG_SEQ/CONV_SEQ.NEXTVAL` + `SYSDATE` tường minh — đúng A10. (`RETURNING INTO` ở Node là hợp lệ — ORA-22816 chỉ áp dụng trong APEX Application Process.)
- ✅ `INTERVAL` literal trong `/online` và `handleFullScan` chạm bảng **local** (CHAT_USER_ONLINE, USER_NOTIFICATIONS) — không phải remote → không dính ORA-02000.

---

## User stories kiểm thử

### Epic A — CQN ổn định
- **A1.** *Là hệ thống, khi subscription CQN còn sống, health check mỗi 5 phút phải chạy KHÔNG ném ORA-00904.* → sau fix F1, log sạch trong ≥10 phút.
- **A2.** *Là hệ thống, khi Oracle drop subscription, health check phải phát hiện và tự `startCQN` lại.* → test: drop registration thủ công, trong ≤5 phút phải thấy log "subscription gone — restarting" + "Subscription active".
- **A3.** *Là hệ thống, khi 1 notification INSERT, đúng aus_id nhận event `notification`.* → smoke test qua `/api/notify/:aus_id` + SSE client.

### Epic B — Chat real-time đúng
- **B1.** *Là người gửi, khi gửi tin, tôi KHÔNG nhận lại event `message` của chính mình qua SSE.* → sau fix F2, kiểm cả `/send`, `/broadcast-message`, `/upload-send`, `/attach`.
- **B2.** *Là thành viên khác, khi có tin mới, tôi nhận đúng 1 event `message` với payload enrich (doc_type/doc_no/conv_name).*
- **B3.** *Là client reconnect, khi gửi `Last-Event-ID`, tôi nhận replay đúng các event seq > lastEventId, không trùng, không sót (trong TTL 60s).*
- **B4.** *Là user mở conn SSE mới, conn cũ phải nhận `event: replaced` và đóng.*

### Epic C — Performance
- **C1.** *Là user có ≥30 conversations (gồm doc), `/conversations` trả < ngưỡng X ms.* → đo trước/sau F3.
- **C2.** *Là hệ thống, số round-trip tới DBLINK remote khi load sidebar phải giảm sau khi MATERIALIZE* (F3).
- **C3.** *Là user, `/unread-summary` trả đúng tổng unread sau khi rewrite F4 (kết quả không đổi, chỉ nhanh hơn).* → so sánh output cũ/mới trên cùng dataset.

### Epic D — Robustness
- **D1.** *Là hệ thống khi SIGTERM, đóng sạch SSE + pool + CQN conn, exit code 0* (F8).
- **D2.** *Là hệ thống, `/api/notify` không bị lạm dụng từ ngoài* (F5).

---

## Lộ trình đề xuất (theo ưu tiên)

**Bước 1 — Fix lỗi đang báo (🔴, an toàn, độc lập)**
- F1: health check CQN dùng `regId` + `user_change_notification_regs WHERE regid=`.
- Test: A1, A2.

**Bước 2 — Fix self-echo (🔴, nhỏ, tác động UX rõ)**
- F2: normalize `excludeAusId` trong `deliverToConv`.
- Test: B1, B2.

**Bước 3 — Tối ưu SQL (🟡, cần đo & verify kết quả không đổi)**
- F3 trước (sidebar — nặng nhất, dính remote), rồi F4.
- Test: C1, C2, C3 — bắt buộc so output cũ/mới.

**Bước 4 — Robustness & dọn (🔵, gom 1 lượt)**
- F5, F6, F7, F8, F9, F10.
- Test: D1, D2.

## Đề xuất thống nhất
- **F3 là tiến hoá convention (🟢):** sidebar query đang vi phạm A7 (remote không MATERIALIZE). Sau khi sửa, nên ghi pattern "list query chạm bảng remote → MATERIALIZE CTE + LEFT JOIN local" vào `docs/oracle-db.md` để các list query sau không lặp lại lỗi N+1 remote.
- Các bước độc lập nhau → có thể duyệt/ship từng bước, không cần làm trọn gói.
