/* Chat hệ thống — APEX integration v2 */

const {
  useState: useStatePageApp,
  useEffect: useEffectPageApp,
  useRef: useRefPageApp,
} = React;

// ============================================================
// CONSTANTS
// ============================================================

const MY_AUS_ID = Number(window.CHAT_AUS_ID || 0);

const DOC_TYPE_LABELS = {
  SO: 'Đơn hàng bán', PXK: 'Phiếu xuất kho',
  HD: 'Hợp đồng', PO: 'Đơn mua hàng',
  NHAP_KHO: 'Nhập kho', XUAT_KHO: 'Xuất kho',
};

const TWEAK_DEFAULTS = {
  density: 'cozy', bubbleStyle: 'filled', showInfo: true,
  badgeStyle: 'icon', senderFormat: 'short', senderEmphasis: 'bold',
};

// ============================================================
// APEX CALL UTILITY
// ============================================================

function apexCall(processName, params = {}) {
  return new Promise((resolve, reject) => {
    apex.server.process(
      processName,
      {
        x01: params.x01 || '', x02: params.x02 || '', x03: params.x03 || '',
        x04: params.x04 || '', x05: params.x05 || '',
      },
      {
        pageId:   window.pageId,   // set in "Function and Global Variable Declaration": var pageId = $v('pFlowStepId')
        dataType: 'json',
        success: resolve,
        error: (_, err) => reject(new Error(err)),
      }
    );
  });
}
window.apexCall = apexCall;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function initials(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

function userColor(ausId) {
  return 'user-' + ((Number(ausId) % 4) + 1);
}

function formatDay(dateStr) {
  if (!dateStr) return 'Hôm nay';
  const d = new Date(dateStr.replace('T', ' '));
  if (isNaN(d)) return 'Hôm nay';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today - msgDay) / 86400000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function buildUsersMap(me, users) {
  const map = {};
  const meObj = {
    id: 'me',
    name: me.full_name || me.user_name || 'Tôi',
    short: initials(me.full_name || me.user_name || '?'),
    color: userColor(me.aus_id),
    presence: 'online',
    role: me.role || '',
    dept: me.dept || '',
    statusText: '',
  };
  map['me'] = meObj;
  map[String(me.aus_id)] = meObj;

  (users || []).forEach(u => {
    const key = String(u.aus_id);
    map[key] = {
      id: key,
      name: u.full_name || u.user_name || key,
      short: initials(u.full_name || u.user_name || '?'),
      color: userColor(u.aus_id),
      presence: u.is_online ? 'online' : 'offline',
      role: u.role || '',
      dept: u.dept || '',
      statusText: '',
    };
  });

  return map;
}

function buildContactsList(users) {
  const deptMap = {};
  (users || []).forEach(u => {
    const dept = u.dept || 'Khác';
    if (!deptMap[dept]) deptMap[dept] = [];
    deptMap[dept].push(String(u.aus_id));
  });
  return Object.entries(deptMap)
    .sort(([a], [b]) => a.localeCompare(b, 'vi'))
    .map(([dept, uids]) => ({ dept, users: uids }));
}

function normalizeOneMessage(row, myAusId) {
  const fromAusId = Number(row.from_aus_id);
  const isMine = fromAusId === myAusId;
  return {
    id: String(row.id || row.msg_id || ('tmp-' + Date.now())),
    user: isMine ? 'me' : String(fromAusId),
    mine: isMine,
    time: row.time || '',
    text: row.is_deleted ? '[Tin nhắn đã thu hồi]' : (row.body || row.text || ''),
    replyTo: row.reply_to_id ? {
      user: Number(row.reply_from_aus_id) === myAusId ? 'me' : String(row.reply_from_aus_id),
      text: row.reply_body || '...',
    } : null,
    receipts: isMine ? 'sent' : null,
  };
}

function normalizeMessages(rows, myAusId) {
  const result = [];
  let lastDay = null;
  (rows || []).forEach((row, i) => {
    const day = formatDay(row.date);
    if (day !== lastDay) {
      result.push({ id: 'div-' + i, day, divider: true });
      lastDay = day;
    }
    result.push(normalizeOneMessage(row, myAusId));
  });
  return result;
}

function normalizeConvs(rows) {
  return (rows || []).map(row => {
    const id = String(row.id);
    const partnerKey = row.partner_id ? String(row.partner_id) : null;
    return {
      id,
      type: row.type,
      name: row.name || '(Không có tên)',
      doc_type: row.doc_type || null,
      doc_no: row.doc_no || null,
      docNo: row.doc_no || null,
      docType: DOC_TYPE_LABELS[row.doc_type] || row.doc_type || null,
      docStatus: null,
      customer: null,
      docValue: null,
      unread: Number(row.unread) || 0,
      lastTime: row.last_time || '',
      lastPreview: row.last_preview || '',
      memberCount: Number(row.member_count) || 0,
      members: row.type === 'dm' && partnerKey ? ['me', partnerKey] : ['me'],
      partnerKey,
      typeMeta: {
        color: row.type,
        icon: row.type === 'dm' ? 'User' : row.type === 'doc' ? 'FileText' : 'Users',
        label: row.type === 'dm' ? 'Cá nhân' : row.type === 'doc' ? 'Chứng từ' : 'Nhóm',
      },
    };
  });
}

// ============================================================
// PAGE APP COMPONENT
// ============================================================

const PageApp = () => {
  const Icons = window.Icons;

  const [loading, setLoading] = useStatePageApp(true);
  const [initError, setInitError] = useStatePageApp(null);
  const [retryKey, setRetryKey] = useStatePageApp(0);
  const [users, setUsers] = useStatePageApp({});
  const [contacts, setContacts] = useStatePageApp([]);
  const [chats, setChats] = useStatePageApp([]);
  const [messages, setMessages] = useStatePageApp({});
  const [activeId, setActiveId] = useStatePageApp(null);
  const [composeOpen, setComposeOpen] = useStatePageApp(false);
  const [createGroupOpen, setCreateGroupOpen] = useStatePageApp(false);

  const activeIdRef = useRefPageApp(null);
  useEffectPageApp(() => { activeIdRef.current = activeId; }, [activeId]);

  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // Sync window globals mỗi lần render để child components đọc được data mới nhất
  window.PAGE_DATA = { USERS: users, CHATS: chats, MESSAGES: messages, CONTACTS: contacts, SAVED_MESSAGES: [] };
  window.CHAT_DATA = window.PAGE_DATA;

  const activeChat = chats.find(c => c.id === activeId);
  const showInfo = t.showInfo && activeChat;

  // ---- Initial load ----
  useEffectPageApp(() => {
    setLoading(true);
    setInitError(null);
    Promise.all([apexCall('chatConvList'), apexCall('chatContactList')])
      .then(([convData, contactData]) => {
        const me = contactData.me || {};
        setUsers(buildUsersMap(me, contactData.users));
        setContacts(buildContactsList(contactData.users));
        setChats(normalizeConvs(convData.conversations));
      })
      .catch(err => {
        console.error('[Chat] Init error', err);
        setInitError(err.message || 'Lỗi không xác định');
      })
      .finally(() => setLoading(false));
  }, [retryKey]);

  // ---- Chat event listener ----
  // Events dispatched by global.js after the unified appEvents long-poll resolves.
  // Fixes pre-existing bug: old poll checked data.type at top level but Node.js
  // returned { events: [...] } — so real-time messages never appeared.
  useEffectPageApp(() => {
    if (loading) return;

    function onChatEvent(_, ev) {
      if (ev.type === 'message' && ev.msg) {
        const cid = String(ev.conv_id);
        const msgRow = { ...ev.msg, time: ev.msg.time || ev.msg.create_date || '' };
        const msg = normalizeOneMessage(msgRow, MY_AUS_ID);
        setMessages(prev => prev[cid] !== undefined
          ? { ...prev, [cid]: [...prev[cid], msg] }
          : prev
        );
        setChats(prev => prev.map(c => c.id !== cid ? c : {
          ...c,
          lastPreview: msg.text || '',
          lastTime: msg.time,
          unread: activeIdRef.current === cid ? 0 : c.unread + 1,
        }));
      }
    }

    $(document).on('apex:chatEvent', onChatEvent);
    return () => $(document).off('apex:chatEvent', onChatEvent);
  }, [loading]);

  // ---- Handlers ----

  const handleSelect = async (id) => {
    setActiveId(id);

    if (messages[id] === undefined) {
      try {
        const [msgData, memberData] = await Promise.all([
          apexCall('chatMsgList', { x01: id }),
          apexCall('chatMemberList', { x01: id }),
        ]);

        setMessages(prev => ({
          ...prev,
          [id]: normalizeMessages(msgData.messages, MY_AUS_ID),
        }));

        if (memberData.members) {
          const memberKeys = memberData.members.map(m =>
            m.aus_id === MY_AUS_ID ? 'me' : String(m.aus_id)
          );
          setUsers(prev => {
            const updated = { ...prev };
            memberData.members.forEach(m => {
              const key = m.aus_id === MY_AUS_ID ? 'me' : String(m.aus_id);
              if (updated[key]) {
                updated[key] = { ...updated[key], presence: m.is_online ? 'online' : 'offline' };
              }
            });
            return updated;
          });
          setChats(prev => prev.map(c => c.id === id ? { ...c, members: memberKeys } : c));
        }
      } catch (e) {
        console.error('[Chat] Load messages error', e);
        setMessages(prev => ({ ...prev, [id]: [] }));
      }
    }

    setChats(prev => prev.map(c => c.id === id ? { ...c, unread: 0 } : c));
    apexCall('chatRead', { x01: id }).catch(() => {});
  };

  const handleSend = (convId, text, replyId, partnerKey) => {
    const timeStr = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    setMessages(prev => {
      const existing = prev[convId] || [];
      const replyMsg = replyId ? existing.find(m => m.id === replyId) : null;
      return {
        ...prev,
        [convId]: [...existing, {
          id: 'tmp-' + Date.now(),
          user: 'me', mine: true, time: timeStr, text,
          replyTo: replyMsg ? { user: replyMsg.user, text: replyMsg.text } : null,
          receipts: 'sent',
        }],
      };
    });
    setChats(prev => prev.map(c => c.id === convId
      ? { ...c, lastPreview: text, lastTime: timeStr }
      : c
    ));

    apexCall('chatSend', {
      x01: convId,
      x02: text,
      x03: replyId ? String(replyId) : '',
      x04: partnerKey && partnerKey !== 'me' ? String(partnerKey) : '',
    }).catch(e => console.error('[Chat] Send error', e));
  };

  const handleStartDM = async (partnerKey) => {
    const existing = chats.find(c => c.type === 'dm' && c.partnerKey === partnerKey);
    if (existing) { setActiveId(existing.id); setComposeOpen(false); return; }

    try {
      const result = await apexCall('chatCreate', {
        x01: 'DM', x02: '',
        x03: JSON.stringify([Number(partnerKey)]),
      });
      if (result.conv_id) {
        const convData = await apexCall('chatConvList');
        setChats(normalizeConvs(convData.conversations));
        setActiveId(String(result.conv_id));
      }
    } catch (e) { console.error('[Chat] Create DM error', e); }
    setComposeOpen(false);
  };

  const handleCreateGroup = async ({ name, members }) => {
    const memberAusIds = members.filter(k => k !== 'me').map(Number);
    try {
      const result = await apexCall('chatCreate', {
        x01: 'CHANNEL', x02: name,
        x03: JSON.stringify(memberAusIds),
      });
      if (result.conv_id) {
        const convData = await apexCall('chatConvList');
        setChats(normalizeConvs(convData.conversations));
        setActiveId(String(result.conv_id));
      }
    } catch (e) { console.error('[Chat] Create group error', e); }
    setCreateGroupOpen(false);
  };

  // ---- Loading / error guard ----
  if (loading) {
    return (
      <div className="page-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>Đang tải...</div>
      </div>
    );
  }

  if (initError || !users['me']) {
    const isApexError = initError === 'APEX';
    return (
      <div className="page-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 400, padding: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 600, color: 'var(--text-1)', marginBottom: 8 }}>
            {isApexError ? 'Ajax Callback chưa được tạo' : 'Không thể tải dữ liệu'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
            {isApexError
              ? 'Tạo các Ajax Callbacks chatConvList và chatContactList trên APEX page này, sau đó reload.'
              : initError}
          </div>
          <button type="button"
            onClick={() => setRetryKey(k => k + 1)}
            style={{ marginTop: 16, padding: '8px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className={`page-app density-${t.density} bubble-${t.bubbleStyle} badge-${t.badgeStyle} sender-em-${t.senderEmphasis} ${showInfo ? 'with-info' : ''}`}>
      <PageChatList
        activeId={activeId}
        onSelect={handleSelect}
        chats={chats}
        currentUser={users['me']}
        onOpenCompose={() => setComposeOpen(true)}
        onOpenCreateGroup={() => setCreateGroupOpen(true)}
        senderFormat={t.senderFormat}
      />

      {activeChat ? (
        <PageMain
          chat={activeChat}
          messages={messages[activeId] || []}
          onSend={(text, replyId) => handleSend(activeId, text, replyId, activeChat.partnerKey)}
          onToggleInfo={() => setTweak('showInfo', !t.showInfo)}
          infoOpen={showInfo}
        />
      ) : (
        <div className="main-pane">
          <div className="empty" style={{ flex: 1 }}>
            <div className="empty-card">
              <div className="empty-illust"><Icons.Users size={36} /></div>
              <div className="empty-h">Chọn một hội thoại</div>
              <div className="empty-p">Chọn từ danh sách bên trái để bắt đầu trò chuyện hoặc tạo nhóm mới</div>
            </div>
          </div>
        </div>
      )}

      {showInfo && activeChat && <InfoPanelByType chat={activeChat} />}

      {composeOpen && <ComposeModal onCancel={() => setComposeOpen(false)} onSelect={handleStartDM} />}
      {createGroupOpen && <CreateGroupPageModal onCancel={() => setCreateGroupOpen(false)} onCreate={handleCreateGroup} />}

      <window.TweaksPanel>
        <window.TweakSection title="Danh sách chat">
          <window.TweakRadio label="Định dạng tên người gửi" value={t.senderFormat} onChange={v => setTweak('senderFormat', v)}
            options={[{ value: 'short', label: 'Ngắn' }, { value: 'full', label: 'Đầy đủ' }]} />
          <window.TweakRadio label="Nhấn tên người gửi" value={t.senderEmphasis} onChange={v => setTweak('senderEmphasis', v)}
            options={[{ value: 'plain', label: 'Nhạt' }, { value: 'bold', label: 'Đậm' }, { value: 'color', label: 'Màu' }]} />
        </window.TweakSection>
        <window.TweakSection title="Layout">
          <window.TweakRadio label="Mật độ" value={t.density} onChange={v => setTweak('density', v)}
            options={[{ value: 'compact', label: 'Compact' }, { value: 'cozy', label: 'Cozy' }, { value: 'spacious', label: 'Spacious' }]} />
          <window.TweakRadio label="Kiểu bubble" value={t.bubbleStyle} onChange={v => setTweak('bubbleStyle', v)}
            options={[{ value: 'filled', label: 'Filled' }, { value: 'outline', label: 'Outline' }, { value: 'soft', label: 'Soft' }]} />
          <window.TweakToggle label="Hiện info panel" value={t.showInfo} onChange={v => setTweak('showInfo', v)} />
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<PageApp />);
