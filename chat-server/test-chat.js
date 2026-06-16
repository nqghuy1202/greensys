'use strict';

/**
 * Test tool cho /api/chat/* endpoints.
 *
 * Dùng:
 *   node test-chat.js <aus_id> [conv_id] [host]
 *
 * Ví dụ:
 *   node test-chat.js 123
 *   node test-chat.js 123 456
 *   node test-chat.js 123 456 https://chattest.erp100.vn
 *
 * Script chạy tuần tự từng endpoint và in kết quả chi tiết.
 */

require('dotenv').config();
const http  = require('http');
const https = require('https');
const { URL } = require('url');

// ── Config ────────────────────────────────────────────────────────────────────

const AUS_ID  = Number(process.argv[2]);
const CONV_ID = Number(process.argv[3]) || null;
const HOST    = process.argv[4] || `http://localhost:${process.env.PORT || 3410}`;

if (!AUS_ID || isNaN(AUS_ID)) {
    console.error('Usage: node test-chat.js <aus_id> [conv_id] [host]');
    process.exit(1);
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const url    = new URL(path, HOST);
        const lib    = url.protocol === 'https:' ? https : http;
        const payload = body ? JSON.stringify(body) : null;

        const options = {
            method,
            hostname: url.hostname,
            port:     url.port || (url.protocol === 'https:' ? 443 : 80),
            path:     url.pathname + url.search,
            headers:  {
                'Accept': 'application/json',
                ...(payload && {
                    'Content-Type':   'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                }),
            },
        };

        const req = lib.request(options, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', c => data += c);
            res.on('end', () => {
                let parsed = data;
                try { parsed = JSON.parse(data); } catch (_) {}
                resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

// ── Print helpers ─────────────────────────────────────────────────────────────

let testNum = 0;
const results = [];

function hr(char = '─') { console.log(char.repeat(60)); }

async function test(label, fn) {
    testNum++;
    console.log(`\n[${testNum}] ${label}`);
    hr();
    const start = Date.now();
    try {
        const res = await fn();
        const ms  = Date.now() - start;
        const ok  = res.status >= 200 && res.status < 300;
        const icon = ok ? '✓' : '✗';
        console.log(`${icon} HTTP ${res.status}  (${ms}ms)`);
        if (typeof res.body === 'object') {
            // Tóm tắt thông minh thay vì dump toàn bộ
            summarize(res.body);
        } else {
            console.log('  raw:', String(res.body).slice(0, 300));
        }
        results.push({ num: testNum, label, status: res.status, ok, ms });
        return res;
    } catch (err) {
        const ms = Date.now() - start;
        console.error(`✗ ERROR (${ms}ms):`, err.message);
        if (err.code === 'ECONNREFUSED') {
            console.error('  → Server chưa chạy hoặc sai host/port:', HOST);
        }
        results.push({ num: testNum, label, status: 0, ok: false, ms, error: err.message });
        return null;
    }
}

function summarize(obj) {
    // Conversations list
    if (obj.conversations) {
        const list = obj.conversations;
        console.log(`  conversations: ${list.length} item(s)`);
        list.slice(0, 3).forEach((c, i) => {
            console.log(`    [${i}] conv_id=${c.conv_id}  type=${c.conv_type}  name="${c.display_name}"  unread=${c.unread_count}`);
        });
        if (list.length > 3) console.log(`    ... và ${list.length - 3} hội thoại khác`);
    }
    // Messages list
    else if (obj.messages) {
        const list = obj.messages;
        console.log(`  messages: ${list.length} item(s)`);
        list.slice(-3).forEach((m, i) => {
            const preview = String(m.body || '[deleted]').slice(0, 60);
            console.log(`    [msg_id=${m.msg_id}] ${m.from_name}: ${preview}`);
        });
    }
    // Members list
    else if (obj.members) {
        const list = obj.members;
        console.log(`  members: ${list.length} member(s)`);
        list.forEach(m => {
            console.log(`    aus_id=${m.aus_id}  ${m.full_name}  admin=${m.is_admin}`);
        });
    }
    // Online list
    else if (obj.online) {
        console.log(`  online: ${obj.online.length} user(s)  cached=${obj.cached ?? false}`);
        console.log(`  aus_ids:`, obj.online.slice(0, 10).join(', ') + (obj.online.length > 10 ? '...' : ''));
    }
    // Send result
    else if (obj.msg) {
        const m = obj.msg;
        console.log(`  status: ${obj.status}`);
        console.log(`  msg_id: ${m.msg_id}  conv_id: ${m.conv_id}`);
        console.log(`  from:   ${m.from_name} (aus_id=${m.from_aus_id})`);
        console.log(`  body:   ${String(m.body).slice(0, 80)}`);
    }
    // Create result
    else if (obj.conv_id !== undefined) {
        console.log(`  status:  ${obj.status}`);
        console.log(`  conv_id: ${obj.conv_id}`);
    }
    // Error
    else if (obj.error) {
        console.error(`  ERROR: ${obj.error}`);
    }
    // Generic
    else {
        console.log('  ', JSON.stringify(obj).slice(0, 200));
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function run() {
    console.log('═'.repeat(60));
    console.log(' Chat API Diagnostic Tool');
    console.log(`  Host   : ${HOST}`);
    console.log(`  aus_id : ${AUS_ID}`);
    console.log(`  conv_id: ${CONV_ID ?? '(chưa cung cấp — sẽ tự lấy từ /conversations)'}`);
    console.log('═'.repeat(60));

    // ── 1. Health ────────────────────────────────────────────────────────────
    await test('GET /health — server alive?', () => request('GET', '/health'));

    // ── 2. Online users ──────────────────────────────────────────────────────
    await test('GET /api/chat/online — danh sách user đang online', () =>
        request('GET', '/api/chat/online'));

    // ── 3. Conversations ─────────────────────────────────────────────────────
    const convRes = await test(
        `GET /api/chat/conversations/${AUS_ID} — sidebar conversations`,
        () => request('GET', `/api/chat/conversations/${AUS_ID}`)
    );

    // Lấy conv_id đầu tiên nếu không truyền
    let targetConvId = CONV_ID;
    if (!targetConvId && convRes?.body?.conversations?.length > 0) {
        targetConvId = convRes.body.conversations[0].conv_id;
        console.log(`  → Dùng conv_id=${targetConvId} cho các test tiếp theo`);
    }

    if (!targetConvId) {
        console.log('\n⚠  Không có conv_id — bỏ qua tests messages/members/typing/read');
        console.log('   Truyền conv_id làm arg thứ 2: node test-chat.js <aus_id> <conv_id>');
    } else {
        // ── 4. Messages ──────────────────────────────────────────────────────
        await test(
            `GET /api/chat/messages/${targetConvId}?limit=10 — lịch sử tin nhắn`,
            () => request('GET', `/api/chat/messages/${targetConvId}?limit=10`)
        );

        // ── 5. Members ───────────────────────────────────────────────────────
        await test(
            `GET /api/chat/members/${targetConvId} — thành viên conversation`,
            () => request('GET', `/api/chat/members/${targetConvId}`)
        );

        // ── 6. Typing indicator ──────────────────────────────────────────────
        await test(
            `POST /api/chat/typing/${targetConvId}/${AUS_ID} — typing event`,
            () => request('POST', `/api/chat/typing/${targetConvId}/${AUS_ID}`)
        );

        // ── 7. Read ──────────────────────────────────────────────────────────
        await test(
            `POST /api/chat/read/${targetConvId}/${AUS_ID} — đánh dấu đã đọc`,
            () => request('POST', `/api/chat/read/${targetConvId}/${AUS_ID}`)
        );

        // ── 8. Send message ──────────────────────────────────────────────────
        await test(
            `POST /api/chat/send — gửi tin nhắn test`,
            () => request('POST', '/api/chat/send', {
                conv_id:  targetConvId,
                aus_id:   AUS_ID,
                username: 'test-script',
                from_name: '[Test Script]',
                body:     `[test-chat.js] ping lúc ${new Date().toISOString()}`,
            })
        );
    }

    // ── 9. Doc conversations (nếu có tham số) ───────────────────────────────
    // Bỏ qua — cần doc_type + doc_no cụ thể, không guess

    // ── 10. Create DM (dry-run: kiểm tra idempotent với chính mình) ─────────
    if (targetConvId) {
        // Lấy partner từ conversation đầu tiên (nếu là DM)
        const firstConv = convRes?.body?.conversations?.find(c => c.conv_type === 'DM' && c.dm_partner_aus_id);
        if (firstConv) {
            const partnerId = firstConv.dm_partner_aus_id;
            await test(
                `POST /api/chat/create — DM với aus_id=${partnerId} (idempotent — phải trả status=exists)`,
                () => request('POST', '/api/chat/create', {
                    conv_type:      'DM',
                    aus_id:         AUS_ID,
                    username:       'test-script',
                    member_aus_ids: [partnerId],
                })
            );
        } else {
            console.log('\n[skip] Không tìm thấy DM partner để test /create idempotent');
        }
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    hr('═');
    console.log('SUMMARY');
    hr('═');
    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    results.forEach(r => {
        const icon = r.ok ? '✓' : '✗';
        const ms   = `${r.ms}ms`.padStart(6);
        const st   = String(r.status || 'ERR').padStart(3);
        console.log(`  ${icon} [${r.num}] ${st}  ${ms}  ${r.label}`);
    });
    hr();
    console.log(`  Passed: ${passed}/${results.length}    Failed: ${failed}`);
    hr('═');
}

run().catch(err => {
    console.error('[FATAL]', err);
    process.exit(1);
});
