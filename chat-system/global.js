(function () {
    'use strict';
    if (window._eventsPoll) return;
    if (window.parent && window.parent !== window) return;

    // ── Helpers: login + worker URL (tự dò, KHÔNG cần set ở Page 0) ────────────

    // Đăng nhập? Ưu tiên window.IS_AUTHENTICATED (set Page 0 FGVD bằng '&APP_USER.').
    // Fallback: phần tử nav chuông '.user-notificaiton' chỉ render khi đã login.
    function isAuthenticated() {
        if (typeof window.IS_AUTHENTICATED === 'boolean') return window.IS_AUTHENTICATED;
        return document.querySelector('.user-notificaiton') != null;
    }

    // URL tuyệt đối của sse-worker.js. KHÔNG dùng #APP_FILES# trực tiếp — nó là path
    // tương đối (vd 'r/dev/.../files/...'), new SharedWorker() resolve so với URL trang
    // (đang ở sâu trong /ords/r/dev/...) → nhân đôi path → 404 → worker fail âm thầm.
    //
    // Cách chắc chắn: global.js ĐÃ load thành công, nên thẻ <script> của nó mang URL
    // đã được APEX resolve đúng. Lấy URL đó, thay tên file → cùng thư mục, đúng 100%.
    // global.js nằm trong subfolder 'js/' của theme; sse-worker.js nằm ở GỐC theme
    // (#THEME_DB_FILES#sse-worker.js). Phải lùi ra khỏi 'js/' rồi mới ghép worker.
    // (\.min)? giữ chỗ cho #MIN# khi production minify (global.min.js → sse-worker.min.js).
    function workerScriptUrl() {
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            var src = scripts[i].src || '';
            // global.js trong js/ → worker ở thư mục cha:
            var m = src.match(/^(.*\/)js\/global(\.min)?\.js(\?.*)?$/);
            if (m) return m[1] + 'sse-worker' + (m[2] || '') + '.js';
            // global.js cùng cấp worker (phòng layout khác):
            m = src.match(/^(.*\/)global(\.min)?\.js(\?.*)?$/);
            if (m) return m[1] + 'sse-worker' + (m[2] || '') + '.js';
        }
        // Fallback hiếm gặp (không tìm thấy thẻ <script> global.js — vd bị inline):
        try { return new URL('sse-worker.js', window.location.href).href; }
        catch (e) { return 'sse-worker.js'; }
    }

    // ── SharedWorker ──────────────────────────────────────────────────────────

    var _port = null;
    var _pingTimer = null;
    var _notifDebounce = null;

    function initWorker(sseUrl) {
        var workerUrl = workerScriptUrl();
        console.log('[SSE] worker url =', workerUrl, '| sseUrl =', sseUrl);

        var worker;
        try {
            worker = new SharedWorker(workerUrl);
            _port = worker.port;
        } catch (e) {
            console.error('[SSE] Tạo SharedWorker thất bại (kiểm tra workerUrl 404?):', e);
            return;
        }
        // SharedWorker với script 404/lỗi KHÔNG throw ở new — bắt qua onerror.
        worker.onerror = function (e) {
            console.error('[SSE] Worker load lỗi (URL 404 hoặc script lỗi):', workerUrl, e.message || e);
        };

        _port.onmessage = function (ev) {
            var msg = ev.data;
            if (msg.type === 'mint_token') {
                // Worker yêu cầu tab này mint token (tab này đang là leader).
                // aus_id resolve server-side qua :APP_USER — không gửi x01.
                apex.server.process('sseToken', {}, {
                    dataType: 'text',
                    success: function (token) {
                        token = (token || '').trim();
                        if (!token) console.warn('[SSE] sseToken trả rỗng (secret chưa cấu hình? hoặc chưa login?)');
                        _port.postMessage({ type: 'token_response', token: token });
                    },
                    error: function () {
                        console.error('[SSE] sseToken AJAX error');
                        _port.postMessage({ type: 'token_response', token: '' });
                    }
                });
            } else if (msg.type === 'heartbeat_tick') {
                // aus_id resolve server-side qua :APP_USER — không gửi x01.
                apex.server.process('chatHeartbeat', {});
            } else if (msg.type === 'sse_error') {
                console.error('[SSE] connection error:', msg.reason, msg);
            } else {
                handleEvent(msg);
            }
        };

        _port.start();
        _port.postMessage({ type: 'init', sseUrl: sseUrl });

        // Ping worker định kỳ để worker biết tab này còn sống
        _pingTimer = setInterval(function () { _port.postMessage({ type: 'ping' }); }, 25000);
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

    // Gộp các event 'notification' dồn dập → 1 lần gọi notificationCount (giảm AJAX).
    function scheduleNotifCount() {
        if (_notifDebounce) clearTimeout(_notifDebounce);
        _notifDebounce = setTimeout(fetchNotifCount, 400);
    }

    function fetchNotifCount() {
        // aus_id resolve server-side qua :APP_USER — không gửi x01.
        apex.server.process('notificationCount', {}, {
            dataType: 'json',
            success: function (data) {
                if (data && data.state === 'success') updateNotifBadge(Number(data.count) || 0);
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
                console.log('[SSE] Node URL =', urlObj.url);
                callback(urlObj.url);
            } else {
                console.error('[SSE] getUrlNodeJs failed:', urlObj && urlObj.message,
                    '— kiểm tra system_paras code=\'NODEJS\'');
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
            scheduleNotifCount();
            $(document).trigger('apex:notifEvent', [data]);
        } else if (data.type === 'message' || data.type === 'typing' ||
            data.type === 'typing_stop' || data.type === 'read') {
            $(document).trigger('apex:chatEvent', [data]);
        }
    }

    // ── Init ──────────────────────────────────────────────────────────────────

    $(document).ready(function () {
        // Guard đăng nhập — KHÔNG dùng aus_id ở client. Trang login: bỏ qua hoàn toàn
        // (tránh JSON.parse('') crash khi gọi AJAX trên trang chưa đăng nhập).
        if (!isAuthenticated()) {
            console.log('[SSE] Chưa đăng nhập — bỏ qua real-time');
            return;
        }

        window._eventsPoll = true;

        initNotifBell();
        fetchNotifCount();

        fetchSseUrl(function (sseUrl) {
            if (!sseUrl) {
                console.warn('[SSE] Không có Node URL — bỏ qua real-time (badge vẫn hoạt động qua fetchNotifCount)');
                return;
            }
            initWorker(sseUrl);
        });

        // Dọn timer khi rời trang (worker tự prune port chết, đây chỉ là dọn sạch phía tab)
        window.addEventListener('beforeunload', function () {
            if (_pingTimer) clearInterval(_pingTimer);
            if (_notifDebounce) clearTimeout(_notifDebounce);
        });
    });
})();
