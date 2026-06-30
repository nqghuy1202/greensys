# Deferred Work

## Tách CQN sang process riêng (cô lập khỏi SSE)
**Nguồn:** review spec-cqn-recovery-exit-on-failure (2026-06-30).
**Vấn đề:** Sau fix `fatalRestart` → `process.exit(1)`, lỗi CQN làm cả `chat-server` thoát → SSE/chat rớt theo tới khi pm2 restart. Trường hợp thường chỉ 1 blip (client tự reconnect), nhưng nếu CQN không bao giờ subscribe được (quyền/firewall/DB) thì process bounce lặp, SSE rớt mỗi vài phút.
**Hướng:** Chạy CQN trong process pm2 riêng (vd `cqn-worker`), đẩy notification sang chat-server qua IPC/HTTP nội bộ → CQN crash không kéo SSE xuống. Hoặc nâng cấp DB ≥19.4 dùng `clientInitiated: true` (không cần listener ngược → không vướng ORA-24912).
**Ưu tiên:** Medium — chỉ cần khi CQN hay fail kéo dài; hiện fix exit-restart đã đủ cho ca thường.

## Dọn registration mồ côi + sửa docs IP
**Nguồn:** điều tra cqn-realtime-loss (2026-06-30).
- DBA cấp `GRANT EXECUTE ON DBMS_CQ_NOTIFICATION TO DEV24` rồi `DEREGISTER` reg mồ côi 35104 (callback .38). Không bắt buộc (reg .50 mới chạy song song) nhưng nên dọn.
- Sửa docs ghi sai Server B = 172.25.10.38 → đúng là **172.25.10.50** (CLAUDE.md, docs/cqn-setup-guide.md, docs/oracle-db.md DB_CONNECTION_STRING context).
