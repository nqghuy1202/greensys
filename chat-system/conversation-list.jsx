/* Conversation list (LEFT pane of chat modal) */
/* Exposes window.ConversationList */

const Avatar = ({ user, size = 40, showPresence = true }) => {
  const u = window.CHAT_DATA.USERS[user] || { short: '?', color: 'user-1', presence: 'offline' };
  return (
    <div className={`convo-avatar ${u.color}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {u.short}
      {showPresence && <span className={`presence ${u.presence}`}></span>}
    </div>
  );
};

const GroupAvatar = ({ size = 40 }) => (
  <div className="convo-avatar group" style={{ width: size, height: size, fontSize: size * 0.4 }}>
    <window.Icons.Users size={Math.floor(size * 0.5)} stroke={2.2} />
  </div>
);

const ReaderDots = ({ readers }) => {
  if (!readers || readers.length === 0) return null;
  const palette = { vananh: '#EC4899', bich: '#F59E0B', nam: '#06B6D4', ha: '#6366F1', long: '#10B981', thuy: '#F59E0B', me: '#6366F1' };
  return (
    <div className="convo-readers" title={`Đã đọc bởi ${readers.length} người`}>
      {readers.slice(0, 3).map((r, i) => (
        <span key={i} className="convo-reader-avatar" style={{ background: palette[r] || '#9CA3AF' }} />
      ))}
    </div>
  );
};

const ConversationList = ({ activeId, onSelect, onCreateNew, query, setQuery, activeTab, setActiveTab, conversations }) => {
  const Icons = window.Icons;
  const totalUnread = conversations.reduce((a, c) => a + (c.unread || 0), 0);

  const groups = conversations.filter(c => c.type === 'group');
  const dms = conversations.filter(c => c.type === 'dm');

  const filt = (list) => {
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter(c => c.name.toLowerCase().includes(q) || (c.lastPreview || '').toLowerCase().includes(q));
  };

  const renderItem = (c) => {
    const USERS = window.CHAT_DATA.USERS;
    const isActive = c.id === activeId;
    const unread = c.unread > 0;
    const sender = c.lastSender ? USERS[c.lastSender] : null;
    const senderIsMe = c.lastSender === 'me';

    // Only show sender badge for groups — DMs are 1-1 so the avatar already identifies them
    const showSenderBadge = sender && c.type === 'group';

    // Sender label in preview
    const senderLabel = senderIsMe ? 'Bạn' : (sender ? sender.name : null);

    // Mini avatar colors palette (matches user.color)
    const grad = {
      'user-1': 'linear-gradient(135deg,#6366F1,#4338CA)',
      'user-2': 'linear-gradient(135deg,#EC4899,#BE185D)',
      'user-3': 'linear-gradient(135deg,#F59E0B,#B45309)',
      'user-4': 'linear-gradient(135deg,#06B6D4,#0E7490)',
    };

    return (
      <div key={c.id} className={`convo-item ${isActive ? 'active' : ''} ${unread ? 'unread' : ''}`} onClick={() => onSelect(c.id)}>
        <div className="convo-avatar-wrap">
          {c.type === 'group' ? <GroupAvatar size={40} /> : <Avatar user={c.members.find(m => m !== 'me')} size={40} />}
          {showSenderBadge && (
            <div className="convo-sender-badge" style={{ background: grad[sender.color] }} title={`${sender.name} · ${sender.presence}`}>
              {sender.short}
              <span className={`badge-presence ${sender.presence}`}></span>
            </div>
          )}
        </div>
        <div className="convo-content">
          <div className="convo-row1">
            <span className="convo-name">
              {c.pinned && <Icons.Pin size={11} style={{ marginRight: 4, color: 'var(--text-3)', verticalAlign: '-1px' }} />}
              {c.name}
            </span>
            <span className="convo-time">{c.lastTime}</span>
          </div>
          <div className="convo-row2">
            <span className="convo-preview">
              {c.typing && c.typing.length > 0
                ? <span style={{ color: 'var(--primary)', fontStyle: 'italic' }}>{USERS[c.typing[0]]?.name.split(' ').slice(-1)[0]} đang nhập...</span>
                : (
                  <React.Fragment>
                    {senderLabel && <span className="convo-sender-name">{senderLabel}:</span>}
                    <span className="convo-preview-body">{c.lastPreview}</span>
                  </React.Fragment>
                )
              }
            </span>
            <div className="convo-meta">
              {!unread && c.readers && <ReaderDots readers={c.readers} />}
              {unread && <span className="convo-badge">{c.unread}</span>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="convo-pane">
      <div className="convo-toolbar">
        <div className="convo-search">
          <Icons.Search size={15} />
          <input placeholder="Tìm hội thoại, tin nhắn..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="convo-tabs">
          <button type="button"className={`convo-tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
            Tất cả {totalUnread > 0 && <span className="count">{totalUnread}</span>}
          </button>
          <button type="button"className={`convo-tab ${activeTab === 'unread' ? 'active' : ''}`} onClick={() => setActiveTab('unread')}>Chưa đọc</button>
          <button type="button"className={`convo-tab ${activeTab === 'mention' ? 'active' : ''}`} onClick={() => setActiveTab('mention')}>@Tôi</button>
        </div>
      </div>

      <div className="convo-list">
        <div style={{ padding: '8px 10px 0', fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Hash size={11} />
          <span>Đang xem: <b style={{ color: 'var(--primary-700)' }}>SO-2601/010</b></span>
        </div>

        {filt(groups).length > 0 && <div className="convo-section-label">Nhóm trao đổi · {filt(groups).length}</div>}
        {filt(groups).map(renderItem)}

        {filt(dms).length > 0 && <div className="convo-section-label">Trao đổi cá nhân · {filt(dms).length}</div>}
        {filt(dms).map(renderItem)}

        {filt(groups).length + filt(dms).length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 24, fontSize: 13 }}>
            Không tìm thấy hội thoại nào
          </div>
        )}
      </div>

      <button type="button"className="convo-new-btn" onClick={onCreateNew}>
        <Icons.Plus size={16} /> Tạo nhóm trao đổi mới
      </button>
    </div>
  );
};

window.ConversationList = ConversationList;
window.Avatar = Avatar;
window.GroupAvatar = GroupAvatar;
