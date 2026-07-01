# Multi-Database CQN Architecture — Research (Giai đoạn 1)

> Investigation bmad-investigate · 2026-07-01 · chỉ nghiên cứu, chưa sửa code.
> Case file: `_bmad-output/implementation-artifacts/investigations/multi-db-cqn-investigation.md`

## Hand-off Brief

1. **Bối cảnh.** Server B (Node.js 22 + node-oracledb **thick mode**) đang là real-time hub cho **1** Oracle DB; cần mở rộng thành hub cho **N** Oracle server, mỗi DB đều cần CQN, và muốn thêm DB **động không restart**.
2. **Kết luận.** Chạy N CQN trong **cùng 1 process là khả thi kỹ thuật nhưng phá mô hình recovery** hiện tại (`process.exit` là all-or-nothing → 1 DB lỗi làm chớp toàn bộ N DB). Kiến trúc bền vững = **1 process/DB cho phần CQN** (giữ nguyên bất biến thick-mode) + **1 gateway process giữ toàn bộ SSE**, nối nhau qua forward nội bộ.
3. **Cần làm tiếp.** Chốt topology (Phương án C — hybrid, khuyến nghị), rồi sang Giai đoạn 2 refactor. Bắt buộc thêm **namespacing `dbKey`** vào định danh trước mọi việc khác.

---

## Câu hỏi 1 — N CQN trên N database trong 1 process?

### Bằng chứng Confirmed (từ code)

| # | Bằng chứng | Ý nghĩa |
|---|-----------|---------|
| F1 | `cqn.js:8-13` — state module-level đơn trị: `_cqnConn`, `_regId`, `_healthTimer`, `_exiting`, `rowidCache`, `SUBSCR_NAME` const | Module hiện **cấu trúc chỉ phục vụ 1 DB**. Không có chiều "DB nào". |
| F2 | `cqn.js:15-28` `fatalRestart` → `process.exit(1)`; comment nêu rõ: OCI thick mode giữ notification listener trên `CQN_PORT` **ở cấp process suốt đời process**; close connection **không nhả port**; re-subscribe cùng process → `ORA-24912` loop | Recovery là **all-or-nothing cấp process**. |
| F3 | `cqn.js:197-211` — CQN connection tạo bằng `getConnection({events:true})`, `subscribe()` với `ipAddress=CQN_HOST`, `port=CQN_PORT` | Listener bind **1 host:port** cho subscription này. |
| F4 | `cqn.js:163-188` health check match **1** registration theo `CQN_HOST:CQN_PORT` + `_regId` đơn trị | Không theo dõi được nhiều subscription song song. |
| F5 | `server.js:38-49` pool mặc định `events:true`; `server.js:138-139` `initDB()` → `startCQN()` | events-mode của OCI env do **pool đầu tiên** quyết định (đã ghi pitfalls). |

### Kết luận Q1 (Deduced + Hypothesized)

- **Chung 1 CQN_PORT cho N DB — Deduced khả thi.** Thick mode tạo **1 notification listener/process** trên `host:port` (F2). Nhiều DB có thể cùng trỏ callback về `CQN_HOST:CQN_PORT` đó; OCI định tuyến message vào đúng callback theo registration id. ⇒ **không cần N port**, chỉ cần N `subscribe()` trên N connection tới N DB, cùng `ipAddress:port`.
  - *Cần xác minh (Hypothesized):* mỗi DB một reg riêng, message tới đúng `onMessage` — kiểm chứng bằng POC 2 DB, xem `user_change_notification_regs` mỗi DB đều có callback về cùng `CQN_HOST:CQN_PORT` và cả hai đều fire.
- **Recovery `process.exit` KHÔNG còn đúng khi N DB share process — Confirmed từ F2.** Nếu DB #k rớt subscription, `fatalRestart` giết cả process → pm2 restart → **toàn bộ N DB dựng lại subscription**. Xác suất "có ít nhất 1 DB lỗi" **tăng theo N** ⇒ hub mong manh bằng DB tệ nhất. Đây là **mâu thuẫn lõi**: mô hình recovery hiện tại đúng cho 1 DB nhưng không scale N-in-one-process.
- **Cannot partial-recover in-process — Confirmed từ F2.** Vì listener ở cấp process, không thể tháo/subscribe lại riêng 1 DB mà không đụng cả process (`ORA-24912`).

---

## Câu hỏi 2 — In-process đa-CQN (b) vs 1 process/DB (a)

| Tiêu chí | (a) 1 process/DB (pm2 nhiều instance) | (b) 1 process đa-pool + đa-CQN |
|---------|----------------------------------------|--------------------------------|
| Fault isolation CQN | ✅ 1 DB crash chỉ restart process của nó | ❌ 1 DB lỗi → `process.exit` chớp cả N DB (F2) |
| Tái dùng code hiện tại | ✅ `cqn.js`/`server.js` gần như nguyên vẹn, tham số hoá qua env | ❌ Phải viết lại `cqn.js` thành đa-instance (state theo DB) |
| Bất biến thick-mode recovery | ✅ Giữ nguyên `process.exit`-per-DB | ❌ Phải thay recovery, mà docs nói in-process re-subscribe bất khả thi |
| Registry SSE (browser) | ❌ **Vỡ**: `sseConnections` (events.js:10) nằm trong từng process → browser nối process-1 không nhận event DB-3 | ✅ 1 registry SSE duy nhất, `events.js` routing dùng lại |
| Thêm DB động | ✅ `pm2 start` process mới, không đụng process đang chạy | ⚠️ Thêm subscription runtime được (events-mode đã bật) nhưng vẫn dính all-or-nothing |
| Quản lý port | ⚠️ Mỗi process 1 `CQN_PORT` riêng | ✅ Có thể chung 1 port |

**Mấu chốt:** (a) tốt cho **CQN** nhưng **vỡ SSE** (browser chỉ nối 1 endpoint Server B, state SSE bị chia mảnh). (b) tốt cho **SSE** nhưng **ghép chặt lỗi CQN**. Không phương án thuần nào thắng cả hai.

### Khuyến nghị — Phương án C (Hybrid), tách 2 mối lo

```
                 Browser (APEX, nhiều erp server)
                         │  SSE (nginx 443 → :3410)
                         ▼
          ┌───────────────────────────────┐
          │  GATEWAY process (1)           │  ← giữ TOÀN BỘ SSE
          │  events.js: sseConnections,    │     (nguồn sự thật giao nhận)
          │  eventBuffer  — key = dbKey:aus │
          │  POST /internal/notify         │  ← nhận forward nội bộ
          └───────────────────────────────┘
             ▲            ▲            ▲   localhost HTTP / IPC
     ┌───────┴───┐  ┌─────┴─────┐  ┌───┴───────┐
     │ CQN wkr A │  │ CQN wkr B │  │ CQN wkr N │  ← 1 process / DB
     │ cqn.js    │  │ cqn.js    │  │ cqn.js    │     (giữ process.exit recovery)
     │ pool A    │  │ pool B    │  │ pool N    │
     └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
       CQN │ 1521     CQN │           CQN │
     Oracle A         Oracle B       Oracle N   ← callback về CQN_HOST:CQN_PORT
```

- **Gateway (1 process):** sở hữu mọi SSE connection + buffer, expose `POST /internal/notify {dbKey, ausId}`. **Không** đụng CQN → không bao giờ `process.exit` vì CQN. `events.js` dùng lại, chỉ đổi key sang `dbKey:ausId`.
- **CQN worker (N process, 1/DB):** tái dùng nguyên `cqn.js` + phần DB pool của `server.js`, tham số hoá bằng env (`DB_KEY`, `DB_CONNECTION_STRING`, `DB_USER`, `CQN_PORT`). Khi có notification → thay vì gọi `notifyUser` in-process, **forward** `{dbKey, ausId}` sang gateway. Giữ nguyên `fatalRestart`→exit ⇒ **fault isolation**: 1 DB rớt chỉ restart worker đó.
- **Giá phải trả:** thêm 1 hop nội bộ (localhost, rẻ) + khóa namespacing `dbKey`.

> Nếu số DB nhỏ (≤3–4) và chấp nhận "1 DB lỗi chớp cả cụm", (b) đơn giản hơn. Nhưng yêu cầu "nhiều server" + "thêm động" nghiêng hẳn về **Phương án C**.

---

## Câu hỏi 3 — Thêm DB động không restart

- **Tạo pool động:** khả thi — `oracledb.createPool({poolAlias})` gọi lúc runtime, lazy-init khi cần. Miễn pool **đầu tiên** có `events:true` (F5) thì pool sau không phá events-mode.
- **Thêm CQN động (Phương án C):** = **spawn 1 pm2 process mới** cho DB mới (`pm2 start server-cqn.js --name cqn-<dbKey>`), **không** đụng process đang chạy → đúng bất biến thick-mode (process mới = listener mới, không tranh chấp). Đây là cách *duy nhất* thêm CQN mà không restart cái đang chạy.
- **Nguồn cấu hình — khuyến nghị bảng control** (giống `CHAT_CONFIG` đã có), ví dụ `CHAT_DB_REGISTRY(db_key, connect_string, db_user, db_password_ref, cqn_port, status)`. Một **supervisor** đọc bảng và **reconcile** đội pm2: DB có trong bảng mà chưa có process → start; DB gỡ khỏi bảng → stop. ⇒ "Thêm DB = INSERT 1 dòng + supervisor tự spin process", zero downtime cho DB khác.
  - Thay thế nhẹ hơn: file JSON `db-registry.json` + `pm2 reload ecosystem.config.js`. Đơn giản hơn nhưng thủ công hơn.

---

## Finding cắt ngang — BẮT BUỘC bất kể topology: Namespacing `dbKey`

**Confirmed:**
- `events.js:10,49,91` — mọi map (`sseConnections`, `eventBuffer`) key bằng **bare `aus_id`**.
- `token.js:7,34,42` — SSE token body = `<aus_id>|<exp>`, `verifyToken` trả `{ausId}` — **không có định danh DB**.

**Hệ quả:** N Oracle server có dãy `aus_id` độc lập → user 5 ở DB-A và user 5 ở DB-B **đụng key** → giao chéo notification giữa các tenant (rò rỉ dữ liệu). ⇒ Trước khi làm multi-DB, phải nâng định danh thành **composite `dbKey:ausId`** xuyên suốt:
- `token.js` — token body thêm `dbKey`; `verifyToken` trả `{dbKey, ausId}`.
- `events.js` — key = `dbKey + ':' + ausId`.
- SSE token mint phía APEX (`sseToken`) — nhúng `dbKey` của server đó.
- Forward nội bộ CQN worker → gateway mang theo `dbKey`.

---

## Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|--------|-----|-----------|
| `aus_id` đụng độ xuyên DB → rò rỉ notification | 🔴 Cao | Namespacing `dbKey` (bắt buộc, làm trước) |
| N-in-one-process: 1 DB lỗi chớp cả cụm | 🔴 Cao | Phương án C — process/DB cho CQN |
| Nhiều `CQN_PORT` cần mở firewall Server→Server B | 🟡 TB | Phương án C có thể share 1 port; nếu tách port, chuẩn hoá dải port + tài liệu |
| Registration mồ côi khi worker chết bẩn | 🟡 TB | `stopCQN` best-effort đã có (`cqn.js:231`); supervisor dọn `DBMS_CQ_NOTIFICATION.DEREGISTER` |
| Secret HMAC SSE khác nhau giữa các DB | 🟡 TB | Cho phép secret theo `dbKey`, hoặc 1 secret dùng chung ở gateway |
| POC Q1 (share port đa-DB) chưa xác minh thực địa | 🟡 TB | Chạy POC 2 DB trước khi cam kết Phương án C |

---

## Danh sách file cần đụng ở Giai đoạn 2 (dự kiến)

| File | Thay đổi |
|------|---------|
| `token.js` | Token body + `dbKey`; `verifyToken` trả `{dbKey, ausId}` |
| `events.js` | Mọi key → `dbKey:ausId`; thêm hàm nhận forward |
| `cqn.js` | Tham số hoá theo DB (env `DB_KEY`/connect); thay `notifyUser` bằng forward sang gateway |
| `server.js` | Tách vai trò: gateway (SSE, `/internal/notify`) vs cqn-worker; hoặc chia thành `server-gateway.js` + `server-cqn.js` |
| `.env` / `.env.example` | Thêm `DB_KEY`, cấu hình per-DB; hoặc chuyển sang registry |
| **mới** `db-registry` (bảng `CHAT_DB_REGISTRY` hoặc `db-registry.json`) | Nguồn danh sách DB |
| **mới** `supervisor.js` | Reconcile đội pm2 theo registry |
| **mới** `ecosystem.config.js` | Khai báo pm2 gateway + workers |
| `chat.js` | Nếu API chat cũng đa-DB: chọn pool theo `dbKey` (ngoài phạm vi nếu chỉ notification) |
| `CLAUDE.md`, `docs/pitfalls.md` | Ghi mô hình mới + bất biến |
| APEX `sseToken` (page 0) | Nhúng `dbKey` khi mint token |

---

## Follow-up 2026-07-01 — Bối cảnh làm rõ + kết quả POC

**Làm rõ bối cảnh (thay đổi thiết kế):**
- "Nhiều database" hiện tại = **nhiều schema trên CÙNG 1 Oracle instance** (`172.25.10.18:1521/pdbgc19c`), phân biệt bằng `DB_USER`. **Tương lai có thể thêm instance/server khác** → vẫn giữ Phương án C cho fault isolation.
- **Mỗi schema có dãy `aus_id` riêng** → namespacing `dbKey:ausId` **BẮT BUỘC** (chốt, không còn optional).

**Kết quả POC (`test-cqn-multidb.js`, chạy trên Server B):**
- 2 subscription từ 2 schema trên **cùng 1 instance**, share `CQN_PORT=3411`, **cả hai active, KHÔNG `ORA-24912`**.
- ⇒ **Hypothesis 1 (share 1 CQN_PORT) — Confirmed cho cùng-instance.** Cho khác-instance vẫn Open (chưa có instance thứ 2 để test), nhưng Phương án C không phụ thuộc điều này.
- Còn thiếu: bước INSERT test xác nhận định tuyến `[db1]`/`[db2]` đúng schema (chưa chạy).

**Tinh chỉnh Phương án C — fault domain = Oracle instance, không phải schema:**
- POC chứng minh **1 process giữ nhiều subscription tới cùng instance được**. Vậy:
- **1 CQN worker process / mỗi Oracle INSTANCE** (connectString). Trong worker đó, N subscription (1/schema) share `CQN_PORT` của worker.
- Fault domain = instance (1 instance sập → mọi schema của nó sập cùng lúc, khớp thực tế) → `process.exit` recovery đúng ở mức instance.
- Instance khác nhau → worker khác nhau (khác `CQN_PORT`) → fault isolation.
- **Hiện tại chỉ 1 instance → chỉ 1 worker giữ N subscription.** Gateway/worker vẫn tách để sẵn sàng scale ra nhiều instance mà không viết lại.
- **`dbKey` = định danh SCHEMA** (vì aus_id riêng theo schema), không phải theo instance.

## Kết luận

**Confidence: Medium-High** (share 1 CQN_PORT cùng-instance đã Confirmed bằng POC; chỉ còn định tuyến INSERT-test và kịch bản khác-instance là Open).

- N CQN trong 1 process **khả thi kỹ thuật** nhưng **phá recovery** → không khuyến nghị cho "nhiều server".
- **Khuyến nghị Phương án C (hybrid):** gateway giữ SSE, N worker process/DB giữ CQN với `process.exit` recovery độc lập, nối qua forward nội bộ.
- **Việc phải làm trước tiên (chặn tất cả):** namespacing `dbKey` trong `token.js` + `events.js` + `sseToken`.
- Thêm DB động = INSERT registry + supervisor spawn pm2 worker, zero downtime.

**Next:** chốt Phương án C (hay chấp nhận (b) nếu ít DB), chạy POC Q1, rồi `bmad-quick-dev` cho Giai đoạn 2 theo bảng file trên.
