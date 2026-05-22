'use strict';
  require('dotenv').config();

  const oracledb = require('oracledb');

  async function main() {
    try {
      oracledb.initOracleClient();
      console.log('[Mode] Thick mode OK');
    } catch (err) {
      console.warn('[Mode] Thick mode không khả dụng:', err.message);
      console.warn('[Mode] Chạy Thin mode (CQN sẽ không hoạt động)');
    }
    console.log('[Mode] Đang chạy:', oracledb.thin ? 'Thin' : 'Thick', 'mode\n');

    const config = {
      user:          process.env.DB_USER,
      password:      process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECTION_STRING,
    };

    console.log('[Config] DB_USER:             ', config.user);
    console.log('[Config] DB_CONNECTION_STRING:', config.connectString, '\n');

    if (!config.user || !config.password || !config.connectString) {
      console.error('[Error] Thiếu biến môi trường trong .env (DB_USER, DB_PASSWORD, DB_CONNECTION_STRING)');
      process.exit(1);
    }

    let conn;
    try {
      console.log('[Test] Đang kết nối...');
      conn = await oracledb.getConnection(config);
      console.log('[Test] Kết nối thành công!\n');

      const ver = await conn.execute(`SELECT banner FROM v$version WHERE ROWNUM = 1`);
      console.log('[DB Version]', ver.rows[0][0]);

      const usr = await conn.execute(`SELECT USER FROM DUAL`);
      console.log('[DB User]   ', usr.rows[0][0]);

      const svc = await conn.execute(`SELECT SYS_CONTEXT('USERENV','SERVICE_NAME') FROM DUAL`);
      console.log('[DB Service]', svc.rows[0][0], '\n');

      const cqn = await conn.execute(
        `SELECT COUNT(*) cnt FROM session_privs WHERE privilege = 'CHANGE NOTIFICATION'`
      );
      if (cqn.rows[0][0] > 0) {
        console.log('[CQN] Quyền CHANGE NOTIFICATION: OK');
      } else {
        console.warn('[CQN] THIẾU quyền CHANGE NOTIFICATION');
        console.warn('[CQN] Chạy trên DB (DBA): GRANT CHANGE NOTIFICATION TO ' + config.user + ';');
      }

      for (const table of ['USER_NOTIFICATIONS', 'APP_NOTIFICATIONS']) {
        try {
          const r = await conn.execute(`SELECT COUNT(*) cnt FROM ${table}`);
          console.log(`[Table] ${table.padEnd(25)} → ${r.rows[0][0]} rows`);
        } catch (e) {
          console.warn(`[Table] ${table.padEnd(25)} → Lỗi: ${e.message}`);
        }
      }

    } catch (err) {
      console.error('\n[Error] Kết nối thất bại:', err.message);
      diagnose(err, config);
    } finally {
      if (conn) await conn.close();
    }
  }

  function diagnose(err, config) {
    const msg = err.message || '';
    if (msg.includes('ORA-01017'))
      console.error('[Diagnose] Sai username/password — kiểm tra DB_USER và DB_PASSWORD trong .env');
    else if (msg.includes('ORA-12541') || msg.includes('no listener'))
      console.error('[Diagnose] Không tới Oracle listener tại', config.connectString, '— kiểm tra IP, port 1521, DB đang chạy');
    else if (msg.includes('ORA-12154') || msg.includes('could not resolve'))
      console.error('[Diagnose] Sai service name — DB_CONNECTION_STRING phải có dạng host:1521/SERVICE_NAME');
    else if (msg.includes('ORA-28000'))
      console.error('[Diagnose] Tài khoản bị khóa — liên hệ DBA: ALTER USER ' + config.user + ' ACCOUNT UNLOCK;');
    else if (msg.includes('DPI-1047') || msg.includes('Cannot locate'))
      console.error('[Diagnose] Oracle Instant Client chưa cài — xem CLAUDE.md mục "Oracle Instant Client Setup"');
  }

  main();
