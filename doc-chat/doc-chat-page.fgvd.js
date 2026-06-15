/* Doc Chat — Function and Global Variable Declaration (FGVD)
 * Page 10022710201 — Paste TOÀN BỘ file này vào:
 *   Page → JavaScript → "Function and Global Variable Declaration".
 *
 * Nexus redesign — class names MỚI, slider lpGoTo(), contenteditable input.
 * Xem docs/da-setup.md để biết 19 DA + HTML IDs cần có trên APEX page.
 */
window.CHAT_AUS_ID = &G_AUS_ID.;
var pageId = $v('pFlowStepId');

(function($) {
  'use strict';

  var PAGE_ID         = 10022710201;
  var AUS_ID          = Number(window.CHAT_AUS_ID || 0);
  var activeConvId    = null;
  var activeFilter    = 'ALL';
  var showInfo        = true;
  var typingUsers     = {};
  var typingTimers    = {};
  var selectedMembers = {};
  var isSending       = false;
  var lastSentAt      = 0;
  var typingDebounce;
  var convSearchTimer;
  var msgSearchTimer;

  // Cross-frame event: global.js (trang cha) trigger apex:chatEvent trên parent document
  // bằng jQuery của trang cha. jQuery custom event không vượt 2 instance → phải bind đúng.
  var inIframe  = (window.parent && window.parent !== window);
  var eventWin  = inIframe ? window.parent : window;
  var $evt      = (eventWin.apex && eventWin.apex.jQuery) ? eventWin.apex.jQuery : $;
  var $eventDoc = $evt(eventWin.document);

  // ── Slider ───────────────────────────────────────────────────────────────────
  // S0=#lp-s1 (conv list), S1=#lp-s2 (DM picker), S2=#lp-s3 (group members), S3=#lp-s4 (group info)

  var LP_W = 268;
  function lpGoTo(n) {
    var track = document.getElementById('lp-track');
    if (track) track.style.transform = 'translateX(-' + (n * LP_W) + 'px)';
  }

  // ── APEX helpers ─────────────────────────────────────────────────────────────

  function dcHtml(proc, params, targetId, onDone) {
    apex.server.process(proc, params, {
      pageId:   PAGE_ID,
      dataType: 'text',
      success:  function(html) {
        var el = document.getElementById(targetId);
        if (el) el.innerHTML = html;
        if (onDone) onDone();
      },
      error: function(xhr) {
        console.error('[DocChat]', proc, xhr.responseText);
      }
    });
  }

  function dcJson(proc, params, onSuccess, onError) {
    apex.server.process(proc, params, {
      pageId:   PAGE_ID,
      dataType: 'json',
      success:  onSuccess || function() {},
      error:    onError || function(xhr) {
        console.error('[DocChat]', proc, xhr.responseText);
      }
    });
  }

  // ── Data loaders ─────────────────────────────────────────────────────────────

  function loadConvList(onDone) {
    dcHtml('dcConvListHtml', {
      x01: $v('P' + pageId + '_DOC_TYPE'),
      x02: $v('P' + pageId + '_DOC_NO'),
      x03: activeFilter,
      x04: $v('P' + pageId + '_SEARCH_QUERY') || ''
    }, 'lp-conv-list', onDone);
  }

  function loadThread() {
    if (!activeConvId) {
      var el = document.getElementById('dc-messages');
      if (el) el.innerHTML =
        '<div style="text-align:center;color:var(--n-400);margin-top:60px;font-size:13px">← Chọn hội thoại</div>';
      return;
    }
    var searchInput = document.getElementById('dc-msg-search-input');
    dcHtml('dcMsgThreadHtml', {
      x01: String(activeConvId),
      x02: searchInput ? searchInput.value : ''
    }, 'dc-messages', function() { setTimeout(scrollToBottom, 300); });
  }

  function loadInfo() {
    if (!showInfo) return;
    dcHtml('dcInfoHtml', { x01: activeConvId ? String(activeConvId) : '' }, 'dc-right-panel', injectDocFields);
  }

  function loadContacts(targetId, format, onDone) {
    dcHtml('dcContactsHtml', { x01: format || 'GROUP' }, targetId, onDone);
  }

  // ── Scroll ───────────────────────────────────────────────────────────────────

  function scrollToBottom() {
    var el = document.getElementById('dc-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  // ── Doc fields from sessionStorage → patch right panel after dcInfoHtml load ─

  function injectDocFields() {
    var ctx = {};
    try { ctx = JSON.parse(sessionStorage.getItem('docChatCtx') || '{}'); } catch(e) {}

    var elNo     = document.getElementById('dc-doc-no');
    var elStatus = document.getElementById('dc-doc-status');
    var elLabel  = document.getElementById('dc-doc-label');
    var elTotal  = document.getElementById('dc-doc-total');
    var elFields = document.getElementById('dc-doc-fields-placeholder');

    if (elNo     && ctx.doc_no)     elNo.textContent     = ctx.doc_no;
    if (elStatus && ctx.doc_status) elStatus.textContent = ctx.doc_status;
    if (elLabel  && ctx.doc_label)  elLabel.textContent  = ctx.doc_label;
    if (elTotal  && ctx.doc_total)  elTotal.textContent  = ctx.doc_total;

    if (elFields) {
      var fields = ctx.doc_fields || [];
      if (!fields.length) { elFields.innerHTML = ''; return; }
      var html = '';
      fields.forEach(function(f) {
        html += '<div class="dc-voucher-row">'
              + '<span class="k">' + escHtml(f[0]) + '</span>'
              + '<span class="v">' + escHtml(f[1]) + '</span>'
              + '</div>';
      });
      elFields.innerHTML = html;
    }
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Select conversation ───────────────────────────────────────────────────────

  function selectConv(convId) {
    convId = Number(convId);
    if (convId === activeConvId) return;
    activeConvId = convId;
    $s('P' + pageId + '_CONV_ID', String(convId));
    $s('P' + pageId + '_REPLY_TO_MSG_ID', '');

    // Active state
    $('.dc-conv-item').removeClass('dc-conv-active');
    var $item = $('.dc-conv-item[data-conv-id="' + convId + '"]');
    $item.addClass('dc-conv-active');

    // Update chat header name
    var name = $item.find('.dc-conv-name').text();
    var headerName = document.querySelector('.dc-header-name');
    if (headerName) headerName.textContent = name;

    // Clone avatar into header
    var $srcAv = $item.find('.dc-av').first();
    var headerAv = document.querySelector('.dc-header-avatar');
    if (headerAv && $srcAv.length) {
      headerAv.className = 'dc-header-avatar ' + ($srcAv.attr('class') || '').replace('dc-av', '').trim();
      headerAv.setAttribute('style', $srcAv.attr('style') || '');
      headerAv.innerHTML = $srcAv.html();
    }

    // Show composer + header action buttons (hidden until first conv)
    var composerWrap = document.getElementById('dc-composer-wrap');
    if (composerWrap) composerWrap.style.display = '';
    var searchBtn = document.getElementById('dc-btn-search-toggle');
    if (searchBtn) searchBtn.style.display = '';
    var rpBtn = document.getElementById('dc-btn-toggle-rp');
    if (rpBtn) rpBtn.style.display = '';

    // Clear reply preview
    var rp = document.getElementById('dc-reply-preview');
    if (rp) rp.classList.remove('rp-active');

    loadThread();
    loadInfo();
    dcJson('docChatRead', { x01: String(convId) });

    $item.removeClass('unread').find('.dc-conv-badge').remove();
  }

  // ── Send message ─────────────────────────────────────────────────────────────

  function sendMessage() {
    if (isSending) return;
    var input  = document.getElementById('dc-chat-input');
    var body   = input ? (input.innerText || input.textContent || '').trim() : '';
    var replyId = $v('P' + pageId + '_REPLY_TO_MSG_ID') || '';
    var partner = $('.dc-conv-item[data-conv-id="' + activeConvId + '"]').data('partner-aus-id') || '';

    if (!body || !activeConvId) return;

    isSending  = true;
    lastSentAt = Date.now();
    if (input) input.textContent = '';
    $s('P' + pageId + '_REPLY_TO_MSG_ID', '');
    var rp = document.getElementById('dc-reply-preview');
    if (rp) rp.classList.remove('rp-active');

    dcJson('docChatSend', {
      x01: String(activeConvId),
      x02: body,
      x03: replyId,
      x04: String(partner)
    }, function(data) {
      isSending = false;
      if (data && data.error) {
        apex.message.showErrors([{ type: 'error', message: 'Gửi thất bại: ' + data.error }]);
        console.error('[DocChat] docChatSend error:', data.error);
        return;
      }
      loadThread();
      loadConvList();
    }, function(xhr) {
      isSending = false;
      apex.message.showErrors([{ type: 'error', message: 'Gửi thất bại: ' + (xhr.responseText || 'Lỗi kết nối') }]);
    });
  }

  // ── Typing ───────────────────────────────────────────────────────────────────

  function onMsgInput() {
    if (!activeConvId) return;
    clearTimeout(typingDebounce);
    typingDebounce = setTimeout(function() {
      dcJson('docChatTyping', { x01: String(activeConvId) });
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
    var el     = document.getElementById('dc-typing-row');
    var elText = document.querySelector('#dc-typing-row .dc-typing-label');
    if (!el) return;
    if (!names.length) { el.style.display = 'none'; return; }
    if (elText) elText.textContent = names.slice(0, 2).join(', ') + ' đang gõ';
    el.style.display = 'flex';
  }

  // ── Seen indicator ───────────────────────────────────────────────────────────

  function showSeen() {
    var box = document.getElementById('dc-messages');
    if (!box) return;
    var old = box.querySelector('.msg-seen');
    if (old) old.remove();
    var mine = box.querySelectorAll('.message-group.msg-me-wrap');
    if (!mine.length) return;
    var lastInner = mine[mine.length - 1].querySelector('.msg-me-inner');
    if (!lastInner) return;
    var tag = document.createElement('div');
    tag.className = 'msg-seen';
    tag.textContent = '✓ Đã xem';
    lastInner.appendChild(tag);
  }

  // ── Real-time events ─────────────────────────────────────────────────────────
  // Bind ở FGVD (không phải DA): cần payload từ trigger + cleanup khi iframe unload.

  function onChatEvent(_, ev) {
    if (ev.type === 'message') {
      loadConvList();
      if (String(ev.conv_id) === String(activeConvId)) {
        if ((Date.now() - lastSentAt) >= 3000) loadThread();
        dcJson('docChatRead', { x01: String(activeConvId) });
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
  $(window).on('unload', function() {
    $eventDoc.off('apex:chatEvent', onChatEvent);
  });

  // ── Create conversation: chips + member toggle ────────────────────────────────

  function renderChips() {
    var $chips   = $('#lp-s3-chips');
    var count    = Object.keys(selectedMembers).length;
    var countEl  = document.querySelector('.lp-gm-count');
    var s4Count  = document.querySelector('.lp-gi-members-bar span');
    var nextBtn  = document.querySelector('.lp-gm-next');

    if (countEl) countEl.textContent = 'Đã chọn ' + count;
    if (s4Count) s4Count.textContent = count + ' thành viên được chọn';
    if (nextBtn) nextBtn.classList.toggle('lp-gm-ok', count > 0);

    if (!$chips.length) return;
    if (!count) { $chips.html(''); return; }

    var html = '';
    Object.keys(selectedMembers).forEach(function(ausId) {
      var m     = selectedMembers[ausId];
      var initl = m.name.trim().split(/\s+/).slice(-1)[0][0].toUpperCase();
      html += '<div class="lp-gc">'
            + '<div class="lp-gc-av" style="background:hsl(' + m.hue + ',55%,52%)">' + initl + '</div>'
            + '<span>' + escHtml(m.name.trim().split(/\s+/).slice(-1)[0]) + '</span>'
            + '<button type="button" class="lp-gc-x" data-chip-id="' + ausId + '">'
            + '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">'
            + '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
            + '</button></div>';
    });
    $chips.html(html);
  }

  function toggleMember(item) {
    var $item  = $(item).closest('.gm-row');
    var ausId  = String($item.data('aus-id'));
    var name   = String($item.data('name') || '');
    var hue    = String($item.data('hue')  || '0');
    var img    = String($item.data('img')  || '');

    if ($item.hasClass('gm-sel')) {
      $item.removeClass('gm-sel');
      delete selectedMembers[ausId];
    } else {
      $item.addClass('gm-sel');
      selectedMembers[ausId] = { name: name, hue: hue, img: img };
    }
    renderChips();
  }

  // ── Compose: open / close via slider ─────────────────────────────────────────

  function openCompose(convType) {
    selectedMembers = {};
    renderChips();
    if (convType === 'DM') {
      lpGoTo(1);
      loadContacts('lp-s2-list', 'DM');
    } else {
      lpGoTo(2);
      loadContacts('lp-s3-list', 'GROUP');
    }
  }

  function closeCompose() {
    lpGoTo(0);
    selectedMembers = {};
    renderChips();
  }

  function injectCreateContext() {
    var docType = $v('P' + pageId + '_DOC_TYPE');
    var docNo   = $v('P' + pageId + '_DOC_NO');
    var nameEl  = document.getElementById('lp-gname');
    if (nameEl && !nameEl.value && docType && docNo) {
      nameEl.value = docType + ' - ' + docNo;
      updateGroupAvatar();
    }
  }

  function updateGroupAvatar() {
    var nameEl = document.getElementById('lp-gname');
    var name   = nameEl ? nameEl.value.trim() : '';
    var av     = document.getElementById('lp-gi-av');
    var ini    = document.getElementById('lp-av-initials');
    var btn    = document.getElementById('lp-create-btn');
    if (!av) return;
    if (name) {
      if (ini) { ini.textContent = name.substring(0, 2).toUpperCase(); ini.style.display = 'flex'; }
      av.style.background = 'var(--c-main)';
      av.classList.remove('lp-av-empty');
      av.classList.add('lp-av-filled');
      var svg = av.querySelector('svg');
      if (svg) svg.style.display = 'none';
      if (btn) btn.disabled = false;
    } else {
      if (ini) ini.style.display = 'none';
      av.style.background = '';
      av.classList.add('lp-av-empty');
      av.classList.remove('lp-av-filled');
      var svg2 = av.querySelector('svg');
      if (svg2) svg2.style.display = '';
      if (btn) btn.disabled = true;
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  HANDLERS — gọi từ Dynamic Action (window.dcOn*)
  // ════════════════════════════════════════════════════════════════════════════

  // DA1 — Click .dc-conv-item[data-conv-id]
  function dcOnConvClick(el, ev) {
    var $item = $(el).closest('.dc-conv-item');
    selectConv($item.data('conv-id'));
  }

  // DA2 — Click .dc-filter-tab[data-filter]
  function dcOnFilter(el, ev) {
    activeFilter = $(el).data('filter');
    $('.dc-filter-tab').removeClass('active');
    $(el).addClass('active');
    loadConvList();
  }

  // DA3 — Custom input #dc-conv-search
  function dcOnConvSearch(el, ev) {
    var q = el.value;
    clearTimeout(convSearchTimer);
    convSearchTimer = setTimeout(function() {
      $s('P' + pageId + '_SEARCH_QUERY', q);
      loadConvList();
    }, 350);
  }

  // DA4 — Click search-toggle button (trong chat header)
  function dcOnSearchToggle(el, ev) {
    var bar = document.getElementById('dc-msg-search-bar');
    if (!bar) return;
    var isShown = bar.style.display !== 'none' && bar.style.display !== '';
    if (isShown) {
      bar.style.display = 'none';
      var inp = document.getElementById('dc-msg-search-input');
      if (inp) inp.value = '';
      loadThread();
    } else {
      bar.style.display = '';
      var inp2 = document.getElementById('dc-msg-search-input');
      if (inp2) inp2.focus();
    }
    $(el).toggleClass('active', !isShown);
  }

  // DA5 — Custom input #dc-msg-search-input
  function dcOnMsgSearch(el, ev) {
    clearTimeout(msgSearchTimer);
    msgSearchTimer = setTimeout(loadThread, 350);
  }

  // DA6 — Click info/member button trong chat header
  function dcOnToggleInfo(el, ev) {
    showInfo = !showInfo;
    var rp = document.getElementById('dc-right-panel');
    if (rp) rp.classList.toggle('collapsed', !showInfo);
    $(el).toggleClass('active', showInfo);
    if (showInfo) loadInfo();
  }

  // DA7 — Click .msg-action-btn[data-action="reply"]
  function dcOnReplyStart(el, ev) {
    if (ev) ev.stopPropagation();
    var $group  = $(el).closest('.message-group');
    var replyId = $group.data('msg-id') || '';
    var isMe    = $group.hasClass('msg-me-wrap');
    var sender  = isMe ? 'Tôi' : $group.find('.msg-sender').text().trim();
    var body    = $group.find('.msg-text, .msg-me-bubble').first().text().trim();

    $s('P' + pageId + '_REPLY_TO_MSG_ID', String(replyId));
    var rpSender = document.querySelector('#dc-reply-preview .dc-rp-sender');
    var rpText   = document.querySelector('#dc-reply-preview .dc-rp-text');
    if (rpSender) rpSender.textContent = sender;
    if (rpText)   rpText.textContent   = body.substring(0, 80);

    var rp = document.getElementById('dc-reply-preview');
    if (rp) rp.classList.add('rp-active');
    var input = document.getElementById('dc-chat-input');
    if (input) input.focus();
  }

  // DA8 — Click .dc-rp-close (nút × trong reply preview)
  function dcOnReplyCancel(el, ev) {
    $s('P' + pageId + '_REPLY_TO_MSG_ID', '');
    var rp = document.getElementById('dc-reply-preview');
    if (rp) rp.classList.remove('rp-active');
  }

  // DA9 — Click #dc-send-btn
  function dcOnSend(el, ev) { sendMessage(); }

  // DA10 — Keydown trên #dc-chat-input (contenteditable)
  // Enter gửi tin; Shift+Enter xuống dòng (default behavior)
  function dcOnMsgKeydown(el, ev) {
    if (ev && ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      sendMessage();
    } else {
      onMsgInput();
    }
  }

  // DA11 — No-op: contenteditable auto-resize qua CSS (min-height + max-height)
  function dcOnMsgAutosize(el, ev) {}

  // DA12 — Click .gm-row (chọn/bỏ thành viên trong S3)
  function dcOnMemberToggle(el, ev) { toggleMember(el); }

  // DA13 — Click .lp-gc-x (bỏ chip thành viên)
  function dcOnChipRemove(el, ev) {
    if (ev) ev.stopPropagation();
    var ausId = String($(el).closest('[data-chip-id]').data('chip-id') || $(el).data('chip-id'));
    delete selectedMembers[ausId];
    $('#lp-s3-list .gm-row[data-aus-id="' + ausId + '"]').removeClass('gm-sel');
    renderChips();
  }

  // DA14 — Custom input: search trong S2 (#lp-s2-search) hoặc S3 (#lp-s3-search)
  function dcOnContactSearch(el, ev) {
    var q      = el.value.toLowerCase().trim();
    var inS2   = $(el).closest('#lp-s2').length > 0;
    var listId = inS2 ? 'lp-s2-list' : 'lp-s3-list';
    var rowSel = inS2 ? '.lp-cr' : '.gm-row';

    $('#' + listId + ' ' + rowSel).each(function() {
      var name = ($(this).data('name') || '').toLowerCase();
      var dept = ($(this).data('dept') || '').toLowerCase();
      $(this).toggle(!q || name.indexOf(q) !== -1 || dept.indexOf(q) !== -1);
    });
    $('#' + listId + ' .lp-alpha').each(function() {
      var $h = $(this), any = false, $n = $h.next();
      while ($n.length && !$n.is('.lp-alpha')) {
        if ($n.is(':visible')) { any = true; break; }
        $n = $n.next();
      }
      $h.toggle(any);
    });
  }

  // DA15 — No-op: không còn radio conv-type trong Nexus flow
  function dcOnTypeTab(el, ev) {}

  // DA16 — Click nút pencil/compose trong S1 header → S2 (DM picker)
  function dcOnOpenDM(el, ev) { openCompose('DM'); }

  // DA17 — Click "Tạo nhóm" trong S2 → S3 (member picker)
  function dcOnGoToGroupMembers(el, ev) {
    lpGoTo(2);
    if (!document.querySelector('#lp-s3-list .gm-row')) {
      loadContacts('lp-s3-list', 'GROUP');
    }
  }

  // DA18 — Click "Tiếp theo" trong S3 → S4 (group info)
  function dcOnGroupNext(el, ev) {
    if (!Object.keys(selectedMembers).length) {
      apex.message.showErrors([{ type: 'error', message: 'Chọn ít nhất 1 thành viên' }]);
      return;
    }
    lpGoTo(3);
    injectCreateContext();
  }

  // DA: Back button trong S2 / S3 / S4 → về S0
  function dcOnCloseCompose(el, ev) { closeCompose(); }

  // DA: Back trong S3 → S2
  function dcOnGroupBack(el, ev) { lpGoTo(1); }

  // DA: Back trong S4 → S3
  function dcOnGroupInfoBack(el, ev) { lpGoTo(2); }

  // DA: Click .lp-cr (chọn người trong S2 → tạo DM ngay)
  function dcOnDMContactSelect(el, ev) {
    var $item = $(el).closest('.lp-cr');
    var ausId = $item.data('aus-id');
    var name  = String($item.data('name') || '');
    if (!ausId) return;

    dcJson('docChatCreate', {
      x01: 'DM',
      x02: name,
      x03: JSON.stringify([Number(ausId)]),
      x04: $v('P' + pageId + '_DOC_TYPE'),
      x05: $v('P' + pageId + '_DOC_NO')
    }, function(data) {
      if (data && data.error) {
        apex.message.showErrors([{ type: 'error', message: 'Tạo thất bại: ' + data.error }]);
        return;
      }
      closeCompose();
      if (data && data.conv_id) {
        loadConvList(function() { selectConv(data.conv_id); });
      }
    }, function(xhr) {
      apex.message.showErrors([{ type: 'error', message: 'Tạo thất bại: ' + (xhr.responseText || 'Lỗi kết nối') }]);
    });
  }

  // DA19 — Click #lp-create-btn trong S4 (tạo nhóm)
  function dcOnSubmitCreate(el, ev) {
    var $btn = $(el);
    if ($btn.prop('disabled') || $btn.data('submitting')) return;

    var nameEl  = document.getElementById('lp-gname');
    var name    = nameEl ? nameEl.value.trim() : '';
    var members = Object.keys(selectedMembers).map(Number);

    if (!members.length) {
      apex.message.showErrors([{ type: 'error', message: 'Chọn ít nhất 1 thành viên' }]);
      return;
    }
    if (!name) {
      var docType = $v('P' + pageId + '_DOC_TYPE');
      var docNo   = $v('P' + pageId + '_DOC_NO');
      name = (docType && docNo) ? docType + ' - ' + docNo : 'Nhóm mới';
      if (nameEl) nameEl.value = name;
    }

    $btn.data('submitting', true).prop('disabled', true);

    dcJson('docChatCreate', {
      x01: 'CHANNEL',
      x02: name,
      x03: JSON.stringify(members),
      x04: $v('P' + pageId + '_DOC_TYPE'),
      x05: $v('P' + pageId + '_DOC_NO')
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

  // DA: Oninput #lp-gname → cập nhật group avatar preview
  function dcOnGroupNameInput(el, ev) { updateGroupAvatar(); }

  // ── Post-inject setup — wire listeners after HTML fragment injected ──────────

  function setupAfterInject() {
    // Emoji picker: close on click outside
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.dc-emoji-wrap')) {
        var picker = document.getElementById('dc-emoji-picker');
        if (picker) picker.classList.remove('open');
      }
    });

    // Emoji button: insert into contenteditable
    var emojiPicker = document.getElementById('dc-emoji-picker');
    if (emojiPicker) {
      emojiPicker.addEventListener('click', function(e) {
        var btn = e.target.closest('.dc-emoji-btn');
        if (!btn) return;
        var input = document.getElementById('dc-chat-input');
        if (input) { input.focus(); document.execCommand('insertText', false, btn.textContent); }
        emojiPicker.classList.remove('open');
      });
    }

    // Lightbox: close on backdrop click or Escape
    var lb = document.getElementById('dc-lightbox');
    if (lb) {
      lb.addEventListener('click', function(e) { if (e.target === lb) lb.classList.remove('open'); });
    }

    // Forward modal: close on backdrop click
    var fwd = document.getElementById('dc-forward-modal');
    if (fwd) {
      fwd.addEventListener('click', function(e) { if (e.target === fwd) fwd.classList.remove('open'); });
    }

    // Keyboard: Escape closes lightbox / forward modal
    document.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape') return;
      var lb2 = document.getElementById('dc-lightbox');
      if (lb2) lb2.classList.remove('open');
      var fwd2 = document.getElementById('dc-forward-modal');
      if (fwd2) fwd2.classList.remove('open');
    });

    // Jump button: show when scrolled up > 300px from bottom
    var msgEl = document.getElementById('dc-messages');
    if (msgEl) {
      msgEl.addEventListener('scroll', function() {
        var btn = document.getElementById('dc-jump-btn');
        if (!btn) return;
        var dist = msgEl.scrollHeight - msgEl.scrollTop - msgEl.clientHeight;
        btn.classList.toggle('visible', dist > 300);
        if (dist <= 60) {
          document.getElementById('dc-jump-badge').classList.remove('show');
        }
      });
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  function dcInit() {
    var ctx = {};
    try { ctx = JSON.parse(sessionStorage.getItem('docChatCtx') || '{}'); } catch(e) {}

    if (ctx.doc_type)   $s('P' + pageId + '_DOC_TYPE',   ctx.doc_type);
    if (ctx.doc_no)     $s('P' + pageId + '_DOC_NO',     ctx.doc_no);
    if (ctx.doc_label)  $s('P' + pageId + '_DOC_LABEL',  ctx.doc_label);
    if (ctx.doc_status) $s('P' + pageId + '_DOC_STATUS', ctx.doc_status);
    if (ctx.doc_total)  $s('P' + pageId + '_DOC_TOTAL',  ctx.doc_total);

    if (ctx.doc_label && ctx.doc_no) {
      var $title = apex.jQuery('.ui-dialog-title');
      if ($title.length) $title.text('Trao đổi — ' + ctx.doc_label + ': ' + ctx.doc_no);
    }

    // Fetch HTML fragment from Static Application Files, inject, then load data
    // apex.env.APP_IMAGES = path prefix to application-level static files
    var imgBase = (apex.env && apex.env.APP_IMAGES) ? apex.env.APP_IMAGES : '';
    var htmlUrl = imgBase + 'doc-chat.html';

    fetch(htmlUrl, { cache: 'force-cache' })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function(html) {
        var root = document.getElementById('doc-chat-root');
        if (root) root.innerHTML = html;
        setupAfterInject();
        loadConvList();
        loadInfo();
      })
      .catch(function(err) {
        console.error('[DocChat] Không tải được doc-chat.html:', err);
        var root = document.getElementById('doc-chat-root');
        if (root) root.innerHTML =
          '<div style="padding:32px;text-align:center;color:var(--n-400,#94A3B8);font-size:13px;">'
          + 'Không tải được giao diện. Vui lòng tải lại trang.<br>'
          + '<small style="opacity:.6">' + htmlUrl + '</small></div>';
      });
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  window.lpGoTo                = lpGoTo;
  window.dcInit                = dcInit;
  window.dcOnConvClick         = dcOnConvClick;
  window.dcOnFilter            = dcOnFilter;
  window.dcOnConvSearch        = dcOnConvSearch;
  window.dcOnSearchToggle      = dcOnSearchToggle;
  window.dcOnMsgSearch         = dcOnMsgSearch;
  window.dcOnToggleInfo        = dcOnToggleInfo;
  window.dcOnReplyStart        = dcOnReplyStart;
  window.dcOnReplyCancel       = dcOnReplyCancel;
  window.dcOnSend              = dcOnSend;
  window.dcOnMsgKeydown        = dcOnMsgKeydown;
  window.dcOnMsgAutosize       = dcOnMsgAutosize;
  window.dcOnMemberToggle      = dcOnMemberToggle;
  window.dcOnChipRemove        = dcOnChipRemove;
  window.dcOnContactSearch     = dcOnContactSearch;
  window.dcOnTypeTab           = dcOnTypeTab;
  window.dcOnOpenDM            = dcOnOpenDM;
  window.dcOnGoToGroupMembers  = dcOnGoToGroupMembers;
  window.dcOnGroupNext         = dcOnGroupNext;
  window.dcOnGroupInfoBack     = dcOnGroupInfoBack;
  window.dcOnCloseCompose      = dcOnCloseCompose;
  window.dcOnGroupBack         = dcOnGroupBack;
  window.dcOnDMContactSelect   = dcOnDMContactSelect;
  window.dcOnSubmitCreate      = dcOnSubmitCreate;
  window.dcOnGroupNameInput    = dcOnGroupNameInput;
  // Compatibility aliases
  window.dcOpenCompose  = openCompose;
  window.dcCloseCompose = closeCompose;
  window.dcLoadConvList = loadConvList;
  window.dcSelectConv   = selectConv;
  window.dcLoadThread   = loadThread;
  window.dcSendMessage  = sendMessage;

})(apex.jQuery);
