/* Doc Chat — Native APEX Page JavaScript
 * Page 10022710201 — Paste vào "Execute when Page Loads"
 * Không React, không Babel, không Static Files.
 *
 * Yêu cầu trong "Function and Global Variable Declaration":
 *   var pageId = $v('pFlowStepId');
 *
 * Items đặt tên theo P${pageId}_ITEM_NAME (ví dụ: P10022710201_CONV_ID).
 * pageId được dùng trực tiếp ở đây: $v('P' + pageId + '_CONV_ID')
 */
(function($) {
  'use strict';

  var PAGE_ID         = 10022710201;
  var AUS_ID          = Number(window.CHAT_AUS_ID || 0);
  var activeConvId    = null;
  var showInfo        = true;
  var typingUsers     = {};   // aus_id → name
  var typingTimers    = {};   // aus_id → timer handle
  var selectedMembers = {};   // aus_id → { name, hue } — create dialog state

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

  // ── Data loaders ──────────────────────────────────────────────────────────────

  function loadConvList(onDone) {
    dcHtml('dcConvListHtml', {
      x01: $v('P' + pageId + '_DOC_TYPE'),
      x02: $v('P' + pageId + '_DOC_NO'),
      x03: $v('P' + pageId + '_CONV_FILTER') || 'ALL',
      x04: $v('P' + pageId + '_SEARCH_QUERY') || ''
    }, 'dc-conv-list', onDone);
  }

  function loadThread() {
    if (!activeConvId) {
      var el = document.getElementById('dc-messages');
      if (el) el.innerHTML =
        '<div style="text-align:center;color:var(--text-3);margin-top:60px;font-size:13px">← Chọn hội thoại</div>';
      return;
    }
    var searchInput = document.getElementById('dc-msg-search-input');
    dcHtml('dcMsgThreadHtml', {
      x01: String(activeConvId),
      x02: searchInput ? searchInput.value : ''
    }, 'dc-messages', scrollToBottom);
  }

  function loadInfo() {
    if (!showInfo) return;
    dcHtml('dcInfoHtml', { x01: activeConvId ? String(activeConvId) : '' }, 'dc-info', injectDocFields);
  }

  function loadContacts(onDone) {
    dcHtml('dcContactsHtml', {}, 'dc-create-content', onDone);
  }

  // ── Scroll to bottom ──────────────────────────────────────────────────────────

  function scrollToBottom() {
    var el = document.getElementById('dc-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }

  // ── Doc fields from sessionStorage ────────────────────────────────────────────

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
        html += '<div class="doc-summary-row">'
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

  // ── Select conversation ────────────────────────────────────────────────────────

  function selectConv(convId) {
    convId = Number(convId);
    if (convId === activeConvId) return;
    activeConvId = convId;
    $v('P' + pageId + '_CONV_ID', String(convId));
    $v('P' + pageId + '_REPLY_TO_MSG_ID', '');

    // Highlight active item
    $('.convo-item').removeClass('active');
    $('.convo-item[data-conv-id="' + convId + '"]').addClass('active');

    // Show compose + action buttons
    document.getElementById('dc-compose-area').style.display = '';
    document.getElementById('dc-btn-search-toggle').style.display = '';
    document.getElementById('dc-btn-info').style.display = '';

    // Clear reply bar
    document.getElementById('dc-reply-banner').style.display = 'none';
    $('#dc-composer').removeClass('with-reply');

    // Update thread header
    var name = $('.convo-item[data-conv-id="' + convId + '"] .convo-name').text();
    document.getElementById('dc-chat-head-title').textContent = name;

    loadThread();
    loadInfo();
    dcJson('docChatRead', { x01: String(convId) });

    // Clear unread in conv list
    $('.convo-item[data-conv-id="' + convId + '"]').removeClass('unread').find('.convo-badge').remove();
  }

  // ── Send message ───────────────────────────────────────────────────────────────

  function sendMessage() {
    var input   = document.getElementById('dc-msg-input');
    var body    = (input.value || '').trim();
    var replyId = $v('P' + pageId + '_REPLY_TO_MSG_ID') || '';
    var partner = $('.convo-item[data-conv-id="' + activeConvId + '"]').data('partner-aus-id') || '';

    if (!body || !activeConvId) return;

    input.value = '';
    $v('P' + pageId + '_REPLY_TO_MSG_ID', '');
    document.getElementById('dc-reply-banner').style.display = 'none';
    $('#dc-composer').removeClass('with-reply');

    dcJson('docChatSend', {
      x01: String(activeConvId),
      x02: body,
      x03: replyId,
      x04: String(partner)
    }, function(data) {
      if (data && data.error) {
        apex.message.showErrors([{ type: 'error', message: 'Gửi thất bại: ' + data.error }]);
        console.error('[DocChat] docChatSend error:', data.error);
        return;
      }
      loadThread();
      loadConvList();
    }, function(xhr) {
      var msg = xhr.responseText || 'Lỗi kết nối';
      apex.message.showErrors([{ type: 'error', message: 'Gửi thất bại: ' + msg }]);
      console.error('[DocChat] docChatSend xhr error:', msg);
    });
  }

  // ── Typing ─────────────────────────────────────────────────────────────────────

  var typingDebounce;
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
    var names = Object.values(typingUsers);
    var el = document.getElementById('dc-typing');
    var elText = document.getElementById('dc-typing-text');
    if (!el) return;
    if (!names.length) { el.style.display = 'none'; return; }
    if (elText) elText.textContent = names.slice(0, 2).join(', ') + ' đang nhập...';
    el.style.display = 'flex';
  }

  // ── Real-time events from global.js ───────────────────────────────────────────

  $(document).on('apex:chatEvent', function(_, ev) {
    if (ev.type === 'message') {
      loadConvList();
      if (String(ev.conv_id) === String(activeConvId)) {
        loadThread();
        dcJson('docChatRead', { x01: String(activeConvId) });
      }
    } else if (ev.type === 'typing') {
      if (Number(ev.aus_id) !== AUS_ID && String(ev.conv_id) === String(activeConvId)) {
        showTyping(ev.aus_id, ev.name);
      }
    } else if (ev.type === 'typing_stop') {
      if (String(ev.conv_id) === String(activeConvId)) hideTyping(ev.aus_id);
    }
  });

  // ── Event bindings (delegated — content is dynamically loaded) ────────────────

  // Conversation selection
  $(document).on('click', '.convo-item[data-conv-id]', function() {
    selectConv($(this).data('conv-id'));
  });

  // Filter tabs
  $(document).on('click', '.convo-tab[data-filter]', function() {
    $v('P' + pageId + '_CONV_FILTER', $(this).data('filter'));
    loadConvList();
  });

  // Conversation search (debounced)
  var convSearchTimer;
  $(document).on('input', '#dc-conv-search', function() {
    var q = this.value;
    clearTimeout(convSearchTimer);
    convSearchTimer = setTimeout(function() {
      $v('P' + pageId + '_SEARCH_QUERY', q);
      loadConvList();
    }, 350);
  });

  // Toggle message search bar
  $(document).on('click', '#dc-btn-search-toggle', function() {
    var bar = document.getElementById('dc-msg-search-bar');
    if (bar.style.display !== 'none') {
      bar.style.display = 'none';
      document.getElementById('dc-msg-search-input').value = '';
      loadThread();
    } else {
      bar.style.display = 'block';
      document.getElementById('dc-msg-search-input').focus();
    }
    $(this).toggleClass('active');
  });

  // Message search (debounced)
  var msgSearchTimer;
  $(document).on('input', '#dc-msg-search-input', function() {
    clearTimeout(msgSearchTimer);
    msgSearchTimer = setTimeout(loadThread, 350);
  });

  // Toggle info panel
  $(document).on('click', '#dc-btn-info', function() {
    showInfo = !showInfo;
    $('#dc-body').toggleClass('with-info', showInfo);
    var pane = document.getElementById('dc-info-pane');
    if (pane) pane.style.display = showInfo ? '' : 'none';
    $(this).toggleClass('active', showInfo);
    if (showInfo) loadInfo();
  });

  // Reply to message
  $(document).on('click', '.msg-hover-action[data-reply-id]', function(e) {
    e.stopPropagation();
    $v('P' + pageId + '_REPLY_TO_MSG_ID', String($(this).data('reply-id')));
    document.getElementById('dc-reply-preview').textContent = ($(this).data('reply-body') || '').substring(0, 80);
    document.getElementById('dc-reply-banner').style.display = 'flex';
    $('#dc-composer').addClass('with-reply');
    document.getElementById('dc-msg-input').focus();
  });

  // Cancel reply
  $(document).on('click', '#dc-reply-cancel', function() {
    $v('P' + pageId + '_REPLY_TO_MSG_ID', '');
    document.getElementById('dc-reply-banner').style.display = 'none';
    $('#dc-composer').removeClass('with-reply');
  });

  // Send button + Ctrl+Enter
  $(document).on('click', '#dc-btn-send', sendMessage);
  $(document).on('keydown', '#dc-msg-input', function(e) {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); sendMessage(); }
    else onMsgInput();
  });

  // Auto-resize textarea
  $(document).on('input', '#dc-msg-input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // ── Create conversation dialog ────────────────────────────────

  function renderChips() {
    var $chips = $('#dc-selected-chips');
    var count  = Object.keys(selectedMembers).length;
    var $count = $('#dc-selected-count');
    if ($count.length) $count.text(count);
    if (!$chips.length) return;

    if (!count) {
      $chips.html('<span style="color:var(--text-4);font-size:13px;padding:4px">Chưa chọn thành viên nào</span>');
      return;
    }
    var html = '';
    Object.keys(selectedMembers).forEach(function(ausId) {
      var m     = selectedMembers[ausId];
      var initl = m.name.trim().split(/\s+/).slice(-1)[0][0].toUpperCase();
      html += '<span class="member-chip">'
            + '<span class="member-chip-avatar" style="background:hsl(' + m.hue + ',55%,52%)">' + initl + '</span>'
            + escHtml(m.name.split(/\s+/).slice(-1)[0])
            + '<span class="x" data-chip-id="' + ausId + '">×</span>'
            + '</span>';
    });
    $chips.html(html);
  }

  function toggleMember(item) {
    var $item    = $(item);
    var ausId    = String($item.data('aus-id'));
    var name     = String($item.data('name') || '');
    var hue      = String($item.data('hue')  || '0');
    var convType = $('input[name="dc-conv-type"]:checked').val() || 'DM';

    if ($item.hasClass('selected')) {
      $item.removeClass('selected');
      delete selectedMembers[ausId];
    } else {
      if (convType === 'DM') {
        // DM: clear previous selection first
        $('#dc-member-suggest-list .member-suggest-item.selected').removeClass('selected');
        selectedMembers = {};
      }
      $item.addClass('selected');
      selectedMembers[ausId] = { name: name, hue: hue };
    }
    renderChips();
  }

  // Click row to toggle member
  $(document).on('click', '#dc-member-suggest-list .member-suggest-item', function() {
    toggleMember(this);
  });

  // Remove chip
  $(document).on('click', '.member-chip .x', function(e) {
    e.stopPropagation();
    var ausId = String($(this).data('chip-id'));
    delete selectedMembers[ausId];
    $('#dc-member-suggest-list .member-suggest-item[data-aus-id="' + ausId + '"]').removeClass('selected');
    renderChips();
  });

  // Search filter
  $(document).on('input', '#dc-contact-search', function() {
    var q = this.value.toLowerCase().trim();
    $('#dc-member-suggest-list .member-suggest-item').each(function() {
      var name = ($(this).data('name') || '').toLowerCase();
      var dept = ($(this).data('dept') || '').toLowerCase();
      $(this).toggle(!q || name.indexOf(q) !== -1 || dept.indexOf(q) !== -1);
    });
    $('#dc-member-suggest-list [data-dept-header]').each(function() {
      var $h = $(this), any = false, $n = $h.next();
      while ($n.length && !$n.is('[data-dept-header]')) {
        if ($n.is(':visible')) { any = true; break; }
        $n = $n.next();
      }
      $h.toggle(any);
    });
  });

  // Type tab toggle
  $(document).on('change', 'input[name="dc-conv-type"]', function() {
    var isChannel = this.value === 'CHANNEL';
    // Update tab visual
    $('.dc-type-tab').removeClass('active');
    $(this).closest('.dc-type-tab').addClass('active');
    // Show/hide name field
    var wrap = document.getElementById('dc-create-name-wrap');
    if (wrap) wrap.style.display = isChannel ? 'flex' : 'none';
    // DM: keep only first selected
    if (!isChannel) {
      var keys = Object.keys(selectedMembers);
      keys.slice(1).forEach(function(id) {
        delete selectedMembers[id];
        $('#dc-member-suggest-list .member-suggest-item[data-aus-id="' + id + '"]').removeClass('selected');
      });
      renderChips();
    }
  });

  // ── Inline compose: mở / đóng panel trong cột trái ──────────────────────────

  function openCompose(convType) {
    selectedMembers = {};
    document.getElementById('dc-list-screen').style.display    = 'none';
    document.getElementById('dc-compose-screen').style.display = 'flex';
    document.getElementById('dc-compose-title').textContent =
      convType === 'CHANNEL' ? 'Tạo nhóm mới' : 'Nhắn tin mới';

    loadContacts(function() {
      $('input[name=dc-conv-type][value="' + convType + '"]')
        .prop('checked', true).trigger('change');
      injectCreateContext();
    });
  }

  function closeCompose() {
    document.getElementById('dc-compose-screen').style.display = 'none';
    document.getElementById('dc-list-screen').style.display    = 'flex';
    selectedMembers = {};
  }

  function injectCreateContext() {
    var docType = $v('P' + pageId + '_DOC_TYPE');
    var docNo   = $v('P' + pageId + '_DOC_NO');
    var ref = document.getElementById('dc-create-doc-ref');
    if (ref) ref.textContent = (docType && docNo) ? (docType + ' — ' + docNo) : '—';
    var nameEl = document.getElementById('dc-create-name');
    if (nameEl && !nameEl.value && docType && docNo) {
      nameEl.value = docType + ' - ' + docNo;
    }
  }

  $(document).on('click', '#dc-btn-dm',    function() { openCompose('DM'); });
  $(document).on('click', '#dc-btn-group', function() { openCompose('CHANNEL'); });
  $(document).on('click', '#dc-btn-create', function() { openCompose('CHANNEL'); });

  $(document).on('click', '#dc-compose-back, #dc-compose-close, #dc-create-cancel', closeCompose);

  // Submit
  $(document).on('click', '#dc-create-submit', function() {
    var convType = $('input[name="dc-conv-type"]:checked').val() || 'DM';
    var nameEl   = document.getElementById('dc-create-name');
    var name     = nameEl ? nameEl.value.trim() : '';
    var members  = Object.keys(selectedMembers).map(Number);

    if (!members.length) {
      apex.message.showErrors([{ type: 'error', message: 'Chọn ít nhất 1 thành viên' }]);
      return;
    }
    if (convType === 'CHANNEL' && !name) {
      var docType = $v('P' + pageId + '_DOC_TYPE');
      var docNo   = $v('P' + pageId + '_DOC_NO');
      name = (docType && docNo) ? docType + ' - ' + docNo : 'Nhóm mới';
      if (nameEl) nameEl.value = name;
    }

    dcJson('docChatCreate', {
      x01: convType,
      x02: name,
      x03: JSON.stringify(members),
      x04: $v('P' + pageId + '_DOC_TYPE'),
      x05: $v('P' + pageId + '_DOC_NO')
    }, function(data) {
      if (data && data.error) {
        apex.message.showErrors([{ type: 'error', message: 'Tạo thất bại: ' + data.error }]);
        console.error('[DocChat] docChatCreate error:', data.error);
        return;
      }
      closeCompose();
      if (data && data.conv_id) {
        loadConvList(function() { selectConv(data.conv_id); });
      }
    }, function(xhr) {
      console.error('[DocChat] docChatCreate xhr error:', xhr.responseText);
      apex.message.showErrors([{ type: 'error', message: 'Tạo thất bại: ' + (xhr.responseText || 'Lỗi kết nối') }]);
    });
  });

  // ── Public API (cho Dynamic Actions và code ngoài IIFE) ──────────────────────
  window.dcOpenCompose  = openCompose;
  window.dcCloseCompose = closeCompose;
  window.dcLoadConvList = loadConvList;
  window.dcSelectConv   = selectConv;
  window.dcLoadThread   = loadThread;
  window.dcSendMessage  = sendMessage;

  // ── Init ──────────────────────────────────────────────────────────────────────

  $(document).ready(function() {
    var ctx = {};
    try { ctx = JSON.parse(sessionStorage.getItem('docChatCtx') || '{}'); } catch(e) {}

    // Set APEX page items from context
    if (ctx.doc_type)   $v('P' + pageId + '_DOC_TYPE',   ctx.doc_type);
    if (ctx.doc_no)     $v('P' + pageId + '_DOC_NO',     ctx.doc_no);
    if (ctx.doc_label)  $v('P' + pageId + '_DOC_LABEL',  ctx.doc_label);
    if (ctx.doc_status) $v('P' + pageId + '_DOC_STATUS', ctx.doc_status);
    if (ctx.doc_total)  $v('P' + pageId + '_DOC_TOTAL',  ctx.doc_total);

    // Modal title (inject doc label into dialog titlebar)
    if (ctx.doc_label && ctx.doc_no) {
      var $title = apex.jQuery('.ui-dialog-title');
      if ($title.length) $title.text('Trao đổi — ' + ctx.doc_label + ': ' + ctx.doc_no);
    }

    // Apply initial grid state (info panel shown by default)
    $('#dc-body').toggleClass('with-info', showInfo);

    // Initial data load
    loadConvList();
    loadInfo();
  });

})(apex.jQuery);
