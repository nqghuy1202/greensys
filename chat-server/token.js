'use strict';

const crypto = require('crypto');

const SECRET = process.env.G_SSE_SECRET || process.env.SSE_SECRET || '';

// token = base64url("<aus_id>|<exp_epoch_seconds>") + "." + base64url(HMAC_SHA256(body, SECRET))
function verifyToken(token) {
    if (!token || !SECRET) return null;

    const dot = token.lastIndexOf('.');
    if (dot < 1) return null;

    const body = token.slice(0, dot);
    const sig  = token.slice(dot + 1);

    const expected = crypto
        .createHmac('sha256', SECRET)
        .update(body)
        .digest('base64url');

    // timing-safe compare
    let safeLen = Math.max(sig.length, expected.length);
    const a = Buffer.alloc(safeLen).fill(0);
    const b = Buffer.alloc(safeLen).fill(0);
    Buffer.from(sig).copy(a);
    Buffer.from(expected).copy(b);
    if (!crypto.timingSafeEqual(a, b)) return null;

    let decoded;
    try { decoded = Buffer.from(body, 'base64url').toString(); }
    catch { return null; }

    const [ausIdStr, expStr] = decoded.split('|');
    if (!ausIdStr || !expStr) return null;

    const exp   = Number(expStr);
    const ausId = Number(ausIdStr);
    if (!Number.isFinite(exp) || !Number.isFinite(ausId)) return null;
    if (Date.now() / 1000 > exp) return null;

    return { ausId };
}

module.exports = { verifyToken };
