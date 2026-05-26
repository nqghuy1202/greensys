'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express  = require('express');
const http     = require('http');
const cors     = require('cors');
const oracledb = require('oracledb');
const { startCQN }        = require('./cqn');
const { router: chatRouter } = require('./chat');

oracledb.initOracleClient();

const app    = express();
const server = http.createServer(app);

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

// Danh sách APEX client đang long-poll: aus_id(string) → [{ res, timeout }]
const waiters = new Map();

function notifyWaiters(ausId) {
    const key  = String(ausId);
    const list = waiters.get(key) || [];
    list.forEach(({ res, timeout }) => {
        clearTimeout(timeout);
        res.json({ status: 'new_notification' });
    });
    waiters.set(key, []);
    if (list.length) {
        console.log('[Notify] aus_id=%s — long-poll=%d', key, list.length);
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
    const key = String(req.params.aus_id);
    if (!waiters.has(key)) waiters.set(key, []);

    const timeout = setTimeout(() => {
        const list = waiters.get(key) || [];
        waiters.set(key, list.filter(w => w.res !== res));
        res.json({ status: 'timeout' });
    }, 25_000);

    waiters.get(key).push({ res, timeout });

    req.on('close', () => {
        const list = waiters.get(key) || [];
        waiters.set(key, list.filter(w => w.res !== res));
        clearTimeout(timeout);
    });
});

// ──────────────────────────────────────────────
// Graceful shutdown (pm2 restart / SIGTERM)
// ──────────────────────────────────────────────
function shutdown(signal) {
    console.log('[Server] %s received — shutting down gracefully', signal);
    // Drain all pending long-poll waiters immediately
    for (const [, list] of waiters) {
        for (const { res, timeout } of list) {
            clearTimeout(timeout);
            res.json({ status: 'timeout' });
        }
    }
    waiters.clear();

    server.close(() => {
        oracledb.getPool().close(10)
            .then(() => { console.log('[Server] Pool closed'); process.exit(0); })
            .catch(() => process.exit(1));
    });
    // Force-exit if server.close() hangs beyond 15s
    setTimeout(() => process.exit(1), 15_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

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
