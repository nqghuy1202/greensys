/* Doc Chat App — entry point for "Trao đổi chứng từ" modal */
/* Exposes window.openDocChat(context) */

const { useState, useEffect, useRef, useCallback } = React;

const CURRENT_AUS_ID = Number(window.CHAT_AUS_ID || 0);
const POLL_BACKOFF_MAX = 30000;

const MODAL_PAGE_ID = 10022710201;

// Call an Ajax Callback on the modal page (doc-chat callbacks are page-level on page 10022710201)
function apexCall(processName, params = {}) {
  return new Promise((resolve, reject) => {
    apex.server.process(processName,
      {
        x01: String(params.x01 !== undefined ? params.x01 : ''),
        x02: String(params.x02 !== undefined ? params.x02 : ''),
        x03: String(params.x03 !== undefined ? params.x03 : ''),
        x04: String(params.x04 !== undefined ? params.x04 : ''),
        x05: String(params.x05 !== undefined ? params.x05 : ''),
      },
      {
        dataType: 'json',
        pageId:   MODAL_PAGE_ID,
        success:  resolve,
        error:    (jqXHR, err) => reject(new Error(jqXHR.responseText || err || 'APEX error'))
      }
    );
  });
}

// Call an Application Process (no pageId) — for shared processes like chatContactList
function apexCallApp(processName, params = {}) {
  return new Promise((resolve, reject) => {
    apex.server.process(processName,
      {
        x01: String(params.x01 !== undefined ? params.x01 : ''),
        x02: String(params.x02 !== undefined ? params.x02 : ''),
        x03: String(params.x03 !== undefined ? params.x03 : ''),
        x04: String(params.x04 !== undefined ? params.x04 : ''),
        x05: String(params.x05 !== undefined ? params.x05 : ''),
      },
      {
        dataType: 'json',
        success:  resolve,
        error:    (jqXHR, err) => reject(new Error(jqXHR.responseText || err || 'APEX error'))
      }
    );
  });
}

function fmtPreviewTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  } catch (_) { return ''; }
}

// ─── Main app component ───────────────────────────────────────────────────────

const DocChatApp = ({ context, onClose }) => {
  const { doc_type, doc_no } = context;

  const [conversations,  setConversations]  = useState([]);
  const [activeConvId,   setActiveConvId]   = useState(null);
  const [messages,       setMessages]       = useState({});  // conv_id → []
  const [members,        setMembers]        = useState({});  // conv_id → []
  const [contacts,       setContacts]       = useState([]);
  const [infoOpen,       setInfoOpen]       = useState(false);
  const [showCreate,     setShowCreate]     = useState(false);
  const [query,          setQuery]          = useState('');
  const [activeTab,      setActiveTab]      = useState('all');
  const [typingMap,      setTypingMap]      = useState({});  // conv_id → [{aus_id, name}]
  const [loadingConvs,   setLoadingConvs]   = useState(true);
  const [loadingMsgs,    setLoadingMsgs]    = useState(false);

  // Refs to access latest state inside long-poll closure without re-creating it
  const activeConvIdRef = useRef(null);
  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    if (!CURRENT_AUS_ID || !doc_type || !doc_no) {
      setLoadingConvs(false);
      return;
    }
    try {
      const data = await apexCall('docChatConversations', {
        x01: CURRENT_AUS_ID,
        x02: doc_type,
        x03: doc_no,
      });
      setConversations(data.conversations || []);
    } catch (e) {
      console.error('[DocChat] loadConversations:', e);
    } finally {
      setLoadingConvs(false);
    }
  }, [doc_type, doc_no]);

  const loadMessages = useCallback(async (convId) => {
    setLoadingMsgs(true);
    try {
      const data = await apexCall('docChatMessages', { x01: convId, x02: '', x03: '50' });
      setMessages(prev => ({ ...prev, [convId]: data.messages || [] }));
    } catch (e) {
      console.error('[DocChat] loadMessages:', e);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  const loadMembers = useCallback(async (convId) => {
    try {
      const data = await apexCall('docChatMembers', { x01: convId });
      setMembers(prev => ({ ...prev, [convId]: data.members || [] }));
    } catch (e) {
      console.error('[DocChat] loadMembers:', e);
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      const data = await apexCallApp('chatContactList');
      setContacts(data.contacts || data.users || []);
    } catch (e) {
      console.error('[DocChat] loadContacts:', e);
    }
  }, []);

  // ── User actions ────────────────────────────────────────────────────────────

  const handleSelect = useCallback(async (convId) => {
    setActiveConvId(convId);
    if (!messages[convId]) loadMessages(convId);
    if (!members[convId])  loadMembers(convId);
    apexCall('docChatRead', { x01: convId }).catch(() => {});
    setConversations(prev =>
      prev.map(c => c.conv_id === convId ? { ...c, unread_count: 0 } : c)
    );
  }, [messages, members, loadMessages, loadMembers]);

  const handleSend = useCallback(async (body, replyToId) => {
    if (!activeConvId || !body.trim()) return;
    const conv = conversations.find(c => c.conv_id === activeConvId);
    const partnerAusId = conv?.conv_type === 'DM' ? (conv.partner_aus_id || '') : '';
    try {
      const data = await apexCall('docChatSend', {
        x01: activeConvId,
        x02: body.trim(),
        x03: replyToId || '',
        x04: partnerAusId,
      });
      // Optimistic update — long-poll will bring the canonical version
      const tmpMsg = {
        msg_id:         data.msg_id || ('tmp_' + Date.now()),
        from_aus_id:    CURRENT_AUS_ID,
        from_name:      'Bạn',
        body:           body.trim(),
        reply_to_msg_id: replyToId || null,
        create_date:    new Date().toISOString(),
      };
      setMessages(prev => ({ ...prev, [activeConvId]: [...(prev[activeConvId] || []), tmpMsg] }));
      setConversations(prev =>
        prev.map(c => c.conv_id === activeConvId
          ? { ...c, last_msg_preview: body.trim(), last_msg_time: fmtPreviewTime(new Date().toISOString()) }
          : c
        )
      );
    } catch (e) {
      console.error('[DocChat] send:', e);
    }
  }, [activeConvId, conversations]);

  const handleTyping = useCallback(() => {
    if (!activeConvId) return;
    apexCall('docChatTyping', { x01: activeConvId }).catch(() => {});
  }, [activeConvId]);

  const handleCreate = useCallback(async ({ conv_type, name, memberAusIds }) => {
    try {
      const data = await apexCall('docChatCreate', {
        x01: conv_type,
        x02: name || '',
        x03: JSON.stringify(memberAusIds),
        x04: doc_type,
        x05: doc_no,
      });
      setShowCreate(false);
      await loadConversations();
      if (data.conv_id) handleSelect(data.conv_id);
    } catch (e) {
      console.error('[DocChat] create:', e);
    }
  }, [doc_type, doc_no, loadConversations, handleSelect]);

  // ── Long-poll ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const backoffRef = { current: 3000 };

    function doPoll() {
      if (cancelled || !CURRENT_AUS_ID) return;
      apexCall('docChatEvents', { x01: CURRENT_AUS_ID })
        .then(data => {
          if (cancelled) return;
          backoffRef.current = 3000;
          (data.events || []).forEach(ev => {
            if (ev.type === 'message') {
              setMessages(prev => {
                const list = prev[ev.conv_id] || [];
                // skip if already present (optimistic duplicate)
                if (list.some(m => String(m.msg_id) === String(ev.msg_id))) return prev;
                return {
                  ...prev,
                  [ev.conv_id]: [...list, {
                    msg_id:          ev.msg_id,
                    from_aus_id:     ev.from_aus_id,
                    from_name:       ev.from_name || 'Unknown',
                    body:            ev.body,
                    reply_to_msg_id: ev.reply_to_msg_id || null,
                    reply_body:      ev.reply_body || null,
                    reply_from_name: ev.reply_from_name || null,
                    create_date:     ev.create_date || new Date().toISOString(),
                  }]
                };
              });
              setConversations(prev =>
                prev.map(c => c.conv_id === ev.conv_id ? {
                  ...c,
                  last_msg_preview: ev.body,
                  last_msg_time:    fmtPreviewTime(ev.create_date),
                  unread_count: activeConvIdRef.current === ev.conv_id
                    ? 0 : (c.unread_count || 0) + 1,
                } : c)
              );
            } else if (ev.type === 'typing') {
              if (Number(ev.aus_id) === CURRENT_AUS_ID) return;
              setTypingMap(prev => {
                const list = (prev[ev.conv_id] || []).filter(t => t.aus_id !== ev.aus_id);
                return { ...prev, [ev.conv_id]: [...list, { aus_id: ev.aus_id, name: ev.name || 'User' }] };
              });
              setTimeout(() => {
                if (cancelled) return;
                setTypingMap(prev => ({
                  ...prev,
                  [ev.conv_id]: (prev[ev.conv_id] || []).filter(t => t.aus_id !== ev.aus_id)
                }));
              }, 5000);
            }
          });
          doPoll();
        })
        .catch(() => {
          if (cancelled) return;
          const b = backoffRef.current;
          backoffRef.current = Math.min(b * 2, POLL_BACKOFF_MAX);
          setTimeout(() => { if (!cancelled) doPoll(); }, b);
        });
    }

    loadConversations();
    loadContacts();
    doPoll();

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select first conversation once loaded
  useEffect(() => {
    if (!loadingConvs && conversations.length > 0 && !activeConvId) {
      handleSelect(conversations[0].conv_id);
    }
  }, [loadingConvs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Parent dialog titlebar setup ─────────────────────────────────────────────
  // Inject doc info + info-panel toggle button into the jQuery UI dialog titlebar.
  // Works because both parent page and iframe are same-origin (same ORDS server).
  useEffect(() => {
    var SVG_LOGO  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
    var SVG_PANEL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>';

    // Expose toggle for the button click handler (closure captures iframe window)
    window.docChatToggleInfo = () => setInfoOpen(v => !v);

    try {
      var parentDoc = parent.document;
      var $p = (parent.apex && parent.apex.jQuery) || parent.$;

      // Inject titlebar CSS into parent document (once)
      if (!parentDoc.getElementById('dc-titlebar-style')) {
        var style = parentDoc.createElement('style');
        style.id = 'dc-titlebar-style';
        style.textContent = [
          '.ui-dialog-titlebar{display:flex!important;align-items:center!important;gap:6px!important;padding:0 10px 0 16px!important;min-height:46px!important;}',
          '.ui-dialog-title{flex:1!important;min-width:0!important;overflow:visible!important;font-size:13px!important;font-weight:600!important;margin:0!important;padding:0!important;line-height:1.3!important;}',
          '.ui-dialog-titlebar-close{position:static!important;top:auto!important;right:auto!important;transform:none!important;margin:0!important;margin-inline-start:0!important;margin-inline-end:0!important;flex-shrink:0!important;}',
          '.dc-title-wrap{display:inline-flex;align-items:center;gap:8px;white-space:nowrap;overflow:hidden;}',
          '.dc-title-icon{width:24px;height:24px;border-radius:5px;background:#E8F5EE;color:#2D9D5C;display:grid;place-items:center;flex-shrink:0;}',
          '.dc-title-text{font-size:13.5px;font-weight:600;color:#15202B;}',
          '.dc-title-pill{display:inline-flex;align-items:center;gap:5px;padding:2px 10px;background:#E8F5EE;color:#1F7444;font-size:11.5px;font-weight:500;border-radius:999px;border:1px solid #D4ECDF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px;}',
          '#dc-info-btn{width:28px;height:28px;border-radius:5px;display:grid;place-items:center;cursor:pointer;border:0;background:transparent;color:#7A848F;padding:0;flex-shrink:0;transition:background .15s,color .15s;outline:0;}',
          '#dc-info-btn:hover{background:#F4F6F8;color:#15202B;}',
          '#dc-info-btn.is-active{background:#E8F5EE;color:#1F7444;}',
        ].join('');
        parentDoc.head.appendChild(style);
      }

      // Build title HTML
      var pill = context.doc_no
        ? '<span class="dc-title-pill">' +
            (context.doc_type ? context.doc_type + ' · ' : '') +
            context.doc_no +
            (context.doc_label ? ' · ' + context.doc_label : '') +
          '</span>'
        : '';
      $p('.ui-dialog-title').html(
        '<span class="dc-title-wrap">' +
          '<span class="dc-title-icon">' + SVG_LOGO + '</span>' +
          '<span class="dc-title-text">Trao đổi chứng từ</span>' +
          pill +
        '</span>'
      );

      // Inject info-panel toggle button (before the X close button)
      if (!parentDoc.getElementById('dc-info-btn')) {
        var btn = parentDoc.createElement('button');
        btn.id   = 'dc-info-btn';
        btn.type = 'button';
        btn.title = 'Th\xf4ng tin chứng từ';
        btn.innerHTML = SVG_PANEL;
        btn.onclick = function () {
          if (window.docChatToggleInfo) window.docChatToggleInfo();
        };
        $p('.ui-dialog-titlebar-close').before(btn);
      }
    } catch (e) {
      console.warn('[DocChat] titlebar setup failed:', e);
    }

    return function () {
      delete window.docChatToggleInfo;
      try {
        parent.$('#dc-info-btn').remove();
        parent.$('#dc-titlebar-style').remove();
      } catch (e2) {}
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync info-panel button active state whenever infoOpen changes
  useEffect(() => {
    try {
      var $p = (parent.apex && parent.apex.jQuery) || parent.$;
      $p('#dc-info-btn').toggleClass('is-active', infoOpen);
    } catch (e) {}
  }, [infoOpen]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const activeConv     = conversations.find(c => c.conv_id === activeConvId) || null;
  const activeMessages = activeConvId ? (messages[activeConvId] || []) : [];
  const activeMembers  = activeConvId ? (members[activeConvId]  || []) : [];
  const activeTyping   = activeConvId ? (typingMap[activeConvId] || []) : [];
  const showEmpty      = !loadingConvs && conversations.length === 0;

  return (
    <div className="modal">

        {/* ── Body — fills full dialog content area (no internal header) ─────── */}
        <div className={`modal-body ${infoOpen && activeConv ? 'with-info' : ''}`}>

          {/* Left pane — conversation list */}
          {!showEmpty && (
            <window.ConversationList
              conversations={conversations}
              activeId={activeConvId}
              onSelect={handleSelect}
              onCreateNew={() => setShowCreate(true)}
              query={query}
              setQuery={setQuery}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              currentAusId={CURRENT_AUS_ID}
              docCtx={context}
              typingMap={typingMap}
            />
          )}

          {/* Center pane — chat thread or empty state */}
          {showEmpty ? (
            <window.EmptyState
              onCreate={(mode) => setShowCreate(true)}
              docCtx={context}
            />
          ) : activeConv ? (
            <window.ChatThread
              conv={activeConv}
              messages={activeMessages}
              members={activeMembers}
              typingList={activeTyping}
              currentAusId={CURRENT_AUS_ID}
              loading={loadingMsgs}
              onSend={handleSend}
              onTyping={handleTyping}
              onToggleInfo={() => setInfoOpen(v => !v)}
              infoOpen={infoOpen}
              onClose={onClose}
            />
          ) : (
            !loadingConvs && (
              <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                Chọn một hội thoại để bắt đầu
              </div>
            )
          )}

          {/* Right pane — info panel */}
          {infoOpen && activeConv && (
            <window.InfoPanel
              conv={activeConv}
              members={activeMembers}
              docCtx={context}
            />
          )}
        </div>

        {/* Create group / DM modal */}
        {showCreate && (
          <window.CreateGroupModal
            contacts={contacts}
            currentAusId={CURRENT_AUS_ID}
            docCtx={context}
            onCancel={() => setShowCreate(false)}
            onCreate={handleCreate}
          />
        )}
    </div>
  );
};

// ─── Entry point — auto-render on APEX Modal Dialog page load ─────────────────
// Context strategy: sessionStorage (rich, any chars) + APEX items (fallback for type/no)

(function () {
  var container = document.getElementById('doc-chat-root');
  if (!container) { console.error('[DocChat] #doc-chat-root not found'); return; }

  var stored = {};
  try {
    var raw = sessionStorage.getItem('docChatCtx');
    if (raw) stored = JSON.parse(raw);
  } catch (_) {}

  var context = {
    doc_type:   stored.doc_type   || $v('P10022710201_DOC_TYPE')   || '',
    doc_no:     stored.doc_no     || $v('P10022710201_DOC_NO')     || '',
    doc_label:  stored.doc_label  || $v('P10022710201_DOC_LABEL')  || '',
    doc_status: stored.doc_status || $v('P10022710201_DOC_STATUS') || '',
    doc_total:  stored.doc_total  || $v('P10022710201_DOC_TOTAL')  || '',
    doc_fields: stored.doc_fields || [],
  };

  ReactDOM.render(
    <DocChatApp
      context={context}
      onClose={() => apex.navigation.dialog.close()}
    />,
    container
  );
})();
