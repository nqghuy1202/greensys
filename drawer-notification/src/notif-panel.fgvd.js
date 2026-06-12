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
      // Sau khi React mount xong, init dropdown cho #Btn_Action
      window.notifInitDropdown();
    })
    .catch(function (e) {
      console.error('[notif] JSX load failed:', e);
    });
};

/* ── Action dropdown cho #Btn_Action ──────────────────────────── */
window.notifInitDropdown = function () {
  var btn = document.getElementById('Btn_Action');
  if (!btn) return;

  // Tránh init trùng
  if (btn._notifDropdownReady) return;
  btn._notifDropdownReady = true;

  // Tạo dropdown — append vào body để thoát overflow:hidden
  var menu = document.createElement('div');
  menu.id = 'notif-action-menu';
  menu.style.cssText = [
    'position:fixed',
    'z-index:99999',
    'background:#fff',
    'border:1px solid #E5E7EB',
    'border-radius:10px',
    'box-shadow:0 6px 20px rgba(0,0,0,.13)',
    'padding:4px 0',
    'min-width:230px',
    'display:none',
    'font-family:Plus Jakarta Sans,sans-serif',
  ].join(';');

  menu.innerHTML = [
    '<div id="notif-opt-readall" style="display:flex;align-items:center;gap:9px;padding:9px 15px;font-size:13px;cursor:pointer;color:#374151;transition:background .12s">',
    '  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg>',
    '  <span>Đánh dấu tất cả đã đọc</span>',
    '</div>',
    '<div style="height:1px;background:#F3F4F6;margin:3px 0"></div>',
    '<div id="notif-opt-delall" style="display:flex;align-items:center;gap:9px;padding:9px 15px;font-size:13px;cursor:pointer;color:#DC2626;transition:background .12s">',
    '  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
    '  <span>Xóa tất cả thông báo</span>',
    '</div>',
  ].join('');

  document.body.appendChild(menu);

  var readOpt = document.getElementById('notif-opt-readall');
  var delOpt  = document.getElementById('notif-opt-delall');

  readOpt.onmouseenter = function () { this.style.background = '#F0FBF6'; };
  readOpt.onmouseleave = function () { this.style.background = ''; };
  delOpt.onmouseenter  = function () { this.style.background = '#FEF2F2'; };
  delOpt.onmouseleave  = function () { this.style.background = ''; };

  readOpt.onclick = function () {
    closeMenu();
    if (typeof window.notifMarkAll === 'function') window.notifMarkAll();
  };
  delOpt.onclick = function () {
    closeMenu();
    if (typeof window.notifDeleteAll === 'function') window.notifDeleteAll();
  };

  var timer;

  function openMenu() {
    clearTimeout(timer);
    var r = btn.getBoundingClientRect();
    menu.style.top   = (r.bottom + 4) + 'px';
    menu.style.right = (window.innerWidth - r.right) + 'px';
    menu.style.display = 'block';
  }

  function closeMenu() {
    menu.style.display = 'none';
  }

  function scheduleClose() {
    timer = setTimeout(closeMenu, 300);
  }

  btn.addEventListener('mouseenter', openMenu);
  btn.addEventListener('mouseleave', scheduleClose);
  menu.addEventListener('mouseenter', function () { clearTimeout(timer); });
  menu.addEventListener('mouseleave', scheduleClose);
};

/* ── SSE integration via apex:notifEvent ──────────────────── */
// global.js trigger apex:notifEvent khi SSE emit type=notification
$(document).on('apex:notifEvent', function (_, data) {
  window.notifBadgeUpdate(data.unread_count);
  var root = document.getElementById('notif-root');
  if (root && root.classList.contains('open') && typeof window.notifRefresh === 'function') {
    window.notifRefresh();
  }
});
