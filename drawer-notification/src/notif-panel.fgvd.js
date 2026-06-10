/* ============================================================
   notif-panel.fgvd.js
   Page 0 → Function and Global Variable Declaration
   ============================================================ */

/* ── Drawer toggle ─────────────────────────────────────────── */
window.notifOpen = function () {
  document.getElementById('notif-root').classList.add('open');
  document.getElementById('notif-overlay').classList.add('active');
  document.getElementById('notif-bell-btn').setAttribute('aria-expanded', 'true');
  // Trigger load/refresh khi mở
  if (typeof window.notifRefresh === 'function') window.notifRefresh();
};

window.notifClose = function () {
  document.getElementById('notif-root').classList.remove('open');
  document.getElementById('notif-overlay').classList.remove('active');
  document.getElementById('notif-bell-btn').setAttribute('aria-expanded', 'false');
};

window.notifToggle = function () {
  var root = document.getElementById('notif-root');
  root.classList.contains('open') ? window.notifClose() : window.notifOpen();
};

/* ── Badge update (gọi từ SSE handler) ────────────────────── */
window.notifBadgeUpdate = function (count) {
  var badge = document.getElementById('notif-bell-badge');
  if (!badge) return;
  var n = parseInt(count, 10) || 0;
  badge.textContent = n > 99 ? '99+' : String(n);
  badge.style.display = n > 0 ? '' : 'none';
};

/* ── Load JSX component ────────────────────────────────────── */
window.notifLoadJSX = function () {
  var jsxUrl = apex.util.makeApplicationUrl({
    pageId: 0, // unused — chỉ để lấy base
  });
  // Static Application File path
  var fileUrl = '#APP_FILES#notif-panel.jsx';

  fetch(fileUrl)
    .then(function (r) { return r.text(); })
    .then(function (src) {
      var compiled = Babel.transform(src, { presets: ['react'] }).code;
      /* eslint-disable no-new-func */
      new Function(compiled)();
    })
    .catch(function (e) {
      console.error('[notif] JSX load failed:', e);
    });
};

/* ── SSE integration ───────────────────────────────────────── */
// Đăng ký listener sau khi SSE channel khởi tạo (chat-server đã live)
window.notifSSEInit = function (sseSource) {
  sseSource.addEventListener('notification_new', function (e) {
    try {
      var data = JSON.parse(e.data);
      window.notifBadgeUpdate(data.unread_count);
      // Nếu drawer đang mở → refresh ngay
      if (document.getElementById('notif-root').classList.contains('open')) {
        if (typeof window.notifRefresh === 'function') window.notifRefresh();
      }
    } catch (_) {}
  });
};
