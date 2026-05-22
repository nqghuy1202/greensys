'use strict';

const oracledb = require('oracledb');

const SUBSCR_NAME       = 'notifications_watcher';
const RETRY_INTERVAL_MS = 15_000;

let _emitFn = null;
const rowidCache = new Map(); // rowid → aus_id

// ──────────────────────────────────────────────
// Load toàn bộ ROWID hiện có vào cache khi khởi động
// ──────────────────────────────────────────────
async function loadCache() {
    let conn;
    try {
        conn = await oracledb.getConnection();
        const result = await conn.execute(
            `SELECT rowid, aus_id FROM user_notifications`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        rowidCache.clear();
        for (const row of result.rows) {
            rowidCache.set(row.ROWID, String(row.AUS_ID));
        }
        console.log('[CQN] Cache loaded: %d rows', rowidCache.size);
    } catch (err) {
        console.error('[CQN] loadCache error:', err.message);
    } finally {
        if (conn) await conn.close().catch(() => {});
    }
}

// ──────────────────────────────────────────────
// INSERT: fetch aus_id từ DB, lưu vào cache, notify
// ──────────────────────────────────────────────
async function handleRowid(rowid) {
    let conn;
    try {
        conn = await oracledb.getConnection();
        const result = await conn.execute(
            `SELECT aus_id FROM user_notifications WHERE rowid = :rid`,
            { rid: rowid },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (!result.rows.length) return;
        const ausId = String(result.rows[0].AUS_ID);
        rowidCache.set(rowid, ausId);
        _emitFn(ausId);
    } catch (err) {
        console.error('[CQN] handleRowid error:', err.message);
    } finally {
        if (conn) await conn.close().catch(() => {});
    }
}

// ──────────────────────────────────────────────
// DELETE: tra cache lấy aus_id, notify, xóa khỏi cache
// ──────────────────────────────────────────────
function handleDeleteRowid(rowid) {
    const ausId = rowidCache.get(rowid);
    if (!ausId) {
        console.warn('[CQN] DELETE rowid not in cache:', rowid);
        return;
    }
    rowidCache.delete(rowid);
    _emitFn(ausId);
}

// ──────────────────────────────────────────────
// Fallback khi Oracle không trả ROWID (>80 rows)
// ──────────────────────────────────────────────
async function handleFullScan() {
    let conn;
    try {
        conn = await oracledb.getConnection();
        const result = await conn.execute(
            `SELECT DISTINCT aus_id
             FROM   user_notifications
             WHERE  create_date >= SYSDATE - INTERVAL '5' MINUTE`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        for (const row of result.rows) _emitFn(String(row.AUS_ID));
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
        console.warn('[CQN] Subscription deregistered — reconnecting in %ds', RETRY_INTERVAL_MS / 1000);
        setTimeout(() => startCQN(_emitFn), RETRY_INTERVAL_MS);
        return;
    }

    let hasRows = false;
    for (const query of (message.queries || [])) {
        for (const table of (query.tables || [])) {
            const rows = table.rows || [];
            if (!rows.length) continue;

            hasRows = true;
            const isDelete = !!(table.operation & oracledb.CQN_OPCODE_DELETE);

            for (const row of rows) {
                if (isDelete) {
                    handleDeleteRowid(row.rowid);
                } else {
                    handleRowid(row.rowid);
                }
            }
        }
    }

    if (!hasRows) {
        console.log('[CQN] No ROWIDs — running full scan fallback');
        handleFullScan();
    }
}

// ──────────────────────────────────────────────
// Start CQN (auto-retry loop)
// ──────────────────────────────────────────────
async function startCQN(emitFn) {
    _emitFn = emitFn;

    await loadCache();

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
            sql:       `SELECT ano_id, aus_id FROM user_notifications`,
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

module.exports = { startCQN };
