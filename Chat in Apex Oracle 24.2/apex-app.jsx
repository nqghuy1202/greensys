// APEX Chat Module — App Entry Point (real data)
// Kết nối Oracle APEX 24.2 ↔ Node.js ↔ Oracle DB

// ─── API helper ──────────────────────────────────────────────────────────────

function chatAPI(callbackName, params, timeout) {
  return new Promise(function(resolve, reject) {
    apex.server.process(callbackName, params || {}, {
      dataType: 'json',
      timeout:  timeout || 10000,
      success:  resolve,
      error:    function(xhr, status, errorThrown) {
        console.error('[chatAPI error]', callbackName, '| status:', status, '| thrown:', errorThrown, '| response:', xhr.responseText);
        reject(new Error(status + ': ' + callbackName));
      }
    });
  });
}

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

// ─── Transformers ─────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['blue','purple','green','orange','red','teal','amber','indigo'];

function userColor(ausId) {
  return AVATAR_COLORS[Math.abs(Number(ausId)) % AVATAR_COLORS.length];
}

function shortName(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatTime(isoDate) {
  if (!isoDate) return '';
  try {
    return new Date(isoDate).toLocaleTimeString('vi-VN', {
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) { return ''; }
}

// API conversation → component format (tương thích Sidebar)
function transformConv(row) {
  return {
    id:          row.conv_id,
    type:        row.conv_type === 'CHANNEL' ? 'channel' : 'dm',
    name:        row.display_name || ('Hội thoại ' + row.conv_id),
    user:        row.dm_partner_aus_id || null,   // DM: key vào users object
    unread:      row.unread_count   || 0,
    lastPreview: row.last_msg_preview || '',
    lastTime:    formatTime(row.last_msg_date),
    pinned:      false,
    icon:        null,                            // Phase 2: thêm icon vào DB
    members:     Array(row.member_count || 0).fill(null),
    pinnedMsgId: row.pinned_msg_id || null,
  };
}

// API message → component format (tương thích MessageGroup)
function transformMsg(row, currentAusId) {
  const isDeleted = !!row.delete_date;
  const isMine    = Number(row.from_aus_id) === Number(currentAusId);
  return {
    id:      row.msg_id,
    author:  isMine ? 'me' : row.from_aus_id,
    mine:    isMine,
    time:    formatTime(row.create_date),
    text:    isDeleted
               ? '<i style="color:var(--text-muted)">[Tin nhắn đã bị xóa]</i>'
               : (row.body || ''),
    msg_type: row.msg_type,
    replyTo: row.reply_to_msg_id ? {
      author: row.reply_from_name || 'Unknown',
      body:   row.reply_body || '[Tin nhắn đã bị xóa]',
    } : undefined,
  };
}

// ─── Modal: Soạn tin (New DM) ────────────────────────────────────────────────

function NewDMModal({ onClose, onCreated }) {
  const [query,   setQuery]   = React.useState('');
  const [results, setResults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [picked,  setPicked]  = React.useState(null);
  const [creating, setCreating] = React.useState(false);
  const timerRef = React.useRef(null);

  function search(kw) {
    setQuery(kw);
    clearTimeout(timerRef.current);
    if (!kw.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await chatAPI('chatSearchUsers', { x01: kw }, 8000);
        setResults(data.users || []);
      } catch (e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  async function create() {
    if (!picked) return;
    setCreating(true);
    try {
      const data = await chatAPI('chatCreate', {
        x01: 'DM',
        x02: '',
        x03: JSON.stringify([picked.aus_id]),
      }, 10000);
      if (data.error) throw new Error(data.error);
      onCreated(data.conv_id, data.status === 'exists');
    } catch (e) {
      alert('Lỗi: ' + e.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span>Soạn tin nhắn mới</span>
          <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_DM_Close" onClick={onClose} data-otel-label="DM_CLOSE">
            <span className="t-Icon fa fa-times" aria-hidden="true"></span>
            <span className="t-Button-label u-VisuallyHidden">Đóng</span>
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-search">
            <Icons.search size={13}/>
            <input
              autoFocus
              placeholder="Tìm theo tên hoặc username..."
              value={query}
              onChange={e => search(e.target.value)}
            />
          </div>
          {loading && <div className="modal-hint">Đang tìm...</div>}
          {!loading && results.length === 0 && query.trim() &&
            <div className="modal-hint">Không tìm thấy người dùng</div>}
          <div className="modal-list">
            {results.map(u => (
              <div
                key={u.aus_id}
                className={'modal-item' + (picked?.aus_id === u.aus_id ? ' selected' : '')}
                data-aus-id={u.aus_id}
                onClick={() => setPicked(u)}
              >
                <span className={'avatar sm ' + userColor(u.aus_id)}>
                  {shortName(u.full_name)}
                </span>
                <div>
                  <div className="modal-item-name">{u.full_name}</div>
                  <div className="modal-item-sub">@{u.username}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="t-Button t-Button--icon t-Button--mobileHideLabel" type="button" id="Btn_DM_Cancel" onClick={onClose} data-otel-label="DM_CANCEL">
            <span className="t-Button-label">Hủy</span>
          </button>
          <button
            className="t-Button t-Button--icon t-Button--mobileHideLabel t-Button--hot"
            type="button"
            id="Btn_DM_Start"
            disabled={!picked || creating}
            onClick={create}
            data-otel-label="DM_START"
          >
            <span className="t-Button-label">{creating ? 'Đang tạo...' : 'Bắt đầu chat'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Tạo nhóm (New Channel) ───────────────────────────────────────────

function NewChannelModal({ onClose, onCreated }) {
  const [channelName, setChannelName] = React.useState('');
  const [query,       setQuery]       = React.useState('');
  const [results,     setResults]     = React.useState([]);
  const [loading,     setLoading]     = React.useState(false);
  const [members,     setMembers]     = React.useState([]);
  const [creating,    setCreating]    = React.useState(false);
  const timerRef = React.useRef(null);

  function search(kw) {
    setQuery(kw);
    clearTimeout(timerRef.current);
    if (!kw.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await chatAPI('chatSearchUsers', { x01: kw }, 8000);
        setResults((data.users || []).filter(u => !members.find(m => m.aus_id === u.aus_id)));
      } catch (e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function addMember(u) {
    setMembers(prev => prev.find(m => m.aus_id === u.aus_id) ? prev : [...prev, u]);
    setQuery('');
    setResults([]);
  }

  function removeMember(ausId) {
    setMembers(prev => prev.filter(m => m.aus_id !== ausId));
  }

  async function create() {
    const trimName = channelName.trim();
    if (!trimName) { alert('Nhập tên nhóm'); return; }
    setCreating(true);
    try {
      const data = await chatAPI('chatCreate', {
        x01: 'CHANNEL',
        x02: trimName,
        x03: JSON.stringify(members.map(m => m.aus_id)),
      }, 10000);
      if (data.error) throw new Error(data.error);
      onCreated(data.conv_id);
    } catch (e) {
      alert('Lỗi: ' + e.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span>Tạo nhóm mới</span>
          <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Ch_Close" onClick={onClose} data-otel-label="CH_CLOSE">
            <span className="t-Icon fa fa-times" aria-hidden="true"></span>
            <span className="t-Button-label u-VisuallyHidden">Đóng</span>
          </button>
        </div>
        <div className="modal-body">
          <label className="modal-label">Tên nhóm</label>
          <input
            className="modal-input"
            autoFocus
            placeholder="VD: Dự án tháng 5, Nhóm kinh doanh..."
            value={channelName}
            onChange={e => setChannelName(e.target.value)}
          />
          <label className="modal-label" style={{marginTop:12}}>Thêm thành viên</label>
          {members.length > 0 && (
            <div className="modal-tags">
              {members.map(u => (
                <span key={u.aus_id} className="modal-tag">
                  {u.full_name}
                  <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id={`Btn_Ch_RemMember_${u.aus_id}`} onClick={() => removeMember(u.aus_id)} data-otel-label="CH_REMOVE_MEMBER">×</button>
                </span>
              ))}
            </div>
          )}
          <div className="modal-search">
            <Icons.search size={13}/>
            <input
              placeholder="Tìm thành viên..."
              value={query}
              onChange={e => search(e.target.value)}
            />
          </div>
          {loading && <div className="modal-hint">Đang tìm...</div>}
          <div className="modal-list">
            {results.map(u => (
              <div key={u.aus_id} className="modal-item" onClick={() => addMember(u)}>
                <span className={'avatar sm ' + userColor(u.aus_id)}>
                  {shortName(u.full_name)}
                </span>
                <div>
                  <div className="modal-item-name">{u.full_name}</div>
                  <div className="modal-item-sub">@{u.username}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <span className="modal-hint">{members.length} thành viên được thêm</span>
          <button className="t-Button t-Button--icon t-Button--mobileHideLabel" type="button" id="Btn_Ch_Cancel" onClick={onClose} data-otel-label="CH_CANCEL">
            <span className="t-Button-label">Hủy</span>
          </button>
          <button
            className="t-Button t-Button--icon t-Button--mobileHideLabel t-Button--hot"
            type="button"
            id="Btn_Ch_Create"
            disabled={!channelName.trim() || creating}
            onClick={create}
            data-otel-label="CH_CREATE"
          >
            <span className="t-Button-label">{creating ? 'Đang tạo...' : 'Tạo nhóm'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── App Component ───────────────────────────────────────────────────────────

function App() {
  // G_AUS_ID là Application Item (không có DOM element) → $v() trả về ""
  // Dùng substitution string &G_AUS_ID. được inject từ APEX page load JS
  const currentAusId = Number(window.CHAT_AUS_ID || $v('G_AUS_ID') || 0);
  const accent = '#2B7DE9';

  // Apply CSS tokens
  React.useEffect(() => {
    document.documentElement.dataset.density = 'default';
    document.documentElement.dataset.bubble  = 'default';
    document.documentElement.dataset.theme   = 'light';
    document.documentElement.style.setProperty('--primary', accent);
    const darken  = (hex, a) => { const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255,m=c=>Math.round(c*(1-a)); return `rgb(${m(r)},${m(g)},${m(b)})`; };
    const lighten = (hex, a) => { const n=parseInt(hex.slice(1),16),r=(n>>16)&255,g=(n>>8)&255,b=n&255,x=c=>Math.round(c+(255-c)*a); return `rgb(${x(r)},${x(g)},${x(b)})`; };
    document.documentElement.style.setProperty('--primary-hover',  darken(accent, 0.12));
    document.documentElement.style.setProperty('--primary-soft',   lighten(accent, 0.85));
    document.documentElement.style.setProperty('--primary-softer', lighten(accent, 0.94));
    document.documentElement.style.setProperty('--primary-deep',   darken(accent, 0.45));
  }, []);

  // ── State ───────────────────────────────────────────────────────────────────
  const [usersCache,    setUsersCache]    = React.useState({ me: { id: currentAusId, name: 'Bạn', short: 'B', color: userColor(currentAusId), status: 'online' } });
  const [conversations, setConversations] = React.useState([]);
  const [activeConvId,  setActiveConvId]  = React.useState(null);
  const [messages,      setMessages]      = React.useState([]);
  const [searchQuery,   setSearchQuery]   = React.useState('');
  const [activeTab,     setActiveTab]     = React.useState('all');
  const [msgsLoading,   setMsgsLoading]   = React.useState(false);
  const [convLoading,   setConvLoading]   = React.useState(true);
  const [panelOpen,     setPanelOpen]     = React.useState(true);
  const [onlineSet,     setOnlineSet]     = React.useState(new Set());
  const [showNewDM,     setShowNewDM]     = React.useState(false);
  const [showNewChan,   setShowNewChan]   = React.useState(false);
  const [typingByConv,  setTypingByConv]  = React.useState({});   // { [conv_id]: Set<aus_id> }
  const [membersCache,  setMembersCache]  = React.useState({});   // { [conv_id]: member[] }

  // Refs để tránh stale closure trong async loops
  const pollActiveRef   = React.useRef(true);
  const activeConvIdRef = React.useRef(null);

  React.useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);

  // ── Helpers: populate usersCache từ message rows ─────────────────────────
  function cacheUsersFromMessages(msgRows) {
    const newEntries = {};
    for (const m of msgRows) {
      if (m.from_aus_id && !String(m.from_aus_id) in {}) {
        newEntries[m.from_aus_id] = {
          id:     m.from_aus_id,
          name:   m.from_name  || 'Unknown',
          short:  shortName(m.from_name),
          color:  userColor(m.from_aus_id),
          status: 'offline',
        };
      }
    }
    if (Object.keys(newEntries).length > 0) {
      setUsersCache(prev => ({ ...prev, ...newEntries }));
    }
  }

  // ── Load members cho conversation ───────────────────────────────────────
  async function loadMembers(convId) {
    try {
      const data = await chatAPI('chatGetMembers', { x01: convId }, 8000);
      const list = data.members || [];
      setMembersCache(prev => ({ ...prev, [String(convId)]: list }));
      // Populate usersCache với tên thật từ DB
      const entries = {};
      for (const m of list) {
        entries[m.aus_id] = {
          id:     m.aus_id,
          name:   m.full_name || 'Unknown',
          short:  shortName(m.full_name),
          color:  userColor(m.aus_id),
          status: 'offline',
        };
      }
      if (Object.keys(entries).length > 0) {
        setUsersCache(prev => ({ ...prev, ...entries }));
      }
    } catch (err) {
      console.error('[Chat] loadMembers:', err.message);
    }
  }

  // ── Load conversations ───────────────────────────────────────────────────
  async function loadConversations() {
    try {
      const data = await chatAPI('chatGetConversations', {}, 10000);
      const convs = (data.conversations || []).map(transformConv);
      setConversations(convs);
      setConvLoading(false);

      // Pre-populate usersCache với DM partners
      const partnerEntries = {};
      for (const row of data.conversations || []) {
        if (row.conv_type === 'DM' && row.dm_partner_aus_id) {
          const id = row.dm_partner_aus_id;
          partnerEntries[id] = {
            id,
            name:   row.display_name || 'Unknown',
            short:  shortName(row.display_name),
            color:  userColor(id),
            status: 'offline',
          };
        }
      }
      if (Object.keys(partnerEntries).length > 0) {
        setUsersCache(prev => ({ ...prev, ...partnerEntries }));
      }

      // Auto-chọn conversation đầu tiên
      if (convs.length > 0) {
        setActiveConvId(convs[0].id);
      }
    } catch (err) {
      console.error('[Chat] loadConversations:', err.message);
      setConvLoading(false);
    }
  }

  // ── Load messages ────────────────────────────────────────────────────────
  async function loadMessages(convId) {
    setMsgsLoading(true);
    setMessages([]);
    try {
      const data = await chatAPI('chatGetMessages', { x01: convId }, 10000);
      const msgs = (data.messages || []).map(m => transformMsg(m, currentAusId));
      setMessages(msgs);
      cacheUsersFromMessages(data.messages || []);
    } catch (err) {
      console.error('[Chat] loadMessages:', err.message);
    } finally {
      setMsgsLoading(false);
    }
  }

  // ── Xử lý events từ long-poll ────────────────────────────────────────────
  function handleEvents(events) {
    for (const ev of events) {
      if (ev.type === 'message') {
        const { conv_id, msg } = ev;

        // Nếu đang mở đúng conv này → thêm tin vào cuối
        if (Number(conv_id) === Number(activeConvIdRef.current)) {
          setMessages(prev => [...prev, transformMsg(msg, currentAusId)]);
          // Tự động đánh dấu đã đọc
          chatAPI('chatRead', { x01: conv_id }, 5000).catch(() => {});
        }

        // Cập nhật preview + unread trên sidebar
        setConversations(prev => prev.map(c => {
          if (Number(c.id) !== Number(conv_id)) return c;
          const isActive = Number(conv_id) === Number(activeConvIdRef.current);
          return {
            ...c,
            lastPreview: (msg.body || '').replace(/<[^>]+>/g, '').substring(0, 100),
            lastTime:    formatTime(msg.create_date),
            unread:      isActive ? 0 : (c.unread || 0) + 1,
          };
        }));

        // Cache user mới nếu chưa có
        if (msg.from_aus_id) {
          setUsersCache(prev => {
            if (prev[msg.from_aus_id]) return prev;
            return {
              ...prev,
              [msg.from_aus_id]: {
                id:     msg.from_aus_id,
                name:   msg.from_name  || 'Unknown',
                short:  shortName(msg.from_name),
                color:  userColor(msg.from_aus_id),
                status: 'offline',
              }
            };
          });
        }

      } else if (ev.type === 'typing') {
        setTypingByConv(prev => {
          const key = String(ev.conv_id);
          const set = new Set(prev[key] || []);
          set.add(ev.aus_id);
          return { ...prev, [key]: set };
        });

      } else if (ev.type === 'typing_stop') {
        setTypingByConv(prev => {
          const key = String(ev.conv_id);
          const set = new Set(prev[key] || []);
          set.delete(ev.aus_id);
          const next = { ...prev };
          if (set.size === 0) { delete next[key]; } else { next[key] = set; }
          return next;
        });
      }
    }
  }

  // ── Long-poll loop ───────────────────────────────────────────────────────
  function startPoll() {
    async function loop() {
      while (pollActiveRef.current) {
        try {
          const data = await chatAPI('chatEvents', {}, 35000);
          if (!pollActiveRef.current) break;
          if (data.events && data.events.length > 0) {
            handleEvents(data.events);
          }
        } catch (e) {
          if (!pollActiveRef.current) break;
          await sleep(5000);  // đợi 5s rồi poll lại khi lỗi
        }
      }
    }
    loop();
  }

  // ── Expose functions cho APEX Dynamic Actions ────────────────────────────
  React.useEffect(() => {
    window.chatGoBack        = () => history.back();
    window.chatOpenNewDM     = () => setShowNewDM(true);
    window.chatOpenNewGroup  = () => setShowNewChan(true);
    window.chatLoadMembers   = loadMembers;
    return () => {
      delete window.chatGoBack;
      delete window.chatOpenNewDM;
      delete window.chatOpenNewGroup;
      delete window.chatLoadMembers;
    };
  }, []);

  // ── Mount / Unmount ──────────────────────────────────────────────────────
  React.useEffect(() => {
    loadConversations();
    startPoll();

    // Heartbeat mỗi 20s
    chatAPI('chatHeartbeat', {}, 5000).catch(() => {});
    const hbInterval = setInterval(() => {
      chatAPI('chatHeartbeat', {}, 5000).catch(() => {});
      chatAPI('chatOnline',    {}, 5000)
        .then(d => setOnlineSet(new Set((d.online || []).map(Number))))
        .catch(() => {});
    }, 20000);

    return () => {
      pollActiveRef.current = false;
      clearInterval(hbInterval);
    };
  }, []);

  // Load messages + members khi chuyển conv
  React.useEffect(() => {
    if (!activeConvId) return;
    loadMessages(activeConvId);
    loadMembers(activeConvId);
    chatAPI('chatRead', { x01: activeConvId }, 5000).catch(() => {});
    setConversations(prev =>
      prev.map(c => Number(c.id) === Number(activeConvId) ? { ...c, unread: 0 } : c)
    );
    // Xóa typing indicators khi vào conv mới
    setTypingByConv(prev => {
      const next = { ...prev };
      delete next[String(activeConvId)];
      return next;
    });
  }, [activeConvId]);

  // ── Typing callback ──────────────────────────────────────────────────────
  function handleTyping() {
    if (!activeConvId) return;
    chatAPI('chatTyping', { x01: activeConvId }, 5000).catch(() => {});
  }

  // ── Send message ─────────────────────────────────────────────────────────
  async function sendMessage(text, replyTo) {
    if (!activeConvId || !String(text || '').trim()) return;
    const trimmed = String(text).trim();
    try {
      const data = await chatAPI('chatSend', {
        x01: activeConvId,
        x02: trimmed,
        x03: replyTo?.id || '',
        x04: activeConv?.user || '',   // partner aus_id (DM) hoặc '' (CHANNEL)
      }, 10000);

      if (data.status === 'ok' && data.msg) {
        setMessages(prev => [...prev, transformMsg(data.msg, currentAusId)]);
        setConversations(prev => prev.map(c =>
          Number(c.id) === Number(activeConvId)
            ? { ...c, lastPreview: trimmed.substring(0, 100), lastTime: formatTime(data.msg.create_date), unread: 0 }
            : c
        ));
      }
    } catch (err) {
      console.error('[Chat] sendMessage:', err.message);
    }
  }

  // ── Xử lý sau khi tạo conversation mới ──────────────────────────────────────
  async function handleConvCreated(convId) {
    setShowNewDM(false);
    setShowNewChan(false);
    await loadConversations();
    setActiveConvId(Number(convId));
  }

  // ── Derived state ────────────────────────────────────────────────────────
  const activeConv   = conversations.find(c => Number(c.id) === Number(activeConvId)) || null;
  const totalUnread  = conversations.reduce((s, c) => s + (c.unread || 0), 0);
  const activeMembers = membersCache[String(activeConvId)] || [];

  // Merge online status vào users
  const users = React.useMemo(() => {
    const result = {};
    for (const [id, user] of Object.entries(usersCache)) {
      result[id] = {
        ...user,
        status: onlineSet.has(Number(id)) ? 'online' : (id === 'me' ? 'online' : 'offline'),
      };
    }
    return result;
  }, [usersCache, onlineSet]);

  // Danh sách tên người đang gõ trong conv hiện tại
  const typingUsers = React.useMemo(() => {
    if (!activeConvId) return [];
    const set = typingByConv[String(activeConvId)];
    if (!set || set.size === 0) return [];
    return [...set].map(id => users[id]?.name || 'Ai đó');
  }, [typingByConv, activeConvId, users]);

  // Số người online trong conv hiện tại
  const activeOnlineCount = React.useMemo(() => {
    if (!activeConvId || activeMembers.length === 0) return 0;
    return activeMembers.filter(m => onlineSet.has(Number(m.aus_id))).length;
  }, [activeMembers, activeConvId, onlineSet]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <div className="appbar">
        <button className="back t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Back" data-tip="Quay lại" data-otel-label="BACK">
          <span className="t-Icon fa fa-chevron-left" aria-hidden="true"></span>
          <span className="t-Button-label u-VisuallyHidden">Quay lại</span>
        </button>
        <div className="title">
          <Icons.zap size={14}/>
          Chat
          <span className="badge">Apex Oracle 24.2</span>
        </div>
        <span className="breadcrumb">/ <b>{activeConv?.name || 'Hội thoại'}</b></span>
        <div className="spacer"/>
        <div className="actions">
          <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Filter" data-tip="Lọc" data-otel-label="FILTER">
            <span className="t-Icon fa fa-filter" aria-hidden="true"></span>
            <span className="t-Button-label u-VisuallyHidden">Lọc</span>
          </button>
          <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Archive" data-tip="Lưu trữ" data-otel-label="ARCHIVE">
            <span className="t-Icon fa fa-archive" aria-hidden="true"></span>
            <span className="t-Button-label u-VisuallyHidden">Lưu trữ</span>
          </button>
          <button className="t-Button t-Button--icon t-Button--mobileHideLabel t-Button--iconLeft" type="button" id="Btn_CreateGroup" data-otel-label="CREATE_GROUP">
            <span className="t-Icon t-Icon--left fa fa-users" aria-hidden="true"></span>
            <span className="t-Button-label">Tạo nhóm</span>
            <span className="t-Icon t-Icon--right fa fa-users" aria-hidden="true"></span>
          </button>
          <button className="t-Button t-Button--icon t-Button--mobileHideLabel t-Button--iconLeft t-Button--hot" type="button" id="Btn_Compose" data-otel-label="COMPOSE">
            <span className="t-Icon t-Icon--left fa fa-comment-o" aria-hidden="true"></span>
            <span className="t-Button-label">Soạn tin</span>
            <span className="t-Icon t-Icon--right fa fa-comment-o" aria-hidden="true"></span>
          </button>
        </div>
      </div>

      <div className="main" data-panel={panelOpen ? 'shown' : 'hidden'}>
        <Sidebar
          conversations={conversations}
          users={users}
          activeId={activeConvId}
          onSelectConv={id => setActiveConvId(id)}
          searchQuery={searchQuery}
          onSearch={setSearchQuery}
          activeTab={activeTab}
          onTab={setActiveTab}
          totalUnread={totalUnread}
        />

        {convLoading ? (
          <section className="chat">
            <div className="msgs" style={{justifyContent:'center', alignItems:'center', display:'flex'}}>
              <div style={{color:'var(--text-muted)', fontSize:14}}>Đang tải...</div>
            </div>
          </section>
        ) : (
          <ChatCenter
            conv={activeConv}
            messages={messages}
            users={users}
            onSend={sendMessage}
            onTogglePanel={() => setPanelOpen(p => !p)}
            isLoading={msgsLoading}
            pinnedMessage={null}
            onPin={() => {}}
            typingUsers={typingUsers}
            onTyping={handleTyping}
            onlineCount={activeOnlineCount}
          />
        )}

        {panelOpen && (
          <RightPanel
            conv={activeConv}
            users={users}
            files={[]}
            linkedDocs={[]}
            audit={[]}
            memberList={activeMembers}
            currentAusId={currentAusId}
            onlineCount={activeOnlineCount}
          />
        )}
      </div>

      {showNewDM && (
        <NewDMModal
          onClose={() => setShowNewDM(false)}
          onCreated={handleConvCreated}
        />
      )}
      {showNewChan && (
        <NewChannelModal
          onClose={() => setShowNewChan(false)}
          onCreated={handleConvCreated}
        />
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
