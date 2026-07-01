'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// POC Giai đoạn 2 — Hypothesis 1: N database CÓ share được 1 CQN_PORT trong
// CÙNG 1 process (thick mode) không?
//
// Script này subscribe CQN tới HAI database khác nhau, dùng CHUNG một
// CQN_HOST:CQN_PORT, trong một process duy nhất. Mỗi callback gắn nhãn dbKey để
// xác minh Oracle định tuyến notification về đúng subscription.
//
// KỲ VỌNG NẾU HYPOTHESIS ĐÚNG:
//   - Cả 2 subscribe() thành công, KHÔNG có ORA-24912 "Listen failed".
//   - INSERT vào DB1 → chỉ log [db1]; INSERT vào DB2 → chỉ log [db2].
//   - Trên mỗi DB, user_change_notification_regs có callback về CÙNG host:port.
//
// NẾU HYPOTHESIS SAI:
//   - subscribe() DB thứ 2 ném ORA-24912 / NJS-003 (tranh bind port), HOẶC
//   - chỉ 1 DB nhận được callback.
//
// CÁCH CHẠY (dừng chat-server trước để tránh tranh CQN_PORT):
//   1. Điền .env: bộ DB1 hiện có + bộ DB2 mới (xem biến bên dưới).
//   2. node test-cqn-multidb.js
//   3. INSERT test vào user_notifications trên TỪNG DB, xem log.
//   4. Ctrl+C để dừng (tự unsubscribe cả hai).
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const oracledb = require('oracledb');

try {
  oracledb.initOracleClient();
  console.log('[Mode] Thick mode OK');
} catch (err) {
  console.error('[Error] CQN yêu cầu Thick mode:', err.message);
  process.exit(1);
}

// Hai target DB — cùng CQN_HOST:CQN_PORT (điểm mấu chốt của POC)
const TARGETS = [
  {
    dbKey:         'db1',
    user:          process.env.DB_USER,
    password:      process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECTION_STRING,
  },
  {
    dbKey:         'db2',
    user:          process.env.DB2_USER,
    password:      process.env.DB2_PASSWORD,
    connectString: process.env.DB2_CONNECTION_STRING,
  },
];

const CQN_HOST = process.env.CQN_HOST;
const CQN_PORT = Number(process.env.CQN_PORT);

function makeOnMessage(dbKey) {
  return function onMessage(message) {
    if (message.type === oracledb.SUBSCR_EVENT_TYPE_DEREG) {
      console.warn('[%s] Subscription bị DB hủy (DEREG).', dbKey);
      return;
    }
    console.log('\n[%s] ✅ Nhận notification! Type: %d', dbKey, message.type);
    for (const query of (message.queries || [])) {
      for (const table of (query.tables || [])) {
        console.log('[%s]   Bảng: %s | Op: %d', dbKey, table.name, table.operation);
        for (const row of (table.rows || [])) {
          console.log('[%s]     ROWID: %s | Op: %d', dbKey, row.rowid, row.operation);
        }
      }
    }
  };
}

async function subscribeTarget(t) {
  if (!t.connectString) {
    console.warn('[%s] BỎ QUA — thiếu connectString trong .env.', t.dbKey);
    return null;
  }
  console.log('[%s] Kết nối %s ...', t.dbKey, t.connectString);
  const conn = await oracledb.getConnection({
    user:          t.user,
    password:      t.password,
    connectString: t.connectString,
    events:        true,
  });
  console.log('[%s] Kết nối OK. Subscribe → %s:%d', t.dbKey, CQN_HOST, CQN_PORT);

  await conn.subscribe('poc_watcher_' + t.dbKey, {
    sql:       `SELECT ano_id, aus_id FROM user_notifications WHERE read = 'N'`,
    ipAddress: CQN_HOST,
    port:      CQN_PORT,               // ← CHUNG port cho mọi DB — điểm cần xác minh
    qos:       oracledb.SUBSCR_QOS_QUERY | oracledb.SUBSCR_QOS_ROWIDS,
    callback:  makeOnMessage(t.dbKey),
  });
  console.log('[%s] ✅ Subscription active (share CQN_PORT %d).', t.dbKey, CQN_PORT);
  return { conn, name: 'poc_watcher_' + t.dbKey, dbKey: t.dbKey };
}

async function main() {
  const subs = [];
  try {
    // Subscribe TUẦN TỰ để thấy rõ DB nào ném ORA-24912 nếu tranh port
    for (const t of TARGETS) {
      try {
        const s = await subscribeTarget(t);
        if (s) subs.push(s);
      } catch (err) {
        console.error('[%s] ❌ subscribe FAIL: %s', t.dbKey, err.message);
        console.error('    → Nếu là ORA-24912/NJS-003: Hypothesis SAI, không share được port.');
      }
    }

    if (!subs.length) {
      console.error('[POC] Không subscribe được DB nào — kiểm tra .env.');
      return;
    }

    console.log('\n[POC] %d/%d subscription active trên cùng port %d.',
      subs.length, TARGETS.length, CQN_PORT);
    console.log('[POC] Verify trên MỖI DB:');
    console.log("       SELECT regid, table_name, callback FROM user_change_notification_regs;");
    console.log('[POC] INSERT test vào user_notifications từng DB rồi xem nhãn [dbX] ở trên.');
    console.log('[POC] Ctrl+C để dừng.\n');

    await new Promise((_, reject) => {
      for (const s of subs) s.conn.on('error', e => reject(new Error(s.dbKey + ': ' + e.message)));
      process.on('SIGINT', () => reject(new Error('SIGINT')));
    });
  } catch (err) {
    if (err.message !== 'SIGINT') console.error('[POC] Error:', err.message);
  } finally {
    for (const s of subs) {
      try { await s.conn.unsubscribe(s.name); } catch {}
      try { await s.conn.close(); } catch {}
      console.log('[%s] Đã đóng.', s.dbKey);
    }
  }
}

main();
