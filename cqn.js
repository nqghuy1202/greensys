'use strict';

const oracledb = require('oracledb');

const SUBSCRIBE_NAME = 'user_notif_watcher';

const SUBSCRIBE_SQL = `
  SELECT ano_id, aus_id
  FROM   user_notifications
  WHERE  deleted = 'N'
`;

// Injected by startCQN caller
let _emitToUser;
let _resolveUsername;

// ──────────────────────────────────────────────────────────
// CALLBACK
// ──────────────────────────────────────────────────────────
async function onUserNotificationChange(message) {
  console.log('[CQN] Notification received, type:', message.type);

  if (message.type === oracledb.SUBSCR_EVENT_TYPE_DEREG) {
    console.warn('[CQN] Subscription deregistered by DB — reconnect loop will re-subscribe');
    return;
  }

  if (message.type !== oracledb.SUBSCR_EVENT_TYPE_OBJ_CHANGE) return;

  const queries = message.queries || [];
  for (const query of queries) {
    for (const table of (query.tables || [])) {
      console.log('[CQN] Table:', table.name, '| op:', table.operation);

      if (!table.name.toUpperCase().includes('USER_NOTIFICATIONS')) continue;

      const hasInsert = (table.operation & oracledb.CQN_OPCODE_INSERT) !== 0;
      if (!hasInsert) continue;

      if (!table.rows || table.rows.length === 0) {
        await handleFullTableNotification();
        continue;
      }

      for (const row of table.rows) {
        const isInsert = (row.operation & oracledb.CQN_OPCODE_INSERT) !== 0;
        if (!isInsert) continue;
        console.log('[CQN] INSERT rowid:', row.rowid);
        await handleRowByRowid(row.rowid);
      }
    }
  }
}

// ──────────────────────────────────────────────────────────
// FETCH ROW DATA via pool connection (never use CQN conn)
// ──────────────────────────────────────────────────────────
async function handleRowByRowid(rowid) {
  let conn;
  try {
    conn = await oracledb.getConnection();

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
      console.log('[CQN] Row not found or deleted, rowid:', rowid);
      return;
    }

    const notif    = result.rows[0];
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
    console.error('[CQN] handleRowByRowid error:', err.message);
  } finally {
    if (conn) try { await conn.close(); } catch {}
  }
}

// ──────────────────────────────────────────────────────────
// FALLBACK — >80 rows in one transaction, no ROWID data
// ──────────────────────────────────────────────────────────
async function handleFullTableNotification() {
  console.warn('[CQN] Full-table notification (no ROWID) — querying last 5 minutes');
  let conn;
  try {
    conn = await oracledb.getConnection();

    const result = await conn.execute(
      `SELECT un.ano_id, un.aus_id, an.ano_name, an.ano_summary
       FROM   user_notifications un
       JOIN   app_notifications  an ON an.ano_id = un.ano_id
       WHERE  un.deleted     = 'N'
         AND  un.read        = 'N'
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
    if (conn) try { await conn.close(); } catch {}
  }
}

// ──────────────────────────────────────────────────────────
// CQN CONNECTION with auto-reconnect loop
// ──────────────────────────────────────────────────────────
async function startCQN({ emitToUser, resolveUsername }) {
  _emitToUser      = emitToUser;
  _resolveUsername = resolveUsername;

  // Oracle 19.3: clientInitiated not supported — Oracle calls back to us
  const callbackIp   = process.env.CQN_HOST;
  const callbackPort = parseInt(process.env.CQN_PORT, 10) || 3141;

  if (!callbackIp) {
    throw new Error('CQN_HOST not set in .env — Oracle needs Server B IP to send callbacks');
  }

  console.log(`[CQN] Will register callback to ${callbackIp}:${callbackPort}`);

  while (true) {
    let cqnConn;
    try {
      console.log('[CQN] Connecting with events:true ...');

      // CQN connection — separate from pool, events:true required
      cqnConn = await oracledb.getConnection({
        user:          process.env.DB_USER,
        password:      process.env.DB_PASSWORD,
        connectString: process.env.DB_CONNECTION_STRING,
        events:        true
      });

      console.log('[CQN] Connected. Registering subscription...');

      await cqnConn.subscribe(SUBSCRIBE_NAME, {
        sql:      SUBSCRIBE_SQL,
        callback: onUserNotificationChange,
        // Oracle 19.3: no clientInitiated — DB pushes back to this IP/port
        ipAddress: callbackIp,
        port:      callbackPort,
        qos:       oracledb.SUBSCR_QOS_QUERY | oracledb.SUBSCR_QOS_ROWIDS
      });

      console.log('[CQN] Subscription active on USER_NOTIFICATIONS');

      // Log registered tables for verification
      const reg = await cqnConn.execute(
        `SELECT regid, table_name FROM user_change_notification_regs`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      console.log('[CQN] Registered:', reg.rows.map(r => `${r.REGID}:${r.TABLE_NAME}`));

      // Keep connection alive — ping every 30s to detect drops
      await new Promise((_, reject) => {
        const pingInterval = setInterval(async () => {
          try {
            await cqnConn.ping();
          } catch (pingErr) {
            clearInterval(pingInterval);
            reject(pingErr);
          }
        }, 30_000);

        // Allow clean shutdown
        process.once('SIGTERM', () => {
          clearInterval(pingInterval);
          reject(new Error('SIGTERM'));
        });
      });

    } catch (err) {
      if (err.message === 'SIGTERM') {
        console.log('[CQN] Shutting down cleanly');
        try {
          if (cqnConn) await cqnConn.unsubscribe(SUBSCRIBE_NAME);
        } catch {}
        break;
      }

      console.error('[CQN] Error:', err.message);
      console.log('[CQN] Retrying in 15 seconds...');

      try { if (cqnConn) await cqnConn.close(); } catch {}
      await new Promise(r => setTimeout(r, 15_000));
    }
  }
}

module.exports = { startCQN };
