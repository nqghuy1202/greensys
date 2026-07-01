'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Dynamic multi-DB registry — nguồn cấu hình cho Phương án C.
//
// Đọc db-registry.json (mảng object), tạo 1 named oracledb pool / mỗi DB
// (poolAlias = key) lúc startup → "kết nối động": thêm DB = thêm 1 object,
// không sửa code. Cờ `cqn:true` đánh dấu DB cần CQN real-time (dùng ở bước
// tách worker sau; bước hiện tại CQN chỉ chạy trên primary).
//
// LƯU Ý thick mode: events-mode của OCI env do POOL ĐẦU TIÊN quyết định. Vì có
// DB cần CQN nên MỌI pool tạo với events:true → không lệ thuộc thứ tự tạo pool.
//
// Registry entry:
//   { key, user, password, connectString, cqn?, primary?,
//     poolMin?, poolMax?, poolIncrement? }
// ─────────────────────────────────────────────────────────────────────────────
const fs       = require('fs');
const path     = require('path');
const oracledb = require('oracledb');

const REGISTRY_PATH = process.env.DB_REGISTRY_PATH
    || path.join(__dirname, 'db-registry.json');

let _dbs        = [];     // entry[] đã validate
let _primaryKey = null;

function loadRegistry() {
    let raw;
    try {
        raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    } catch (e) {
        throw new Error('Không đọc được ' + REGISTRY_PATH + ' — tạo từ db-registry.example.json. ' + e.message);
    }

    let arr;
    try { arr = JSON.parse(raw); }
    catch (e) { throw new Error('db-registry.json không phải JSON hợp lệ: ' + e.message); }

    if (!Array.isArray(arr) || arr.length === 0)
        throw new Error('db-registry.json phải là mảng có ít nhất 1 DB');

    const seen = new Set();
    _dbs = arr.map((d, i) => {
        for (const f of ['key', 'user', 'password', 'connectString']) {
            if (!d[f]) throw new Error('DB #' + i + ' thiếu trường "' + f + '"');
        }
        const key = String(d.key);
        if (seen.has(key)) throw new Error('Trùng key "' + key + '" trong registry');
        seen.add(key);
        return {
            key,
            user:          d.user,
            password:      d.password,
            connectString: d.connectString,
            cqn:           d.cqn === true,
            primary:       d.primary === true,
            poolMin:       Number(d.poolMin)       || Number(process.env.DB_POOL_MIN)       || 2,
            poolMax:       Number(d.poolMax)       || Number(process.env.DB_POOL_MAX)       || 10,
            poolIncrement: Number(d.poolIncrement) || Number(process.env.DB_POOL_INCREMENT) || 1,
        };
    });

    const primaries = _dbs.filter(d => d.primary);
    if (primaries.length > 1)
        throw new Error('Chỉ được 1 DB có "primary": true (thấy ' + primaries.length + ')');
    _primaryKey = (primaries[0] || _dbs[0]).key;
    return _dbs;
}

// Tạo pool cho MỌI DB trong registry. Idempotent-ish: ném nếu poolAlias trùng
// (createPool sẽ báo) — gọi 1 lần lúc startup.
async function initPools() {
    if (!_dbs.length) loadRegistry();
    for (const d of _dbs) {
        await oracledb.createPool({
            poolAlias:     d.key,
            user:          d.user,
            password:      d.password,
            connectString: d.connectString,
            events:        true,   // xem ghi chú thick-mode ở đầu file
            poolMin:       d.poolMin,
            poolMax:       d.poolMax,
            poolIncrement: d.poolIncrement,
        });
        console.log('[DB] Pool "%s" → %s%s', d.key, d.connectString, d.cqn ? ' (CQN)' : '');
    }
    console.log('[DB] %d pool(s) created. Primary=%s', _dbs.length, _primaryKey);
    return _dbs;
}

function primaryKey()        { return _primaryKey; }
function listDbs()           { return _dbs.slice(); }
function getDb(key)          { return _dbs.find(d => d.key === (key || _primaryKey)) || null; }
function cqnDbs()            { return _dbs.filter(d => d.cqn); }

// Lấy connection từ pool theo key (mặc định = primary). key là poolAlias.
function getConnection(key)  { return oracledb.getConnection(key || _primaryKey); }
function getPool(key)        { return oracledb.getPool(key || _primaryKey); }

async function closeAll(drainSeconds = 10) {
    for (const d of _dbs) {
        try { await oracledb.getPool(d.key).close(drainSeconds); }
        catch (_) { /* pool có thể chưa tạo */ }
    }
}

module.exports = {
    loadRegistry, initPools,
    primaryKey, listDbs, getDb, cqnDbs,
    getConnection, getPool, closeAll,
};
