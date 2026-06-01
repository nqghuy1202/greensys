'use strict';

const POLL_TIMEOUT = 25_000;

// Unified event waiters: aus_id(string) → { res, timeout }
// One active long-poll per user; new connection replaces the old one.
const eventWaiters = new Map();

function addWaiter(ausId, req, res) {
    const key = String(ausId);

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
    if (!w) return;
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
