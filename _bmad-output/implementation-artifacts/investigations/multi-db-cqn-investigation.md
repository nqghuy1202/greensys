# Investigation: Multi-Database CQN Architecture Feasibility (chat-server)

## Hand-off Brief

1. **What.** Server B (Node.js 22 + node-oracledb thick mode) là real-time hub cho 1 Oracle DB; cần mở rộng thành hub cho N Oracle server, mỗi DB cần CQN, thêm DB động không restart.
2. **Where it stands.** Nghiên cứu hoàn tất (Giai đoạn 1). Confirmed: recovery `process.exit` là all-or-nothing → không scale N-in-one-process; định danh `aus_id` không namespaced theo DB (rủi ro rò rỉ). Khuyến nghị Phương án C (hybrid). 1 điểm Hypothesized: share 1 CQN_PORT cho N DB — cần POC.
3. **Next.** Chốt Phương án C, chạy POC 2-DB (Q1), rồi bmad-quick-dev Giai đoạn 2.

## Case Info

| Field | Value |
| --- | --- |
| Ticket | N/A |
| Date opened | 2026-07-01 |
| Status | Concluded (Giai đoạn 1) |
| System | Server B 172.25.10.50, Node.js 22, node-oracledb thick mode, Oracle 19.3/23ai qua DBLINK |
| Evidence sources | Source code (chat-server/*.js), docs (CLAUDE.md, docs/pitfalls.md, cqn-setup-guide.md) |

## Problem Statement

Mở rộng chat-server từ 1-DB thành N-DB real-time hub, mỗi DB có CQN, thêm DB động không restart. Nghiên cứu tính khả thi, chưa sửa code.

## Confirmed Findings

### Finding 1: cqn.js chỉ có state đơn trị (single-DB by construction)
**Evidence:** `chat-server/cqn.js:8-13` — `_cqnConn, _regId, _healthTimer, _exiting, rowidCache, SUBSCR_NAME`.
**Detail:** Không có chiều "DB nào"; module hiện chỉ phục vụ 1 DB.

### Finding 2: Recovery = process.exit, all-or-nothing
**Evidence:** `chat-server/cqn.js:15-28` (`fatalRestart`→`process.exit(1)`), comment F2 nêu OCI thick mode giữ listener trên CQN_PORT cấp process suốt đời process; re-subscribe in-process → ORA-24912.
**Detail:** 1 DB lỗi trong N → giết cả process → pm2 dựng lại toàn bộ N subscription. Không partial-recover được in-process.

### Finding 3: CQN listener bind 1 host:port
**Evidence:** `chat-server/cqn.js:197-211` subscribe với ipAddress=CQN_HOST, port=CQN_PORT.

### Finding 4: Health check đơn-subscription
**Evidence:** `chat-server/cqn.js:163-188` match 1 registration theo host:port + `_regId` đơn trị.

### Finding 5: events.js key bằng bare aus_id
**Evidence:** `chat-server/events.js:10,49,91` — sseConnections/eventBuffer key = String(ausId).
**Detail:** Không có dbKey → aus_id đụng độ xuyên DB.

### Finding 6: SSE token không có định danh DB
**Evidence:** `chat-server/token.js:7,34,42` — body `<aus_id>|<exp>`, verifyToken trả `{ausId}`.

## Deduced Conclusions

### Deduction 1: Share 1 CQN_PORT cho N DB
**Based on:** F2 (1 listener/process), F3.
**Reasoning:** Thick mode tạo 1 notification listener/process; nhiều DB trỏ callback về cùng CQN_HOST:CQN_PORT, OCI route theo reg id.
**Conclusion:** Không cần N port. (Vẫn Hypothesized cho tới khi POC.)

### Deduction 2: N-in-one-process phá recovery
**Based on:** F2.
**Conclusion:** Hub mong manh bằng DB tệ nhất; xác suất lỗi tăng theo N. Cần fault isolation cấp process → 1 process/DB cho CQN.

### Deduction 3: SSE không được chia mảnh
**Based on:** F5 + kiến trúc SSE (browser nối 1 endpoint Server B).
**Conclusion:** Nếu mỗi DB 1 process độc lập, SSE state bị chia → cần 1 gateway giữ toàn bộ SSE. ⇒ Phương án C hybrid.

## Hypothesized Paths

### Hypothesis 1: 1 CQN_PORT phục vụ N DB trong POC 2-DB
**Status:** Confirmed (cùng-instance) / Open (khác-instance)
**Resolution:** POC `test-cqn-multidb.js` chạy trên Server B — 2 subscription từ 2 schema trên CÙNG instance (172.25.10.18/pdbgc19c) share CQN_PORT 3411, cả hai active, KHÔNG ORA-24912. Bối cảnh làm rõ: "nhiều DB" = nhiều schema/1 instance (tương lai có thể thêm instance). Còn thiếu bước INSERT-test xác nhận định tuyến đúng schema. Kịch bản khác-instance chưa test (chưa có instance thứ 2) nhưng Phương án C không phụ thuộc.
**Would refute (phần còn Open):** worker cho instance thứ 2 subscribe báo ORA-24912 khi dùng lại port của instance 1 (dự kiến mỗi instance 1 port riêng).

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | --- | --- |
| POC N-DB share port | Xác nhận Deduction 1 | Dựng 2 connection tới 2 DB test, cùng CQN_PORT, INSERT thử |
| .env thực tế trên Server B | Xác nhận CQN_PORT đang chạy (docs mâu thuẫn 3411 vs 3141) | Đọc .env trên Server B |

## Conclusion

**Confidence: Medium.** Ràng buộc Confirmed từ code; 1 điểm Hypothesized (share port). Khuyến nghị **Phương án C (hybrid)**: gateway giữ SSE + N worker process/DB giữ CQN (process.exit recovery độc lập) + forward nội bộ. Bắt buộc namespacing `dbKey` trước tiên. Chi tiết đầy đủ + sơ đồ + danh sách file: `chat-server/docs/multi-db-research.md`.

## Recommended Next Steps

### Fix direction
1. Namespacing `dbKey` (token.js, events.js, sseToken) — chặn tất cả, làm trước.
2. POC Hypothesis 1 (share port).
3. Tách gateway vs cqn-worker; registry + supervisor pm2.

### Diagnostic
POC 2-DB để đóng Hypothesis 1.

## Side Findings

- Docs mâu thuẫn CQN_PORT: CLAUDE.md ghi 3411, docs/pitfalls.md ghi 3141, cqn-setup-guide.md ghi 3141. Cần thống nhất (Confirmed mâu thuẫn tài liệu).

## Status: Concluded (Giai đoạn 1) — chờ user chốt topology cho Giai đoạn 2.
