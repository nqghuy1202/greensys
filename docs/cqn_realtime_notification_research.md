---
document_type: technical_research
title: Real-time Notification — Cross-Server Middleware Architecture
version: "3.0"
created_date: 2026-05-19
language: vi + en
topology:
  server_a: Oracle Database 23ai + Oracle APEX 24.2 (application server)
  server_b: Node.js 22 (middleware-only, separate machine)
tags: [CQN, UTL_HTTP, Socket.io, APEX, cross-server, middleware, oracledb, thick-mode]
changelog:
  v3.0: "Clarify topology: DB+APEX on Server A, Node.js on Server B (separate machine). DB sends signals to Node.js."
  v2.0: "REST Push — ERP servers call Node.js (dropped)"
  v1.0: "CQN — localhost-only (dropped)"
---

# Real-time Notification — Cross-Server Middleware Architecture (v3.0)

## Server Topology

```
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│  SERVER A (e.g. 192.168.1.10)  │     │  SERVER B (e.g. 192.168.1.20)  │
│  ─────────────────────────────  │     │  ─────────────────────────────  │
│  Oracle Database 23ai Free      │     │  Node.js 22                     │
│  Oracle APEX 24.2.16            │     │  (middleware only)               │
│  ORDS / HTTP Server             │     │  Express + Socket.io             │
└─────────────────────────────────┘     └─────────────────────────────────┘
          │                                          │
          │   ① DB sends signals to Node.js          │
          │ ─────────────────────────────────────►  │
          │                                          │
          │   ② Node.js pushes to APEX browser       │
          │ ◄─────────────────────────────────────  │
          │       (WebSocket via Socket.io)           │
          │                                          │
   APEX browser clients connect to APEX (Server A)
   AND open WebSocket to Node.js (Server B)
```

---

## Two Options: DB → Node.js

| | **Option A: CQN** (Recommended) | **Option B: UTL_HTTP** |
|--|--|--|
| Initiator | Node.js kết nối ra DB, DB gửi event về | Oracle DB gọi HTTP POST ra Node.js |
| Node.js mode | **Thick** (cần Oracle Instant Client) | **Thin** (không cần Oracle Client) |
| Cần mở firewall | Server B → Server A:1521 (normal Oracle port) | Server A → Server B:3140 |
| Trigger/Procedure phía DB | Không cần — DB tự detect qua redo log | Cần gọi từ stored procedure |
| Reliability | DB-level guarantee | PL/SQL HTTP call (có thể timeout) |
| Lock/deadlock risk | Không | Nhỏ — HTTP call blocking trong PL/SQL |
| Phức tạp Node.js | Medium (Thick mode setup) | Thấp (chỉ Express endpoint) |

---

## OPTION A — CQN with `clientInitiated: true` ⭐ Recommended

### Tại sao `clientInitiated: true` hoạt động cross-server

**Mặc định CQN (không dùng):** DB Server A mở TCP connection ngược lại về Node.js Server B → cần Node.js có fixed IP và mở port lắng nghe riêng.

**`clientInitiated: true` (dùng):**
1. Node.js (Server B) mở kết nối TCP thông thường tới Oracle DB (Server A) port 1521
2. Đăng ký CQN subscription trên kết nối đó
3. Khi có INSERT vào USER_NOTIFICATIONS, DB gửi event notification **ngược lại qua chính TCP connection đang mở**
4. Node.js nhận callback — không cần thêm port, không cần DB biết IP của Node.js

> *"Does not require the database to be able to connect back to the application. Since client initiated CQN notifications do not need additional network configuration, they have ease-of-use and security advantages."* — official docs

### Network Requirements (Option A)

```
Server B (Node.js) ──── TCP:1521 (outbound) ────► Server A (Oracle DB)
                        Normal Oracle connection
                        CQN events flow BACK through this same connection

Server B (Node.js) ◄─── WebSocket:3140 ──────── APEX Browser Clients
                         (clients connect to Server B)
```

Firewall rules cần mở:
- Server B → Server A: port 1521 (Oracle listener)
- APEX browser → Server B: port 3140 (Socket.io WebSocket)

### Thick Mode — Cài Oracle Instant Client trên Server B (Node.js)

Node.js cần Oracle Client libraries (Thick mode). Trên Server B (Linux):

```bash
# Option 1: Nếu Server B cùng hệ OS với Server A (Oracle Linux/RHEL)
# Download Oracle Instant Client Basic từ oracle.com
# https://www.oracle.com/database/technologies/instant-client/linux-x86-64-downloads.html

# Cài bằng RPM (Oracle Linux):
sudo rpm -ivh oracle-instantclient23.5-basic-23.5.0.0.0-1.el8.x86_64.rpm

# Hoặc cài thủ công:
sudo mkdir -p /opt/oracle
# Giải nén instantclient_23_5.zip vào /opt/oracle/instantclient_23_5
sudo sh -c "echo /opt/oracle/instantclient_23_5 > /etc/ld.so.conf.d/oracle-instantclient.conf"
sudo ldconfig

# Verify:
find /opt/oracle -name "libclntsh.so*"
```

### Node.js — CQN Code (Server B)

```javascript
// server.js — CQN + Socket.io middleware
'use strict';
require('dotenv').config();

const oracledb = require('oracledb');

// THICK MODE — phải gọi trước mọi thứ
oracledb.initOracleClient({
  // libDir chỉ cần trên Windows hoặc nếu libs không ở standard path
  // libDir: '/opt/oracle/instantclient_23_5'
});

const express      = require('express');
const { createServer } = require('http');
const { Server }   = require('socket.io');
const socketMgr    = require('./socket/socketManager');

const app = express();
app.use(express.json());
app.get('/health', (req, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const APEX_ORIGINS = process.env.APEX_ORIGINS.split(',').map(s => s.trim());

const io = new Server(httpServer, {
  cors: { origin: APEX_ORIGINS, methods: ['GET','POST'], credentials: true }
});

socketMgr.init(io);

// Start server + CQN
const PORT = process.env.PORT || 3140;
httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`[Server] Listening on 0.0.0.0:${PORT}`);
  await startCQN();
});
```

```javascript
// cqn.js — CQN subscription với auto-reconnect
'use strict';
const oracledb = require('oracledb');
const { emitToUser, resolveUsername } = require('./socket/socketManager');

const DB_CONFIG = {
  user:          process.env.DB_USER,
  password:      process.env.DB_PASSWORD,
  connectString: process.env.DB_CONNECT_STRING,  // e.g. "192.168.1.10/FREEPDB1"
  events:        true   // BẮT BUỘC cho CQN
};

async function onCQNMessage(message) {
  if (message.type !== oracledb.SUBSCR_EVENT_TYPE_OBJ_CHANGE) return;

  for (const table of (message.tables || [])) {
    if (!table.name.toUpperCase().includes('USER_NOTIFICATIONS')) continue;
    if (!table.rows) continue;

    for (const row of table.rows) {
      if (row.operation !== oracledb.CQN_OPCODE_INSERT) continue;
      await handleInsert(row.rowid);
    }
  }
}

async function handleInsert(rowid) {
  let conn;
  try {
    // Dùng pool connection riêng để query — KHÔNG dùng CQN connection
    conn = await oracledb.getConnection(DB_CONFIG);
    const result = await conn.execute(
      `SELECT un.ano_id, un.aus_id, an.ano_name, an.ano_summary
       FROM   user_notifications un
       JOIN   app_notifications  an ON an.ano_id = un.ano_id
       WHERE  un.rowid = :rid`,
      { rid: rowid },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (!result.rows.length) return;
    const notif = result.rows[0];

    // Lấy username từ aus_id (query ERP user table)
    const username = await resolveUsername(conn, notif.AUS_ID);
    if (!username) return;

    emitToUser(username, {
      anoId:   notif.ANO_ID,
      title:   notif.ANO_NAME,
      summary: notif.ANO_SUMMARY
    });
  } finally {
    if (conn) await conn.close();
  }
}

async function startCQN() {
  while (true) {
    let cqnConn;
    try {
      console.log('[CQN] Connecting to Oracle DB at', process.env.DB_CONNECT_STRING);
      cqnConn = await oracledb.getConnection(DB_CONFIG);

      await cqnConn.subscribe('user_notif_sub', {
        sql:             `SELECT ano_id, aus_id FROM user_notifications WHERE deleted = 'N'`,
        callback:        onCQNMessage,
        clientInitiated: true,   // ← cross-server key option
        qos:             oracledb.SUBSCR_QOS_QUERY | oracledb.SUBSCR_QOS_ROWIDS
      });

      console.log('[CQN] Subscription active — watching USER_NOTIFICATIONS on Server A');

      // Giữ CQN connection sống mãi (không close)
      await new Promise((_, reject) => {
        // Nếu connection bị drop, promise reject → vào catch → retry
        cqnConn.on('error', reject);
      });

    } catch (err) {
      console.error('[CQN] Error:', err.message, '— retrying in 15s');
      try { if (cqnConn) await cqnConn.close(); } catch {}
      await new Promise(r => setTimeout(r, 15000));
    }
  }
}

module.exports = { startCQN };
```

---

## OPTION B — UTL_HTTP (Oracle DB → Node.js REST)

Dùng khi **không thể cài Oracle Instant Client** trên Server B.

### Network Requirements (Option B)

```
Server A (Oracle DB) ──── HTTP POST:3140 ────► Server B (Node.js)
                          UTL_HTTP call from PL/SQL

Server B (Node.js) ◄──── WebSocket:3140 ─────  APEX Browser Clients
```

Firewall rules cần mở:
- Server A → Server B: port 3140 (HTTP from DB)
- APEX browser → Server B: port 3140 (Socket.io)

### Oracle DB — ACL Setup (chạy với DBA trên Server A)

```sql
-- Cấp quyền cho user DEV24 gọi HTTP ra Server B
BEGIN
  DBMS_NETWORK_ACL_ADMIN.CREATE_ACL(
    acl         => 'nodejs_acl.xml',
    description => 'Allow calls to Node.js middleware server',
    principal   => 'DEV24',
    is_grant    => TRUE,
    privilege   => 'connect'
  );

  DBMS_NETWORK_ACL_ADMIN.ASSIGN_ACL(
    acl        => 'nodejs_acl.xml',
    host       => '192.168.1.20',   -- IP của Server B (Node.js)
    lower_port => 3140,
    upper_port => 3140
  );
  COMMIT;
END;
/
```

### Oracle DB — PL/SQL Procedure (Server A)

```sql
CREATE OR REPLACE PROCEDURE notify_nodejs(
  p_username  IN VARCHAR2,
  p_ano_id    IN NUMBER,
  p_title     IN VARCHAR2,
  p_summary   IN VARCHAR2 DEFAULT NULL
) AS
  l_req    UTL_HTTP.req;
  l_resp   UTL_HTTP.resp;
  l_url    CONSTANT VARCHAR2(200) := 'http://192.168.1.20:3140/api/db-signal';
  l_apikey CONSTANT VARCHAR2(200) := 'YOUR_API_KEY';
  l_body   VARCHAR2(4000);
BEGIN
  l_body := JSON_OBJECT(
    'username' VALUE p_username,
    'ano_id'   VALUE p_ano_id,
    'title'    VALUE p_title,
    'summary'  VALUE NVL(p_summary, '')
  );

  l_req := UTL_HTTP.begin_request(l_url, 'POST', 'HTTP/1.1');
  UTL_HTTP.set_header(l_req, 'Content-Type',   'application/json');
  UTL_HTTP.set_header(l_req, 'X-API-Key',      l_apikey);
  UTL_HTTP.set_header(l_req, 'Content-Length', TO_CHAR(LENGTHB(l_body)));
  UTL_HTTP.write_text(l_req, l_body);

  l_resp := UTL_HTTP.get_response(l_req);
  UTL_HTTP.end_response(l_resp);

EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.end_response(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    -- Log lỗi — KHÔNG raise để không ảnh hưởng business transaction
    INSERT INTO app_error_log (error_source, error_msg, created_at)
    VALUES ('notify_nodejs', SQLERRM, SYSDATE);
    COMMIT;
END;
/
```

**Gọi procedure sau khi INSERT notification (trong ERP business procedure):**
```sql
-- Sau INSERT vào USER_NOTIFICATIONS và COMMIT:
notify_nodejs(
  p_username => v_username,
  p_ano_id   => v_ano_id,
  p_title    => 'Đơn hàng #' || v_order_id || ' cần duyệt'
);
```

### Node.js — /api/db-signal Endpoint (Option B)

```javascript
// routes/dbSignal.js
const express  = require('express');
const router   = express.Router();
const { emitToUser } = require('../socket/socketManager');

const API_KEY     = process.env.NOTIFY_API_KEY;
const ALLOWED_IPS = process.env.ALLOWED_DB_IPS.split(',').map(s => s.trim());

router.post('/db-signal', (req, res) => {
  // Validate IP (Server A only)
  const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress)
                     .replace(/^::ffff:/, '');
  if (!ALLOWED_IPS.includes(clientIp)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Validate API Key
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { username, ano_id, title, summary } = req.body;
  if (!username || !ano_id) {
    return res.status(400).json({ error: 'username and ano_id required' });
  }

  const emitted = emitToUser(username.toLowerCase(), { anoId: ano_id, title, summary });
  return res.json({ ok: true, emitted });
});

module.exports = router;
```

---

## Socket.io — Node.js pushes to APEX browser (chung cho cả 2 options)

```javascript
// socket/socketManager.js
'use strict';
const oracledb = require('oracledb');   // chỉ cần nếu dùng CQN (Option A)

let io;

function init(ioServer) {
  io = ioServer;

  io.on('connection', (socket) => {
    const username = socket.handshake.query.username?.toLowerCase();
    if (!username) { socket.disconnect(true); return; }

    socket.join(`user:${username}`);
    console.log(`[Socket] ${username} connected (${socket.id})`);

    socket.on('disconnect', () => {
      console.log(`[Socket] ${username} disconnected`);
    });
  });
}

function emitToUser(username, payload) {
  if (!io) return false;
  const room  = `user:${username}`;
  const socks = io.sockets.adapter.rooms.get(room);
  if (!socks?.size) {
    console.log(`[Socket] ${username} is offline — notification in DB only`);
    return false;
  }
  io.to(room).emit('new_notification', payload);
  console.log(`[Socket] Emitted to ${username} (${socks.size} session(s))`);
  return true;
}

// Chỉ cần cho Option A (CQN) — map aus_id → username
async function resolveUsername(conn, ausId) {
  const r = await conn.execute(
    `SELECT username FROM app_users WHERE id = :id`,  // Xác nhận tên bảng với DBA
    { id: ausId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return r.rows[0]?.USERNAME?.toLowerCase() || null;
}

module.exports = { init, emitToUser, resolveUsername };
```

---

## APEX Page 0 — Browser kết nối Socket.io (Server B)

```javascript
// Page 0 — Execute when Page Loads (Before Header)
(function() {
  // URL của Node.js server (Server B)
  const SOCKET_URL = 'http://192.168.1.20:3140';
  const username   = apex.env.APP_USER || $v('APP_USER');
  if (!username) return;

  const socket = io(SOCKET_URL, {
    query:               { username: username },
    transports:          ['websocket', 'polling'],
    reconnection:        true,
    reconnectionDelay:   3000,
    reconnectionAttempts: Infinity
  });

  socket.on('connect', () =>
    console.log('[Notif] Socket connected for user:', username));

  socket.on('new_notification', (data) => {
    // 1. Refresh bell plugin
    $(document).trigger('refresh-apex-notification-menu');

    // 2. Toast
    apex.message.showPageSuccess('Thông báo mới: ' + data.title);
  });

  socket.on('disconnect', () =>
    console.log('[Notif] Socket disconnected — reconnecting...'));
})();
```

**Include Socket.io client library (APEX Page 0 — Page HTML Header):**
```html
<script src="http://192.168.1.20:3140/socket.io/socket.io.js"></script>
```

---

## .env Template (Server B — Node.js)

```env
PORT=3140

# Oracle DB connection (Server A)
DB_USER=DEV24
DB_PASSWORD=your_password
DB_CONNECT_STRING=192.168.1.10/FREEPDB1   # IP của Server A : service name

# Security
NOTIFY_API_KEY=<crypto.randomBytes(32).toString('hex')>
ALLOWED_DB_IPS=192.168.1.10              # IP của Server A (cho Option B)

# CORS — APEX browser origin
# APEX chạy trên Server A, browsers connect từ nhiều IPs
# Nên để APEX server URL
APEX_ORIGINS=https://192.168.1.10,http://192.168.1.10:8080
```

---

## package.json (Server B)

```json
{
  "name": "notif-middleware",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev":   "node --watch server.js"
  },
  "dependencies": {
    "express":   "^4.18.0",
    "socket.io": "^4.7.0",
    "dotenv":    "^16.0.0",
    "oracledb":  "^6.10.0"
  }
}
```

`oracledb` cần cho cả 2 options:
- **Option A (CQN):** dùng Thick mode + CQN + connection pool
- **Option B (UTL_HTTP):** vẫn cần nếu phải query DB để resolve aus_id → username

---

## Comparison — Chọn Option nào?

### Chọn Option A (CQN) nếu:
- Có thể cài Oracle Instant Client trên Server B
- Muốn DB-level detection (không cần sửa PL/SQL procedure)
- Muốn kiến trúc sạch: Node.js tự connect DB, tự nghe thay đổi

### Chọn Option B (UTL_HTTP) nếu:
- Không muốn/không thể cài Oracle Client libs trên Server B
- ERP team sẵn sàng thêm `notify_nodejs()` call vào business procedures
- Muốn Node.js nhẹ nhất có thể (Thin mode)

**Gợi ý thực tế:** Option A sạch hơn về kiến trúc và ít phụ thuộc ERP code hơn. Option B đơn giản hơn nếu Oracle Client libs phức tạp khi cài trên Server B.

---

## Firewall Summary

| Kết nối | Source | Destination | Port | Protocol |
|---------|--------|-------------|------|---------|
| Option A: Node.js → Oracle | Server B | Server A | 1521 | TCP |
| Option B: Oracle → Node.js | Server A | Server B | 3140 | TCP/HTTP |
| APEX browser → Node.js | Client browsers | Server B | 3140 | TCP/WebSocket |
| APEX browser → APEX | Client browsers | Server A | 443/8080 | HTTPS/HTTP |

---

## DB Prerequisites (Server A — DBA)

```sql
-- Cả 2 options đều cần:
GRANT CHANGE NOTIFICATION TO DEV24;   -- Option A (CQN)

-- Option B thêm:
-- Chạy DBMS_NETWORK_ACL_ADMIN block ở trên

-- Xác nhận tên bảng mapping aus_id → username (hỏi DBA):
-- SELECT * FROM app_users WHERE ROWNUM < 5;
```

---

## Action Items

### Cần xác nhận ngay

- [ ] **IP của Server A** (Oracle DB + APEX) và **IP của Server B** (Node.js)
- [ ] **Chọn Option A hay B** → quyết định có cài Oracle Instant Client không
- [ ] **Tên bảng mapping aus_id → username** (nếu Option A hoặc Option B không gửi username)
- [ ] **Firewall rules**: mở đúng port (xem bảng Firewall Summary)

### Phase 1 — Server B Setup (1-2 giờ)
- [ ] Cài Node.js 22 trên Server B
- [ ] Nếu Option A: cài Oracle Instant Client + verify `libclntsh.so*`
- [ ] Tạo `.env` với đúng IPs, credentials, API key
- [ ] Test kết nối từ Server B → Server A:1521: `node -e "const o=require('oracledb'); o.initOracleClient(); o.getConnection({...}).then(c=>c.execute('SELECT 1 FROM DUAL')).then(r=>console.log(r.rows))"`

### Phase 2 — Node.js Code (3-4 giờ)
- [ ] `server.js`, `cqn.js` hoặc `routes/dbSignal.js`, `socket/socketManager.js`
- [ ] Test CQN: INSERT vào USER_NOTIFICATIONS → xem callback log
- [ ] Test Socket.io: connect từ browser → xem log "connected"

### Phase 3 — APEX Integration (2-3 giờ)
- [ ] Import RonnyWeiss/Apex-Notification-Menu-for-NavBar plugin
- [ ] Page 0: thêm socket.io.js script + connection JS
- [ ] Test end-to-end: INSERT → CQN callback → Socket.io emit → bell refresh

### Phase 4 — Hardening (1-2 giờ)
- [ ] Test CQN reconnect khi Server A restart
- [ ] Test Socket.io multi-tab (same user)
- [ ] Monitor logs

---

## Sources

- [node-oracledb CQN — clientInitiated](https://node-oracledb.readthedocs.io/en/stable/user_guide/cqn.html)
- [node-oracledb AQ (Advanced Queuing)](https://node-oracledb.readthedocs.io/en/latest/user_guide/aq.html)
- [Oracle UTL_HTTP Docs](https://docs.oracle.com/en/database/oracle/oracle-database/12.2/arpls/UTL_HTTP.html)
- [Oracle ACL Network Access](https://oracle-base.com/articles/11g/fine-grained-access-to-network-services-11gr1)
- [Oracle → Node.js via UTL_HTTP gist](https://gist.github.com/jwcastillo/d5c58ad09f2454e537c745c7fe7825c0)
- [Socket.IO CORS Configuration](https://socket.io/docs/v4/handling-cors/)
- [Apex-Notification-Menu-for-NavBar Plugin](https://github.com/RonnyWeiss/Apex-Notification-Menu-for-NavBar)
