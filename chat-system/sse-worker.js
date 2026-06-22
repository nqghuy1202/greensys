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
var _connecting     = false;  // chặn 2 tab cùng init → 2 EventSource (orphan leak)

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
                if (!_es && !_reconnectTimer && !_connecting) connectSSE();
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

// Dừng toàn bộ hoạt động khi không còn tab nào sống — tránh giữ SSE conn,
// vòng mint token và reconnect chạy vô hạn (hao pin + giữ connection ở server).
// Tab mới connect sẽ gửi 'init' và khởi động lại.
function pauseSSE() {
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
    if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
    if (_es) { try { _es.close(); } catch (_) {} _es = null; }
    _connecting     = false;
    _tokenRequested = false;
}

// Chọn "leader" = port có ping gần đây nhất → tab chắc chắn còn sống nhất.
// Tránh luôn dùng ports[0]: nếu tab đó đã đóng, postMessage KHÔNG throw (no-op lặng lẽ)
// → heartbeat/mint mất tới ~50s (đến khi prune), user nhấp nháy offline.
function pickLeader() {
    var best = null, bestTs = -1;
    for (var i = 0; i < ports.length; i++) {
        var ts = portPings.get(ports[i]) || 0;
        if (ts > bestTs) { bestTs = ts; best = ports[i]; }
    }
    return best;
}

// Gỡ port khỏi CẢ ports[] và portPings (tránh rò entry Map).
function dropPort(p) {
    var i = ports.indexOf(p);
    if (i >= 0) ports.splice(i, 1);
    portPings.delete(p);
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
    if (ports.length === 0) { pauseSSE(); return; }
    var leader = pickLeader();
    try { leader.postMessage({ type: 'heartbeat_tick' }); }
    catch (_) { dropPort(leader); sendHeartbeat(); }
}

function startHeartbeatLoop() {
    if (_heartbeatTimer) return;
    // Fire heartbeat đầu NGAY do worker điều phối (chỉ ports[0]) — đảm bảo đúng 1
    // heartbeat lúc khởi động dù mở bao nhiêu tab (trước đây mỗi tab tự gửi 1 cái).
    sendHeartbeat();
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
    if (ports.length === 0) { pauseSSE(); return; }  // không loop vô hạn khi 0 tab
    var leader = pickLeader();
    try { leader.postMessage({ type: 'mint_token' }); }
    catch (_) { dropPort(leader); requestTokenFromTab(); }
}

function onTokenReceived(newToken) {
    if (!newToken || newToken.indexOf('.') < 0) {
        // GIỮ _tokenRequested = true để chặn getToken kích hoạt mint song song;
        // chỉ chính nhánh retry này được phép gọi lại requestTokenFromTab.
        broadcast({ type: 'sse_error', reason: 'token_invalid' });
        setTimeout(requestTokenFromTab, 3000);
        return;
    }
    _tokenRequested = false;
    // Parse expiry từ token body: base64url("<aus_id>|<exp_epoch_seconds>")
    try {
        var body = newToken.slice(0, newToken.lastIndexOf('.'));
        var b64  = body.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';   // pad base64url, tránh atob throw ở vài browser
        var decoded = atob(b64);
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
    _connecting = true;          // set đồng bộ NGAY — chặn init thứ 2 lọt guard trong lúc getToken async
    getToken(function (tok) {
        // Trong lúc chờ token, tất cả tab có thể đã đóng → đừng mở connection mồ côi
        prunePorts();
        if (ports.length === 0) { pauseSSE(); return; }

        var url = SSE_URL + '?token=' + encodeURIComponent(tok) + '&lastEventId=' + _lastId;
        _es = new EventSource(url);

        _es.onopen = function () {
            _connecting = false;
            _backoff = 5000;
        };

        _es.onmessage = function (ev) {
            if (ev.lastEventId) _lastId = Number(ev.lastEventId);
            try { broadcast(JSON.parse(ev.data)); }
            catch (err) { console.warn('[SSE worker] bad event payload:', err, ev.data); }
        };

        _es.addEventListener('replaced', function () {
            // Hiếm với SharedWorker; guard phòng edge case server restart.
            // Đi qua scheduleReconnect() để có guard 0-port + backoff (không reconnect khi 0 tab).
            _connecting = false;
            _es.close(); _es = null;
            scheduleReconnect();
        });

        _es.onerror = function () {
            _connecting = false;
            _es.close(); _es = null;
            _token = null; // buộc mint token mới khi reconnect
            broadcast({ type: 'sse_error', reason: 'connection_error', sseUrl: SSE_URL, backoffMs: _backoff });
            scheduleReconnect();
        };
    });
}

function scheduleReconnect() {
    prunePorts();
    if (ports.length === 0) { pauseSSE(); return; }  // không reconnect khi không còn tab
    _reconnectTimer = setTimeout(connectSSE, _backoff);
    _backoff = Math.min(_backoff * 2, 60000);
}
