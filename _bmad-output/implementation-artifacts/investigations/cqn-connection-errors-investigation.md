# Investigation: CQN connection errors (NJS-003 / DPI-1010 / ORA-01013)

## Hand-off Brief
Chat-server CQN subscription thất bại lặp lại mỗi 15s với `NJS-003 / DPI-1010 not connected`. Bằng chứng cho thấy **pool DB vẫn kết nối được** (loadCache chỉ lỗi 1 lần với ORA-01013, không lặp), nhưng **connection CQN chuyên dụng dùng `events: true` thì hỏng nhất quán** — khoanh vùng vào tầng đăng ký CQN (privilege / callback port / events mode của Oracle Client), không phải logic ứng dụng. Cần log đầy đủ + `npm run test:cqn` để confirm.

## Case Info
- Slug: cqn-connection-errors
- Date: 2026-06-29
- Status: **Blocked on evidence** (evidence-light — không có .env, không truy cập được DB/log live từ dev box)
- Scope: `chat-server/` (cqn.js, server.js)

## Problem Statement
Log lặp:
```
[CQN] Startup error: NJS-003: invalid or closed connection / DPI-1010: not connected   (lặp ~mỗi 15s)
[CQN] loadCache error: ORA-01013: user requested cancel of current operation            (1 lần)
```

## Evidence Inventory
| Evidence | Trạng thái | Ghi chú |
|---|---|---|
| `chat-server/cqn.js` | Available | startCQN/loadCache/retry loop |
| `chat-server/server.js` | Available | initDB pool + startup chain |
| git history cqn.js | Available | sửa lần cuối `e9e4935` (22-06) |
| `.env` (CQN_HOST/PORT, DB string) | **Missing** | chỉ tồn tại trên Server B |
| Full pm2 log (có dòng "Connected"?) | **Missing** | quyết định throw ở getConnection hay subscribe |
| `npm run test:cqn` output | **Missing** | confirm CQN registration |
| DB-side: CHANGE NOTIFICATION grant, listener | **Missing** | |

## Findings (evidence-graded)

| # | Finding | Grade | Bằng chứng |
|---|---|---|---|
| F1 | Pool DB **kết nối được** — DB không "chết" hoàn toàn | Deduced | loadCache (`cqn.js:30` pool conn) chỉ lỗi **1 lần**; nếu DB down thì lỗi mọi lần |
| F2 | Lỗi nằm ở **connection CQN chuyên dụng** (`events:true`, `cqn.js:190-204`), không phải pool | Deduced | F1 + Startup error lặp chỉ quanh khối subscribe |
| F3 | NJS-003/DPI-1010 = connection object đã đóng/không kết nối khi gọi method — lỗi tầng OCI/network, **không phải logic JS** | Confirmed | mã lỗi node-oracledb thick client |
| F4 | ORA-01013 "user requested cancel" = query bị hủy do conn bị đóng giữa chừng / callTimeout / session bị kill | Confirmed | nghĩa chuẩn của ORA-01013 |
| F5 | Retry loop mỗi 15s là **thiết kế cố ý**, không phải bug — log spam là hệ quả của connect fail liên tục | Confirmed | `RETRY_INTERVAL_MS=15000` `cqn.js:6,227` + `scheduleRestart` guard `cqn.js:18-22` |
| F6 | Thay đổi gần nhất (`e9e4935`) chỉ thêm `_regId`/`scheduleRestart`/health-check — **không đụng connection/subscribe params** | Confirmed | `git show e9e4935 -- cqn.js` |

## Hypotheses

| # | Hypothesis | Status | Confirm/Refute bằng |
|---|---|---|---|
| H1 | DB user thiếu quyền `CHANGE NOTIFICATION` | Open | `SELECT * FROM session_privs WHERE privilege='CHANGE NOTIFICATION'`; thường ra ORA-29972/29973 — nếu vậy bớt khả năng |
| H2 | DB không gọi callback ngược về Server B `CQN_HOST:CQN_PORT` (3141) — firewall/IP sai | Open | kiểm `.env` CQN_HOST=172.25.10.38, CQN_PORT=3141; test TCP DB→Server B:3141 |
| H3 | `events: true` mode của Oracle Instant Client không bật → conn chết ngay sau khi mở | Open | full log: có dòng `[CQN] Connected. Registering...` (`cqn.js:196`) không? Nếu KHÔNG → chết ở `getConnection`; nếu CÓ → chết ở `subscribe` |
| H4 | Oracle DB kill session CQN (DPI-1010) do resource_limit/profile/IDLE_TIME | Open | DB alert log + `v$session` |
| H5 | App logic gây lỗi | **Refuted** | F3, F5, F6 — code đúng, lỗi ở tầng connection |

## Root Cause (Confidence: **Low–Medium**)
Khoanh vùng chắc chắn: **lỗi ở tầng đăng ký CQN của connection `events:true`**, pool vẫn khỏe (F1–F3). Nguyên nhân gốc cụ thể chưa confirm được vì thiếu .env + log đầy đủ + truy cập DB. Phân biệt nhanh nhất bằng dấu hiệu trong log (H3).

## Đề xuất (CHƯA áp dụng)
1. **Phân nhánh trước tiên (rẻ nhất):** xem full pm2 log — có dòng `[CQN] Connected. Registering subscription...` không?
   - KHÔNG → chết ở `oracledb.getConnection({events:true})` → nghi `events` mode / Instant Client (H3).
   - CÓ → chết ở `subscribe()` → nghi privilege (H1) hoặc callback port (H2).
2. Chạy `npm run test:cqn` (dừng server trước — tranh CQN_PORT 3141) để cô lập CQN khỏi phần còn lại.
3. Verify `.env`: `CQN_HOST=172.25.10.38`, `CQN_PORT=3141` (≠ PORT 3410), `DB_CONNECTION_STRING` dùng 172 không phải 127.
4. DB-side: kiểm grant `CHANGE NOTIFICATION` cho DB_USER; kiểm DB có route TCP ngược về Server B:3141 (firewall).
5. Tăng tính chẩn đoán: tạm log thêm `err.code`/`err.stack` đầy đủ trong catch `cqn.js:223` (hiện chỉ log `err.message`).

## Reproduction / Verification Plan
- Trên Server B: `pm2 logs chat-server --lines 50` lấy full chuỗi startup.
- `npm run test:cqn` và dán output.
- Nếu cần: `tnsping` / sqlplus tới DB_CONNECTION_STRING xác nhận DB reachable từ Server B.
