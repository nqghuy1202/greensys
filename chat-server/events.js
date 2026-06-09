'use strict';

const BUFFER_MAX = 100;
const BUFFER_TTL = 60_000;

// Event types được buffer để replay khi SSE reconnect
const BUFFERABLE = new Set(['message', 'read', 'notification']);

// aus_id(string) → res  (1 SSE conn/user; conn mới đẩy conn cũ ra)
const sseConnections = new Map();

// seq tăng dần — gắn vào mỗi SSE event để client dùng Last-Event-ID replay
let sseSeq = 0;

// aus_id(string) → [{ seq, payload, expiresAt }]
const eventBuffer = new Map();

function pruneBuffer(key) {
    const q = eventBuffer.get(key);
    if (!q) return null;
    const now   = Date.now();
    const fresh = q.filter(e => e.expiresAt > now);
    if (fresh.length) { eventBuffer.set(key, fresh); return fresh; }
    eventBuffer.delete(key);
    return null;
}

function bufferEvent(key, payload) {
    const seq = ++sseSeq;
    let q = eventBuffer.get(key) || [];
    // Gộp notification liên tiếp — chuông tự query lại DB nên 1 cái là đủ
    if (payload.type === 'notification' &&
        q.length && q[q.length - 1].payload.type === 'notification') {
        return seq;
    }
    q.push({ seq, payload, expiresAt: Date.now() + BUFFER_TTL });
    if (q.length > BUFFER_MAX) q = q.slice(q.length - BUFFER_MAX);
    eventBuffer.set(key, q);
    return seq;
}

function sseWrite(res, seq, payload) {
    try {
        res.write(`id: ${seq}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch (_) { /* conn đã đóng */ }
}

function registerSSE(ausId, res, lastEventId) {
    const key = String(ausId);

    // Đẩy conn cũ ra
    const old = sseConnections.get(key);
    if (old) {
        try { old.write('event: replaced\ndata: {}\n\n'); old.end(); } catch (_) {}
    }
    sseConnections.set(key, res);

    // Flush buffer từ lastEventId trở đi (replay sau reconnect)
    const since = Number(lastEventId) || 0;
    const q = pruneBuffer(key);
    if (q) {
        q.filter(e => e.seq > since).forEach(e => sseWrite(res, e.seq, e.payload));
    }

    res.on('close', () => {
        if (sseConnections.get(key) === res) sseConnections.delete(key);
    });
}

function deliverToUser(ausId, payload) {
    const key    = String(ausId);
    const sseRes = sseConnections.get(key);

    if (sseRes) {
        const seq = ++sseSeq;
        sseWrite(sseRes, seq, payload);
        // Buffer để replay khi reconnect
        if (BUFFERABLE.has(payload.type)) {
            let q = eventBuffer.get(key) || [];
            q.push({ seq, payload, expiresAt: Date.now() + BUFFER_TTL });
            if (q.length > BUFFER_MAX) q = q.slice(q.length - BUFFER_MAX);
            eventBuffer.set(key, q);
        }
        return;
    }

    // Không có SSE conn đang mở — buffer để replay khi client reconnect
    if (BUFFERABLE.has(payload.type)) bufferEvent(key, payload);
}

function notifyUser(ausId) {
    deliverToUser(String(ausId), { type: 'notification' });
    console.log('[Events] notification → aus_id=%s', ausId);
}

function drainAll() {
    for (const [, res] of sseConnections) {
        try { res.write('event: close\ndata: {}\n\n'); res.end(); } catch (_) {}
    }
    sseConnections.clear();
}

module.exports = { deliverToUser, notifyUser, drainAll, registerSSE };
