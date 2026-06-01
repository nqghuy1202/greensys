---
document_type: technical_research_deep
title: CQN Option A — Deep Research for APP_NOTIFICATIONS & USER_NOTIFICATIONS
version: "1.0"
created_date: 2026-05-19
language: vi + en
tables: [APP_NOTIFICATIONS, USER_NOTIFICATIONS]
server_topology: "Server A: Oracle DB 23ai + APEX 24.2 | Server B: Node.js 22 middleware"
tags: [CQN, clientInitiated, thick-mode, oracle-instant-client, USER_NOTIFICATIONS, node-oracledb]
---

# CQN Option A — Deep Research

## TL;DR Quyết định thiết kế

| Câu hỏi | Quyết định | Lý do |
|---------|-----------|-------|
| Subscribe bảng nào? | **Chỉ `USER_NOTIFICATIONS`** | INSERT vào đây là trigger thực tế |
| Có JOIN với APP_NOTIFICATIONS không? | **KHÔNG** — subscribe riêng | JOIN làm CQN phức tạp, fire thêm event không cần thiết |
| QoS mode? | **`SUBSCR_QOS_QUERY \| SUBSCR_QOS_ROWIDS`** | Lấy ROWID để fetch dữ liệu, chỉ fire khi result thực sự thay đổi |
| Guaranteed hay best-effort? | **Guaranteed** — query đủ đơn giản | Không có aggregate, không có outer join |
| clientInitiated? | **`true`** | Cross-server, không cần DB mở connection về Node.js |

---

## 1. Tại sao KHÔNG subscribe JOIN giữa 2 bảng

**Ý tưởng ban đầu có thể là:**
```sql
-- ĐỪNG làm thế này
SELECT un.ano_id, un.aus_id, an.ano_name
FROM user_notifications un
JOIN app_notifications an ON an.ano_id = un.ano_id
WHERE un.deleted = 'N'
```

**Vấn đề với JOIN trong CQN:**

1. **Cả 2 bảng đều bị register** — Oracle theo dõi cả `USER_NOTIFICATIONS` lẫn `APP_NOTIFICATIONS`
2. **INSERT vào `APP_NOTIFICATIONS`** (bước đầu của ERP flow) cũng fire callback → Node.js nhận event thừa
3. **UPDATE bất kỳ row nào** trong `APP_NOTIFICATIONS` → fire callback → phải check lại xem có user nào bị ảnh hưởng không
4. **Trong guaranteed mode**, JOIN query yêu cầu PK/FK constraints và inner equijoin — phức tạp hơn để verify
5. **Debugging khó hơn**: callback fire nhưng không rõ bảng nào thay đổi

**Đúng là:**
```sql
-- CHỈ subscribe USER_NOTIFICATIONS
SELECT ano_id, aus_id FROM user_notifications WHERE deleted = 'N'
```
Khi callback fire → dùng **pool connection riêng** để JOIN query lấy đầy đủ thông tin.

---

## 2. Flow đầy đủ với 2 bảng

```
[ERP INSERT vào APP_NOTIFICATIONS]
    → INSERT vào USER_NOTIFICATIONS (gắn notification với user)
    → COMMIT

    ↓ Oracle redo log detect change
    ↓ CQN notification gửi qua TCP connection về Node.js (Server B)

[CQN Callback fires on Node.js]
    message.queries[0].tables[0] = { name: "DEV24.USER_NOTIFICATIONS", operation: INSERT }
    row.rowid = "AAABBBAAAFAAAACXAAA"
    row.operation = CQN_OPCODE_INSERT (2)

    ↓ Dùng pool connection query DB

[Pool connection query:]
    SELECT un.ano_id, un.aus_id, an.ano_name, an.ano_summary
    FROM user_notifications un
    JOIN app_notifications an ON an.ano_id = un.ano_id
    WHERE un.rowid = :rowid

    ↓ Map aus_id → username (query ERP user table)
    ↓ Socket.io emit tới room "user:{username}"

[APEX browser bell refresh]
```

---

## 3. DB Prerequisites trên Server A (Chạy với DBA/SYS)

### 3.1 Cấp quyền CQN

```sql
-- Cấp quyền CHANGE NOTIFICATION cho user DEV24
GRANT CHANGE NOTIFICATION TO DEV24;

-- Verify:
SELECT GRANTEE, PRIVILEGE
FROM DBA_SYS_PRIVS
WHERE GRANTEE = 'DEV24' AND PRIVILEGE = 'CHANGE NOTIFICATION';
```

### 3.2 Kiểm tra JOB_QUEUE_PROCESSES

`JOB_QUEUE_PROCESSES` chỉ cần cho PL/SQL callbacks. Node-oracledb dùng **OCI client-side callbacks** nên **không bắt buộc**. Tuy nhiên nên verify để tránh nhầm lẫn:

```sql
-- Kiểm tra (chỉ FYI):
SHOW PARAMETER JOB_QUEUE_PROCESSES;
-- NAME                   TYPE    VALUE
-- ---------------------- ------- -----
-- job_queue_processes    integer 10    ← OK, nonzero

-- Nếu = 0 thì set lại (cho các scheduler jobs khác):
ALTER SYSTEM SET JOB_QUEUE_PROCESSES = 10;
```

### 3.3 Verify SELECT privileges trên bảng

DEV24 phải có SELECT trên cả 2 bảng (để CQN register và để callback query):

```sql
-- Kiểm tra từ DEV24:
SELECT COUNT(*) FROM user_notifications WHERE ROWNUM = 1;
SELECT COUNT(*) FROM app_notifications  WHERE ROWNUM = 1;

-- Nếu chưa có:
GRANT SELECT ON DEV24.USER_NOTIFICATIONS TO DEV24;  -- thường không cần nếu owner
-- Nếu bảng do schema khác sở hữu:
GRANT SELECT ON ERP_SCHEMA.USER_NOTIFICATIONS TO DEV24;
GRANT SELECT ON ERP_SCHEMA.APP_NOTIFICATIONS  TO DEV24;
```

### 3.4 Kiểm tra AQ/Change Notification đang enabled

```sql
-- Xem các CQN registrations hiện tại của DEV24:
SELECT regid, table_name, operations_filter, changelag
FROM user_change_notification_regs;

-- Xem CQN queries:
SELECT queryid, regid, TO_CHAR(querytext) AS querytext
FROM user_cq_notification_queries;
```

---

## 4. Oracle Instant Client — Cài trên Server B (Linux)

### 4.1 Download

Tải từ: https://www.oracle.com/database/technologies/instant-client/linux-x86-64-downloads.html

- Chọn version **23.x** (khớp với Oracle DB 23ai trên Server A)
- Package: **Basic** (oracle-instantclient23.x-basic-*.rpm)

### 4.2 Cài bằng RPM (Oracle Linux / RHEL / CentOS)

```bash
# Cài RPM
sudo dnf install -y oracle-instantclient23.5-basic-23.5.0.0.0-1.el8.x86_64.rpm

# Hoặc nếu không dùng dnf:
sudo rpm -ivh oracle-instantclient23.5-basic-23.5.0.0.0-1.el8.x86_64.rpm

# Cài thêm libaio nếu thiếu:
sudo dnf install -y libaio
```

### 4.3 Cài theo cách thủ công (nếu không dùng RPM)

```bash
# Giải nén vào /opt/oracle
sudo mkdir -p /opt/oracle
sudo unzip instantclient-basic-linux.x64-23.5.0.0.0dbru.zip -d /opt/oracle

# Tạo symlink nếu cần:
# ls /opt/oracle/instantclient_23_5/

# Thêm vào ldconfig:
sudo sh -c "echo /opt/oracle/instantclient_23_5 > /etc/ld.so.conf.d/oracle-instantclient.conf"
sudo ldconfig
```

### 4.4 Verify cài đặt

```bash
# Tìm libclntsh.so:
find /usr/lib/oracle /opt/oracle -name "libclntsh.so*" 2>/dev/null
# Expected: /usr/lib/oracle/23.5/client64/lib/libclntsh.so.23.1

# Verify ldconfig biết đường dẫn:
ldconfig -p | grep libclntsh
# Expected: libclntsh.so.23.1 => /usr/lib/oracle/23.5/client64/lib/libclntsh.so.23.1

# Nếu dùng LD_LIBRARY_PATH (tạm thời để test):
export LD_LIBRARY_PATH=/usr/lib/oracle/23.5/client64/lib:$LD_LIBRARY_PATH
```

### 4.5 Khởi tạo Thick mode trong Node.js

```javascript
// QUAN TRỌNG: trên Linux, KHÔNG set libDir
// Thư viện phải ở trong system path TRƯỚC khi Node.js khởi động

const oracledb = require('oracledb');

// Đúng cách trên Linux:
oracledb.initOracleClient();  // Không tham số

// SAI (chỉ dùng trên Windows/macOS):
// oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_23_5' });
```

### 4.6 Test Thick mode thành công

```javascript
// test-thick.js
const oracledb = require('oracledb');
oracledb.initOracleClient();

console.log('Mode:', oracledb.thin ? 'Thin' : 'Thick');
// Expected: Mode: Thick

oracledb.getConnection({
  user:          'DEV24',
  password:      'your_password',
  connectString: '192.168.1.10/FREEPDB1',
  events:        true
}).then(async conn => {
  const result = await conn.execute('SELECT * FROM V$VERSION WHERE ROWNUM=1');
  console.log('DB Version:', result.rows[0][0]);
  await conn.close();
}).catch(err => {
  console.error('Connection failed:', err.message);
});
```

```bash
node test-thick.js
# Expected:
# Mode: Thick
# DB Version: Oracle Database 23ai Free Release 23.0.0.0.0 - ...
```

---

## 5. CQN Subscribe — Đầy đủ cho USER_NOTIFICATIONS

### 5.1 SQL query tốt nhất để subscribe

```sql
-- Phương án 1 (đơn giản nhất — object level, luôn fire khi có INSERT)
SELECT ano_id, aus_id FROM user_notifications

-- Phương án 2 (dùng SUBSCR_QOS_QUERY — chỉ fire khi result thay đổi)
-- Tốt hơn: lọc deleted='N' để không fire khi soft-delete
SELECT ano_id, aus_id FROM user_notifications WHERE deleted = 'N'
```

**Khuyến nghị: Phương án 2** với `SUBSCR_QOS_QUERY`.

Lý do:
- Khi ERP soft-delete một notification (`UPDATE deleted='Y'`), row đó rời khỏi result set của query → fire callback
  - Đây là trường hợp không cần thiết (deleted, không cần push lên APEX)
  - Nhưng logic trong callback sẽ query DB và thấy row đó `deleted='Y'` → bỏ qua
  - **Không gây lỗi**, chỉ thêm 1 DB query không cần thiết
- Alternative: dùng không filter `SELECT ano_id, aus_id FROM user_notifications` rồi filter trong callback
- Cả 2 đều OK

### 5.2 Subscribe Options — Giải thích từng field

```javascript
await cqnConn.subscribe('user_notif_watcher', {
  
  // --- CÁI NÀY LÀ QUAN TRỌNG NHẤT ---
  clientInitiated: true,
  // Node.js (Server B) tự duy trì TCP connection tới Oracle (Server A:1521)
  // Oracle gửi notification ngược lại QUA connection đó
  // KHÔNG cần DB biết IP của Server B
  // KHÔNG cần mở port inbound trên Server B
  // Yêu cầu: Oracle DB + Client >= 19.4 (Oracle 23ai: ✓)

  sql: `SELECT ano_id, aus_id FROM user_notifications WHERE deleted = 'N'`,
  // Query đơn giản, không JOIN, không aggregate, không function
  // Đây là query Oracle dùng để biết "result set" cần theo dõi
  
  callback: onUserNotificationInsert,
  // Hàm được gọi khi Oracle phát hiện thay đổi trong result set
  // Chạy trong Node.js main thread (không cần worker)
  
  qos: oracledb.SUBSCR_QOS_QUERY | oracledb.SUBSCR_QOS_ROWIDS,
  // SUBSCR_QOS_QUERY:  chỉ fire khi result set thực sự thay đổi
  //                    (không fire khi row bên ngoài WHERE bị sửa)
  // SUBSCR_QOS_ROWIDS: callback nhận ROWID của từng row thay đổi
  //                    cần ROWID để query lại DB lấy dữ liệu đầy đủ
  
  // timeout: 0,       // 0 = không bao giờ expire (mặc định)
  // timeout: 3600,    // 3600s = 1 giờ, sau đó cần re-subscribe
});
```

### 5.3 Callback Message Structure — Khi dùng SUBSCR_QOS_QUERY

```
message
├── type          = oracledb.SUBSCR_EVENT_TYPE_OBJ_CHANGE (6)  ← thay đổi object
│                  oracledb.SUBSCR_EVENT_TYPE_DEREG         ← subscription bị hủy
├── dbName        = "FREEPDB1"
├── txId          = Buffer (transaction ID — ít dùng)
└── queries[]     ← mảng queries (tương ứng với mỗi lần gọi subscribe)
    └── [0]       ← query đầu tiên (user_notifications)
        └── tables[]  ← các bảng bị thay đổi
            └── [0]
                ├── name       = "DEV24.USER_NOTIFICATIONS"
                ├── operation  = bitmask của CQN_OPCODE_*
                │                CQN_OPCODE_INSERT (2)
                │                CQN_OPCODE_UPDATE (4)
                │                CQN_OPCODE_DELETE (8)
                │                CQN_OPCODE_ALL    (30)  ← nhiều loại
                └── rows[]    ← null nếu quá nhiều rows (>~80) hoặc SUBSCR_QOS_ROWIDS không set
                    └── [k]
                        ├── rowid     = "AAAXxxAAFAAABZqAAA"  ← dùng để query lại
                        └── operation = CQN_OPCODE_INSERT (2)
```

**QUAN TRỌNG:**
- `message.queries` (không phải `message.tables`) — khi dùng `SUBSCR_QOS_QUERY`
- `message.tables` chỉ có khi dùng object-level (không có `SUBSCR_QOS_QUERY`)

---

## 6. Code Đầy Đủ — cqn.js

```javascript
// cqn.js
'use strict';

const oracledb = require('oracledb');

// ──────────────────────────────────────────────────────────
// CONSTANTS
// ──────────────────────────────────────────────────────────
const DB_CONFIG = {
  user:          process.env.DB_USER,          // 'DEV24'
  password:      process.env.DB_PASSWORD,
  connectString: process.env.DB_CONNECT_STRING, // '192.168.1.10/FREEPDB1'
  events:        true                           // BẮT BUỘC cho CQN
};

const SUBSCRIBE_NAME = 'user_notif_watcher';

const SUBSCRIBE_SQL = `
  SELECT ano_id, aus_id
  FROM   user_notifications
  WHERE  deleted = 'N'
`;

// ──────────────────────────────────────────────────────────
// CALLBACK — gọi khi Oracle phát hiện thay đổi
// ──────────────────────────────────────────────────────────
async function onUserNotificationChange(message) {
  console.log('[CQN] Received notification, type:', message.type);

  // Bỏ qua deregistration events
  if (message.type === oracledb.SUBSCR_EVENT_TYPE_DEREG) {
    console.warn('[CQN] Subscription deregistered by database — will re-subscribe');
    return;
  }

  if (message.type !== oracledb.SUBSCR_EVENT_TYPE_OBJ_CHANGE) {
    console.log('[CQN] Unknown event type, skipping');
    return;
  }

  // Với SUBSCR_QOS_QUERY: dùng message.queries
  const queries = message.queries || [];
  if (queries.length === 0) {
    console.log('[CQN] No queries in message');
    return;
  }

  for (const query of queries) {
    for (const table of (query.tables || [])) {
      console.log('[CQN] Table changed:', table.name, '| operation:', table.operation);

      // Chỉ xử lý USER_NOTIFICATIONS
      if (!table.name.toUpperCase().includes('USER_NOTIFICATIONS')) continue;

      // Kiểm tra INSERT (có thể là bitmask — dùng bitwise AND)
      const hasInsert = (table.operation & oracledb.CQN_OPCODE_INSERT) !== 0;
      if (!hasInsert) {
        console.log('[CQN] Not an INSERT operation, skipping');
        continue;
      }

      // rows có thể null nếu quá nhiều rows hoặc ROWID không available
      if (!table.rows || table.rows.length === 0) {
        console.warn('[CQN] No ROWID data (FULL-TABLE-NOTIFICATION) — falling back to query');
        await handleFullTableNotification();
        continue;
      }

      // Xử lý từng row INSERT
      for (const row of table.rows) {
        const isInsert = (row.operation & oracledb.CQN_OPCODE_INSERT) !== 0;
        if (!isInsert) continue;

        console.log('[CQN] New row inserted, ROWID:', row.rowid);
        await handleNewNotificationByRowid(row.rowid);
      }
    }
  }
}

// ──────────────────────────────────────────────────────────
// XỬ LÝ INSERT — Query dữ liệu đầy đủ qua ROWID
// ──────────────────────────────────────────────────────────
// Hàm này sẽ được inject từ socketManager.js
let _emitToUser;
let _resolveUsername;

async function handleNewNotificationByRowid(rowid) {
  let conn;
  try {
    // Dùng connection MỚI từ pool (KHÔNG dùng CQN connection)
    conn = await oracledb.getConnection({
      user:          process.env.DB_USER,
      password:      process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT_STRING
      // events: false (mặc định) — đây là query connection thông thường
    });

    const result = await conn.execute(
      `SELECT un.ano_id,
              un.aus_id,
              an.ano_name,
              an.ano_summary,
              an.list_men_id,
              an.redirect_w_v_noti
       FROM   user_notifications un
       JOIN   app_notifications  an ON an.ano_id = un.ano_id
       WHERE  un.rowid   = :rid
         AND  un.deleted = 'N'`,
      { rid: rowid },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      // Row có thể đã bị delete hoặc không match WHERE (e.g., deleted='Y')
      console.log('[CQN] Row not found or already deleted, rowid:', rowid);
      return;
    }

    const notif = result.rows[0];
    const username = await _resolveUsername(conn, notif.AUS_ID);

    if (!username) {
      console.warn('[CQN] Cannot resolve username for aus_id:', notif.AUS_ID);
      return;
    }

    _emitToUser(username, {
      anoId:    notif.ANO_ID,
      title:    notif.ANO_NAME,
      summary:  notif.ANO_SUMMARY,
      menuId:   notif.LIST_MEN_ID,
      redirect: notif.REDIRECT_W_V_NOTI === 'Y'
    });

  } catch (err) {
    console.error('[CQN] handleNewNotificationByRowid error:', err.message);
  } finally {
    if (conn) {
      try { await conn.close(); } catch {}
    }
  }
}

// ──────────────────────────────────────────────────────────
// FALLBACK — khi ROWID không available (>80 rows trong 1 transaction)
// ──────────────────────────────────────────────────────────
async function handleFullTableNotification() {
  // Đây là edge case: ERP insert rất nhiều notification cùng lúc
  // Fallback: query tất cả unread notifications vừa được tạo (trong 5 phút)
  let conn;
  try {
    conn = await oracledb.getConnection({
      user:          process.env.DB_USER,
      password:      process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT_STRING
    });

    const result = await conn.execute(
      `SELECT un.ano_id, un.aus_id, an.ano_name, an.ano_summary
       FROM   user_notifications un
       JOIN   app_notifications  an ON an.ano_id = un.ano_id
       WHERE  un.deleted    = 'N'
         AND  un.read       = 'N'
         AND  un.create_date >= SYSDATE - INTERVAL '5' MINUTE
       ORDER  BY un.create_date DESC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    for (const notif of result.rows) {
      const username = await _resolveUsername(conn, notif.AUS_ID);
      if (username) {
        _emitToUser(username, {
          anoId:   notif.ANO_ID,
          title:   notif.ANO_NAME,
          summary: notif.ANO_SUMMARY
        });
      }
    }
  } catch (err) {
    console.error('[CQN] handleFullTableNotification error:', err.message);
  } finally {
    if (conn) {
      try { await conn.close(); } catch {}
    }
  }
}

// ──────────────────────────────────────────────────────────
// CQN CONNECTION — với auto-reconnect
// ──────────────────────────────────────────────────────────
async function startCQN({ emitToUser, resolveUsername }) {
  _emitToUser      = emitToUser;
  _resolveUsername = resolveUsername;

  while (true) {
    let cqnConn;
    try {
      console.log('[CQN] Connecting to Oracle DB:', process.env.DB_CONNECT_STRING);

      cqnConn = await oracledb.getConnection(DB_CONFIG);

      console.log('[CQN] Connected. Registering subscription...');

      await cqnConn.subscribe(SUBSCRIBE_NAME, {
        sql:             SUBSCRIBE_SQL,
        callback:        onUserNotificationChange,
        clientInitiated: true,
        qos:             oracledb.SUBSCR_QOS_QUERY | oracledb.SUBSCR_QOS_ROWIDS
      });

      console.log('[CQN] Subscription active on USER_NOTIFICATIONS');

      // Kiểm tra registration trong DB (log để debug):
      const reg = await cqnConn.execute(
        `SELECT regid, table_name FROM user_change_notification_regs`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      console.log('[CQN] Registered tables:', reg.rows.map(r => r.TABLE_NAME));

      // Giữ connection sống mãi mãi
      // Promise này chỉ resolve khi connection bị lỗi
      await new Promise((_, reject) => {
        // CQN connection error handler
        const pingInterval = setInterval(async () => {
          try {
            await cqnConn.ping();
          } catch (pingErr) {
            clearInterval(pingInterval);
            reject(pingErr);
          }
        }, 30000); // Ping mỗi 30 giây để phát hiện connection drop
      });

    } catch (err) {
      console.error('[CQN] Connection error:', err.message);
      console.log('[CQN] Retrying in 15 seconds...');

      try {
        if (cqnConn) await cqnConn.close();
      } catch {}

      await new Promise(r => setTimeout(r, 15000));
    }
  }
}

module.exports = { startCQN };
```

---

## 7. aus_id → username Mapping

```javascript
// socket/socketManager.js (phần resolveUsername)

// Cache để tránh query DB mỗi lần (aus_id không thay đổi)
const ausIdCache = new Map();  // Map<ausId, username>

async function resolveUsername(conn, ausId) {
  if (!ausId) return null;

  // Kiểm tra cache trước
  if (ausIdCache.has(ausId)) {
    return ausIdCache.get(ausId);
  }

  try {
    // CẦN XÁC NHẬN TÊN BẢNG VÀ COLUMN với DBA
    // Khả năng: APP_USERS, ACCOUNTS_USERS, SYS_USERS, ERP_USERS
    const result = await conn.execute(
      `SELECT username            -- Tên column chứa login username
       FROM   app_users           -- TÊN BẢNG — cần xác nhận
       WHERE  id = :ausId`,       -- column PK tương ứng aus_id
      { ausId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const username = result.rows[0]?.USERNAME?.toLowerCase() || null;

    if (username) {
      // Cache lại (có thể expire sau 1 giờ nếu cần)
      ausIdCache.set(ausId, username);
    }

    return username;
  } catch (err) {
    console.error('[CQN] resolveUsername error for aus_id', ausId, ':', err.message);
    return null;
  }
}
```

**Query để xác nhận tên bảng (chạy với DEV24 trên Server A):**
```sql
-- Tìm bảng nào có column aus_id hoặc user_id và username
SELECT table_name, column_name
FROM   user_tab_columns
WHERE  column_name IN ('AUS_ID', 'USER_ID', 'ID', 'USERNAME', 'LOGIN_NAME', 'USER_NAME')
ORDER  BY table_name, column_name;

-- Hoặc tìm bảng có cả 2 cột: ID (hoặc AUS_ID) + USERNAME
SELECT t1.table_name
FROM   user_tab_columns t1
JOIN   user_tab_columns t2 ON t1.table_name = t2.table_name
WHERE  t1.column_name IN ('ID', 'AUS_ID')
  AND  t2.column_name IN ('USERNAME', 'LOGIN_NAME', 'USER_NAME');
```

---

## 8. server.js — Entry Point Tích hợp

```javascript
// server.js
'use strict';
require('dotenv').config();

const oracledb = require('oracledb');

// ① THICK MODE — PHẢI LÀ DÒNG ĐẦU TIÊN (trên Linux, không có libDir)
oracledb.initOracleClient();

const express        = require('express');
const { createServer } = require('http');
const { Server }     = require('socket.io');
const { startCQN }   = require('./cqn');
const socketMgr      = require('./socket/socketManager');

const app        = express();
const httpServer = createServer(app);

// ② SOCKET.IO với CORS cho APEX browser
const io = new Server(httpServer, {
  cors: {
    origin:      process.env.APEX_ORIGINS.split(',').map(s => s.trim()),
    methods:     ['GET', 'POST'],
    credentials: true
  }
});

socketMgr.init(io);
app.get('/health', (req, res) => res.json({ ok: true, mode: oracledb.thin ? 'thin' : 'thick' }));

// ③ START
const PORT = process.env.PORT || 3140;
httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`[Server] Running on 0.0.0.0:${PORT}`);
  console.log(`[Server] oracledb mode: ${oracledb.thin ? 'THIN' : 'THICK'}`);

  // ④ START CQN (trong background loop)
  startCQN({
    emitToUser:      socketMgr.emitToUser,
    resolveUsername: socketMgr.resolveUsername
  }).catch(err => {
    console.error('[CQN] Fatal startup error:', err);
    process.exit(1);
  });
});
```

---

## 9. Kiểm tra Registration trên Server A (DB)

Sau khi Node.js khởi động và subscribe, verify trên DB:

```sql
-- Trên Server A, kết nối với DEV24:

-- 1. Xem CQN registrations
SELECT regid, table_name, operations_filter
FROM   user_change_notification_regs;
-- Expected:
-- REGID  TABLE_NAME                  OPERATIONS_FILTER
-- -----  --------------------------  -----------------
--  1234  DEV24.USER_NOTIFICATIONS    null (hoặc INSERT)

-- 2. Xem query text đã register
SELECT queryid, TO_CHAR(querytext) AS querytext
FROM   user_cq_notification_queries;
-- Expected:
-- QUERYID  QUERYTEXT
-- -------  ----------------------------------------------------
--   5678   SELECT ANO_ID, AUS_ID FROM USER_NOTIFICATIONS WHERE...

-- 3. Kiểm tra active sessions với events mode
SELECT sid, serial#, username, program, status
FROM   v$session
WHERE  program LIKE '%node%' OR username = 'DEV24';
```

---

## 10. Test End-to-End

### Test 1: Verify CQN fires on INSERT

```sql
-- Chạy trên Server A (SQL*Plus hoặc SQL Developer):
-- Đảm bảo có data trong APP_NOTIFICATIONS trước

-- INSERT test notification
INSERT INTO user_notifications (
  ano_id, aus_id, read, deleted, create_date, created_by
) VALUES (
  (SELECT MAX(ano_id) FROM app_notifications),  -- lấy ano_id mới nhất
  1,          -- aus_id của user test
  'N',
  'N',
  SYSDATE,
  'TEST'
);
COMMIT;
```

**Kết quả mong đợi trên Node.js console (Server B):**
```
[CQN] Received notification, type: 6
[CQN] Table changed: DEV24.USER_NOTIFICATIONS | operation: 2
[CQN] New row inserted, ROWID: AAAXxxAAFAAABZqAAA
[CQN] Cannot resolve username for aus_id: 1   ← nếu chưa có mapping table
[Socket] user:john emitted
```

### Test 2: Verify Socket.io nhận được event

Mở browser console trên APEX page:
```javascript
// Temporary test — paste vào browser console
const socket = io('http://192.168.1.20:3140', { query: { username: 'john' } });
socket.on('new_notification', data => console.log('Received:', data));
```

### Test 3: Verify NOT fire trên UPDATE không liên quan

```sql
-- UPDATE row nằm NGOÀI WHERE (deleted='Y' row) — không nên fire
UPDATE user_notifications SET reading_date = SYSDATE
WHERE deleted = 'Y' AND ROWNUM = 1;
COMMIT;
-- Node.js console: KHÔNG có log mới
```

---

## 11. Edge Cases & Handling

| Edge Case | Khi nào xảy ra | Xử lý |
|-----------|---------------|-------|
| `table.rows = null` | INSERT >80 rows cùng 1 transaction | `handleFullTableNotification()` — query 5 phút gần đây |
| `SUBSCR_EVENT_TYPE_DEREG` | DB restart, subscription expire, DB purge regs | Re-subscribe (auto-reconnect loop xử lý) |
| Row bị DELETE ngay sau INSERT | Race condition | Query `WHERE un.rowid = :rid AND deleted='N'` trả 0 rows → bỏ qua |
| `resolveUsername` trả null | aus_id chưa có trong ERP user table | Log warning, bỏ qua — notification vẫn trong DB |
| User offline (không có socket) | `emitToUser` trả false | Log: "user offline" — notification sẽ hiện khi user login lại (query bell) |
| CQN connection drop | Server A restart, network hiccup | Ping interval 30s detect → reconnect loop |
| Duplicate events | Hiếm, có thể xảy ra với grouping | Idempotent: APEX query DB để lấy fresh unread count khi bell refresh |

---

## 12. .env cho Server B

```env
PORT=3140

# Oracle DB (Server A)
DB_USER=DEV24
DB_PASSWORD=your_secure_password
DB_CONNECT_STRING=192.168.1.10/FREEPDB1

# CORS — URL của APEX server (trình duyệt user truy cập APEX ở đây)
APEX_ORIGINS=http://192.168.1.10:8080,https://your-apex-domain.internal
```

---

## 13. Checklist Trước Khi Chạy

### Server A (Oracle DB — DBA làm)
- [ ] `GRANT CHANGE NOTIFICATION TO DEV24` đã chạy
- [ ] DEV24 có SELECT trên USER_NOTIFICATIONS và APP_NOTIFICATIONS
- [ ] Xác nhận tên bảng mapping aus_id → username
- [ ] `GRANT SELECT ON <erp_users_table> TO DEV24`
- [ ] Firewall: Server B có thể kết nối TCP:1521 đến Server A

### Server B (Node.js — developer làm)
- [ ] Oracle Instant Client 23.x đã cài (`ldconfig -p | grep libclntsh`)
- [ ] `node test-thick.js` chạy thành công (Mode: Thick)
- [ ] `.env` đầy đủ với đúng IP và credentials
- [ ] `npm install` (oracledb, express, socket.io, dotenv)
- [ ] `node server.js` → log `[CQN] Subscription active`
- [ ] DB verify: `SELECT * FROM user_change_notification_regs` có entry
- [ ] Test INSERT → xem log callback fire

---

## Sources

- [node-oracledb CQN Docs v6.10](https://node-oracledb.readthedocs.io/en/latest/user_guide/cqn.html)
- [node-oracledb Initialization (Thick mode)](https://node-oracledb.readthedocs.io/en/latest/user_guide/initialization.html)
- [Oracle CQN adfns — JOIN, QoS, Restrictions](https://docs.oracle.com/database/121/ADFNS/adfns_cqn.htm)
- [node-oracledb cqn1.js example (GitHub)](https://github.com/oracle/node-oracledb/blob/main/examples/cqn1.js)
- [Installing Oracle Instant Client RPM](https://docs.oracle.com/en/database/oracle/oracle-database/21/lacli/install-instant-client-using-rpm.html)
- [Oracle DBMS_CQ_NOTIFICATION](https://docs.oracle.com/en/database/oracle/oracle-database/19/arpls/DBMS_CQ_NOTIFICATION.html)
