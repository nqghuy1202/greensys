/* CHAT HỆ THỐNG — Native APEX Page JavaScript
 * Paste vào "Execute when Page Loads" trên Messenger page
 * Yêu cầu trong "Function and Global Variable Declaration":
 *   var pageId = $v('pFlowStepId');
 * Và trong "Execute when Page Loads" (trước đoạn này):
 *   window.CHAT_AUS_ID = &G_AUS_ID.;
 */
(function($) {
  'use strict';

  var PAGE_ID         = Number(window.pageId || 0);
  var AUS_ID          = Number(window.CHAT_AUS_ID || 0);
  var activeConvId    = null;
  var activeTab       = 'all';   // all | dm | group | doc
  var activeQuick     = null;    // null | unread | pinned | mention
  var activeConvType  = 'DM';   // DM | CHANNEL — current compose mode
  var showInfo        = true;
  var isSending       = false;
  var lastSentAt      = 0;       // ms — suppress duplicate reload từ apex:chatEvent
  var typingUsers     = {};      // aus_id → name
  var typingTimers    = {};      // aus_id → timer handle
  var selectedMembers = {};      // aus_id → { name, hue }
  var replyToMsgId    = null;
  var replyToBody     = '';

  // Messenger là Normal page (cùng frame với global.js) nên nghe trực tiếp trên document của
  // chính nó là đúng — bình thường nhánh dưới = $(document) như cũ, KHÔNG đổi hành vi.
  // Dùng pattern parent-aware giống Doc Chat để PHÒNG khi về sau page bị nhúng iframe: lúc đó
  // phải bind bằng jQuery của window chứa global.js, không phải jQuery của iframe (jQuery custom
  // event không vượt 2 instance — xem mỏ neo A13 / REVIEW-realtime-flow).
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
    // After load: apply current mode (check vs radio)
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

    // Reset reply state
    replyToMsgId = null;
    replyToBody  = '';
    var replyBanner = document.getElementById('cs-reply-banner');
    if (replyBanner) replyBanner.style.display = 'none';
    $('#cs-composer').removeClass('with-reply');

    // Highlight sidebar item
    $('.convo-item').removeClass('active');
    $('.convo-item[data-conv-id="' + convId + '"]').addClass('active');

    // Show compose area
    var composeArea = document.getElementById('cs-compose-area');
    if (composeArea) composeArea.style.display = '';

    // Update thread header
    var $item = $('.convo-item[data-conv-id="' + convId + '"]');
    var name  = $item.find('.convo-name').text() || 'Hội thoại';
    var titleEl = document.getElementById('cs-thread-title');
    if (titleEl) titleEl.textContent = name;

    // Clone avatar to thread header
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

    // Clear unread badge in sidebar
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

  var typingDebounce;
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

  // Hiện "✓ Đã xem" dưới tin CUỐI CỦA MÌNH khi đối phương đọc (event 'read').
  // Client-side: thread HTML không render sẵn trạng thái seen nên chèn nhãn trực tiếp.
  // loadThread() reload sẽ xóa nhãn — đúng ý: gửi tin mới thì seen reset tới khi được đọc lại.
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
    // update selected state in menu
    $('#cs-type-menu .lp-type-menu-item').each(function() {
      $(this).toggleClass('selected', $(this).data('type') === activeTab);
    });
  }

  $(document).on('click', '#cs-type-dd', function(e) {
    e.stopPropagation();
    var menu = document.getElementById('cs-type-menu');
    var dd   = document.getElementById('cs-type-dd');
    if (!menu || !dd) return;
    var isOpen = menu.style.display !== 'none';
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
  });

  $(document).on('click', '#cs-type-menu .lp-type-menu-item', function(e) {
    e.stopPropagation();
    activeTab = $(this).data('type');
    document.getElementById('cs-type-menu').style.display = 'none';
    $('#cs-type-dd').removeClass('open');
    updateTypeDD();
    loadConvList();
  });

  // Close dropdown on outside click
  $(document).on('click', function() {
    var menu = document.getElementById('cs-type-menu');
    if (menu) { menu.style.display = 'none'; $('#cs-type-dd').removeClass('open'); }
  });

  // ── Filter row — quick chips ──────────────────────────────────────────

  $(document).on('click', '.lp-quick-chip[data-quick]', function() {
    var q = $(this).data('quick');
    activeQuick = (activeQuick === q) ? null : q;
    $('.lp-quick-chip').removeClass('active');
    if (activeQuick) $('[data-quick="' + activeQuick + '"]').addClass('active');
    loadConvList();
  });

  // ── Conversation selection ────────────────────────────────────────────

  $(document).on('click', '.convo-item[data-conv-id]', function() {
    selectConv($(this).data('conv-id'));
  });

  // ── Sidebar search ────────────────────────────────────────────────────

  var searchTimer;
  $(document).on('input', '#cs-search', function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadConvList, 350);
  });

  // ── Reply ─────────────────────────────────────────────────────────────

  $(document).on('click', '.msg-hover-action[data-reply-id]', function(e) {
    e.stopPropagation();
    replyToMsgId = $(this).data('reply-id');
    replyToBody  = String($(this).data('reply-body') || '').substring(0, 80);
    var prevEl = document.getElementById('cs-reply-preview');
    if (prevEl) prevEl.textContent = replyToBody;
    var banner = document.getElementById('cs-reply-banner');
    if (banner) banner.style.display = 'flex';
    $('#cs-composer').addClass('with-reply');
    var inp = document.getElementById('cs-msg-input');
    if (inp) inp.focus();
  });

  $(document).on('click', '#cs-reply-cancel', function() {
    replyToMsgId = null;
    replyToBody  = '';
    var banner = document.getElementById('cs-reply-banner');
    if (banner) banner.style.display = 'none';
    $('#cs-composer').removeClass('with-reply');
  });

  // ── Send (button + Ctrl+Enter) ────────────────────────────────────────

  $(document).on('click', '#cs-btn-send', sendMessage);

  $(document).on('keydown', '#cs-msg-input', function(e) {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); sendMessage(); }
    else onMsgInput();
  });

  $(document).on('input', '#cs-msg-input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // ── Info panel toggle ─────────────────────────────────────────────────

  $(document).on('click', '#cs-btn-info', function() {
    showInfo = !showInfo;
    var root = document.getElementById('chat-root');
    if (root) root.classList.toggle('with-info', showInfo);
    $(this).toggleClass('active', showInfo);
    if (showInfo) loadInfo();
  });

  // ── Compose modal ─────────────────────────────────────────────────────

  function updateEmpItemMode() {
    // Switch check/radio indicator based on conv type
    var isDM = activeConvType === 'DM';
    $('#cs-member-suggest-list .emp-item .check').each(function() {
      $(this).toggleClass('radio', isDM).toggleClass('check', !isDM);
      this.className = isDM ? 'radio' : 'check';
    });
  }

  function setComposeType(convType) {
    activeConvType = convType;
    // Update tabs
    $('.emp-type-tab').removeClass('active');
    $('.emp-type-tab[data-conv-type="' + convType + '"]').addClass('active');
    // Show/hide group-only fields
    var groupFields = document.getElementById('cs-group-fields');
    if (groupFields) groupFields.style.display = convType === 'CHANNEL' ? 'flex' : 'none';
    // Update footer button
    var labelEl = document.getElementById('cs-create-label');
    var iconEl  = document.getElementById('cs-create-icon');
    if (labelEl) labelEl.textContent = convType === 'CHANNEL' ? 'Tạo nhóm' : 'Bắt đầu trao đổi';
    if (iconEl)  iconEl.className    = convType === 'CHANNEL' ? 'fa fa-plus' : 'fa fa-paper-plane';
    // DM: keep max 1 member
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
    // Update footer status
    var statusEl = document.getElementById('cs-selected-status');
    if (statusEl) {
      if (!count) statusEl.textContent = activeConvType === 'DM' ? 'Chưa chọn ai' : 'Chọn ít nhất 1 thành viên';
      else if (activeConvType === 'DM') {
        var m0 = Object.values(selectedMembers)[0];
        statusEl.textContent = 'Đã chọn: ' + (m0 ? m0.name : '');
      } else statusEl.textContent = count + ' thành viên';
    }
    // Update create button label (kèm số đếm cho nhóm) + state
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
            + '<span class="av" style="background:hsl(' + m.hue + ',55%,52%)">' + initl + '</span>'
            + escHtml(m.name)
            + '<span class="x" data-chip-id="' + ausId + '">×</span>'
            + '</span>';
    });
    $chips.html(html);
  }

  function openCompose(convType) {
    activeConvType  = convType || 'DM';
    selectedMembers = {};
    // Inline screen-swap (giống doc-chat): ẩn list-screen, hiện compose-screen
    var listScreen    = document.getElementById('cs-list-screen');
    var composeScreen = document.getElementById('cs-compose-screen');
    if (listScreen)    listScreen.style.display    = 'none';
    if (composeScreen) composeScreen.style.display = 'flex';
    // Tiêu đề theo loại
    var titleEl = document.getElementById('cs-compose-title');
    if (titleEl) titleEl.textContent = activeConvType === 'CHANNEL' ? 'Tạo nhóm mới' : 'Nhắn tin mới';
    // Reset form
    var searchEl = document.getElementById('cs-contact-search');
    if (searchEl) searchEl.value = '';
    var nameEl = document.getElementById('cs-create-name');
    if (nameEl) nameEl.value = '';
    setComposeType(activeConvType);
    renderChips();
    // Load employee list
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

  // 2 nút riêng (giống doc-chat): "Nhắn tin" → DM, "Tạo nhóm" → CHANNEL.
  // #cs-btn-compose giữ lại cho tương thích — mở chế độ DM.
  $(document).on('click', '#cs-btn-dm, #cs-btn-compose', function() { openCompose('DM'); });
  $(document).on('click', '#cs-btn-group',               function() { openCompose('CHANNEL'); });
  $(document).on('click', '#cs-compose-back, #cs-compose-close, #cs-compose-cancel', closeCompose);

  // Type tab switch
  $(document).on('click', '.emp-type-tab[data-conv-type]', function() {
    setComposeType($(this).data('conv-type'));
  });

  // ── Member selection ──────────────────────────────────────────────────

  $(document).on('click', '#cs-member-suggest-list .emp-item', function() {
    var $item = $(this);
    var ausId = String($item.data('aus-id'));
    var name  = String($item.data('name') || '');
    var hue   = String($item.data('hue')  || '0');

    if ($item.hasClass('selected')) {
      $item.removeClass('selected');
      delete selectedMembers[ausId];
    } else {
      if (activeConvType === 'DM') {
        $('#cs-member-suggest-list .emp-item.selected').removeClass('selected');
        selectedMembers = {};
      }
      $item.addClass('selected');
      selectedMembers[ausId] = { name: name, hue: hue };
    }
    renderChips();
  });

  $(document).on('click', '.emp-chip .x', function(e) {
    e.stopPropagation();
    var ausId = String($(this).data('chip-id'));
    delete selectedMembers[ausId];
    $('#cs-member-suggest-list .emp-item[data-aus-id="' + ausId + '"]').removeClass('selected');
    renderChips();
  });

  // Group name change → update button state
  $(document).on('input', '#cs-create-name', renderChips);

  // Contact search filter
  $(document).on('input', '#cs-contact-search', function() {
    var q = (this.value || '').toLowerCase().trim();
    $('#cs-member-suggest-list .emp-item').each(function() {
      var name = ($(this).data('name') || '').toLowerCase();
      var dept = ($(this).data('dept') || '').toLowerCase();
      $(this).toggle(!q || name.indexOf(q) !== -1 || dept.indexOf(q) !== -1);
    });
    // Hide dept headers when all items in section are hidden
    $('#cs-member-suggest-list [data-dept-header]').each(function() {
      var $h = $(this), any = false, $n = $h.next();
      while ($n.length && !$n.is('[data-dept-header]')) {
        if ($n.is(':visible')) { any = true; break; }
        $n = $n.next();
      }
      $h.toggle(any);
    });
  });

  // ── Submit create conversation ────────────────────────────────────────

  $(document).on('click', '#cs-btn-create', function() {
    var $btn = $(this);
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
  });

  // ── Public API (cho Dynamic Actions gọi ngoài IIFE) ───────────────────

  window.csSelectConv  = selectConv;
  window.csOpenCompose = openCompose;
  window.csSendMessage = sendMessage;

  // ── Init ──────────────────────────────────────────────────────────────

  $(document).ready(function() {
    // Sync info panel state to CSS
    var root = document.getElementById('chat-root');
    if (root) root.classList.toggle('with-info', showInfo);

    loadConvList();
    loadInfo();
  });

})(apex.jQuery);
