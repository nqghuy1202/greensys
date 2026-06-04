/* CHAT HỆ THỐNG — Function and Global Variable Declaration (FGVD)
 * Paste TOÀN BỘ file này vào: Page → JavaScript → "Function and Global Variable Declaration".
 *
 * Mục tiêu: né giới hạn ký tự của "Execute when Page Loads" — toàn bộ hàm + state
 * nằm ở đây, mỗi tương tác do 1 Dynamic Action kích hoạt (gọi window.csOn*).
 *
 * Thứ tự chạy APEX: FGVD (file này) → đăng ký DA → "Execute when Page Loads" (gọi window.csInit()).
 * Vì FGVD chạy TRƯỚC Execute-on-load nên CHAT_AUS_ID phải set ngay đây (dòng dưới),
 * KHÔNG để ở Execute-on-load như bản cũ — nếu không IIFE đọc AUS_ID = 0.
 */
window.CHAT_AUS_ID = &G_AUS_ID.;
var pageId = $v('pFlowStepId');

(function($) {
  'use strict';

  var PAGE_ID         = Number(window.pageId || 0);
  var AUS_ID          = Number(window.CHAT_AUS_ID || 0);
  var activeConvId    = null;
  var activeTab       = 'all';   // all | dm | group | doc
  var activeQuick     = null;    // null | unread | pinned
  var activeConvType  = 'DM';    // DM | CHANNEL — current compose mode
  var showInfo        = true;
  var isSending       = false;
  var lastSentAt      = 0;       // ms — suppress duplicate reload từ apex:chatEvent
  var typingUsers     = {};      // aus_id → name
  var typingTimers    = {};      // aus_id → timer handle
  var selectedMembers = {};      // aus_id → { name, hue }
  var replyToMsgId    = null;
  var replyToBody     = '';
  var typingDebounce;            // module-scope timer cho typing
  var searchTimer;               // module-scope timer cho sidebar search

  // Messenger là Normal page (cùng frame với global.js) nên nghe trực tiếp trên document của
  // chính nó. Pattern parent-aware giống Doc Chat để phòng khi page bị nhúng iframe về sau.
  var inIframe  = (window.parent && window.parent !== window);
  var eventWin  = inIframe ? window.parent : window;
  var $evt      = (eventWin.apex && eventWin.apex.jQuery) ? eventWin.apex.jQuery : $;
  var $eventDoc = $evt(eventWin.document);

  // ── APEX helpers ──────────────────────────────────────────────────────

  function csHtml(proc, params, targetId, onDone) {
    apex.server.process(proc, params, {
      pageId:   PAGE_ID,
      dataType: 'text',
      success: function(html) {
        var el = document.getElementById(targetId);
        if (el) el.innerHTML = html;
        if (onDone) onDone();
      },
      error: function(xhr) {
        console.error('[Chat]', proc, xhr.responseText);
      }
    });
  }

  function csJson(proc, params, onSuccess, onError) {
    apex.server.process(proc, params, {
      pageId:   PAGE_ID,
      dataType: 'json',
      success:  onSuccess || function() {},
      error:    onError || function(xhr) {
        console.error('[Chat]', proc, xhr.responseText);
      }
    });
  }

  // ── Data loaders ──────────────────────────────────────────────────────

  function loadConvList(onDone) {
    var searchEl = document.getElementById('cs-search');
    csHtml('chatConvListHtml', {
      x01: activeTab.toUpperCase(),
      x02: searchEl ? (searchEl.value || '') : '',
      x03: activeQuick || ''
    }, 'cs-conv-list', onDone);
  }

  function loadThread() {
    if (!activeConvId) {
      var el = document.getElementById('cs-messages');
      if (el) el.innerHTML = '<div class="cs-empty-state">← Chọn hội thoại để bắt đầu</div>';
      return;
    }
    csHtml('chatMsgThreadHtml', { x01: String(activeConvId) }, 'cs-messages', scrollToBottom);
  }

  function loadInfo() {
    if (!showInfo) return;
    csHtml('chatMembersHtml', {
      x01: activeConvId ? String(activeConvId) : ''
    }, 'cs-info-content');
  }

  function loadContacts(onDone) {
    csHtml('chatContactsHtml', {}, 'cs-member-suggest-list', onDone);
    setTimeout(updateEmpItemMode, 100);
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  function scrollToBottom() {
    setTimeout(function() {
      var el = document.getElementById('cs-messages');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Select conversation ───────────────────────────────────────────────

  function selectConv(convId) {
    convId = Number(convId);
    if (convId === activeConvId) return;
    activeConvId = convId;

    replyToMsgId = null;
    replyToBody  = '';
    var replyBanner = document.getElementById('cs-reply-banner');
    if (replyBanner) replyBanner.style.display = 'none';
    $('#cs-composer').removeClass('with-reply');

    $('.convo-item').removeClass('active');
    $('.convo-item[data-conv-id="' + convId + '"]').addClass('active');

    var composeArea = document.getElementById('cs-compose-area');
    if (composeArea) composeArea.style.display = '';

    var $item = $('.convo-item[data-conv-id="' + convId + '"]');
    var name  = $item.find('.convo-name').text() || 'Hội thoại';
    var titleEl = document.getElementById('cs-thread-title');
    if (titleEl) titleEl.textContent = name;

    var headEl = document.getElementById('cs-thread-head');
    if (headEl) {
      $(headEl).find('.cs-head-avatar').remove();
      var $srcAv = $item.find('.convo-avatar').first();
      if ($srcAv.length) {
        var $av = $srcAv.clone();
        $av.removeClass('convo-avatar').addClass('cs-head-avatar');
        $av.css({ width: 36, height: 36, fontSize: 13 });
        $(headEl).prepend($av);
      }
    }

    loadThread();
    loadInfo();
    csJson('chatRead', { x01: String(convId) });

    $('.convo-item[data-conv-id="' + convId + '"]').removeClass('unread').find('.convo-badge').remove();
  }

  // ── Send message ──────────────────────────────────────────────────────

  function sendMessage() {
    if (isSending || !activeConvId) return;
    var input  = document.getElementById('cs-msg-input');
    var body   = (input ? input.value : '').trim();
    if (!body) return;

    var partner = String($('.convo-item[data-conv-id="' + activeConvId + '"]').data('partner-aus-id') || '');

    isSending  = true;
    lastSentAt = Date.now();
    if (input) { input.value = ''; input.style.height = 'auto'; }

    var prevReplyId = replyToMsgId;
    replyToMsgId = null;
    replyToBody  = '';
    var replyBanner = document.getElementById('cs-reply-banner');
    if (replyBanner) replyBanner.style.display = 'none';
    $('#cs-composer').removeClass('with-reply');

    csJson('chatSend', {
      x01: String(activeConvId),
      x02: body,
      x03: prevReplyId ? String(prevReplyId) : '',
      x04: partner
    }, function(data) {
      isSending = false;
      if (data && data.error) {
        apex.message.showErrors([{ type: 'error', message: 'Gửi thất bại: ' + data.error }]);
        return;
      }
      loadThread();
      loadConvList();
    }, function(xhr) {
      isSending = false;
      apex.message.showErrors([{ type: 'error', message: 'Gửi thất bại: ' + (xhr.responseText || 'Lỗi kết nối') }]);
    });
  }

  // ── Typing indicators ─────────────────────────────────────────────────

  function onMsgInput() {
    if (!activeConvId) return;
    clearTimeout(typingDebounce);
    typingDebounce = setTimeout(function() {
      csJson('chatTyping', { x01: String(activeConvId) });
    }, 600);
  }

  function showTyping(ausId, name) {
    typingUsers[ausId] = name || 'Ai đó';
    clearTimeout(typingTimers[ausId]);
    typingTimers[ausId] = setTimeout(function() { hideTyping(ausId); }, 5000);
    renderTyping();
  }

  function hideTyping(ausId) {
    delete typingUsers[ausId];
    clearTimeout(typingTimers[ausId]);
    renderTyping();
  }

  function renderTyping() {
    var names  = Object.values(typingUsers);
    var el     = document.getElementById('cs-typing');
    if (!el) return;
    if (!names.length) { el.style.display = 'none'; return; }
    el.innerHTML = '<span class="cs-typing-dot"></span><span class="cs-typing-dot"></span><span class="cs-typing-dot"></span> '
                 + escHtml(names.slice(0, 2).join(', ')) + ' đang nhập...';
    el.style.display = 'flex';
  }

  // ── Real-time events (từ global.js → apex:chatEvent) ─────────────────
  // GIỮ BINDING Ở FGVD (không làm DA): custom event mang payload qua jQuery trigger,
  // DA "Custom Event" không lấy được tham số thứ 2 sạch sẽ.

  function showSeen() {
    var box = document.getElementById('cs-messages');
    if (!box) return;
    var old = box.querySelector('.msg-seen');
    if (old) old.remove();
    var mine = box.querySelectorAll('.msg-row.mine');
    if (!mine.length) return;
    var col = mine[mine.length - 1].querySelector('.msg-col');
    if (!col) return;
    var tag = document.createElement('div');
    tag.className = 'msg-seen';
    tag.textContent = '✓ Đã xem';
    col.appendChild(tag);
  }

  function onChatEvent(_, ev) {
    if (ev.type === 'message') {
      loadConvList();
      if (String(ev.conv_id) === String(activeConvId)) {
        var justSentHere = (Date.now() - lastSentAt) < 3000;
        if (!justSentHere) loadThread();
        csJson('chatRead', { x01: String(activeConvId) });
      }
    } else if (ev.type === 'typing') {
      if (Number(ev.aus_id) !== AUS_ID && String(ev.conv_id) === String(activeConvId)) {
        showTyping(ev.aus_id, ev.name);
      }
    } else if (ev.type === 'typing_stop') {
      if (String(ev.conv_id) === String(activeConvId)) hideTyping(ev.aus_id);
    } else if (ev.type === 'read') {
      if (Number(ev.aus_id) !== AUS_ID && String(ev.conv_id) === String(activeConvId)) {
        showSeen();
      }
    }
  }

  $eventDoc.on('apex:chatEvent', onChatEvent);

  // ── Filter row — type dropdown ────────────────────────────────────────

  var TYPE_LABELS = { all: 'Tất cả', dm: 'Cá nhân', group: 'Nhóm', doc: 'Chứng từ' };

  function updateTypeDD() {
    var dd = document.getElementById('cs-type-dd');
    var labelEl = document.getElementById('cs-type-label');
    var countEl = document.getElementById('cs-type-count');
    if (!dd || !labelEl) return;
    labelEl.textContent = TYPE_LABELS[activeTab] || 'Tất cả';
    dd.classList.toggle('active', activeTab !== 'all');
    if (activeTab === 'all' && countEl) {
      var cnt = document.getElementById('cs-cnt-all');
      var n = cnt ? parseInt(cnt.textContent, 10) : 0;
      if (n > 0) { countEl.textContent = n; countEl.style.display = ''; }
      else countEl.style.display = 'none';
    } else if (countEl) {
      countEl.style.display = 'none';
    }
    $('#cs-type-menu .lp-type-menu-item').each(function() {
      $(this).toggleClass('selected', $(this).data('type') === activeTab);
    });
  }

  function closeTypeMenu() {
    var menu = document.getElementById('cs-type-menu');
    if (menu) { menu.style.display = 'none'; $('#cs-type-dd').removeClass('open'); }
  }

  // GIỮ BINDING Ở FGVD (không làm DA): đóng menu khi click ra ngoài, dựa vào
  // stopPropagation của csOnTypeDdToggle để không bị đóng ngay khi mở.
  $(document).on('click', closeTypeMenu);

  // ── Convo menu (Zalo "...") — ghim/bỏ ghim hội thoại ──────────────────

  function pinConv(convId, next) {
    csJson('chatPin', { x01: String(convId), x02: next }, function(data) {
      if (data && data.error) {
        apex.message.showErrors([{ type: 'error', message: 'Ghim thất bại: ' + data.error }]);
        return;
      }
      loadConvList();
    }, function(xhr) {
      apex.message.showErrors([{ type: 'error',
        message: 'Ghim thất bại (chatPin): ' + (xhr.responseText || 'callback chưa được tạo trên page?') }]);
    });
  }

  function closeConvMenu() {
    var m = document.getElementById('cs-convo-menu');
    if (m) m.style.display = 'none';
  }

  function openConvMenu($btn) {
    var convId = String($btn.data('conv-id'));
    var pinned = String($btn.data('pinned')) === '1';
    var menu = document.getElementById('cs-convo-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'cs-convo-menu';
      menu.className = 'cs-convo-menu';
      (document.getElementById('chat-root') || document.body).appendChild(menu);
    }
    menu.innerHTML = '<button type="button" class="cs-convo-menu-item" data-act="pin">'
      + '<span class="fa fa-thumb-tack"></span><span>'
      + (pinned ? 'Bỏ ghim hội thoại' : 'Ghim hội thoại') + '</span></button>';
    menu.setAttribute('data-conv-id', convId);
    menu.setAttribute('data-pinned', pinned ? '1' : '0');
    menu.style.display = 'block';
    var rect = $btn[0].getBoundingClientRect();
    var mw   = menu.offsetWidth || 180;
    var left = rect.right - mw;
    if (left < 8) left = 8;
    menu.style.top  = (rect.bottom + 4) + 'px';
    menu.style.left = left + 'px';
  }

  // GIỮ BINDING Ở FGVD (không làm DA): đóng convo menu khi click ra ngoài.
  $(document).on('click', closeConvMenu);

  // ── Compose: form helpers ─────────────────────────────────────────────

  function updateEmpItemMode() {
    var isDM = activeConvType === 'DM';
    $('#cs-member-suggest-list .emp-item .check').each(function() {
      $(this).toggleClass('radio', isDM).toggleClass('check', !isDM);
      this.className = isDM ? 'radio' : 'check';
    });
  }

  function setComposeType(convType) {
    activeConvType = convType;
    $('.emp-type-tab').removeClass('active');
    $('.emp-type-tab[data-conv-type="' + convType + '"]').addClass('active');
    var groupFields = document.getElementById('cs-group-fields');
    if (groupFields) groupFields.style.display = convType === 'CHANNEL' ? 'flex' : 'none';
    var labelEl = document.getElementById('cs-create-label');
    var iconEl  = document.getElementById('cs-create-icon');
    if (labelEl) labelEl.textContent = convType === 'CHANNEL' ? 'Tạo nhóm' : 'Bắt đầu trao đổi';
    if (iconEl)  iconEl.className    = convType === 'CHANNEL' ? 'fa fa-plus' : 'fa fa-paper-plane';
    if (convType === 'DM') {
      Object.keys(selectedMembers).slice(1).forEach(function(id) {
        delete selectedMembers[id];
        $('#cs-member-suggest-list .emp-item[data-aus-id="' + id + '"]').removeClass('selected');
      });
    }
    updateEmpItemMode();
    renderChips();
  }

  function renderChips() {
    var $chips = $('#cs-selected-chips');
    var count  = Object.keys(selectedMembers).length;
    $('#cs-selected-count').text(count);
    var statusEl = document.getElementById('cs-selected-status');
    if (statusEl) {
      if (!count) statusEl.textContent = activeConvType === 'DM' ? 'Chưa chọn ai' : 'Chọn ít nhất 1 thành viên';
      else if (activeConvType === 'DM') {
        var m0 = Object.values(selectedMembers)[0];
        statusEl.textContent = 'Đã chọn: ' + (m0 ? m0.name : '');
      } else statusEl.textContent = count + ' thành viên';
    }
    var nameEl  = document.getElementById('cs-create-name');
    var name    = nameEl ? nameEl.value.trim() : '';
    var labelEl = document.getElementById('cs-create-label');
    var iconEl  = document.getElementById('cs-create-icon');
    if (labelEl) labelEl.textContent = activeConvType === 'CHANNEL'
      ? ('Tạo nhóm (' + count + ')') : 'Bắt đầu trao đổi';
    if (iconEl)  iconEl.className = activeConvType === 'CHANNEL' ? 'fa fa-plus' : 'fa fa-paper-plane';
    var btnEl  = document.getElementById('cs-btn-create');
    if (btnEl) btnEl.disabled = !count || (activeConvType === 'CHANNEL' && !name);
    if (!$chips.length) return;
    if (!count) { $chips.addClass('empty').html(''); return; }
    $chips.removeClass('empty');
    var html = '';
    Object.keys(selectedMembers).forEach(function(ausId) {
      var m = selectedMembers[ausId];
      var words = m.name.trim().split(/\s+/);
      var initl = (words[words.length - 1][0] || '?').toUpperCase();
      html += '<span class="emp-chip">'
            + '<span class="av" style="background:hsl(' + m.hue + ',55%,52%)">'
            + (m.img ? '<img class="av-img" onerror="this.remove()" src="' + escHtml(m.img) + '">' : '') + initl + '</span>'
            + escHtml(m.name)
            + '<span class="x" data-chip-id="' + ausId + '">×</span>'
            + '</span>';
    });
    $chips.html(html);
  }

  function openCompose(convType) {
    activeConvType  = convType || 'DM';
    selectedMembers = {};
    var listScreen    = document.getElementById('cs-list-screen');
    var composeScreen = document.getElementById('cs-compose-screen');
    if (listScreen)    listScreen.style.display    = 'none';
    if (composeScreen) composeScreen.style.display = 'flex';
    var titleEl = document.getElementById('cs-compose-title');
    if (titleEl) titleEl.textContent = activeConvType === 'CHANNEL' ? 'Tạo nhóm mới' : 'Nhắn tin mới';
    var searchEl = document.getElementById('cs-contact-search');
    if (searchEl) searchEl.value = '';
    var nameEl = document.getElementById('cs-create-name');
    if (nameEl) nameEl.value = '';
    setComposeType(activeConvType);
    renderChips();
    var listEl = document.getElementById('cs-member-suggest-list');
    if (listEl) listEl.innerHTML = '<div class="cs-loading">Đang tải...</div>';
    loadContacts();
    setTimeout(function() {
      var inp = document.getElementById('cs-contact-search');
      if (inp) inp.focus();
    }, 150);
  }

  function closeCompose() {
    var listScreen    = document.getElementById('cs-list-screen');
    var composeScreen = document.getElementById('cs-compose-screen');
    if (composeScreen) composeScreen.style.display = 'none';
    if (listScreen)    listScreen.style.display    = 'flex';
    selectedMembers = {};
  }

  // ════════════════════════════════════════════════════════════════════════
  //  HANDLERS gọi từ Dynamic Action — nhận (el, ev) từ this.triggeringElement
  //  và this.browserEvent. Mỗi hàm dưới đây ánh xạ 1 DA. Xem chat-system-da-setup.md.
  // ════════════════════════════════════════════════════════════════════════

  // DA1 — Click #cs-type-dd  (mở/đóng dropdown loại)
  function csOnTypeDdToggle(el, ev) {
    if (ev) ev.stopPropagation();
    var menu = document.getElementById('cs-type-menu');
    var dd   = document.getElementById('cs-type-dd');
    if (!menu || !dd) return;
    var isOpen = menu.style.display === 'block';
    if (isOpen) {
      menu.style.display = 'none';
      $('#cs-type-dd').removeClass('open');
    } else {
      var rect = dd.getBoundingClientRect();
      menu.style.top  = (rect.bottom + 6) + 'px';
      menu.style.left = rect.left + 'px';
      menu.style.display = 'block';
      $('#cs-type-dd').addClass('open');
    }
  }

  // DA2 — Click #cs-type-menu .lp-type-menu-item  (chọn loại)
  function csOnTypeMenuSelect(el, ev) {
    if (ev) ev.stopPropagation();
    activeTab = $(el).data('type');
    document.getElementById('cs-type-menu').style.display = 'none';
    $('#cs-type-dd').removeClass('open');
    updateTypeDD();
    loadConvList();
  }

  // DA3 — Click .lp-quick-chip[data-quick]  (chip lọc nhanh)
  function csOnQuickChip(el, ev) {
    var q = $(el).data('quick');
    activeQuick = (activeQuick === q) ? null : q;
    $('.lp-quick-chip').removeClass('active');
    if (activeQuick) $('[data-quick="' + activeQuick + '"]').addClass('active');
    loadConvList();
  }

  // DA4 — Click .convo-menu[data-conv-menu]  (mở menu "..." của hội thoại)
  function csOnConvoMenuOpen(el, ev) {
    if (ev) ev.stopPropagation();
    var $btn   = $(el);
    var menu   = document.getElementById('cs-convo-menu');
    var isOpen = menu && menu.style.display === 'block'
                 && menu.getAttribute('data-conv-id') === String($btn.data('conv-id'));
    closeConvMenu();
    if (!isOpen) openConvMenu($btn);
  }

  // DA5 — Click #cs-convo-menu .cs-convo-menu-item  (item trong menu "...")
  function csOnConvoMenuItem(el, ev) {
    if (ev) ev.stopPropagation();
    var menu = document.getElementById('cs-convo-menu');
    if (!menu) return;
    if ($(el).data('act') === 'pin') {
      pinConv(menu.getAttribute('data-conv-id'), menu.getAttribute('data-pinned') === '1' ? '0' : '1');
    }
    closeConvMenu();
  }

  // DA6 — Click .convo-item[data-conv-id]  (chọn hội thoại)
  function csOnConvClick(el, ev) {
    selectConv($(el).data('conv-id'));
  }

  // DA7 — Key Release / Input #cs-search  (tìm kiếm sidebar, debounce)
  function csOnSearchInput(el, ev) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadConvList, 350);
  }

  // DA8 — Click .msg-hover-action[data-reply-id]  (bắt đầu trả lời)
  function csOnReplyStart(el, ev) {
    if (ev) ev.stopPropagation();
    var $a = $(el);
    replyToMsgId = $a.data('reply-id');
    replyToBody  = String($a.data('reply-body') || '').substring(0, 80);
    var prevEl = document.getElementById('cs-reply-preview');
    if (prevEl) prevEl.textContent = replyToBody;
    var banner = document.getElementById('cs-reply-banner');
    if (banner) banner.style.display = 'flex';
    $('#cs-composer').addClass('with-reply');
    var inp = document.getElementById('cs-msg-input');
    if (inp) inp.focus();
  }

  // DA9 — Click #cs-reply-cancel  (hủy trả lời)
  function csOnReplyCancel(el, ev) {
    replyToMsgId = null;
    replyToBody  = '';
    var banner = document.getElementById('cs-reply-banner');
    if (banner) banner.style.display = 'none';
    $('#cs-composer').removeClass('with-reply');
  }

  // DA10 — Click #cs-btn-send  (gửi tin)
  function csOnSend(el, ev) { sendMessage(); }

  // DA11 — Key Down #cs-msg-input  (Ctrl+Enter gửi; phím khác → báo typing)
  function csOnMsgKeydown(el, ev) {
    if (ev && ev.ctrlKey && ev.key === 'Enter') { ev.preventDefault(); sendMessage(); }
    else onMsgInput();
  }

  // DA12 — Key Release / Input #cs-msg-input  (auto-resize textarea)
  function csOnMsgAutosize(el, ev) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  // DA13 — Click #cs-btn-info  (bật/tắt panel thông tin)
  function csOnToggleInfo(el, ev) {
    showInfo = !showInfo;
    var root = document.getElementById('chat-root');
    if (root) root.classList.toggle('with-info', showInfo);
    $(el).toggleClass('active', showInfo);
    if (showInfo) loadInfo();
  }

  // DA14 — Click #cs-btn-dm, #cs-btn-compose  (mở soạn DM)
  function csOnOpenDM(el, ev) { openCompose('DM'); }

  // DA15 — Click #cs-btn-group  (mở soạn nhóm)
  function csOnOpenGroup(el, ev) { openCompose('CHANNEL'); }

  // DA16 — Click #cs-compose-back, #cs-compose-close, #cs-compose-cancel  (đóng soạn)
  function csOnCloseCompose(el, ev) { closeCompose(); }

  // DA17 — Click .emp-type-tab[data-conv-type]  (đổi tab loại trong soạn)
  function csOnTypeTab(el, ev) { setComposeType($(el).data('conv-type')); }

  // DA18 — Click #cs-member-suggest-list .emp-item  (chọn/bỏ thành viên)
  function csOnMemberToggle(el, ev) {
    var $item = $(el);
    var ausId = String($item.data('aus-id'));
    var name  = String($item.data('name') || '');
    var hue   = String($item.data('hue')  || '0');
    var img   = String($item.data('img')  || '');

    if ($item.hasClass('selected')) {
      $item.removeClass('selected');
      delete selectedMembers[ausId];
    } else {
      if (activeConvType === 'DM') {
        $('#cs-member-suggest-list .emp-item.selected').removeClass('selected');
        selectedMembers = {};
      }
      $item.addClass('selected');
      selectedMembers[ausId] = { name: name, hue: hue, img: img };
    }
    renderChips();
  }

  // DA19 — Click .emp-chip .x  (bỏ 1 chip thành viên)
  function csOnChipRemove(el, ev) {
    if (ev) ev.stopPropagation();
    var ausId = String($(el).data('chip-id'));
    delete selectedMembers[ausId];
    $('#cs-member-suggest-list .emp-item[data-aus-id="' + ausId + '"]').removeClass('selected');
    renderChips();
  }

  // DA20 — Key Release / Input #cs-create-name  (cập nhật state nút Tạo)
  function csOnCreateNameInput(el, ev) { renderChips(); }

  // DA21 — Key Release / Input #cs-contact-search  (lọc danh bạ)
  function csOnContactSearch(el, ev) {
    var q = (el.value || '').toLowerCase().trim();
    $('#cs-member-suggest-list .emp-item').each(function() {
      var name = ($(this).data('name') || '').toLowerCase();
      var dept = ($(this).data('dept') || '').toLowerCase();
      $(this).toggle(!q || name.indexOf(q) !== -1 || dept.indexOf(q) !== -1);
    });
    $('#cs-member-suggest-list [data-dept-header]').each(function() {
      var $h = $(this), any = false, $n = $h.next();
      while ($n.length && !$n.is('[data-dept-header]')) {
        if ($n.is(':visible')) { any = true; break; }
        $n = $n.next();
      }
      $h.toggle(any);
    });
  }

  // DA22 — Click #cs-btn-create  (tạo hội thoại)
  function csOnSubmitCreate(el, ev) {
    var $btn = $(el);
    if ($btn.data('submitting')) return;

    var convType = activeConvType;
    var nameEl   = document.getElementById('cs-create-name');
    var name     = nameEl ? (nameEl.value || '').trim() : '';
    var members  = Object.keys(selectedMembers).map(Number);

    if (!members.length) {
      apex.message.showErrors([{ type: 'error', message: 'Chọn ít nhất 1 thành viên' }]);
      return;
    }
    if (convType === 'CHANNEL' && !name) {
      name = 'Nhóm mới';
      if (nameEl) nameEl.value = name;
    }

    $btn.data('submitting', true).prop('disabled', true);

    csJson('chatCreate', {
      x01: convType,
      x02: name,
      x03: JSON.stringify(members)
    }, function(data) {
      $btn.removeData('submitting').prop('disabled', false);
      if (data && data.error) {
        apex.message.showErrors([{ type: 'error', message: 'Tạo thất bại: ' + data.error }]);
        return;
      }
      closeCompose();
      if (data && data.conv_id) {
        loadConvList(function() { selectConv(data.conv_id); });
      }
    }, function(xhr) {
      $btn.removeData('submitting').prop('disabled', false);
      apex.message.showErrors([{ type: 'error', message: 'Tạo thất bại: ' + (xhr.responseText || 'Lỗi kết nối') }]);
    });
  }

  // ── Init (gọi 1 lần từ "Execute when Page Loads") ─────────────────────
  function csInit() {
    var root = document.getElementById('chat-root');
    if (root) root.classList.toggle('with-info', showInfo);
    updateTypeDD();
    loadConvList();
    loadInfo();
  }

  // ── Public API (cho Dynamic Actions + Execute-on-load gọi ngoài IIFE) ──
  window.csInit            = csInit;
  window.csOnTypeDdToggle  = csOnTypeDdToggle;
  window.csOnTypeMenuSelect= csOnTypeMenuSelect;
  window.csOnQuickChip     = csOnQuickChip;
  window.csOnConvoMenuOpen = csOnConvoMenuOpen;
  window.csOnConvoMenuItem = csOnConvoMenuItem;
  window.csOnConvClick     = csOnConvClick;
  window.csOnSearchInput   = csOnSearchInput;
  window.csOnReplyStart    = csOnReplyStart;
  window.csOnReplyCancel   = csOnReplyCancel;
  window.csOnSend          = csOnSend;
  window.csOnMsgKeydown    = csOnMsgKeydown;
  window.csOnMsgAutosize   = csOnMsgAutosize;
  window.csOnToggleInfo    = csOnToggleInfo;
  window.csOnOpenDM        = csOnOpenDM;
  window.csOnOpenGroup     = csOnOpenGroup;
  window.csOnCloseCompose  = csOnCloseCompose;
  window.csOnTypeTab       = csOnTypeTab;
  window.csOnMemberToggle  = csOnMemberToggle;
  window.csOnChipRemove    = csOnChipRemove;
  window.csOnCreateNameInput = csOnCreateNameInput;
  window.csOnContactSearch = csOnContactSearch;
  window.csOnSubmitCreate  = csOnSubmitCreate;
  // Giữ tương thích tên cũ
  window.csSelectConv  = selectConv;
  window.csOpenCompose = openCompose;
  window.csSendMessage = sendMessage;

})(apex.jQuery);
