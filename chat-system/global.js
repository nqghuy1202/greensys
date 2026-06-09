(function () {
    'use strict';
    if (window._eventsPoll) return;
    if (window.parent && window.parent !== window) return;

    var SSE_URL = 'https://chattest.erp100.vn/api/sse';

    // ── Notification badge ────────────────────────────────────────────────────

    function updateNotifBadge(count) {
        var $badge = $('#notif-badge');
        if (!$badge.length) return;
        if (count > 0) {
            $badge.text(count > 99 ? '99+' : count).show();
        } else {
            $badge.hide();
        }
    }

    function fetchNotifCount() {
        apex.server.process('notificationCount', { x01: $v('P0_AUS_ID') }, {
            dataType: 'json',
            success: function (data) {
                if (data) updateNotifBadge(data.count || 0);
            }
        });
    }

    function initNotifBell() {
        var $li = $('.user-notificaiton');
        if (!$li.length) return;

        $li.css('position', 'relative').append(
            '<span id="notif-badge" style="' +
            'display:none;position:absolute;left:20px;' +
            'background:var(--red-color,#D81F25);color:#fff;' +
            'border-radius:10px;font-size:10px;font-weight:700;' +
            'min-width:16px;height:16px;line-height:16px;' +
            'text-align:center;padding:0 3px;pointer-events:none;z-index:10;' +
            '"></span>'
        );
    }

    // ── Event handler ─────────────────────────────────────────────────────────

    function handleEvent(data) {
        if (data.type === 'notification') {
            fetchNotifCount();
        } else if (data.type === 'message' || data.type === 'typing' ||
            data.type === 'typing_stop' || data.type === 'read') {
            $(document).trigger('apex:chatEvent', [data]);
        }
    }

    // ── SSE client ────────────────────────────────────────────────────────────

    var _lastId     = 0;
    var _sseBackoff = 5000;
    var _sseTimer   = null;

    function mintToken(callback) {
        apex.server.process('sseToken', {}, {
            dataType: 'text',
            success: function (token) {
                token = (token || '').trim();
                if (token && token.indexOf('.') > 0) {
                    callback(token);
                } else {
                    console.warn('[SSE] sseToken invalid:', token);
                    scheduleReconnect();
                }
            },
            error: function () {
                console.warn('[SSE] sseToken error');
                scheduleReconnect();
            }
        });
    }

    function scheduleReconnect() {
        _sseTimer = setTimeout(connectSSE, _sseBackoff);
        _sseBackoff = Math.min(_sseBackoff * 2, 60000);
    }

    function connectSSE() {
        _sseTimer = null;
        mintToken(function (token) {
            var url = SSE_URL + '?token=' + encodeURIComponent(token) +
                '&lastEventId=' + _lastId;
            var es = new EventSource(url);

            es.onopen = function () {
                _sseBackoff = 5000;
                console.log('[SSE] connected');
            };

            es.onmessage = function (ev) {
                if (ev.lastEventId) _lastId = ev.lastEventId;
                try {
                    var data = JSON.parse(ev.data);
                    handleEvent(data);
                } catch (_) { }
            };

            // Server đẩy ra khi có conn mới hơn cùng user — re-mint token ngay
            es.addEventListener('replaced', function () {
                es.close();
                _sseTimer = setTimeout(connectSSE, 3000);
            });

            es.onerror = function () {
                // KHÔNG dựa vào auto-reconnect của EventSource — token cũ TTL 120s → kẹt 401
                es.close();
                scheduleReconnect();
            };
        });
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    $(document).ready(function () {
        var ausId = $v('P0_AUS_ID');
        if (!ausId) return;

        window._eventsPoll = true;

        initNotifBell();
        fetchNotifCount();
        connectSSE();

        apex.server.process('chatHeartbeat', {});
        setInterval(function () { apex.server.process('chatHeartbeat', {}); }, 20000);
    });
})();
