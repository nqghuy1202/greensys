# CQN Setup Guide — Oracle 19.3 + Node.js

## Topology

```
Server A (192.168.1.10)          Server B (192.168.1.20)
Oracle DB 19.3 + APEX       ◄──  Node.js 22 (repo này)
                             TCP:1521 (kết nối DB + đăng ký CQN)
                            ──►  APEX Browser Clients
                             TCP:3141 (Oracle gọi ngược về — CQN callback)
                             WebSocket:3140 (Socket.io)
```

> **Oracle 19.3 không hỗ trợ `clientInitiated: true`** (yêu cầu 19.4+).  
> Dùng **Option A**: Oracle tự gọi ngược về `CQN_HOST:CQN_PORT` trên Server B.  
> Firewall bắt buộc: Server A → Server B:3141 (TCP inbound).

---

## Bước 1 — Điền `.env` trên Server B

```bash
cp .env.example .env
nano .env
```

```env
DB_USER=DEV24
DB_PASSWORD=<mật_khẩu_thực>
DB_CONNECTION_STRING=192.168.1.10/FREEPDB1

DB_POOL_MIN=2
DB_POOL_MAX=10
DB_POOL_INCREMENT=1

PORT=3140
NODE_ENV=production
APEX_ORIGINS=http://192.168.1.10:8080

CQN_HOST=192.168.1.20      # IP Server B — Oracle gọi về đây
CQN_PORT=3141              # Port Oracle dùng để gửi notification
```

---

## Bước 2 — Oracle Instant Client (Server B — Linux)

CQN bắt buộc **Thick mode** — Node.js phải thấy `libclntsh`.

```bash
# Kiểm tra đã cài chưa
ldconfig -p | grep libclntsh

# Nếu chưa → cài Basic package (khớp version DB, ví dụ 23.5):
sudo rpm -ivh oracle-instantclient23.5-basic-23.5.0.0.0-1.el8.x86_64.rpm
sudo dnf install -y libaio
sudo sh -c "echo /opt/oracle/instantclient_23_5 > /etc/ld.so.conf.d/oracle-instantclient.conf"
sudo ldconfig

# Verify
ldconfig -p | grep libclntsh   # Phải thấy libclntsh.so
```

---

## Bước 3 — Cài dependencies

```bash
cd /opt/chat-server   # thư mục chứa repo
npm install
```

---

## Bước 4 — Test CQN độc lập (không Socket.io)

```bash
node test-cqn.js
```

**Output mong đợi — treo ở đây là bình thường (đang chờ Oracle callback):**

```
[Mode] Thick mode OK
[CQN] Đang kết nối tới Oracle DB...
[CQN] connectString: 192.168.1.10/FREEPDB1
[CQN] Kết nối OK

[CQN] Registering callback to 192.168.1.20:3141 ...
[CQN] Subscription đăng ký thành công!
[CQN] Đang lắng nghe... (INSERT vào USER_NOTIFICATIONS để test)
```

---

## Bước 5 — Verify subscription trên Oracle (Server A)

Chạy với user `DEV24` trong SQL*Plus hoặc APEX SQL Workshop:

```sql
SELECT regid, table_name, callback
FROM   user_change_notification_regs
ORDER  BY regid DESC;
```

**Phải thấy** dòng `DEV24.USER_NOTIFICATIONS` với callback về `192.168.1.20:3141`.

Nếu không có dòng nào → subscription chưa đăng ký được, kiểm tra lỗi ở Bước 4.

---

## Bước 6 — Test INSERT để kích hoạt CQN

Chạy trên Oracle (Server A) với user `DEV24`:

```sql
INSERT INTO user_notifications (ano_id, aus_id, read, deleted, create_date, created_by)
VALUES (
  (SELECT MAX(ano_id) FROM app_notifications),
  1,        -- đổi thành aus_id thực tế nếu cần
  'N', 'N',
  SYSDATE,
  'CQN_TEST'
);
COMMIT;
```

**Server B console phải in ngay:**

```
[CQN] Nhận được notification!
[CQN] Type: 100
[CQN] Bảng: DEV24.USER_NOTIFICATIONS | Operation: 2
[CQN]   ROWID: AAAxxxxx | Op: 2
```

Nếu không có gì → xem mục Troubleshooting bên dưới.

---

## Bước 7 — Chạy server đầy đủ

Dừng `test-cqn.js` trước (Ctrl+C) để giải phóng subscription name, rồi:

```bash
node server.js
```

**Output mong đợi:**

```
[DB] Mode: Thick
[DB] Connection pool created
[Server] Listening on 0.0.0.0:3140
[CQN] Will register callback to 192.168.1.20:3141
[CQN] Connecting with events:true ...
[CQN] Connected. Registering subscription...
[CQN] Subscription active on USER_NOTIFICATIONS
[CQN] Registered: [123:DEV24.USER_NOTIFICATIONS]
```

---

## Bước 8 — Verify quyền Oracle (chạy 1 lần, DBA)

```sql
-- Kiểm tra quyền hiện tại
SELECT grantee, privilege
FROM   dba_sys_privs
WHERE  grantee = 'DEV24';

-- Nếu thiếu CHANGE NOTIFICATION → cấp:
GRANT CHANGE NOTIFICATION TO DEV24;

-- Kiểm tra tên bảng app_users (resolveUsername dùng cột này)
SELECT table_name, column_name
FROM   user_tab_columns
WHERE  column_name IN ('USERNAME', 'LOGIN_NAME')
ORDER  BY table_name;
```

---

## Troubleshooting

### ORA-29970: Specified registration name already exists

Subscription cũ chưa xóa. Chạy với `DEV24`:

```sql
BEGIN
  DBMS_CQ_NOTIFICATION.DEREGISTER(
    regid => (
      SELECT regid
      FROM   user_change_notification_regs
      WHERE  table_name = 'DEV24.USER_NOTIFICATIONS'
      FETCH FIRST 1 ROW ONLY
    )
  );
END;
/
```

Hoặc xóa tất cả subscription của DEV24:

```sql
BEGIN
  FOR r IN (SELECT regid FROM user_change_notification_regs) LOOP
    DBMS_CQ_NOTIFICATION.DEREGISTER(r.regid);
  END LOOP;
END;
/
```

---

### NJS-059 hoặc không vào Thick mode

```
[Error] CQN yêu cầu Thick mode. Cài Oracle Instant Client trước.
```

Làm lại Bước 2. Sau đó kiểm tra:

```bash
node -e "const o=require('oracledb'); o.initOracleClient(); console.log(o.thin ? 'THIN (lỗi)' : 'THICK (OK)')"
```

---

### Không nhận callback sau khi COMMIT

Oracle không connect được về Server B:3141. Kiểm tra firewall từ **Server A**:

```bash
# Chạy trên Server A
telnet 192.168.1.20 3141
# Hoặc:
nc -zv 192.168.1.20 3141
```

Nếu timeout → mở firewall Server B:

```bash
# Trên Server B (Linux)
sudo firewall-cmd --permanent --add-port=3141/tcp
sudo firewall-cmd --reload
```

---

### Callback đến nhưng message.queries rỗng

Kiểm tra QoS flag trong `test-cqn.js` và `cqn.js`:

```js
qos: oracledb.SUBSCR_QOS_QUERY | oracledb.SUBSCR_QOS_ROWIDS
```

Không dùng `message.tables` — phải dùng `message.queries[i].tables[j]`.

---

### resolveUsername không ra kết quả

Tên bảng/cột `app_users.username` chưa khớp với schema thực tế. Kiểm tra:

```sql
SELECT table_name, column_name
FROM   user_tab_columns
WHERE  column_name IN ('USERNAME', 'LOGIN_NAME', 'USER_NAME')
ORDER  BY table_name;
```

Sau đó sửa `socket/socketManager.js:67` cho đúng tên bảng và cột.

---

## Checklist cuối

- [ ] `.env` đã điền đầy đủ (đặc biệt `DB_PASSWORD`, `CQN_HOST`)
- [ ] Oracle Instant Client đã cài, `ldconfig -p | grep libclntsh` ra kết quả
- [ ] `node test-cqn.js` chạy không lỗi, treo chờ notification
- [ ] `user_change_notification_regs` có dòng `DEV24.USER_NOTIFICATIONS`
- [ ] Firewall Server A → Server B:3141 đã mở
- [ ] INSERT test → Server B nhận `[CQN] Nhận được notification!`
- [ ] `node server.js` chạy ổn, log `Subscription active`
- [ ] Tên bảng/cột `app_users` đã verify với DBA
