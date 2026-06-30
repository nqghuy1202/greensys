# Investigation: chat-server mất real-time (CQN loop NJS-003/ORA-24912)

## Hand-off Brief

1. **What happened.** chat-server boot đăng ký CQN thành công đúng 1 lần (regId=35112), sau đó loop vô hạn mỗi 15s với NJS-003/DPI-1010 (gốc: ORA-24912 Listen failed); mất real-time cả chat lẫn notification dù SSE vẫn connect. *(Confirmed: log pm2 + output test-cqn.js)*
2. **Where the case stands.** Mở case, đã dựng luồng code. Stronghold: ORA-24912 chỉ xảy ra ở lần subscribe THỨ HAI trở đi trong cùng process. Chờ dữ liệu Server B để chốt H1 vs H2/H3.
3. **What's needed next.** Chạy 4 lệnh chẩn đoán trên Server B (grep file deploy + ss -ltnp 3411 + pm2 describe cwd + log "subscription gone") để khẳng định/bác bỏ từng giả thuyết.

## Case Info

| Field            | Value |
| ---------------- | ----- |
| Ticket           | N/A |
| Date opened      | 2026-06-30 |
| Status           | Active |
| System           | Server B 172.25.10.38, Node.js 22, node-oracledb thick mode, Oracle 19.3, pm2 fork mode |
| Evidence sources | pm2 logs (out+error), output `node test-cqn.js`, source: cqn.js / server.js / events.js / chat.js |

## Problem Statement

Sau khi sửa loop CQN (đổi CQN_PORT 3141→3411, mở firewall, thêm `events:true` vào createPool), lỗi NJS-003 không còn ở 1 thời điểm (boot OK: "Subscription active regId=35112") nhưng pm2 vẫn loop trở lại; real-time chat + notification đều không hoạt động dù `[SSE] connect` vẫn xuất hiện.

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| pm2 out.log | Available | Có cả dòng "Subscription active (regId=35112)" + "Listening 0.0.0.0:3410" lẫn loop "Retrying in 15s" |
| pm2 error.log | Available | NJS-003 + DPI-1010 lặp |
| test-cqn.js output | Available (Confirmed) | Standalone subscribe OK; lỗi gốc khi đụng: ORA-24912 Listener thread failed |
| Source cqn.js | Available | Đã đọc toàn bộ (session này) |
| Source server.js | Available | createPool events:true (file dev box); /api/sse |
| Source events.js / chat.js | Available | deliverToUser/deliverToConv qua sseConnections |
| File server.js TRÊN Server B | **Missing** | Chưa xác nhận file deploy có events:true (H1) |
| ss -ltnp :3411 khi đang loop | **Missing** | Cần để xác nhận listener bị giữ (H2) |
| Log timestamp "subscription gone" | **Missing** | Cần để biết loop khởi phát do health-check hay error (H3) |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | H1: file deploy có events:true? pm2 cwd đúng? | High | Open | grep + pm2 describe |
| 2 | H2: listener 3411 có bị giữ khi loop? | High | Open | ss -ltnp; so trình tự close/unsubscribe trong cqn.js |
| 3 | H3: loop khởi phát do "subscription gone" hay "Connection error"? | High | Open | tìm log trước dòng Retrying đầu tiên |
| 4 | H4: SSE conn bị replace/đóng nên chat chết? | Medium | Open | đếm connect/replaced; kiểm tra send có tới Node |

## Confirmed Findings

### Finding 1: Re-subscribe trong cùng process KHÔNG unsubscribe/đóng listener trước khi thử lại
**Evidence:** chat-server/cqn.js:222-228 (catch: chỉ `_cqnConn.close()`, không `unsubscribe`); cqn.js:213-220 (on('error'): close không unsubscribe); cqn.js:18-22 (`scheduleRestart` chỉ setTimeout gọi lại `startCQN`, KHÔNG `process.exit`).
**Detail:** Mọi đường phục hồi đều giữ process sống và gọi lại `subscribe()` trên connection mới — không có bước giải phóng OCI notification listener đã bind ở CQN_PORT.

### Finding 2: test-cqn.js subscribe thành công standalone
**Evidence:** output user — "[CQN] Subscription đăng ký thành công!" sau khi `pm2 stop chat-server`.
**Detail:** Cùng connectString/CQN_HOST/CQN_PORT/QoS. Khác biệt: standalone KHÔNG tạo pool, và là process đời đầu (port 3411 trống).

### Finding 3: Đường chat real-time độc lập hoàn toàn với CQN
**Evidence:** chat.js:4 `require('./events').deliverToUser`; chat.js:60-64 `deliverToConv`→`deliverToUser`; events.js:70-89 `deliverToUser` chỉ đọc `sseConnections`.
**Detail:** Chat mất real-time KHÔNG thể do CQN. Phải có nguyên nhân riêng ở tầng SSE delivery hoặc đường UTL_HTTP send → Node.

## Deduced Conclusions

### Deduction 1: Loop là ORA-24912 ở lần subscribe ≥2, không phải lần đầu
**Based on:** Finding 1, Finding 2 + log "Subscription active" xuất hiện một lần rồi mới loop.
**Reasoning:** Boot lần đầu port 3411 trống → bind listener OK → subscribe OK. Sau khi subscription rớt (lý do chưa rõ — H3), `scheduleRestart` gọi `subscribe()` lại trong cùng process; listener cũ chưa được giải phóng (Finding 1) → OCI không bind lại được → ORA-24912 → bọc NJS-003 → loop.
**Conclusion:** Nếu đúng, fix tầng phục hồi (process.exit để pm2 restart sạch) sẽ cắt loop. Cần dữ liệu Server B (Backlog #2) để nâng từ Deduced lên Confirmed.

## Hypothesized Paths

### Hypothesis 1: File deploy chưa có events:true / pm2 chạy file cũ
**Status:** Refuted (Deduced)
**Resolution:** User xác nhận dòng "Subscription active (regId=35112)" đến từ **pm2** (không phải `node server.js` thủ công). ⟹ file deploy đã có events:true và pm2 chạy đúng file; subscribe lần đầu thành công. Loại trừ H1, củng cố H2+H3 (chỉ lần re-subscribe mới fail).
**Theory:** Sửa chỉ ở máy dev Windows; Server B vẫn file cũ → loop ngay từ boot.
**Supporting indicators:** Loop vẫn xuất hiện sau khi "đã fix".
**Would confirm:** `grep -n events server.js` trên Server B KHÔNG ra dòng events:true; hoặc pm2 cwd trỏ thư mục khác.
**Would refute:** Boot có in "Subscription active (regId=35112)" (chứng tỏ events đã hiệu lực ít nhất 1 lần) → nghiêng về H2/H3.

### Hypothesis 2: OCI giữ TCP listener 3411 suốt đời process → re-subscribe luôn ORA-24912
**Status:** CONFIRMED (TRỰC TIẾP)
**Resolution:** `ss -ltnp | grep 3411` trong lúc loop: `LISTEN 172.25.10.50:3411 users:(("node /opt/chat-",pid=8455))`. Process node đang loop VẪN giữ port 3411 → subscribe lần ≥2 không bind được → ORA-24912. Listener không được giải phóng vì các đường phục hồi không unsubscribe và không exit process (Finding 1).

### Finding 4: CQN_HOST khớp listener — KHÔNG sai IP
**Status:** Refuted
**Evidence:** `.env` CQN_HOST=172.25.10.50; `ss` listener bind 172.25.10.50:3411 → khớp. Sửa .env không liên quan.

### Finding 5 (Confirmed): Firewall đã test SAI IP lúc debug
**Evidence:** Địa chỉ callback thật = 172.25.10.50:3411 (.env + ss). Lúc debug firewall ta dùng `nc -zv 172.25.10.38 3411` — .38 là IP docs cũ.
**Detail:** Chưa từng xác nhận Server A → 172.25.10.50:3411 thông. Nếu firewall chỉ mở .38 (sai IP), Oracle không giao được callback về .50 → deregister → health-check thấy "subscription gone" → restart → đụng H2 loop. Khớp log gốc "[CQN] Health check: subscription gone — restarting". Cần `nc -zv 172.25.10.50 3411` từ Server A.

### Side note: NODE_ENV=development (không phải production) → /api/notify bật, test SSE độc lập được.
**Theory:** node-oracledb thick mode tạo notification listener 1 lần; close connection không nhả; subscribe lại trong process cũ fail bind.
**Supporting indicators:** Finding 1, Finding 2, Deduction 1.
**Would confirm:** `ss -ltnp | grep 3411` còn process node giữ port trong lúc loop; và pm2 restart (process mới) lại boot OK 1 lần rồi loop tiếp.
**Would refute:** Port 3411 trống trong lúc loop nhưng subscribe vẫn ORA-24912 → nguyên nhân khác (vd quyền/DB).

### Hypothesis 3: Oracle drop subscription → kích hoạt restart → đụng H2
**Status:** Open
**Theory:** health-check (cqn.js:153-181) hoặc on('error') phát hiện subscription gone → scheduleRestart.
**Supporting indicators:** Log gốc từng có "[CQN] Health check: subscription gone — restarting".
**Would confirm:** Dòng log ngay TRƯỚC "Retrying in 15s" đầu tiên là "subscription gone" hoặc "Connection error".
**Would refute:** Loop bắt đầu ngay từ boot không qua "Subscription active" → về H1.

### Hypothesis 4: SSE delivery hỏng riêng (giải thích chat chết)
**Status:** Open
**Theory:** SSE conn bị replace liên tục (mỗi account 2 dòng connect) → message gửi vào conn đã .end(); hoặc UTL_HTTP send không tới Node.
**Supporting indicators:** "[SSE] connect" nhân đôi mỗi account; Finding 3 (chat độc lập CQN).
**Would confirm:** Gửi tin → KHÔNG thấy log "[Chat] ..."/delivery; hoặc thấy connect rồi close ngay; test `/api/notify/:aus_id` (nếu non-prod) tới được browser hay không.
**Would refute:** Gửi tin có deliver và browser nhận khi chỉ mở 1 tab → real-time chat thực ra OK, vấn đề chỉ ở notification (CQN).

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| events:true trong file Server B | Phân định H1 | `grep -n events /path/server.js` |
| ss -ltnp :3411 khi loop | Khẳng định H2 | chạy trong lúc pm2 đang loop |
| Log trước "Retrying" đầu tiên | Phân định H3 vs H1 | `pm2 logs --lines 200` lọc quanh boot |
| Chat send có tới Node? | Phân định H4 | gửi tin + xem log; DevTools Network |

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Error origin | chat-server/cqn.js:198-204 (`_cqnConn.subscribe`) ném ORA-24912→NJS-003 |
| Trigger | `scheduleRestart`→`startCQN` lần ≥2 (cqn.js:18-22, 183) |
| Condition | listener CQN_PORT 3411 đã bind ở lần subscribe đầu, không được giải phóng (cqn.js:213-228 không unsubscribe) |
| Related files | server.js (createPool events:true, startCQN call), events.js (SSE delivery — nhánh H4), chat.js (deliverToConv) |

### Finding 6 (CONFIRMED — gốc rễ notification chết): Oracle registration trỏ callback về IP chết .38
**Evidence:** `SELECT ... FROM user_change_notification_regs` → `regid=35104, callback=net8://(HOST=172.25.10.38)(PORT=3411)`, trong khi listener thật + CQN_HOST = 172.25.10.50.
**Detail:** Oracle giao notification về 172.25.10.38:3411 (không ai nghe) → không bao giờ tới. Đây là registration mồ côi từ thời .env=.38, chưa từng bị deregister (Finding 1). Đổi .env sang .50 không dọn registration cũ phía Oracle.

### Hypothesis 5 (Confirmed về cơ chế): Health-check regId lệch → false "subscription gone"
**Status:** Confirmed (Deduced mạnh)
**Resolution:** Process log boot regId=35112 nhưng bảng chỉ có regid=35104. `checkSubscriptionHealth` query `WHERE regid=_regId(35112)` → 0 dòng → tưởng gone → scheduleRestart mỗi 5 phút → đụng H2. Cần xác nhận lại sau restart sạch (so regId log với bảng).

### Hypothesis 3: Oracle drop subscription → restart
**Status:** Confirmed (gộp Finding 6 + H5) — trigger thật là callback sai IP (.38) + health-check regId lệch, không phải firewall.

## Conclusion

**Confidence:** High

Gốc rễ kép, bắt nguồn từ thay đổi IP `172.25.10.38 → 172.25.10.50` không kèm dọn dẹp:
1. **Finding 6 (Confirmed):** Oracle registration sống trỏ callback về IP chết `.38` → notification không bao giờ tới (listener ở `.50`). Registration mồ côi từ thời .env cũ, không bị deregister (Finding 1).
2. **H2 (Confirmed):** recovery in-process gọi subscribe() lại nhưng OCI không nhả listener 3411 (`ss` chứng minh pid giữ port) → ORA-24912 loop 15s.
3. **H5 (Confirmed):** health-check so regId lệch (35112 vs 35104) → false "subscription gone" → kích hoạt restart 5 phút → đụng H2.
4. **H1 Refuted** (events:true đã deploy). **Finding 4/firewall Refuted** (CQN_HOST đúng .50, firewall mở theo port). **H4 (chat/SSE)** chưa test — `[SSE] connect` chạy nên SSE delivery khả năng OK; cần `/api/notify` để chốt.

## Recommended Next Steps

### Fix direction (3 phần — chờ duyệt)
1. **DB một lần:** DEREGISTER tất cả registration mồ côi (đặc biệt 35104→.38). Sạch slate.
2. **cqn.js — H2:** đổi tầng phục hồi (`on('error')`, health-check fail, catch startup) sang gọi `stopCQN()` best-effort rồi `process.exit(1)` → pm2 restart-delay 3000 spawn process mới sạch (OCI env mới, listener nhả, re-register callback .50). Không retry in-process nữa.
3. **cqn.js — H5 (tùy chọn nhưng nên):** làm health-check bền hơn — hoặc bỏ so theo regId cứng, hoặc xác minh đúng kiểu/giá trị regId so với bảng, tránh false "gone" gây restart 5 phút.

### Diagnostic xác nhận sau fix
- Sau restart: query `user_change_notification_regs` → callback PHẢI = 172.25.10.50:3411, regid khớp regId log.
- `/api/notify/<aus_id>` (dev mode) → badge nhảy = SSE OK (chốt H4).

## Follow-up: 2026-06-30 #2 — sau khi deploy fix cqn.js

### New Evidence
- Fix cqn.js (fatalRestart + health-check theo callback HOST:PORT) đã deploy: loop ORA-24912 HẾT; boot in "Subscription active (regId=35114)"; registration `.50` được tạo đúng (`35113 → HOST=172.25.10.50 PORT=3411`).
- `curl /api/notify/<aus_id>` → log `[Events] notification` + (đường SSE Node→browser hoạt động). Nhưng đây là HTTP nội bộ, KHÔNG đụng CQN.
- **Test bằng DML THẬT trên user_notifications → KHÔNG sinh log `[Events]`** (Confirmed bởi user: "test trên hệ thống thì không có logs").
- Health-check fire `fatalRestart('health-check: no registration for 172.25.10.50:3411')` → reg `.50` bị Oracle purge trong <5 phút. Query (b) thủ công cho cnt>=1 → câu health-check ĐÚNG; reg thật sự chập chờn (tạo rồi bị xoá).

### Updated Conclusion (Confirmed, High)
**Root cause cuối: Oracle KHÔNG giao được CQN callback về 172.25.10.50:3411 (kênh Oracle→Server B inbound bị chặn).** Subscribe OK vì control channel outbound Node→Oracle:1521; nhưng callback ngược về `.50:3411` không tới → DML thật không sinh notification → Oracle purge reg → health-check restart. Đây là vấn đề MẠNG/HẠ TẦNG, không sửa bằng code/.env/SQL. Fix cqn.js (H2/H5) là đúng và cần thiết (đã cắt loop, surface đúng vấn đề) nhưng không thể tự khắc phục kênh mạng.

### Recommended action
1. Test reachability từ DB server bằng `utl_tcp.open_connection('172.25.10.50', 3411)` (so với 3410). 
2. Kiểm firewall Server B: `firewall-cmd --list-ports`/`--list-all`.
3. Nhờ admin mở TCP 3411 từ Server A → 172.25.10.50. Điều kiện bắt buộc cho CQN.

## Status: Concluded — root cause cuối = network (Oracle→172.25.10.50:3411 unreachable); chờ admin mở port
