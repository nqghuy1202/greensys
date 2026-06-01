/* Conversation list — LEFT pane of Doc Chat Modal */
/* Exposes window.ConversationList, window.avatarColor, window.avatarShort */

const AVATAR_COLORS = [
  'linear-gradient(135deg,#6366F1,#4338CA)',
  'linear-gradient(135deg,#EC4899,#BE185D)',
  'linear-gradient(135deg,#F59E0B,#B45309)',
  'linear-gradient(135deg,#06B6D4,#0E7490)',
  'linear-gradient(135deg,#10B981,#065F46)',
  'linear-gradient(135deg,#F97316,#C2410C)',
  'linear-gradient(135deg,#8B5CF6,#6D28D9)',
  'linear-gradient(135deg,#EF4444,#B91C1C)',
];

function avatarColor(ausId) {
  return AVATAR_COLORS[Number(ausId) % AVATAR_COLORS.length];
}

function avatarShort(fullName) {
  if (!fullName) return '?';
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1][0].toUpperCase();
}

const UserAvatar = ({ ausId, fullName, size = 40, presence }) => (
  <div className="convo-avatar" style={{
    width: size, height: size, fontSize: size * 0.36,
    background: avatarColor(ausId), borderRadius: '50%',
    display: 'grid', placeItems: 'center', color: 'white', fontWeight: 600,
    position: 'relative', flexShrink: 0
  }}>
    {avatarShort(fullName)}
    {presence && <span className={`presence ${presence}`}></span>}
  </div>
);

const GroupAvatar = ({ size = 40 }) => (
  <div className="convo-avatar group" style={{ width: size, height: size, fontSize: size * 0.4 }}>
    <window.Icons.Users size={Math.floor(size * 0.5)} stroke={2.2} />
  </div>
);

const ConversationList = ({
  conversations, activeId, onSelect, onCreateNew,
  query, setQuery, activeTab, setActiveTab,
  currentAusId, docCtx, typingMap
}) => {
  const Icons = window.Icons;

  const groups = conversations.filter(c => c.conv_type === 'CHANNEL');
  const dms    = conversations.filter(c => c.conv_type === 'DM');
  const totalUnread = conversations.reduce((a, c) => a + (c.unread_count || 0), 0);
  const unreadOnly  = conversations.filter(c => c.unread_count > 0);

  const filt = (list) => {
    let src = list;
    if (activeTab === 'unread') src = src.filter(c => c.unread_count > 0);
    if (!query) return src;
    const q = query.toLowerCase();
    return src.filter(c =>
      (c.display_name || '').toLowerCase().includes(q) ||
      (c.last_msg_preview || '').toLowerCase().includes(q)
    );
  };

  const renderItem = (c) => {
    const isActive  = c.conv_id === activeId;
    const hasUnread = c.unread_count > 0;
    const typing    = (typingMap || {})[c.conv_id] || [];

    return (
      <div
        key={c.conv_id}
        className={`convo-item ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''}`}
        onClick={() => onSelect(c.conv_id)}
      >
        <div className="convo-avatar-wrap">
          {c.conv_type === 'CHANNEL'
            ? <GroupAvatar size={40} />
            : <UserAvatar ausId={c.partner_aus_id || c.conv_id} fullName={c.display_name} size={40} />
          }
        </div>
        <div className="convo-content">
          <div className="convo-row1">
            <span className="convo-name">{c.display_name || '(Không tên)'}</span>
            <span className="convo-time">{c.last_msg_time || ''}</span>
          </div>
          <div className="convo-row2">
            <span className="convo-preview">
              {typing.length > 0
                ? <span style={{ color: 'var(--primary)', fontStyle: 'italic' }}>
                    {typing[0].name.split(' ').slice(-1)[0]} đang nhập...
                  </span>
                : (c.last_msg_preview || <span style={{ color: 'var(--text-4)' }}>Chưa có tin nhắn</span>)
              }
            </span>
            <div className="convo-meta">
              {hasUnread && <span className="convo-badge">{c.unread_count}</span>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const visibleGroups = filt(groups);
  const visibleDms    = filt(dms);
  const hasResults    = visibleGroups.length + visibleDms.length > 0;

  return (
    <div className="convo-pane">
      <div className="convo-toolbar">
        <div className="convo-search">
          <Icons.Search size={15} />
          <input
            placeholder="Tìm hội thoại..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="convo-tabs">
          <button type="button" className={`convo-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}>
            Tất cả {totalUnread > 0 && <span className="count">{totalUnread}</span>}
          </button>
          <button type="button" className={`convo-tab ${activeTab === 'unread' ? 'active' : ''}`}
            onClick={() => setActiveTab('unread')}>
            Chưa đọc {unreadOnly.length > 0 && <span className="count">{unreadOnly.length}</span>}
          </button>
        </div>
      </div>

      <div style={{ padding: '6px 18px 4px', fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 5 }}>
        <Icons.Hash size={11} />
        <span>Đang xem: <b style={{ color: 'var(--primary-700)' }}>{docCtx.doc_no}</b></span>
      </div>

      <div className="convo-list">
        {visibleGroups.length > 0 && (
          <div className="convo-section-label">Nhóm trao đổi · {visibleGroups.length}</div>
        )}
        {visibleGroups.map(renderItem)}

        {visibleDms.length > 0 && (
          <div className="convo-section-label">Trao đổi cá nhân · {visibleDms.length}</div>
        )}
        {visibleDms.map(renderItem)}

        {!hasResults && (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '24px 16px', fontSize: 13 }}>
            {query ? 'Không tìm thấy hội thoại nào' : 'Chưa có hội thoại nào'}
          </div>
        )}
      </div>

      <button type="button" className="convo-new-btn" onClick={onCreateNew}>
        <Icons.Plus size={16} /> Tạo nhóm trao đổi mới
      </button>
    </div>
  );
};

window.ConversationList = ConversationList;
window.avatarColor = avatarColor;
window.avatarShort = avatarShort;
window.UserAvatar  = UserAvatar;
window.GroupAvatar = GroupAvatar;
