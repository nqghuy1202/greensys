/* Chat list (page version v2) - integrated header + dropdown filter */
/* Exposes window.PageChatList */

const { useState: useStateList, useMemo: useMemoList, useEffect: useEffectList, useRef: useRefList } = React;

const TYPE_OPTIONS = [
  { id: 'all', label: 'Tất cả', icon: 'Layers', color: 'all' },
  { id: 'group', label: 'Nhóm', icon: 'Users', color: 'group' },
  { id: 'project', label: 'Dự án', icon: 'Briefcase', color: 'project' },
  { id: 'doc', label: 'Chứng từ', icon: 'FileText', color: 'doc' },
  { id: 'dm', label: 'Cá nhân', icon: 'User', color: 'dm' },
];

const STATUS_OPTIONS_LIST = [
  { id: 'online', label: 'Đang hoạt động', color: 'var(--st-online)' },
  { id: 'away', label: 'Vắng mặt', color: 'var(--st-away)' },
  { id: 'busy', label: 'Đừng làm phiền', color: 'var(--st-busy)' },
  { id: 'meeting', label: 'Đang họp', color: 'var(--st-meeting)' },
  { id: 'offline', label: 'Vô hình', color: 'var(--st-offline)' },
];

const PRESENCE_LABEL = {
  online: 'Đang hoạt động', away: 'Vắng mặt', busy: 'Đừng làm phiền', meeting: 'Đang họp', offline: 'Vô hình'
};

const PageChatItem = ({ chat, isActive, onSelect, senderFormat = 'short' }) => {
  const Icons = window.Icons;
  const USERS = window.PAGE_DATA.USERS;
  const sender = chat.lastSender ? USERS[chat.lastSender] : null;
  const senderIsMe = chat.lastSender === 'me';

  // Format sender name: 'full' = "Nguyễn Văn Anh", 'short' = "Văn Anh" (last 2 words)
  const formatName = (fullName) => {
    if (!fullName) return null;
    if (senderFormat === 'full') return fullName;
    const parts = fullName.split(' ');
    return parts.length <= 2 ? fullName : parts.slice(-2).join(' ');
  };
  const senderLabel = senderIsMe ? 'Bạn' : formatName(sender?.name);
  const otherDm = chat.type === 'dm' ? chat.members.find(m => m !== 'me') : null;

  let typeBadgeIcon = null;
  if (chat.type === 'group') typeBadgeIcon = <Icons.Users size={9} stroke={2.5} />;
  else if (chat.type === 'project') typeBadgeIcon = <Icons.Briefcase size={9} stroke={2.5} />;
  else if (chat.type === 'doc') typeBadgeIcon = <Icons.FileText size={9} stroke={2.5} />;

  const otherUser = otherDm ? USERS[otherDm] : null;

  return (
    <div className={`chat-item ${isActive ? 'active' : ''} ${chat.unread > 0 ? 'unread' : ''}`} onClick={() => onSelect(chat.id)}>
      <div className="chat-item-avatar-wrap">
        <div className={`chat-item-avatar t-${chat.type} ${chat.type === 'dm' && otherUser ? otherUser.color : ''}`}>
          {chat.type === 'group' && <Icons.Users size={20} />}
          {chat.type === 'project' && <Icons.Briefcase size={20} />}
          {chat.type === 'doc' && <Icons.FileText size={20} />}
          {chat.type === 'dm' && otherUser?.short}
        </div>
        {chat.type !== 'dm' && (
          <div className={`chat-item-type-badge ${chat.type}`} title={chat.typeMeta?.label}>
            {typeBadgeIcon}
          </div>
        )}
        {chat.type === 'dm' && otherUser && (
          <span className={`chat-item-presence ${otherUser.presence}`}></span>
        )}
      </div>
      <div className="chat-item-content">
        <div className="chat-item-row1">
          <span className="chat-item-name">
            {chat.pinned && <Icons.Pin size={11} style={{ marginRight: 4, color: 'var(--text-3)', verticalAlign: '-1px' }} />}
            {chat.name}
          </span>
          <span className="chat-item-time">{chat.lastTime}</span>
        </div>

        {chat.type === 'doc' && (
          <div className="chat-item-meta-line">
            <Icons.Hash size={10} />
            <span className="doc-no">{chat.docNo}</span>
            <span>·</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.customer}</span>
          </div>
        )}
        {chat.type === 'project' && (
          <div className="chat-item-meta-line">
            <Icons.Hash size={10} />
            <span className="doc-no">{chat.projectCode}</span>
            <span>·</span>
            <span>Hạn {chat.deadline}</span>
          </div>
        )}

        <div className="chat-item-row2">
          <span className="chat-item-preview">
            {chat.typing && chat.typing.length > 0
              ? <span style={{ color: 'var(--primary)', fontStyle: 'italic' }}>{USERS[chat.typing[0]]?.name.split(' ').slice(-1)[0]} đang nhập...</span>
              : (
                <React.Fragment>
                  {senderLabel && <span className="chat-item-sender-name">{senderLabel}:</span>}
                  <span>{chat.lastPreview}</span>
                </React.Fragment>
              )
            }
          </span>
          <div className="chat-item-meta">
            {chat.unread > 0
              ? <span className="chat-item-unread">{chat.unread}</span>
              : chat.readers && chat.readers.length > 0 && (
                <div className="chat-item-readers">
                  {chat.readers.slice(0, 3).map((r, i) => {
                    const u = USERS[r];
                    return <span key={i} className="chat-item-reader" style={{ background: u?.color === 'user-1' ? '#6366F1' : u?.color === 'user-2' ? '#EC4899' : u?.color === 'user-3' ? '#F59E0B' : '#06B6D4' }} />;
                  })}
                </div>
              )
            }
          </div>
        </div>

        {chat.type === 'project' && typeof chat.progress === 'number' && (
          <div className="chat-item-progress">
            <div className="chat-item-progress-bar">
              <div className="chat-item-progress-fill" style={{ width: chat.progress + '%' }}></div>
            </div>
            <span className="chat-item-progress-val">{chat.progress}%</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ============ TYPE DROPDOWN ============
const TypeDropdown = ({ value, onChange, chats }) => {
  const Icons = window.Icons;
  const [open, setOpen] = useStateList(false);
  const ref = useRefList(null);

  useEffectList(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const counts = useMemoList(() => {
    const c = { all: 0, group: 0, project: 0, doc: 0, dm: 0 };
    const u = { all: 0, group: 0, project: 0, doc: 0, dm: 0 };
    chats.forEach(ch => {
      c.all += 1; if (c[ch.type] !== undefined) c[ch.type] += 1;
      u.all += ch.unread || 0; if (u[ch.type] !== undefined) u[ch.type] += ch.unread || 0;
    });
    return { c, u };
  }, [chats]);

  const current = TYPE_OPTIONS.find(o => o.id === value) || TYPE_OPTIONS[0];
  const totalUnread = counts.u.all;

  return (
    <div className={`lp-type-dd ${open ? 'open' : ''} ${value !== 'all' ? 'active' : ''}`} ref={ref} onClick={() => setOpen(o => !o)}>
      <span className="label-prefix">Loại:</span>
      <span>{current.label}</span>
      {value === 'all' && totalUnread > 0 && <span className="count-pill">{totalUnread}</span>}
      <Icons.ChevDown size={13} className="ico-chev" />

      {open && (
        <div className="lp-type-menu" onClick={e => e.stopPropagation()}>
          {TYPE_OPTIONS.map(opt => {
            const Ico = Icons[opt.icon];
            const c = counts.c[opt.id];
            const u = counts.u[opt.id];
            return (
              <div key={opt.id} className={`lp-type-menu-item ${value === opt.id ? 'selected' : ''} ${u > 0 ? 'unread' : ''}`} onClick={() => { onChange(opt.id); setOpen(false); }}>
                <div className={`ico ${opt.color}`}><Ico size={13} /></div>
                <span className="lbl">{opt.label}</span>
                {u > 0 ? <span className="cnt">{u}</span> : c > 0 ? <span className="cnt">{c}</span> : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ============ MAIN LIST PANE ============
const PageChatList = ({ activeId, onSelect, chats, currentUser, userStatus, userStatusText, onSetStatus, onSetStatusText, onOpenCompose, onOpenCreateGroup, senderFormat = 'short' }) => {
  const Icons = window.Icons;
  const [query, setQuery] = useStateList('');
  const [typeFilter, setTypeFilter] = useStateList('all');
  const [quickFilter, setQuickFilter] = useStateList(null); // unread | pinned | mention
  const [statusOpen, setStatusOpen] = useStateList(false);
  const [createOpen, setCreateOpen] = useStateList(false);
  const [customText, setCustomText] = useStateList(userStatusText || '');
  const statusRef = useRefList(null);
  const createRef = useRefList(null);

  useEffectList(() => { setCustomText(userStatusText || ''); }, [userStatusText]);

  useEffectList(() => {
    if (!statusOpen) return;
    const onClick = (e) => { if (statusRef.current && !statusRef.current.contains(e.target)) setStatusOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [statusOpen]);

  useEffectList(() => {
    if (!createOpen) return;
    const onClick = (e) => { if (createRef.current && !createRef.current.contains(e.target)) setCreateOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [createOpen]);

  const filtered = useMemoList(() => {
    let f = chats;
    if (typeFilter !== 'all') f = f.filter(c => c.type === typeFilter);
    if (quickFilter === 'unread') f = f.filter(c => c.unread > 0);
    if (quickFilter === 'pinned') f = f.filter(c => c.pinned);
    if (query) {
      const q = query.toLowerCase();
      f = f.filter(c => c.name.toLowerCase().includes(q)
        || (c.lastPreview || '').toLowerCase().includes(q)
        || (c.docNo || '').toLowerCase().includes(q)
        || (c.projectCode || '').toLowerCase().includes(q));
    }
    return f;
  }, [chats, typeFilter, quickFilter, query]);

  const grouped = useMemoList(() => {
    if (typeFilter !== 'all') return null;
    return {
      pinned: filtered.filter(c => c.pinned),
      group: filtered.filter(c => c.type === 'group' && !c.pinned),
      project: filtered.filter(c => c.type === 'project' && !c.pinned),
      doc: filtered.filter(c => c.type === 'doc' && !c.pinned),
      dm: filtered.filter(c => c.type === 'dm' && !c.pinned),
    };
  }, [filtered, typeFilter]);

  const renderSection = (key, label, chipType, items) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="list-section" key={key}>
        <div className="list-section-h">
          {chipType && <span className={`type-chip ${chipType}`}>{label}</span>}
          {!chipType && <span>{label}</span>}
          <span className="count-pill">{items.length}</span>
        </div>
        {items.map(c => <PageChatItem key={c.id} chat={c} isActive={c.id === activeId} onSelect={onSelect} senderFormat={senderFormat} />)}
      </div>
    );
  };

  const currentStatus = STATUS_OPTIONS_LIST.find(s => s.id === userStatus) || STATUS_OPTIONS_LIST[0];

  return (
    <div className="list-pane" style={{ position: 'relative' }}>
      {/* HEADER */}
      <div className="lp-header">
        <div className="lp-header-row">
          <div className="lp-profile" ref={statusRef} onClick={() => setStatusOpen(o => !o)}>
            <div className="lp-profile-avatar">
              {currentUser.short}
              <span className={`pres ${userStatus}`}></span>
            </div>
            <div className="lp-profile-info">
              <div className="lp-profile-name">{currentUser.name}</div>
              <div className="lp-profile-status">
                <span className="dot" style={{ background: `var(--st-${userStatus})` }}></span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {userStatusText || PRESENCE_LABEL[userStatus]}
                </span>
              </div>
            </div>
            <Icons.ChevDown size={14} className="lp-profile-chev" />
          </div>

          <div className="lp-header-actions" ref={createRef}>
            <button className={`lp-action-btn ${createOpen ? 'active' : ''}`} title="Tạo nhóm hoặc soạn tin mới" onClick={(e) => { e.stopPropagation(); setCreateOpen(o => !o); }}>
              <Icons.Plus size={18} />
            </button>
          </div>
        </div>

        {/* SEARCH */}
        <div className="list-search">
          <Icons.Search size={15} />
          <input placeholder="Tìm hội thoại, tin nhắn..." value={query} onChange={e => setQuery(e.target.value)} />
          <kbd>Ctrl+K</kbd>
        </div>
      </div>

      {/* Status popover */}
      {statusOpen && (
        <div className="lp-status-popover" onClick={e => e.stopPropagation()}>
          <div className="status-popover-head">
            <div style={{ width: 38, height: 38, borderRadius: 999, background: 'linear-gradient(135deg,#6366F1,#4338CA)', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 13, position: 'relative' }}>
              {currentUser.short}
              <span className={`rail-avatar-status ${userStatus}`} style={{ bottom: -1, right: -1, border: '2.5px solid white' }}></span>
            </div>
            <div style={{ flex: 1 }}>
              <div className="name">{currentUser.name}</div>
              <div className="role">{currentUser.role}</div>
            </div>
          </div>
          {STATUS_OPTIONS_LIST.map(s => (
            <div key={s.id} className={`status-option ${s.id === userStatus ? 'selected' : ''}`} onClick={() => { onSetStatus(s.id); setStatusOpen(false); }}>
              <span className="status-dot" style={{ background: s.color }}></span>
              <span>{s.label}</span>
              {s.id === userStatus && <span style={{ marginLeft: 'auto' }}><Icons.Check size={14} /></span>}
            </div>
          ))}
          <div className="status-custom-input">
            <input
              placeholder="Trạng thái tuỳ chỉnh..."
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { onSetStatusText(customText); setStatusOpen(false); } }}
            />
            <button className="icon-btn" style={{ background: 'var(--primary)', color: 'white', width: 30, height: 30 }} onClick={() => { onSetStatusText(customText); setStatusOpen(false); }}>
              <Icons.Check size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Create menu */}
      {createOpen && (
        <div className="lp-create-menu" onClick={e => e.stopPropagation()}>
          <div className="lp-create-menu-item" onClick={() => { setCreateOpen(false); onOpenCompose(); }}>
            <div className="ico"><Icons.Send size={15} /></div>
            <div className="lbl">
              <span className="t">Soạn tin mới</span>
              <span className="d">Bắt đầu trao đổi 1-1 với 1 thành viên</span>
            </div>
          </div>
          <div className="lp-create-menu-item" onClick={() => { setCreateOpen(false); onOpenCreateGroup(); }}>
            <div className="ico"><Icons.Users size={15} /></div>
            <div className="lbl">
              <span className="t">Tạo nhóm mới</span>
              <span className="d">Nhóm chat với nhiều thành viên</span>
            </div>
          </div>
        </div>
      )}

      {/* FILTER ROW */}
      <div className="lp-filter-row">
        <TypeDropdown value={typeFilter} onChange={setTypeFilter} chats={chats} />
        <span className={`lp-quick-chip ${quickFilter === 'unread' ? 'active' : ''}`} onClick={() => setQuickFilter(quickFilter === 'unread' ? null : 'unread')}>
          Chưa đọc
        </span>
        <span className={`lp-quick-chip ${quickFilter === 'pinned' ? 'active' : ''}`} onClick={() => setQuickFilter(quickFilter === 'pinned' ? null : 'pinned')}>
          <Icons.Pin size={10} /> Ghim
        </span>
        <span className={`lp-quick-chip ${quickFilter === 'mention' ? 'active' : ''}`} onClick={() => setQuickFilter(quickFilter === 'mention' ? null : 'mention')}>
          @Tôi
        </span>
      </div>

      {/* LIST */}
      <div className="list-body">
        {typeFilter === 'all' && grouped ? (
          <React.Fragment>
            {renderSection('pinned', '📌 Đã ghim', null, grouped.pinned)}
            {renderSection('group', 'Nhóm', 'group', grouped.group)}
            {renderSection('project', 'Dự án', 'project', grouped.project)}
            {renderSection('doc', 'Chứng từ', 'doc', grouped.doc)}
            {renderSection('dm', 'Cá nhân', 'dm', grouped.dm)}
          </React.Fragment>
        ) : (
          <div className="list-section">
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32, fontSize: 13 }}>
                Không có hội thoại nào
              </div>
            ) : (
              filtered.map(c => <PageChatItem key={c.id} chat={c} isActive={c.id === activeId} onSelect={onSelect} senderFormat={senderFormat} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
};

window.PageChatList = PageChatList;
