'use strict';
require('dotenv').config();

const oracledb = require('oracledb');

async function main() {
  // ── 1. Thick mode (cần Oracle Instant Client) ─────────────────────────────
  // Trên Linux Server B: gọi không tham số (libs phải trong system path)
  // Trên Windows (dev): chỉ định libDir nếu cần
  try {
    if (process.platform === 'win32') {
      // Windows: chỉ định đường dẫn Instant Client nếu có
      // Ví dụ: oracledb.initOracleClient({ libDir: 'C:\\oracle\\instantclient_23_5' });
      oracledb.initOracleClient();
    } else {
      // Linux: libs phải trong system path (sau khi chạy ldconfig)
      oracledb.initOracleClient();
    }
    console.log('[Mode] Thick mode — Oracle Instant Client OK');
  } catch (err) {
    console.warn('[Mode] Thick mode không khả dụng:', err.message);
    console.warn('[Mode] Chạy Thin mode (CQN sẽ không hoạt động ở Thin mode)');
  }

  const mode = oracledb.thin ? 'Thin' : 'Thick';
  console.log(`[Mode] Đang chạy: ${mode} mode\n`);

  // ── 2. Thông tin kết nối từ .env ──────────────────────────────────────────
  const config = {
    user:          process.env.DB_USER,
    password:      process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECTION_STRING,
  };

  console.log('[Config] DB_USER:             ', config.user);
  console.log('[Config] DB_CONNECTION_STRING:', config.connectString);
  console.log('');

  // Kiểm tra biến môi trường
  if (!config.user || config.user === 'your_db_user') {
    console.error('[Error] Chưa điền DB_USER trong .env');
    process.exit(1);
  }
  if (!config.password || config.password === 'your_db_password') {
    console.error('[Error] Chưa điền DB_PASSWORD trong .env');
    process.exit(1);
  }
  if (!config.connectString || config.connectString.includes('localhost')) {
    console.warn('[Warn] DB_CONNECTION_STRING đang trỏ về localhost.');
    console.warn('[Warn] Nếu Oracle DB ở Server A (máy khác), hãy sửa thành: 192.168.x.x:1521/FREEPDB1\n');
  }

  // ── 3. Test kết nối và query ──────────────────────────────────────────────
  let conn;
  try {
    console.log('[Test] Đang kết nối...');
    conn = await oracledb.getConnection(config);
    console.log('[Test] Kết nối thành công!\n');

    // Kiểm tra phiên bản DB
    const versionResult = await conn.execute(
      `SELECT banner FROM v$version WHERE ROWNUM = 1`
    );
    console.log('[DB Version]', versionResult.rows[0][0]);

    // Kiểm tra current user
    const userResult = await conn.execute(`SELECT USER FROM DUAL`);
    console.log('[DB User]   ', userResult.rows[0][0]);

    // Kiểm tra tên service
    const serviceResult = await conn.execute(
      `SELECT SYS_CONTEXT('USERENV','SERVICE_NAME') FROM DUAL`
    );
    console.log('[DB Service]', serviceResult.rows[0][0]);
    console.log('');

    // ── 4. Kiểm tra quyền CQN ─────────────────────────────────────────────
    console.log('[CQN] Kiểm tra quyền CHANGE NOTIFICATION...');
    const cqnResult = await conn.execute(
      `SELECT COUNT(*) cnt
       FROM   session_privs
       WHERE  privilege = 'CHANGE NOTIFICATION'`
    );
    const hasCQN = cqnResult.rows[0][0] > 0;
    if (hasCQN) {
      console.log('[CQN] Quyền CHANGE NOTIFICATION: OK');
    } else {
      console.warn('[CQN] THIẾU quyền CHANGE NOTIFICATION');
      console.warn('[CQN] Chạy trên DB (với DBA): GRANT CHANGE NOTIFICATION TO ' + config.user + ';');
    }
    console.log('');

    // ── 5. Kiểm tra bảng USER_NOTIFICATIONS và APP_NOTIFICATIONS ──────────
    for (const table of ['USER_NOTIFICATIONS', 'APP_NOTIFICATIONS']) {
      try {
        const r = await conn.execute(`SELECT COUNT(*) cnt FROM ${table}`);
        console.log(`[Table] ${table.padEnd(25)} → ${r.rows[0][0]} rows`);
      } catch (e) {
        console.warn(`[Table] ${table.padEnd(25)} → KHÔNG truy cập được: ${e.message}`);
      }
    }

    console.log('\n[Result] Tất cả test cơ bản đã qua. Chạy "npm run test:cqn" để test CQN subscription.');

  } catch (err) {
    console.error('[Error] Kết nối thất bại:', err.message);
    console.error('');
    diagnose(err, config);
  } finally {
    if (conn) await conn.close();
  }
}

function diagnose(err, config) {
  const msg = err.message || '';
  if (msg.includes('ORA-01017')) {
    console.error('[Diagnose] Sai username hoặc password. Kiểm tra DB_USER / DB_PASSWORD trong .env');
  } else if (msg.includes('ORA-12541') || msg.includes('TNS:no listener')) {
    console.error('[Diagnose] Không kết nối được Oracle listener tại:', config.connectString);
    console.error('[Diagnose] Kiểm tra: (1) DB đang chạy, (2) port 1521 mở, (3) DB_CONNECTION_STRING đúng');
  } else if (msg.includes('ORA-12154') || msg.includes('TNS:could not resolve')) {
    console.error('[Diagnose] Không resolve được service name. Kiểm tra DB_CONNECTION_STRING (format: host:port/service)');
  } else if (msg.includes('ORA-28000')) {
    console.error('[Diagnose] Tài khoản bị khóa. Liên hệ DBA để mở khóa user', config.user);
  } else if (msg.includes('DPI-1047') || msg.includes('Cannot locate')) {
    console.error('[Diagnose] Oracle Instant Client chưa cài hoặc chưa vào system path.');
    console.error('[Diagnose] Xem hướng dẫn trong CLAUDE.md mục "Oracle Instant Client Setup"');
  }
}

main();
