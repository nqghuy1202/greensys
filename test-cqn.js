'use strict';
require('dotenv').config();

const oracledb = require('oracledb');

// Thick mode bắt buộc cho CQN
try {
  oracledb.initOracleClient();
  console.log('[Mode] Thick mode OK');
} catch (err) {
  console.error('[Error] CQN yêu cầu Thick mode. Cài Oracle Instant Client trước.');
  console.error('[Error]', err.message);
  process.exit(1);
}

const DB_CONFIG = {
  user:          process.env.DB_USER,
  password:      process.env.DB_PASSWORD,
  connectString: process.env.DB_CONNECTION_STRING,
  events:        true,  // BẮT BUỘC cho CQN
};

async function main() {
  console.log('[CQN] Đang kết nối tới Oracle DB...');
  console.log('[CQN] connectString:', DB_CONFIG.connectString);

  let cqnConn;
  try {
    cqnConn = await oracledb.getConnection(DB_CONFIG);
    console.log('[CQN] Kết nối OK\n');

    console.log('[CQN] Đang đăng ký subscription trên USER_NOTIFICATIONS...');
    // Oracle 19.3: clientInitiated not supported — Oracle calls back to CQN_HOST:CQN_PORT
    const callbackIp   = process.env.CQN_HOST;
    const callbackPort = parseInt(process.env.CQN_PORT, 10) || 3141;

    if (!callbackIp) {
      console.error('[Error] Set CQN_HOST in .env (Server B IP that Oracle can reach)');
      process.exit(1);
    }

    console.log(`[CQN] Registering callback to ${callbackIp}:${callbackPort} ...`);

    await cqnConn.subscribe('test_watcher', {
      sql:       `SELECT ano_id, aus_id FROM user_notifications WHERE deleted = 'N'`,
      ipAddress: callbackIp,
      port:      callbackPort,
      qos:       oracledb.SUBSCR_QOS_QUERY | oracledb.SUBSCR_QOS_ROWIDS,
      callback:  onMessage,
    });

    console.log('[CQN] Subscription đăng ký thành công!');
    console.log('[CQN] Đang lắng nghe... (INSERT vào USER_NOTIFICATIONS để test)');
    console.log('[CQN] Nhấn Ctrl+C để dừng.\n');

    // Giữ kết nối sống để nhận events
    await new Promise((_, reject) => {
      cqnConn.on('error', reject);
      process.on('SIGINT', () => {
        console.log('\n[CQN] Dừng...');
        reject(new Error('SIGINT'));
      });
    });

  } catch (err) {
    if (err.message !== 'SIGINT') {
      console.error('[Error]', err.message);
    }
  } finally {
    if (cqnConn) {
      try {
        await cqnConn.unsubscribe('test_watcher');
        await cqnConn.close();
        console.log('[CQN] Đã hủy subscription và đóng kết nối.');
      } catch {}
    }
  }
}

function onMessage(message) {
  console.log('\n[CQN] Nhận được notification!');
  console.log('[CQN] Type:', message.type);

  if (message.type === oracledb.SUBSCR_EVENT_TYPE_DEREG) {
    console.warn('[CQN] Subscription bị hủy bởi DB.');
    return;
  }

  const queries = message.queries || [];
  for (const query of queries) {
    for (const table of (query.tables || [])) {
      console.log('[CQN] Bảng:', table.name, '| Operation:', table.operation);
      for (const row of (table.rows || [])) {
        console.log('[CQN]   ROWID:', row.rowid, '| Op:', row.operation);
      }
    }
  }
}

main();
