'use strict';

const POLL_TIMEOUT = 25_000;
const BUFFER_MAX   = 100;       // tối đa event xếp hàng / user
const BUFFER_TTL   = 60_000;    // event quá 60s coi như cũ → bỏ

// Chỉ buffer event "durable" (cần nhận đủ). typing/typing_stop tự hết hạn ở client → không buffer.
const BUFFERABLE = new Set(['message', 'read', 'notification']);

// Unified event waiters: aus_id(string) → { res, timeout }
// One active long-poll per user; new connection replaces the old one.
const eventWaiters = new Map();

// Event đến khi KHÔNG có waiter (khoảng giữa resolve→re-poll, hoặc đang reconnect):
// aus_id(string) → [{ payload, expiresAt }]. Poll kế tiếp rút từ đây → at-least-once.
// Vá tính lossy của kênh cho chat (notification vẫn tự lành qua DB re-query).
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
    let q = eventBuffer.get(key) || [];
    // Gộp notification liên tiếp: chuông tự query lại DB nên 1 cái là đủ.
    if (payload.type === 'notification' &&
        q.length && q[q.length - 1].payload.type === 'notification') {
        return;
    }
    q.push({ payload, expiresAt: Date.now() + BUFFER_TTL });
    if (q.length > BUFFER_MAX) q = q.slice(q.length - BUFFER_MAX);  // giữ mới nhất
    eventBuffer.set(key, q);
}

function addWaiter(ausId, req, res) {
    const key = String(ausId);

    // Có event đang xếp hàng → trả ngay 1 cái, không đỗ waiter.
    // global.js poll lại tức thì sau mỗi resolve nên hàng đợi được rút nhanh, từng cái một
    // (giữ nguyên contract 1 payload/response — không phải đổi global.js).
    const q = pruneBuffer(key);
    if (q && q.length) {
        const next = q.shift();
        if (q.length) eventBuffer.set(key, q); else eventBuffer.delete(key);
        res.json(next.payload);
        return;
    }

    const old = eventWaiters.get(key);
    if (old) {
        clearTimeout(old.timeout);
        old.res.json({ type: 'replaced' });
    }

    const timeout = setTimeout(() => {
        eventWaiters.delete(key);
        res.json({ type: 'timeout' });
    }, POLL_TIMEOUT);

    eventWaiters.set(key, { res, timeout });

    req.on('close', () => {
        const w = eventWaiters.get(key);
        if (w && w.res === res) {
            clearTimeout(w.timeout);
            eventWaiters.delete(key);
        }
    });
}

function deliverToUser(ausId, payload) {
    const key = String(ausId);
    const w = eventWaiters.get(key);
    if (!w) {
        // Không có poll đang đỗ → xếp hàng thay vì bỏ (fix lossy). typing/* thì bỏ qua.
        if (BUFFERABLE.has(payload.type)) bufferEvent(key, payload);
        return;
    }
    clearTimeout(w.timeout);
    w.res.json(payload);
    eventWaiters.delete(key);
}

// Called by CQN when a new notification row is inserted/deleted
function notifyUser(ausId) {
    deliverToUser(String(ausId), { type: 'notification' });
    console.log('[Events] notification → aus_id=%s', ausId);
}

// Drain all pending waiters on graceful shutdown
function drainAll() {
    for (const [, w] of eventWaiters) {
        clearTimeout(w.timeout);
        w.res.json({ type: 'timeout' });
    }
    eventWaiters.clear();
}

module.exports = { addWaiter, deliverToUser, notifyUser, drainAll };
