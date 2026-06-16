'use strict';

/**
 * Test tool cho /api/sse endpoint.
 *
 * Dùng:
 *   node test-sse.js <aus_id> [host]
 *
 * Ví dụ (nội bộ Server B):
 *   node test-sse.js 123
 *   node test-sse.js 123 https://chattest.erp100.vn
 *
 * Script tự mint token hợp lệ từ secret trong .env (hoặc SSE_SECRET env var),
 * mở kết nối SSE và in mọi event nhận được.
 */

require('dotenv').config();
const http  = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

// ── Config ────────────────────────────────────────────────────────────────────

const AUS_ID = Number(process.argv[2]);
const HOST   = process.argv[3] || `http://localhost:${process.env.PORT || 3410}`;
const SECRET = process.env.G_SSE_SECRET || process.env.SSE_SECRET || '';

if (!AUS_ID || isNaN(AUS_ID)) {
    console.error('Usage: node test-sse.js <aus_id> [host]');
    console.error('  aus_id: số nguyên (aus_id của user cần test)');
    process.exit(1);
}

if (!SECRET) {
    console.error('[ERROR] Secret không tìm thấy — set G_SSE_SECRET hoặc SSE_SECRET trong .env');
    process.exit(1);
}

// ── Mint token ────────────────────────────────────────────────────────────────

function mintToken(ausId, ttlSeconds = 300) {
    const exp  = Math.floor(Date.now() / 1000) + ttlSeconds;
    const body = Buffer.from(`${ausId}|${exp}`).toString('base64url');
    const sig  = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    return `${body}.${sig}`;
}

// ── Connect SSE ───────────────────────────────────────────────────────────────

const token   = mintToken(AUS_ID);
const sseUrl  = new URL(`/api/sse?token=${encodeURIComponent(token)}`, HOST);
const lib     = sseUrl.protocol === 'https:' ? https : http;

console.log('─'.repeat(60));
console.log('[TEST] SSE Diagnostic Tool');
console.log(`[TEST] aus_id  : ${AUS_ID}`);
console.log(`[TEST] endpoint: ${sseUrl.origin}/api/sse`);
console.log(`[TEST] token   : ${token.slice(0, 20)}...`);
console.log('─'.repeat(60));

let eventCount  = 0;
let pingCount   = 0;
let connectedAt = null;
let lastEventId = null;

const req = lib.get(sseUrl.toString(), {
    headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
    }
}, (res) => {
    const { statusCode, headers } = res;
    console.log(`[CONNECT] HTTP ${statusCode} — Content-Type: ${headers['content-type']}`);

    if (statusCode !== 200) {
        console.error(`[ERROR] Unexpected status ${statusCode}`);
        res.resume();
        return;
    }

    if (!(headers['content-type'] || '').includes('text/event-stream')) {
        console.error('[ERROR] Content-Type không phải text/event-stream');
        console.error('  Headers:', headers);
        res.resume();
        return;
    }

    connectedAt = Date.now();
    console.log('[OK] Kết nối SSE thành công. Đang chờ events...');
    console.log('     (Ctrl+C để dừng)\n');

    let buf = '';
    let currentId = null;
    let currentData = null;

    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        buf += chunk;
        const lines = buf.split('\n');
        buf = lines.pop(); // giữ lại dòng chưa kết thúc

        for (const line of lines) {
            if (line.startsWith(': ')) {
                // Comment/ping
                const comment = line.slice(2).trim();
                if (comment === 'ping') {
                    pingCount++;
                    process.stdout.write(`\r[PING] #${pingCount} — uptime: ${((Date.now() - connectedAt) / 1000).toFixed(0)}s   `);
                } else {
                    console.log(`\n[COMMENT] ${comment}`);
                }
            } else if (line.startsWith('id: ')) {
                currentId = line.slice(4).trim();
                lastEventId = currentId;
            } else if (line.startsWith('data: ')) {
                currentData = line.slice(6).trim();
            } else if (line === '') {
                // Kết thúc 1 event
                if (currentData !== null) {
                    eventCount++;
                    let parsed = currentData;
                    try { parsed = JSON.parse(currentData); } catch (_) {}

                    const ts = new Date().toISOString().slice(11, 23);
                    console.log(`\n[EVENT #${eventCount}] ${ts}  id=${currentId ?? '?'}`);
                    if (typeof parsed === 'object') {
                        console.log('  type:', parsed.type);
                        console.log('  data:', JSON.stringify(parsed, null, 2).split('\n').map((l, i) => i ? '        ' + l : l).join('\n'));
                    } else {
                        console.log('  raw:', currentData);
                    }
                }
                currentId   = null;
                currentData = null;
            }
        }
    });

    res.on('end', () => {
        console.log('\n[CLOSE] SSE stream đã đóng từ server');
        printSummary();
        process.exit(0);
    });
});

req.on('error', (err) => {
    console.error('\n[ERROR] Không kết nối được:', err.message);
    if (err.code === 'ECONNREFUSED') {
        console.error('  → Server chưa chạy hoặc sai port/host');
    }
    process.exit(1);
});

req.setTimeout(0); // không timeout — SSE là long-lived

// ── Timeout tự động 60s nếu không có event ───────────────────────────────────

const idleTimeout = setTimeout(() => {
    console.log('\n\n[TIMEOUT] 60s không có event — tự dừng');
    console.log('  → Có thể: user không có notification/chat event đang chờ');
    printSummary();
    req.destroy();
    process.exit(0);
}, 60_000);
idleTimeout.unref();

// ── Cleanup khi Ctrl+C ────────────────────────────────────────────────────────

process.on('SIGINT', () => {
    console.log('\n[STOP] Người dùng dừng');
    printSummary();
    req.destroy();
    process.exit(0);
});

function printSummary() {
    const uptime = connectedAt ? ((Date.now() - connectedAt) / 1000).toFixed(1) : '0';
    console.log('\n' + '─'.repeat(60));
    console.log('[SUMMARY]');
    console.log(`  Uptime       : ${uptime}s`);
    console.log(`  Events nhận  : ${eventCount}`);
    console.log(`  Pings nhận   : ${pingCount}`);
    console.log(`  Last event id: ${lastEventId ?? 'none'}`);
    console.log('─'.repeat(60));
}
