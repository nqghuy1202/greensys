'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express    = require('express');
const http       = require('http');
const cors       = require('cors');
const oracledb   = require('oracledb');
const { WebSocketServer } = require('ws');
const { startCQN }   = require('./cqn');
const { router: chatRouter } = require('./chat');

oracledb.initOracleClient();

const app    = express();
const server = http.createServer(app);

// WebSocket clients cho notification bell: aus_id → Set<ws>
const wsClients = new Map();

const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
    const ausId = new URL(req.url, 'http://localhost').searchParams.get('aus_id');
    if (!ausId) { ws.close(); return; }

    if (!wsClients.has(ausId)) wsClients.set(ausId, new Set());
    wsClients.get(ausId).add(ws);
    console.log('[WS] Connected aus_id=%s (clients=%d)', ausId, wsClients.get(ausId).size);

    ws.on('close', () => {
        const set = wsClients.get(ausId);
        if (set) {
            set.delete(ws);
            if (!set.size) wsClients.delete(ausId);
        }
        console.log('[WS] Disconnected aus_id=%s', ausId);
    });
});

app.use(cors());
app.use(express.json());

// Escape tất cả non-ASCII thành \uXXXX để JSON survive qua Oracle UTL_HTTP charset conversion.
// Oracle đọc UTF-8 bytes theo DB charset (WE8MSWIN1252) → multi-byte sequences bị vỡ.
// \uXXXX là ASCII thuần, không bị ảnh hưởng bởi charset conversion nào.
app.use((req, res, next) => {
    res.json = function (data) {
        const str = JSON.stringify(data);
        let body = '';
        for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            body += code > 127 ? '\\u' + code.toString(16).padStart(4, '0') : str[i];
        }
        this.set('Content-Type', 'application/json');
        return this.send(body);
    };
    next();
});

// Danh sách APEX client đang long-poll, key = aus_id
const waiters = {};

function notifyWaiters(ausId) {
    // Long-poll (giữ nguyên cho chat module)
    const list = waiters[ausId] || [];
    list.forEach(({ res, timeout }) => {
        clearTimeout(timeout);
        res.json({ status: 'new_notification' });
    });
    waiters[ausId] = [];

    // WebSocket push
    const wsSet = wsClients.get(String(ausId));
    if (wsSet) {
        const msg = JSON.stringify({ status: 'new_notification' });
        for (const ws of wsSet) {
            if (ws.readyState === ws.OPEN) ws.send(msg);
        }
    }

    const wsCount = wsSet ? wsSet.size : 0;
    if (list.length || wsCount) {
        console.log('[Notify] aus_id=%s — long-poll=%d ws=%d', ausId, list.length, wsCount);
    }
}

async function initDB() {
    await oracledb.createPool({
        user:          process.env.DB_USER,
        password:      process.env.DB_PASSWORD,
        connectString: process.env.DB_CONNECTION_STRING,
        poolMin:       Number(process.env.DB_POOL_MIN)       || 2,
        poolMax:       Number(process.env.DB_POOL_MAX)       || 10,
        poolIncrement: Number(process.env.DB_POOL_INCREMENT) || 1,
    });
    console.log('[DB] Connection pool created');
}

// ──────────────────────────────────────────────
// Endpoints
// ──────────────────────────────────────────────

app.use('/api/chat', chatRouter);

app.get('/health', (req, res) => {
    res.json({ status: 'OK', time: new Date().toISOString() });
});

app.get('/api/notify/:aus_id', (req, res) => {
    notifyWaiters(req.params.aus_id);
    res.json({ status: 'ok' });
});

// APEX long-poll: GET /api/wait/:aus_id
// Trả về ngay khi có notification mới, hoặc timeout sau 25s
app.get('/api/wait/:aus_id', (req, res) => {
    const ausId = req.params.aus_id;
    if (!waiters[ausId]) waiters[ausId] = [];

    const timeout = setTimeout(() => {
        waiters[ausId] = waiters[ausId].filter(w => w.res !== res);
        res.json({ status: 'timeout' });
    }, 25_000);

    waiters[ausId].push({ res, timeout });
});

// ──────────────────────────────────────────────
// Startup
// ──────────────────────────────────────────────
initDB()
    .then(() => startCQN(notifyWaiters))
    .then(() => {
        const port = Number(process.env.PORT) || 3410;
        server.listen(port, '0.0.0.0', () => {
            console.log('[Server] Listening on 0.0.0.0:%d', port);
        });
    })
    .catch(err => {
        console.error('[Startup] Fatal:', err.message);
        process.exit(1);
    });
