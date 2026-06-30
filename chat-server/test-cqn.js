'use strict';
  require('dotenv').config();

  const oracledb = require('oracledb');

  try {
    oracledb.initOracleClient();
    console.log('[Mode] Thick mode OK');
  } catch (err) {
    console.error('[Error] CQN yêu cầu Thick mode:', err.message);
    process.exit(1);
  }

  const DB_CONFIG = {
    user:          process.env.DB_USER,
    password:      process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECTION_STRING,
    events:        true,
  };

  function onMessage(message) {
    console.log('\n[CQN] Nhận được notification! Type:', message.type);

    if (message.type === oracledb.SUBSCR_EVENT_TYPE_DEREG) {
      console.warn('[CQN] Subscription bị hủy bởi DB.');
      return;
    }

    for (const query of (message.queries || [])) {
      for (const table of (query.tables || [])) {
        console.log('[CQN] Bảng:', table.name, '| Operation:', table.operation);
        for (const row of (table.rows || [])) {
          console.log('[CQN]   ROWID:', row.rowid, '| Op:', row.operation);
        }
      }
    }
  }

  async function main() {
    let cqnConn;
    try {
      console.log('[CQN] Đang kết nối...');
      cqnConn = await oracledb.getConnection(DB_CONFIG);
      console.log('[CQN] Kết nối OK');

      await cqnConn.subscribe('test_watcher', {
        sql:       `SELECT ano_id, aus_id FROM user_notifications WHERE deleted = 'N'`,
        ipAddress: process.env.CQN_HOST,
        port:      Number(process.env.CQN_PORT),
        qos:       oracledb.SUBSCR_QOS_QUERY | oracledb.SUBSCR_QOS_ROWIDS,
        callback:  onMessage,
      });

      console.log('[CQN] Subscription đăng ký thành công!');
      console.log('[CQN] Đang lắng nghe... INSERT vào USER_NOTIFICATIONS để test');
      console.log('[CQN] Nhấn Ctrl+C để dừng.\n');

      await new Promise((_, reject) => {
        cqnConn.on('error', reject);
        process.on('SIGINT', () => reject(new Error('SIGINT')));
      });

    } catch (err) {
      if (err.message !== 'SIGINT') console.error('[Error]', err);
    } finally {
      if (cqnConn) {
        try { await cqnConn.unsubscribe('test_watcher'); } catch {}
        try { await cqnConn.close(); } catch {}
        console.log('[CQN] Đã đóng kết nối.');
      }
    }
  }

  main();
