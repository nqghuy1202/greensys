'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express  = require('express');
const http     = require('http');
const cors     = require('cors');
const oracledb = require('oracledb');
const { startCQN }                        = require('./cqn');
const { router: chatRouter }              = require('./chat');
const { notifyUser, drainAll, registerSSE } = require('./events');
const { verifyToken } = require('./token');

oracledb.initOracleClient();

const app    = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Escape non-ASCII → \uXXXX so JSON survives Oracle UTL_HTTP charset conversion.
// Oracle reads UTF-8 bytes as WE8MSWIN1252 → multi-byte sequences break.
// \uXXXX is pure ASCII and is unaffected by any charset conversion.
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

// Manual trigger for testing/debugging
app.get('/api/notify/:aus_id', (req, res) => {
    notifyUser(req.params.aus_id);
    res.json({ status: 'ok' });
});

// SSE endpoint — browser kết nối trực tiếp qua nginx (không qua ORDS)
const SSE_ORIGIN = process.env.SSE_ORIGIN || 'https://erp.greensys.vn:8211';
const SSE_PING_MS = 25_000;
const sseIntervals = new Set();

app.get('/api/sse', (req, res) => {
    const origin = req.headers.origin || '';
    if (origin && origin !== SSE_ORIGIN) {
        return res.status(403).end();
    }

    const token = req.query.token;
    const parsed = verifyToken(token);
    if (!parsed) return res.status(401).json({ error: 'invalid_token' });

    const { ausId } = parsed;

    res.set({
        'Content-Type':                'text/event-stream',
        'Cache-Control':               'no-cache',
        'Connection':                  'keep-alive',
        'X-Accel-Buffering':           'no',
        'Access-Control-Allow-Origin': SSE_ORIGIN,
    });
    res.flushHeaders();

    registerSSE(ausId, res, req.query.lastEventId || req.headers['last-event-id']);

    // Heartbeat chống proxy idle-timeout
    const ping = setInterval(() => {
        try { res.write(': ping\n\n'); }
        catch (_) { clearInterval(ping); sseIntervals.delete(ping); }
    }, SSE_PING_MS);
    sseIntervals.add(ping);

    req.on('close', () => {
        clearInterval(ping);
        sseIntervals.delete(ping);
    });

    console.log('[SSE] connect aus_id=%s', ausId);
});


// ──────────────────────────────────────────────
// Graceful shutdown (pm2 restart / SIGTERM)
// ──────────────────────────────────────────────
function shutdown(signal) {
    console.log('[Server] %s received — shutting down gracefully', signal);
    sseIntervals.forEach(t => clearInterval(t));
    sseIntervals.clear();
    drainAll();
    server.close(() => {
        oracledb.getPool().close(10)
            .then(() => { console.log('[Server] Pool closed'); process.exit(0); })
            .catch(() => process.exit(1));
    });
    setTimeout(() => process.exit(1), 15_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ──────────────────────────────────────────────
// Startup
// ──────────────────────────────────────────────
initDB()
    .then(() => startCQN(notifyUser))
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
