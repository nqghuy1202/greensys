'use strict';

// SharedWorker — chạy 1 instance duy nhất cho tất cả tab cùng origin.
// Trách nhiệm:
//   - Giữ 1 SSE connection duy nhất
//   - Cache token, chỉ yêu cầu mint lại khi gần hết TTL
//   - Broadcast SSE event đến tất cả tab
//   - Điều phối chatHeartbeat — chỉ 1 tab gửi mỗi 20s

var SSE_URL          = '';
var TOKEN_BUFFER_S   = 30;    // mint token mới khi còn < 30s
var HEARTBEAT_MS     = 20000;
var PING_INTERVAL_MS = 25000; // tab ping worker để xác nhận còn sống

var ports      = [];          // MessagePort của từng tab
var portPings  = new Map();   // port → timestamp ping cuối cùng

var _token          = null;
var _tokenExpiry    = 0;
var _tokenCallbacks = [];
var _tokenRequested = false;

var _es             = null;
var _lastId         = 0;
var _backoff        = 5000;
var _reconnectTimer = null;
var _heartbeatTimer = null;

// ── Port management ───────────────────────────────────────────────────────────

self.onconnect = function (e) {
    var port = e.ports[0];
    ports.push(port);
    portPings.set(port, Date.now());

    port.onmessage = function (ev) {
        var msg = ev.data;
        switch (msg.type) {
            case 'init':
                SSE_URL = msg.sseUrl;
                if (!_es && !_reconnectTimer) connectSSE();
                break;
            case 'token_response':
                onTokenReceived(msg.token);
                break;
            case 'ping':
                portPings.set(port, Date.now());
                break;
        }
    };

    port.start();

    // Nếu đây là tab đầu tiên, khởi động heartbeat loop
    if (ports.length === 1) startHeartbeatLoop();
};

// Xóa port chết (không ping > 2 × PING_INTERVAL_MS)
function prunePorts() {
    var cutoff = Date.now() - PING_INTERVAL_MS * 2;
    ports = ports.filter(function (p) {
        if ((portPings.get(p) || 0) < cutoff) {
            portPings.delete(p);
            return false;
        }
        return true;
    });
}

function broadcast(data) {
    var alive = [];
    for (var i = 0; i < ports.length; i++) {
        try { ports[i].postMessage(data); alive.push(ports[i]); }
        catch (_) { portPings.delete(ports[i]); }
    }
    ports = alive;
}

// ── Heartbeat coordination ────────────────────────────────────────────────────
// Worker chỉ ra lệnh cho ports[0] gửi chatHeartbeat — tránh N tab × 20s request.

function sendHeartbeat() {
    prunePorts();
    if (ports.length === 0) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; return; }
    try { ports[0].postMessage({ type: 'heartbeat_tick' }); }
    catch (_) { ports.shift(); sendHeartbeat(); }
}

function startHeartbeatLoop() {
    if (_heartbeatTimer) return;
    // Không fire ngay — tab tự gửi heartbeat đầu tiên khi initWorker()
    _heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_MS);
}

// ── Token management ──────────────────────────────────────────────────────────

function getToken(callback) {
    var now = Date.now() / 1000;
    if (_token && (_tokenExpiry - now) > TOKEN_BUFFER_S) {
        callback(_token);
        return;
    }
    _tokenCallbacks.push(callback);
    if (!_tokenRequested) {
        _tokenRequested = true;
        requestTokenFromTab();
    }
}

function requestTokenFromTab() {
    prunePorts();
    if (ports.length === 0) { setTimeout(requestTokenFromTab, 1000); return; }
    try { ports[0].postMessage({ type: 'mint_token' }); }
    catch (_) { ports.shift(); requestTokenFromTab(); }
}

function onTokenReceived(newToken) {
    _tokenRequested = false;
    if (!newToken || newToken.indexOf('.') < 0) {
        setTimeout(requestTokenFromTab, 3000);
        return;
    }
    // Parse expiry từ token body: base64url("<aus_id>|<exp_epoch_seconds>")
    try {
        var body    = newToken.slice(0, newToken.lastIndexOf('.'));
        var decoded = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
        _tokenExpiry = Number(decoded.split('|')[1]) || 0;
    } catch (_) {
        _tokenExpiry = Date.now() / 1000 + 120; // fallback 120s
    }
    _token = newToken;

    var cbs = _tokenCallbacks.splice(0);
    cbs.forEach(function (cb) { cb(_token); });
}

// ── SSE connection ────────────────────────────────────────────────────────────

function connectSSE() {
    _reconnectTimer = null;
    getToken(function (tok) {
        var url = SSE_URL + '?token=' + encodeURIComponent(tok) + '&lastEventId=' + _lastId;
        _es = new EventSource(url);

        _es.onopen = function () {
            _backoff = 5000;
        };

        _es.onmessage = function (ev) {
            if (ev.lastEventId) _lastId = Number(ev.lastEventId);
            try { broadcast(JSON.parse(ev.data)); } catch (_) {}
        };

        _es.addEventListener('replaced', function () {
            // Không xảy ra với SharedWorker (worker không bị replaced)
            // Guard phòng edge case server restart
            _es.close(); _es = null;
            _reconnectTimer = setTimeout(connectSSE, 3000);
        });

        _es.onerror = function () {
            _es.close(); _es = null;
            _token = null; // buộc mint token mới khi reconnect
            scheduleReconnect();
        };
    });
}

function scheduleReconnect() {
    _reconnectTimer = setTimeout(connectSSE, _backoff);
    _backoff = Math.min(_backoff * 2, 60000);
}
