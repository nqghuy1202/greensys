/* ============================================================
   Notification TC Page — Function and Global Variable Declaration
   ============================================================ */

var pageId = $v('pFlowStepId');

/* ── Refresh Cr_Ano giữ nguyên vị trí cuộn ────────────────── */
function refreshAnoKeepScroll() {
    var scrollEl = document.getElementById('notif-scroll');
    var scrollTop = scrollEl ? scrollEl.scrollTop : 0;
    try {
        apex.region('Cr_Ano').widget().one('apexafterrefresh', function () {
            if (scrollEl) scrollEl.scrollTop = scrollTop;
        });
        apex.region('Cr_Ano').refresh();
    } catch (_) {}
}

/* ── Helper dùng chung: gọi bulk process + refresh region ─── */
function apexBulkProcess(processName) {
    apex.server.process(processName, {}, {
        pageId: 0,
        success: function () { refreshAnoKeepScroll(); }
    });
}

/* ── Di chuyển Btn_BulkAction lên dialog titlebar ────────── */
function moveNotifButtons() {
    if (window.parent === window) return;
    var parentDoc = window.parent.document;
    var $parent   = window.parent.apex.jQuery;

    var iframe = Array.from(parentDoc.querySelectorAll('iframe'))
        .find(function (f) { return f.contentWindow === window; });
    if (!iframe) return;

    var $dialog   = $parent(iframe).closest('.ui-dialog');
    var $closeBtn = $dialog.find('.ui-dialog-titlebar-close');
    if ($dialog.data('notif-btns-moved')) return;

    var wrap = document.getElementById('Btn_BulkAction')
               && document.getElementById('Btn_BulkAction').closest('.nba-wrap');
    var menu = document.getElementById('nba-menu');
    if (!wrap) return;

    $closeBtn[0].before(wrap, menu);
    $dialog.data('notif-btns-moved', true);

    // Inject CSS sang parent document (không đọc cssRules — cross-origin bị chặn)
    if (!parentDoc.getElementById('notif-nba-style')) {
        var tag = parentDoc.createElement('style');
        tag.id = 'notif-nba-style';
        tag.textContent = [
            '.nba-trigger{display:inline-flex;align-items:center;justify-content:center;',
            'width:28px;height:28px;border-radius:7px;border:1px solid #E5E7EB;',
            'background:#fff;color:#6B7280;cursor:pointer;',
            'transition:background .12s,color .12s,border-color .12s}',
            '.nba-trigger:hover,.nba-trigger[aria-expanded="true"]',
            '{background:#F3F4F6;color:#111827;border-color:#D1D5DB}',
            '.nba-trigger svg{pointer-events:none}',
            '.nba-menu{position:fixed;z-index:2147483647;background:#fff;',
            'border:1px solid #E5E7EB;border-radius:10px;',
            'box-shadow:0 4px 6px -1px rgba(0,0,0,.08),0 10px 24px -4px rgba(0,0,0,.13);',
            'padding:4px;min-width:210px;display:none;animation:nbaDropIn .13s ease}',
            '.nba-menu.open{display:block}',
            '@keyframes nbaDropIn{from{opacity:0;transform:translateY(-5px) scale(.97)}',
            'to{opacity:1;transform:translateY(0) scale(1)}}',
            '.nba-item{display:flex;align-items:center;gap:9px;width:100%;padding:8px 11px;',
            'border-radius:7px;border:none;background:none;font-family:inherit;',
            'font-size:12.5px;font-weight:500;text-align:left;cursor:pointer;',
            'transition:background .1s,color .1s;white-space:nowrap}',
            '.nba-item svg{flex-shrink:0;opacity:.65;transition:opacity .1s}',
            '.nba-item:hover svg{opacity:1}',
            '.nba-read{color:#374151}.nba-read:hover{background:#EFF6FF;color:#1D4ED8}',
            '.nba-del{color:#6B7280}.nba-del:hover{background:#FEF2F2;color:#DC2626}',
            '.nba-sep{height:1px;background:#F3F4F6;margin:3px 0}',
        ].join('');
        parentDoc.head.appendChild(tag);
    }

    // Rewire inline handlers → iframe window (inline attr chạy trong parent scope)
    var iframeWin  = window;
    var movedBtn   = parentDoc.getElementById('Btn_BulkAction');
    var movedMenu  = parentDoc.getElementById('nba-menu');

    movedBtn.onmouseenter  = function () { iframeWin.notifBulkMenuOpen(); };
    movedBtn.onmouseleave  = function () { iframeWin.notifBulkMenuScheduleClose(); };
    movedMenu.onmouseenter = function () { iframeWin.notifBulkMenuCancelClose(); };
    movedMenu.onmouseleave = function () { iframeWin.notifBulkMenuScheduleClose(); };

    movedMenu.querySelector('.nba-read').onclick = function () { iframeWin.notifBulkMarkAll(); };
    movedMenu.querySelector('.nba-del').onclick  = function () { iframeWin.notifBulkDeleteAll(); };
}

/* ── Read filter tabs (segmented control) ─────────────────── */
function notifSetReadFilter(radio) {
    var tabs = radio.closest('.notif-type-tabs').querySelectorAll('.notif-type-tab');
    tabs.forEach(function (t) { t.classList.remove('active'); });
    radio.closest('.notif-type-tab').classList.add('active');
    apex.item('P' + pageId + '_READ').setValue(radio.value);
}

// Alias cho DA Change — tránh gọi notifSetReadFilter (JSX-only)
function notifSetReadType(radio) {
    apex.item('P' + pageId + '_READ').setValue(radio.value);
}

/* ── Navigate tới chứng từ ────────────────────────────────── */
function notifNavigate(anoId) {
    apex.item('P' + pageId + '_ANO_ID').setValue(anoId);
    apex.item('P' + pageId + '_ANO_CLICK').setValue(anoId);
}

/* ── Click vào notification item ─────────────────────────── */
function notifItemClick(event, inner) {
    if (event.target.closest('.ni-menu-btn')) return;
    var ni = inner.closest('.ni');
    notifNavigate(ni.dataset.anoId);
}

/* ── Dot menu (⋯) per item ────────────────────────────────── */
(function () {
    var _dd          = null;
    var _activeBtn   = null;
    var _activeItem  = null;
    var _justOpened  = false;  // block document listener trong cùng tick với open

    function getDropdown() {
        if (!_dd || !_dd.isConnected) _dd = document.getElementById('ni-dropdown');
        return _dd;
    }

    function niMenuClose() {
        var dd = getDropdown();
        if (!dd) return;
        dd.classList.remove('open');
        if (_activeBtn) { _activeBtn.classList.remove('ni-menu-open'); _activeBtn = null; }
        _activeItem = null;
    }

    window.notifMenuOpen = function (btn) {
        var dd = getDropdown();
        if (!dd) return;

        if (_activeBtn === btn && dd.classList.contains('open')) {
            niMenuClose();
            return;
        }
        niMenuClose();

        var ni = btn.closest('.ni');
        _activeBtn  = btn;
        _activeItem = { anoId: ni.dataset.anoId, ahhId: ni.dataset.ahhId, el: ni };
        btn.classList.add('ni-menu-open');

        var btnRead = dd.querySelector('.dd-read');
        if (btnRead) btnRead.style.display = ni.classList.contains('read-Y') ? 'none' : '';

        var r  = btn.getBoundingClientRect();
        var mw = dd.offsetWidth || 180;
        dd.style.top  = (r.bottom + window.scrollY + 4) + 'px';
        dd.style.left = Math.max(8, Math.min(r.right + window.scrollX - mw,
                        window.innerWidth - mw - 8)) + 'px';

        dd.classList.remove('open');
        void dd.offsetWidth;
        dd.classList.add('open');

        _justOpened = true;
        setTimeout(function () { _justOpened = false; }, 0);
    };

    window.notifMenuView = function () {
        if (!_activeItem) return;
        var anoId = _activeItem.anoId;
        niMenuClose();
        notifNavigate(anoId);
    };

    window.notifMenuMarkRead = function () {
        if (!_activeItem) return;
        var anoId = _activeItem.anoId;
        var el     = _activeItem.el;
        niMenuClose();

        apex.server.process('notifMarkRead', { x01: anoId }, { pageId: 0 });

        if (el) {
            el.classList.add('ni-just-read');
            el.classList.remove('read-N');
            el.classList.add('read-Y');
            var dot = el.querySelector('.ni-dot');
            if (dot) {
                dot.style.transition = 'opacity .35s ease, transform .35s ease';
                requestAnimationFrame(function () {
                    dot.style.opacity   = '0';
                    dot.style.transform = 'scale(0)';
                });
            }
            setTimeout(function () {
                el.classList.remove('ni-just-read');
                refreshAnoKeepScroll();
            }, 450);
        } else {
            refreshAnoKeepScroll();
        }
    };

    window.notifMenuDelete = function () {
        if (!_activeItem) return;
        var anoId = _activeItem.anoId;
        var el    = _activeItem.el;
        niMenuClose();
        apex.item('P' + pageId + '_DELTED_ANO_ID').setValue(anoId);

        if (el) {
            el.style.transition = 'opacity .2s, max-height .25s';
            el.style.overflow   = 'hidden';
            el.style.maxHeight  = el.offsetHeight + 'px';
            el.style.opacity    = '0';
            requestAnimationFrame(function () { el.style.maxHeight = '0'; });
            setTimeout(function () { el.remove(); }, 260);
        }
    };

    document.addEventListener('click', function (e) {
        if (_justOpened) return;
        if (!e.target.closest('.ni-menu-btn') && !e.target.closest('#ni-dropdown')) {
            niMenuClose();
        }
    });

    var scrollEl = document.getElementById('notif-scroll');
    if (scrollEl) scrollEl.addEventListener('scroll', niMenuClose, { passive: true });
})();

/* ── SSE: refresh TC region khi có thông báo mới ──────────── */
// TC page chạy trong iframe → event trigger trên parent.document bằng parent jQuery.
// Dùng .off() trước .on() để tránh listener tích lũy khi iframe reload.
(function () {
    var inIframe = window.parent && window.parent !== window;
    var $        = inIframe ? window.parent.apex.jQuery : apex.jQuery;
    var doc      = inIframe ? window.parent.document    : document;
    $(doc).off('apex:notifEvent.tc').on('apex:notifEvent.tc', function (_, data) {
        refreshAnoKeepScroll();
    });
})();

/* ── Bulk menu (hover) cho #Btn_BulkAction ────────────────── */
(function () {
    var _timer = null;

    function getTrigger() {
        var inParent = window.parent && window.parent !== window
            ? window.parent.document.getElementById('Btn_BulkAction')
            : null;
        return inParent || document.getElementById('Btn_BulkAction');
    }

    function getMenu() {
        var trigger = getTrigger();
        return trigger ? trigger.ownerDocument.getElementById('nba-menu') : null;
    }

    function openMenu() {
        clearTimeout(_timer);
        var trigger = getTrigger();
        var menu    = getMenu();
        if (!trigger || !menu) return;

        var r   = trigger.getBoundingClientRect();
        var doc = trigger.ownerDocument;
        menu.style.top   = (r.bottom + 4) + 'px';
        menu.style.left  = '';
        menu.style.right = (doc.documentElement.clientWidth - r.right) + 'px';
        menu.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
    }

    function closeMenu() {
        var trigger = getTrigger();
        var menu    = getMenu();
        if (menu)    menu.classList.remove('open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }

    window.notifBulkMenuOpen          = function () { openMenu(); };
    window.notifBulkMenuScheduleClose = function () { _timer = setTimeout(closeMenu, 300); };
    window.notifBulkMenuCancelClose   = function () { clearTimeout(_timer); };

    window.notifBulkMarkAll = function () {
        closeMenu();
        apexBulkProcess('notifMarkAll');
    };

    window.notifBulkDeleteAll = function () {
        closeMenu();
        apexBulkProcess('notifDeleteAll');
    };
})();

/* ── Wire-up sau khi page load ────────────────────────────── */
apex.jQuery(document).ready(function () {
    moveNotifButtons();
});
