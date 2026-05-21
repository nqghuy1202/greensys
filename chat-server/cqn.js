'use strict';

const oracledb = require('oracledb');

const SUBSCR_NAME       = 'notifications_watcher';
const RETRY_INTERVAL_MS = 15_000;

// Cache aus_id → username (aus_id không đổi, không cần expire)
const ausIdCache = new Map();

let _pool    = null;
let _emitFn  = null;

// ──────────────────────────────────────────────
// Pool (gọi 1 lần từ server.js trước startCQN)
// ──────────────────────────────────────────────
async function initPool() {
    _pool = await oracledb.createPool({
        user:          process.env.DB_USER,
        password:      process.env.DB_PASSWORD,
        connectString: process.env.DB_CONNECTION_STRING,
        poolMin:       Number(process.env.DB_POOL_MIN)       || 2,
        poolMax:       Number(process.env.DB_POOL_MAX)       || 10,
        poolIncrement: Number(process.env.DB_POOL_INCREMENT) || 1,
        events:        false,
    });
    console.log('[DB] Connection pool created');
}

// ──────────────────────────────────────────────
// aus_id → username (với cache)
// ──────────────────────────────────────────────
async function resolveUsername(conn, ausId) {
    if (!ausId) return null;
    if (ausIdCache.has(ausId)) return ausIdCache.get(ausId);

    try {
        const result = await conn.execute(
            // CẦN XÁC NHẬN tên bảng/cột với DBA — xem cqn-setup-guide.md §8
            `SELECT username FROM app_users WHERE id = :ausId`,
            { ausId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const username = result.rows[0]?.USERNAME?.toLowerCase() || null;
        if (username) ausIdCache.set(ausId, username);
        return username;
    } catch (err) {
        console.error('[CQN] resolveUsername error aus_id=%d: %s', ausId, err.message);
        return null;
    }
}

// ──────────────────────────────────────────────
// Fetch 1 row theo ROWID rồi emit
// ──────────────────────────────────────────────
async function handleRowid(rowid) {
    let conn;
    try {
        conn = await _pool.getConnection();

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

        if (!result.rows.length) {
            console.log('[CQN] Row not found or deleted, rowid:', rowid);
            return;
        }

        const notif    = result.rows[0];
        const username = await resolveUsername(conn, notif.AUS_ID);

        if (!username) {
            console.warn('[CQN] Cannot resolve username for aus_id:', notif.AUS_ID);
            return;
        }

        _emitFn(username, {
            anoId:    notif.ANO_ID,
            title:    notif.ANO_NAME,
            summary:  notif.ANO_SUMMARY,
            menuId:   notif.LIST_MEN_ID,
            redirect: notif.REDIRECT_W_V_NOTI === 'Y',
        });

    } catch (err) {
        console.error('[CQN] handleRowid error:', err.message);
    } finally {
        if (conn) await conn.close().catch(() => {});
    }
}

// ──────────────────────────────────────────────
// Fallback khi Oracle không trả ROWID (>80 rows)
// ──────────────────────────────────────────────
async function handleFullScan() {
    let conn;
    try {
        conn = await _pool.getConnection();

        const result = await conn.execute(
            `SELECT un.ano_id, un.aus_id, an.ano_name, an.ano_summary,
                    an.list_men_id, an.redirect_w_v_noti
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
            const username = await resolveUsername(conn, notif.AUS_ID);
            if (username) {
                _emitFn(username, {
                    anoId:    notif.ANO_ID,
                    title:    notif.ANO_NAME,
                    summary:  notif.ANO_SUMMARY,
                    menuId:   notif.LIST_MEN_ID,
                    redirect: notif.REDIRECT_W_V_NOTI === 'Y',
                });
            }
        }
    } catch (err) {
        console.error('[CQN] handleFullScan error:', err.message);
    } finally {
        if (conn) await conn.close().catch(() => {});
    }
}

// ──────────────────────────────────────────────
// CQN callback
// ──────────────────────────────────────────────
function onMessage(message) {
    if (message.type === oracledb.SUBSCR_EVENT_TYPE_DEREG) {
        console.warn('[CQN] Subscription deregistered by DB — reconnecting in %ds', RETRY_INTERVAL_MS / 1000);
        setTimeout(() => startCQN(_emitFn), RETRY_INTERVAL_MS);
        return;
    }

    const rowids = [];
    for (const query of (message.queries || [])) {
        for (const table of (query.tables || [])) {
            for (const row of (table.rows || [])) {
                rowids.push(row.rowid);
            }
        }
    }

    if (rowids.length) {
        rowids.forEach(handleRowid);
    } else {
        // Oracle không cung cấp ROWID khi >80 rows trong 1 transaction
        console.log('[CQN] No ROWIDs in message — running full scan fallback');
        handleFullScan();
    }
}

// ──────────────────────────────────────────────
// Start CQN (auto-retry loop)
// ──────────────────────────────────────────────
async function startCQN(emitFn) {
    _emitFn = emitFn;
    let cqnConn;

    try {
        cqnConn = await oracledb.getConnection({
            user:          process.env.DB_USER,
            password:      process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING,
            events:        true,
        });
        console.log('[CQN] Connected. Registering subscription...');

        await cqnConn.subscribe(SUBSCR_NAME, {
            sql:       `SELECT ano_id, aus_id FROM user_notifications WHERE deleted = 'N'`,
            ipAddress: process.env.CQN_HOST,
            port:      Number(process.env.CQN_PORT),
            qos:       oracledb.SUBSCR_QOS_QUERY | oracledb.SUBSCR_QOS_ROWIDS,
            callback:  onMessage,
        });

        console.log('[CQN] Subscription active on USER_NOTIFICATIONS');

        cqnConn.on('error', (err) => {
            console.error('[CQN] Connection error:', err.message);
            cqnConn.close().catch(() => {});
            setTimeout(() => startCQN(emitFn), RETRY_INTERVAL_MS);
        });

    } catch (err) {
        console.error('[CQN] Startup error:', err.message);
        if (cqnConn) cqnConn.close().catch(() => {});
        console.log('[CQN] Retrying in %ds...', RETRY_INTERVAL_MS / 1000);
        setTimeout(() => startCQN(emitFn), RETRY_INTERVAL_MS);
    }
}

module.exports = { initPool, startCQN };
