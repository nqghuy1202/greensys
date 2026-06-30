---
title: 'CQN recovery: exit-for-clean-restart thay vì retry in-process + health-check bền hơn'
type: 'bugfix'
created: '2026-06-30'
status: 'done'
baseline_commit: '73c66a7a892a5a645d38e92d56ab68ecc86c7c9b'
context: ['{project-root}/_bmad-output/implementation-artifacts/investigations/cqn-realtime-loss-investigation.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Khi CQN subscription rớt, `cqn.js` gọi `scheduleRestart → startCQN → subscribe()` lại TRONG CÙNG process. OCI thick mode không nhả TCP listener trên `CQN_PORT` → `ORA-24912` (bọc `NJS-003`/`DPI-1010`) → loop vô hạn 15s, mất real-time notification, không bao giờ tự lành (H2 — Confirmed bằng `ss`). Thêm vào đó, health-check so `_regId` (sub.regId) với cột `REGID` trong `user_change_notification_regs` — giá trị lệch → luôn tưởng "subscription gone" → tự kích hoạt restart mỗi 5 phút (H5 — Confirmed).

**Approach:** Bỏ retry in-process. Mọi đường lỗi không phục hồi được (startup catch, `_cqnConn` 'error', health-check phát hiện gone, DEREG event) → best-effort `stopCQN()` rồi `process.exit(1)`, để pm2 (`restart-delay 3000`) spawn process mới sạch (OCI env mới, listener nhả, re-register callback đúng `CQN_HOST`). Sửa health-check: xác minh registration theo `table + callback HOST:PORT` (cái thực sự có ý nghĩa "có reg sẽ giao về cho TA"), không so `regId` cứng.

## Boundaries & Constraints

**Always:** Giữ nguyên QoS, `SUBSCR_NAME`, subscription SQL, đường notify (`notifyUser`/`deliverToUser`), và chữ ký export `{ startCQN, stopCQN }`. Đường exit phải best-effort `stopCQN()` (unsubscribe+close) trước khi `process.exit(1)` để tránh tích lũy registration mồ côi (Finding 1). Có guard chống gọi exit nhiều lần + timeout an toàn để unsubscribe treo không chặn exit.

**Ask First:** Nếu muốn bỏ hẳn health-check poll (chỉ dựa DEREG event + 'error') thay vì sửa cách so — hỏi human trước (poll là lưới an toàn cho trường hợp Oracle drop âm thầm không gửi event).

**Never:** KHÔNG sửa file ngoài `chat-server/cqn.js` (trừ khi bắt buộc, phải nêu rõ). KHÔNG đụng tầng SSE/chat. KHÔNG chạy pm2/deploy (máy dev Windows — copy tay). KHÔNG đổi cơ chế phục hồi sang process-level mà bỏ unsubscribe.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Boot bình thường | Port 3411 trống, DB ok | subscribe OK, "Subscription active (regId=…)", health timer chạy | — |
| Subscribe lỗi lúc startup | ORA-24912 / NJS-003 | log fatal, best-effort stopCQN, `process.exit(1)` → pm2 restart | exit(1) |
| `_cqnConn` 'error' runtime | connection drop | log fatal, stopCQN, `process.exit(1)` | exit(1) |
| Oracle gửi DEREG event | `SUBSCR_EVENT_TYPE_DEREG` | log, stopCQN, `process.exit(1)` | exit(1) |
| Health-check: reg còn sống | reg có table+callback khớp HOST:PORT hiện tại | không làm gì | — |
| Health-check: reg mất thật | không reg nào khớp HOST:PORT | log, stopCQN, `process.exit(1)` | exit(1) |
| stopCQN treo khi exit | unsubscribe không trả về | timeout (~5s) ép `process.exit(1)` | forced exit |

</frozen-after-approval>

## Code Map

- `chat-server/cqn.js` -- DUY NHẤT file sửa. Chứa `scheduleRestart` (bỏ), `startCQN`, `checkSubscriptionHealth` (sửa truy vấn), `onMessage` (DEREG), `stopCQN` (tái dùng cho exit).
- `chat-server/server.js` -- THAM CHIẾU (không sửa): `shutdown()` SIGTERM/SIGINT đã gọi `stopCQN` + `process.exit(0)`; exit lỗi CQN dùng mã `1` để phân biệt shutdown bình thường (`0`).
- `chat-server/events.js` -- THAM CHIẾU: `notifyUser` callback, không đụng.

## Tasks & Acceptance

**Execution:**
- [x] `chat-server/cqn.js` -- Thêm `fatalRestart(reason)`: guard `_exiting`, log, `await stopCQN()` best-effort trong try/catch, `process.exit(1)`, kèm `setTimeout(()=>process.exit(1), 5000).unref()` an toàn. -- exit sạch để pm2 reset OCI/listener.
- [x] `chat-server/cqn.js` -- Thay 4 chỗ gọi `scheduleRestart`/in-process retry (startup catch, `_cqnConn.on('error')`, `checkSubscriptionHealth` gone, `onMessage` DEREG) bằng `fatalRestart(...)`. Xóa `scheduleRestart` + `_restarting` + `RETRY_INTERVAL_MS` (không còn dùng). -- bỏ retry in-process (H2).
- [x] `chat-server/cqn.js` -- Sửa `checkSubscriptionHealth`: query đếm reg theo `UPPER(table_name) LIKE '%USER_NOTIFICATIONS'` AND `callback LIKE '%HOST='||:host||%'` AND `callback LIKE '%PORT='||:port||%'` (bind `CQN_HOST`,`CQN_PORT`), bỏ so `_regId`. Healthy = count>0. -- chống false "gone" (H5).

**Acceptance Criteria:**
- Given subscribe ném ORA-24912/NJS-003 ở bất kỳ đường nào, when lỗi xảy ra, then process log fatal + thoát mã 1 (không loop in-process), pm2 spawn process mới.
- Given pm2 restart sau fix, when boot, then có đúng MỘT "Subscription active", và query `user_change_notification_regs` cho callback `HOST=172.25.10.50 PORT=3411`.
- Given registration còn sống đúng HOST:PORT, when health-check chạy (5 phút), then KHÔNG restart (không còn false "gone").
- Given SIGTERM/SIGINT, when shutdown, then vẫn `process.exit(0)` qua `server.js` (exit lỗi CQN mã 1 không can thiệp đường shutdown).

## Design Notes

Golden — `fatalRestart` (thay mọi `scheduleRestart`):
```js
let _exiting = false;
async function fatalRestart(reason) {
  if (_exiting) return;
  _exiting = true;
  console.error('[CQN] Fatal: %s — exiting(1) for clean pm2 restart', reason);
  setTimeout(() => process.exit(1), 5000).unref();   // an toàn nếu stopCQN treo
  try { await stopCQN(); } catch (_) {}
  process.exit(1);
}
```
Lý do exit thay vì retry: OCI thick mode giữ notification listener ở cấp process suốt đời process; chỉ process mới (pm2 restart) mới giải phóng port 3411 → subscribe lại được. Đã chứng minh: `test-cqn.js` (process đời đầu) subscribe OK, còn re-subscribe in-process luôn ORA-24912.

Health-check match callback thay regId: `sub.regId` không khớp tin cậy với cột `REGID` (bảng có 35104 trong khi process log 35112). Match theo HOST:PORT xác thực đúng thứ cần biết — "Oracle có reg nào sẽ giao notification về listener của ta không".

## Verification

**Commands (chạy ở `chat-server/`, máy dev — chỉ kiểm cú pháp, KHÔNG chạy pm2):**
- `node --check cqn.js` -- expected: không lỗi cú pháp.

**Manual checks (trên Server B sau khi copy cqn.js lên — bước người dùng tự làm):**
- `pm2 restart chat-server && pm2 logs chat-server --lines 20` -- expected: một "[CQN] Subscription active (regId=…)", KHÔNG còn "Retrying in 15s"/NJS-003 lặp.
- SQL DEV24: `SELECT regid, callback FROM user_change_notification_regs` -- expected: callback `HOST=172.25.10.50 PORT=3411`.
- Chờ >5 phút -- expected: không có restart tự phát (↺ pm2 không tăng), không "subscription gone".

## Suggested Review Order

**Cơ chế phục hồi mới (entry point)**

- Trung tâm thiết kế: exit-for-clean-restart thay retry in-process; guard + timeout an toàn.
  [`cqn.js:22`](../../chat-server/cqn.js#L22)

- stopCQN set `_exiting` chặn race fatalRestart lúc graceful shutdown.
  [`cqn.js:241`](../../chat-server/cqn.js#L241)

**Các đường lỗi nối vào fatalRestart (H2)**

- DEREG event → exit.
  [`cqn.js:124`](../../chat-server/cqn.js#L124)

- Connection 'error' runtime → exit.
  [`cqn.js:221`](../../chat-server/cqn.js#L221)

- Startup subscribe lỗi → exit.
  [`cqn.js:225`](../../chat-server/cqn.js#L225)

**Health-check bền hơn (H5)**

- Match registration theo callback HOST:PORT thay regId → hết false "gone".
  [`cqn.js:163`](../../chat-server/cqn.js#L163)
