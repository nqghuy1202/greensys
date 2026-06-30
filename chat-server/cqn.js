'use strict';

const oracledb = require('oracledb');

const SUBSCR_NAME        = 'notifications_watcher';
const HEALTH_CHECK_MS    = 5 * 60_000; // kiểm tra subscription mỗi 5 phút

let _emitFn      = null;
let _cqnConn     = null;
let _healthTimer = null;
let _regId       = null;       // regId của subscription hiện tại (chỉ để log)
let _exiting     = false;      // guard chống gọi exit nhiều lần (error + health cùng fire)
const rowidCache = new Map(); // rowid → aus_id

// Phục hồi CQN = THOÁT process cho pm2 restart sạch — KHÔNG retry in-process.
// Lý do (H2, đã xác minh bằng ss): OCI thick mode giữ notification listener trên
// CQN_PORT ở cấp process suốt đời process; close connection KHÔNG nhả port. Vì vậy
// subscribe() lại trong cùng process luôn ORA-24912 "Listen failed" (bọc NJS-003/
// DPI-1010) → loop vô hạn. Chỉ process mới (pm2 restart-delay 3000) mới giải phóng
// port → subscribe lần đầu thành công + re-register callback đúng CQN_HOST.
// stopCQN() best-effort trước khi thoát để unsubscribe, tránh tích lũy registration mồ côi.
function fatalRestart(reason) {
    if (_exiting) return;
    _exiting = true;
    console.error('[CQN] Fatal: %s — exiting(1) for clean pm2 restart', reason);
    setTimeout(() => process.exit(1), 5000).unref();   // an toàn nếu stopCQN treo
    stopCQN().catch(() => {}).finally(() => process.exit(1));
}

// ──────────────────────────────────────────────
// Load toàn bộ ROWID hiện có vào cache khi khởi động
// ──────────────────────────────────────────────
async function loadCache() {
    let conn;
    try {
        conn = await oracledb.getConnection();
        const result = await conn.execute(
            `SELECT rowid, aus_id FROM user_notifications WHERE read = 'N'`,
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
        // Rowid không có trong cache (row tồn tại trước khi server start hoặc cache miss)
        // Chạy full scan để notify tất cả user bị ảnh hưởng
        console.warn('[CQN] DELETE rowid not in cache — running full scan:', rowid);
        handleFullScan();
        return;
    }
    rowidCache.delete(rowid);
    _emitFn(ausId);
}

// ──────────────────────────────────────────────
// Fallback khi Oracle không trả ROWID (>80 rows)
// ──────────────────────────────────────────────
async function handleFullScan() {
    // GIỚI HẠN ĐÃ BIẾT (F6): fallback này chỉ chạy khi Oracle KHÔNG trả ROWID nào
    // (vd >80 row đổi trong 1 transaction). Cửa sổ 5 phút theo create_date có thể
    // bỏ sót notification cũ hơn 5 phút bị mark-read trong cùng đợt. Trường hợp này
    // hiếm; nới cửa sổ sẽ tăng nguy cơ notify thừa. Giữ nguyên có chủ đích.
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
        fatalRestart('subscription deregistered (DEREG event)');
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
// Kiểm tra subscription còn sống trong Oracle không.
// KHÔNG so theo regid: sub.regId (node-oracledb) không khớp tin cậy với cột REGID
// (H5 — đã xác minh: bảng có 35104 trong khi process log 35112) → so regid cứng gây
// false "gone" → tự restart 5 phút/lần. Thay vào đó match theo cái THỰC SỰ có nghĩa:
// "Oracle có registration nào trên USER_NOTIFICATIONS sẽ giao notification về ĐÚNG
// listener của ta (CQN_HOST:CQN_PORT) không". callback có dạng:
//   net8://(ADDRESS=(PROTOCOL=tcp)(HOST=172.25.10.50)(PORT=3411))
async function checkSubscriptionHealth() {
    // Subscription chưa đăng ký xong → bỏ qua lần check này
    if (_regId == null) return;

    let conn;
    try {
        conn = await oracledb.getConnection();
        const result = await conn.execute(
            `SELECT COUNT(*) AS cnt FROM user_change_notification_regs
             WHERE UPPER(table_name) LIKE '%USER_NOTIFICATIONS'
               AND callback LIKE '%HOST=' || :host || '%'
               AND callback LIKE '%PORT=' || :port || '%'`,
            { host: process.env.CQN_HOST, port: String(process.env.CQN_PORT) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const alive = result.rows[0].CNT > 0;
        if (!alive) {
            fatalRestart('health-check: no registration for ' +
                process.env.CQN_HOST + ':' + process.env.CQN_PORT);
        }
    } catch (err) {
        console.error('[CQN] Health check error:', err.message);
    } finally {
        if (conn) await conn.close().catch(() => {});
    }
}

async function startCQN(emitFn) {
    _emitFn = emitFn;
    if (_healthTimer) { clearInterval(_healthTimer); _healthTimer = null; }

    await loadCache();

    try {
        _cqnConn = await oracledb.getConnection({
            user:          process.env.DB_USER,
            password:      process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECTION_STRING,
            events:        true,
        });
        console.log('[CQN] Connected. Registering subscription...');

        const sub = await _cqnConn.subscribe(SUBSCR_NAME, {
            sql:       `SELECT ano_id, aus_id FROM user_notifications WHERE read = 'N'`,
            ipAddress: process.env.CQN_HOST,
            port:      Number(process.env.CQN_PORT),
            qos:       oracledb.SUBSCR_QOS_QUERY | oracledb.SUBSCR_QOS_ROWIDS,
            callback:  onMessage,
        });
        // node-oracledb ≥5.3 trả { regId } — dùng cho health check theo REGID
        _regId = (sub && sub.regId != null) ? sub.regId : null;

        console.log('[CQN] Subscription active on USER_NOTIFICATIONS (regId=%s)', _regId);

        // Periodic health check — phát hiện khi Oracle drop subscription không gửi event
        _healthTimer = setInterval(checkSubscriptionHealth, HEALTH_CHECK_MS);

        _cqnConn.on('error', (err) => {
            fatalRestart('connection error: ' + err.message);
        });

    } catch (err) {
        fatalRestart('startup error: ' + err.message);
    }
}

// Đóng sạch CQN khi shutdown (pm2 restart / SIGTERM) — tránh để lại connection
// + listener TCP treo trên CQN_PORT.
async function stopCQN() {
    // stopCQN chỉ được gọi ở đường terminal (fatalRestart hoặc shutdown SIGTERM/SIGINT).
    // Set _exiting để chặn fatalRestart đua khi đóng _cqnConn làm bắn 'error' lúc shutdown.
    _exiting = true;
    if (_healthTimer) { clearInterval(_healthTimer); _healthTimer = null; }
    _regId = null;
    if (_cqnConn) {
        try { await _cqnConn.unsubscribe(SUBSCR_NAME); } catch (_) {}
        try { await _cqnConn.close(); } catch (_) {}
        _cqnConn = null;
    }
}

module.exports = { startCQN, stopCQN };
