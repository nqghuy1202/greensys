(function () {
    'use strict';
    if (window._eventsPoll) return;
    if (window.parent && window.parent !== window) return;

    // ── SharedWorker ──────────────────────────────────────────────────────────

    var _port = null;

    function initWorker(sseUrl) {
        var workerUrl = (window.APP_FILES || '') + 'sse-worker.js';
        try {
            var worker = new SharedWorker(workerUrl);
            _port = worker.port;
        } catch (e) {
            console.error('[SSE] SharedWorker not supported:', e);
            return;
        }

        _port.onmessage = function (ev) {
            var msg = ev.data;
            if (msg.type === 'mint_token') {
                // Worker yêu cầu tab này mint token (tab này đang là leader)
                apex.server.process('sseToken', { x01: $v('P0_AUS_ID') }, {
                    dataType: 'text',
                    success: function (token) {
                        _port.postMessage({ type: 'token_response', token: (token || '').trim() });
                    },
                    error: function () {
                        _port.postMessage({ type: 'token_response', token: '' });
                    }
                });
            } else if (msg.type === 'heartbeat_tick') {
                // Worker chọn tab này gửi heartbeat chu kỳ này
                apex.server.process('chatHeartbeat', {});
            } else if (msg.type === 'sse_error') {
                console.error('[SSE] connection error:', msg.reason, msg);
            } else {
                handleEvent(msg);
            }
        };

        _port.start();
        _port.postMessage({ type: 'init', sseUrl: sseUrl });

        // Heartbeat đầu tiên ngay lập tức, các lần sau do worker điều phối
        apex.server.process('chatHeartbeat', {});

        // Ping worker định kỳ để worker biết tab này còn sống
        setInterval(function () { _port.postMessage({ type: 'ping' }); }, 25000);
    }

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
                if (data && data.state === 'success') updateNotifBadge(data.count || 0);
                else if (data) console.error('[notif]', data.message);
            },
            error: function () {
                console.warn('[notif] notificationCount AJAX error');
            }
        });
    }

    function fetchSseUrl(callback) {
        globalHandleAjaxProcess(['getUrlNodeJs', {}, 'json']).then(function (urlObj) {
            if (urlObj && urlObj.state === 'success' && urlObj.url) {
                callback(urlObj.url);
            } else {
                console.error('[SSE] getUrlNodeJs failed:', urlObj && urlObj.message);
                callback(null);
            }
        }).catch(function (err) {
            console.error('[SSE] getUrlNodeJs request error:', err);
            callback(null);
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
            $(document).trigger('apex:notifEvent', [data]);
        } else if (data.type === 'message' || data.type === 'typing' ||
            data.type === 'typing_stop' || data.type === 'read') {
            $(document).trigger('apex:chatEvent', [data]);
        }
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    $(document).ready(function () {
        var ausId = $v('P0_AUS_ID');
        if (!ausId) return; // chưa đăng nhập (vd. trang login) — không gọi bất kỳ AJAX nào

        window._eventsPoll = true;

        initNotifBell();
        fetchNotifCount();

        fetchSseUrl(function (sseUrl) {
            if (!sseUrl) return; // không lấy được URL → bỏ qua real-time, badge vẫn hoạt động qua fetchNotifCount
            initWorker(sseUrl);
        });
    });
})();
