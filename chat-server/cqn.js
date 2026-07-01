'use strict';

const oracledb = require('oracledb');
const registry = require('./db-registry');

const HEALTH_CHECK_MS = 5 * 60_000; // kiểm tra subscription mỗi 5 phút

let _emitFn      = null;   // notifyUser(ausId, dbKey)
let _healthTimer = null;
let _exiting     = false;  // guard chống gọi exit nhiều lần (error + health cùng fire)

// Mỗi DB cqn:true → 1 subscription độc lập. Cùng instance thì share 1 CQN_PORT
// (đã xác minh bằng test-cqn-multidb.js). aus_id + rowid là RIÊNG theo schema nên
// mỗi sub giữ rowidCache riêng và notify kèm dbKey của nó.
// sub = { dbKey, conn, regId, rowidCache: Map<rowid,ausId>, subscrName }
const subs = new Map();    // dbKey → sub

// Phục hồi CQN = THOÁT process cho pm2 restart sạch — KHÔNG retry in-process.
// Lý do (H2, đã xác minh bằng ss): OCI thick mode giữ notification listener trên
// CQN_PORT ở cấp process suốt đời process; close connection KHÔNG nhả port. Vì vậy
// subscribe() lại trong cùng process luôn ORA-24912 "Listen failed" (bọc NJS-003/
// DPI-1010) → loop vô hạn. Chỉ process mới (pm2 restart-delay 3000) mới giải phóng
// port → subscribe lần đầu thành công + re-register callback đúng CQN_HOST.
// LƯU Ý multi-DB: listener ở cấp process → 1 sub lỗi thì thoát cả process, mọi DB
// subscribe lại. Chấp nhận được vì các schema cùng instance (chung vòng đời). Khi
// có INSTANCE khác nhau → tách worker/process (Phương án C) để cô lập lỗi.
// stopCQN() best-effort trước khi thoát để unsubscribe, tránh tích lũy registration mồ côi.
function fatalRestart(reason) {
    if (_exiting) return;
    _exiting = true;
    console.error('[CQN] Fatal: %s — exiting(1) for clean pm2 restart', reason);
    setTimeout(() => process.exit(1), 5000).unref();   // an toàn nếu stopCQN treo
    stopCQN().catch(() => {}).finally(() => process.exit(1));
}

// ──────────────────────────────────────────────
// Load toàn bộ ROWID hiện có vào cache khi khởi động (theo từng DB)
// ──────────────────────────────────────────────
async function loadCache(sub) {
    let conn;
    try {
        conn = await registry.getConnection(sub.dbKey);
        const result = await conn.execute(
            `SELECT rowid, aus_id FROM user_notifications WHERE read = 'N'`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        sub.rowidCache.clear();
        for (const row of result.rows) {
            sub.rowidCache.set(row.ROWID, String(row.AUS_ID));
        }
        console.log('[CQN][%s] Cache loaded: %d rows', sub.dbKey, sub.rowidCache.size);
    } catch (err) {
        console.error('[CQN][%s] loadCache error: %s', sub.dbKey, err.message);
    } finally {
        if (conn) await conn.close().catch(() => {});
    }
}

// ──────────────────────────────────────────────
// INSERT: fetch aus_id từ DB, lưu vào cache, notify
// ──────────────────────────────────────────────
async function handleRowid(sub, rowid) {
    let conn;
    try {
        conn = await registry.getConnection(sub.dbKey);
        const result = await conn.execute(
            `SELECT aus_id FROM user_notifications WHERE rowid = :rid`,
            { rid: rowid },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (!result.rows.length) return;
        const ausId = String(result.rows[0].AUS_ID);
        sub.rowidCache.set(rowid, ausId);
        _emitFn(ausId, sub.dbKey);
    } catch (err) {
        console.error('[CQN][%s] handleRowid error: %s', sub.dbKey, err.message);
    } finally {
        if (conn) await conn.close().catch(() => {});
    }
}

// ──────────────────────────────────────────────
// DELETE: tra cache lấy aus_id, notify, xóa khỏi cache
// ──────────────────────────────────────────────
function handleDeleteRowid(sub, rowid) {
    const ausId = sub.rowidCache.get(rowid);
    if (!ausId) {
        // Rowid không có trong cache (row tồn tại trước khi server start hoặc cache miss)
        // Chạy full scan để notify tất cả user bị ảnh hưởng
        console.warn('[CQN][%s] DELETE rowid not in cache — running full scan: %s', sub.dbKey, rowid);
        handleFullScan(sub);
        return;
    }
    sub.rowidCache.delete(rowid);
    _emitFn(ausId, sub.dbKey);
}

// ──────────────────────────────────────────────
// Fallback khi Oracle không trả ROWID (>80 rows)
// ──────────────────────────────────────────────
async function handleFullScan(sub) {
    // GIỚI HẠN ĐÃ BIẾT (F6): fallback này chỉ chạy khi Oracle KHÔNG trả ROWID nào
    // (vd >80 row đổi trong 1 transaction). Cửa sổ 5 phút theo create_date có thể
    // bỏ sót notification cũ hơn 5 phút bị mark-read trong cùng đợt. Trường hợp này
    // hiếm; nới cửa sổ sẽ tăng nguy cơ notify thừa. Giữ nguyên có chủ đích.
    let conn;
    try {
        conn = await registry.getConnection(sub.dbKey);
        const result = await conn.execute(
            `SELECT DISTINCT aus_id
             FROM   user_notifications
             WHERE  create_date >= SYSDATE - INTERVAL '5' MINUTE`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        for (const row of result.rows) _emitFn(String(row.AUS_ID), sub.dbKey);
    } catch (err) {
        console.error('[CQN][%s] handleFullScan error: %s', sub.dbKey, err.message);
    } finally {
        if (conn) await conn.close().catch(() => {});
    }
}

// ──────────────────────────────────────────────
// CQN callback — closure bao dbKey để route đúng sub
// ──────────────────────────────────────────────
function makeOnMessage(sub) {
    return function onMessage(message) {
        if (message.type === oracledb.SUBSCR_EVENT_TYPE_DEREG) {
            fatalRestart(sub.dbKey + ': subscription deregistered (DEREG event)');
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
                        handleDeleteRowid(sub, row.rowid);
                    } else {
                        handleRowid(sub, row.rowid);
                    }
                }
            }
        }

        if (!hasRows) {
            console.log('[CQN][%s] No ROWIDs — running full scan fallback', sub.dbKey);
            handleFullScan(sub);
        }
    };
}

// ──────────────────────────────────────────────
// Health check — mỗi DB (dùng pool của chính schema đó)
// ──────────────────────────────────────────────
// KHÔNG so theo regid: sub.regId (node-oracledb) không khớp tin cậy với cột REGID
// (H5 — đã xác minh: bảng có 35104 trong khi process log 35112) → so regid cứng gây
// false "gone" → tự restart 5 phút/lần. Thay vào đó match theo cái THỰC SỰ có nghĩa:
// "Oracle có registration nào trên USER_NOTIFICATIONS sẽ giao notification về ĐÚNG
// listener của ta (CQN_HOST:CQN_PORT) không". callback có dạng:
//   net8://(ADDRESS=(PROTOCOL=tcp)(HOST=172.25.10.50)(PORT=3411))
async function checkSubscriptionHealth() {
    for (const sub of subs.values()) {
        if (sub.regId == null) continue;   // chưa đăng ký xong → bỏ qua
        let conn;
        try {
            conn = await registry.getConnection(sub.dbKey);
            const result = await conn.execute(
                `SELECT COUNT(*) AS cnt FROM user_change_notification_regs
                 WHERE UPPER(table_name) LIKE '%USER_NOTIFICATIONS'
                   AND callback LIKE '%HOST=' || :host || '%'
                   AND callback LIKE '%PORT=' || :port || '%'`,
                { host: process.env.CQN_HOST, port: String(process.env.CQN_PORT) },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            if (result.rows[0].CNT === 0) {
                fatalRestart('health-check [' + sub.dbKey + ']: no registration for ' +
                    process.env.CQN_HOST + ':' + process.env.CQN_PORT);
                return;
            }
        } catch (err) {
            console.error('[CQN][%s] Health check error: %s', sub.dbKey, err.message);
        } finally {
            if (conn) await conn.close().catch(() => {});
        }
    }
}

// ──────────────────────────────────────────────
// Subscribe 1 DB
// ──────────────────────────────────────────────
async function subscribeOne(db) {
    const sub = {
        dbKey:      db.key,
        conn:       null,
        regId:      null,
        rowidCache: new Map(),
        subscrName: 'notifications_watcher_' + db.key,   // tên duy nhất/DB
    };
    subs.set(db.key, sub);

    await loadCache(sub);

    // Connection CQN riêng (không từ pool) với events:true — theo config của DB đó.
    sub.conn = await oracledb.getConnection({
        user:          db.user,
        password:      db.password,
        connectString: db.connectString,
        events:        true,
    });
    console.log('[CQN][%s] Connected. Registering subscription...', db.key);

    const s = await sub.conn.subscribe(sub.subscrName, {
        sql:       `SELECT ano_id, aus_id FROM user_notifications WHERE read = 'N'`,
        ipAddress: process.env.CQN_HOST,
        port:      Number(process.env.CQN_PORT),
        qos:       oracledb.SUBSCR_QOS_QUERY | oracledb.SUBSCR_QOS_ROWIDS,
        callback:  makeOnMessage(sub),
    });
    sub.regId = (s && s.regId != null) ? s.regId : null;
    console.log('[CQN][%s] Subscription active on USER_NOTIFICATIONS (regId=%s)', db.key, sub.regId);

    sub.conn.on('error', (err) => {
        fatalRestart(db.key + ' connection error: ' + err.message);
    });
}

// ──────────────────────────────────────────────
// Start CQN cho MỌI DB cqn:true trong registry
// ──────────────────────────────────────────────
async function startCQN(emitFn) {
    _emitFn = emitFn;
    if (_healthTimer) { clearInterval(_healthTimer); _healthTimer = null; }

    const cqnDbs = registry.cqnDbs();
    if (!cqnDbs.length) {
        console.warn('[CQN] Không có DB nào cqn:true trong registry — bỏ qua CQN.');
        return;
    }

    try {
        for (const db of cqnDbs) {
            await subscribeOne(db);   // tuần tự — lỗi DB nào lộ rõ DB đó
        }
        console.log('[CQN] Active trên %d DB: %s', cqnDbs.length,
            cqnDbs.map(d => d.key).join(', '));

        // Periodic health check — phát hiện khi Oracle drop subscription không gửi event
        _healthTimer = setInterval(checkSubscriptionHealth, HEALTH_CHECK_MS);
    } catch (err) {
        fatalRestart('startup error: ' + err.message);
    }
}

// Đóng sạch CQN khi shutdown (pm2 restart / SIGTERM) — tránh để lại connection
// + listener TCP treo trên CQN_PORT.
async function stopCQN() {
    // stopCQN chỉ được gọi ở đường terminal (fatalRestart hoặc shutdown SIGTERM/SIGINT).
    // Set _exiting để chặn fatalRestart đua khi đóng conn làm bắn 'error' lúc shutdown.
    _exiting = true;
    if (_healthTimer) { clearInterval(_healthTimer); _healthTimer = null; }
    for (const sub of subs.values()) {
        if (!sub.conn) continue;
        try { await sub.conn.unsubscribe(sub.subscrName); } catch (_) {}
        try { await sub.conn.close(); } catch (_) {}
        sub.conn = null;
    }
    subs.clear();
}

module.exports = { startCQN, stopCQN };
