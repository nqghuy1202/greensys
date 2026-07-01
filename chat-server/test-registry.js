'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Test kết nối kiểu MỚI (registry) — trước khi vào hoạt động thật.
//
// Đọc db-registry.json, thử kết nối ĐỘC LẬP từng DB (không abort khi 1 DB lỗi),
// kiểm tra version/user/service, quyền CHANGE NOTIFICATION cho DB có cqn:true,
// và các bảng CQN. In bảng tổng hợp PASS/FAIL cuối cùng.
//
// CÁCH CHẠY (an toàn khi server đang chạy — dùng pool tên riêng "test_*"):
//   node test-registry.js
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const oracledb = require('oracledb');
const registry = require('./db-registry');

function diagnose(err, db) {
    const msg = err.message || '';
    if (msg.includes('ORA-01017'))
        console.error('    [Diagnose] Sai user/password của "' + db.key + '"');
    else if (msg.includes('ORA-12541') || msg.includes('no listener'))
        console.error('    [Diagnose] Không tới listener tại ' + db.connectString + ' — kiểm tra IP/port 1521/DB chạy');
    else if (msg.includes('ORA-12514'))
        console.error('    [Diagnose] Service chưa đăng ký listener — ' + db.connectString);
    else if (msg.includes('ORA-12154') || msg.includes('could not resolve'))
        console.error('    [Diagnose] Sai service name — connectString phải là host:1521/SERVICE_NAME');
    else if (msg.includes('ORA-28000'))
        console.error('    [Diagnose] Tài khoản "' + db.user + '" bị khóa — DBA: ALTER USER ' + db.user + ' ACCOUNT UNLOCK;');
    else if (msg.includes('DPI-1047') || msg.includes('Cannot locate'))
        console.error('    [Diagnose] Oracle Instant Client chưa cài — xem cqn-setup-guide.md');
}

const aliasOf = db => 'test_' + db.key;

// Phase 1: mở pool cho 1 DB (không query). Trả true nếu tạo pool thành công.
async function openPool(db) {
    try {
        await oracledb.createPool({
            poolAlias:     aliasOf(db),
            user:          db.user,
            password:      db.password,
            connectString: db.connectString,
            events:        true,
            poolMin: 1, poolMax: 2, poolIncrement: 1,
        });
        console.log('  [Pool] "%s" mở OK → %s%s', db.key, db.connectString, db.cqn ? ' (cqn:true)' : '');
        return true;
    } catch (err) {
        console.error('  [Pool] "%s" FAIL: %s', db.key, err.message);
        diagnose(err, db);
        return false;
    }
}

// Phase 2: query 1 DB khi TẤT CẢ pool đang sống đồng thời.
async function checkDb(db) {
    const result = { key: db.key, ok: false, cqnPriv: null, note: '' };
    let conn;
    try {
        console.log('\n── DB "%s" ──', db.key);
        conn = await oracledb.getConnection(aliasOf(db));

        const usr = await conn.execute(`SELECT USER FROM DUAL`);
        const svc = await conn.execute(`SELECT SYS_CONTEXT('USERENV','SERVICE_NAME') FROM DUAL`);
        console.log('  [Info] USER=%s  SERVICE=%s', usr.rows[0][0], svc.rows[0][0]);

        // Quyền CHANGE NOTIFICATION — chỉ bắt buộc với DB cqn:true
        const priv = await conn.execute(
            `SELECT COUNT(*) FROM session_privs WHERE privilege = 'CHANGE NOTIFICATION'`
        );
        result.cqnPriv = priv.rows[0][0] > 0;
        if (db.cqn) {
            if (result.cqnPriv) console.log('  [CQN] Quyền CHANGE NOTIFICATION: OK');
            else {
                console.warn('  [CQN] THIẾU CHANGE NOTIFICATION → DBA: GRANT CHANGE NOTIFICATION TO ' + db.user + ';');
                result.note = 'thiếu quyền CQN';
            }
        }

        try {
            const r = await conn.execute(`SELECT COUNT(*) FROM user_notifications`);
            console.log('  [Table] user_notifications → %d rows', r.rows[0][0]);
        } catch (e) {
            console.warn('  [Table] user_notifications → %s', e.message);
            if (!result.note) result.note = 'bảng user_notifications lỗi';
        }

        result.ok = true;
    } catch (err) {
        console.error('  [FAIL] %s', err.message);
        diagnose(err, db);
        result.note = err.message.split('\n')[0];
    } finally {
        if (conn) await conn.close().catch(() => {});
    }
    return result;
}

async function main() {
    try {
        oracledb.initOracleClient();
        console.log('[Mode] Thick mode OK');
    } catch (err) {
        console.warn('[Mode] Thick mode không khả dụng:', err.message);
        console.warn('[Mode] Thin mode — CQN sẽ KHÔNG hoạt động');
    }

    let dbs;
    try {
        dbs = registry.loadRegistry();
    } catch (e) {
        console.error('[Registry] Lỗi đọc db-registry.json:', e.message);
        process.exit(1);
    }
    console.log('[Registry] %d DB, primary=%s\n', dbs.length, registry.primaryKey());

    // Phase 1 — mở TẤT CẢ pool cùng lúc (test nhiều pool events:true đồng tồn tại)
    console.log('── Phase 1: mở tất cả pool đồng thời ──');
    const opened = [];
    for (const db of dbs) if (await openPool(db)) opened.push(db);
    console.log('  → %d/%d pool đang sống đồng thời', opened.length, dbs.length);

    // Phase 2 — query từng DB KHI tất cả pool còn sống
    console.log('\n── Phase 2: query từng DB (mọi pool cùng sống) ──');
    const results = [];
    for (const db of opened) results.push(await checkDb(db));

    // Phase 3 — đóng tất cả pool
    console.log('\n── Phase 3: đóng tất cả pool ──');
    for (const db of opened) {
        await oracledb.getPool(aliasOf(db)).close(0).catch(() => {});
    }

    console.log('\n══════════ TỔNG HỢP ══════════');
    let allOk = opened.length === dbs.length;
    for (const db of dbs) {
        const r = results.find(x => x.key === db.key);
        const ok = r && r.ok;
        if (!ok) allOk = false;
        const note = !r ? '— pool không mở được' : (r.note ? '— ' + r.note : '');
        console.log('  %s  %s%s', ok ? 'PASS' : 'FAIL', db.key.padEnd(16), note);
    }
    console.log('══════════════════════════════');
    console.log(allOk ? '✅ Tất cả DB kết nối đồng thời OK.' : '❌ Có DB lỗi — xem chi tiết ở trên.');
    process.exit(allOk ? 0 : 1);
}

main();
