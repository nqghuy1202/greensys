/* Left rail — categories + status user */
/* Exposes window.Rail */

const { useState: useStateRail, useEffect: useEffectRail, useRef: useRefRail } = React;

const STATUS_OPTIONS = [
  { id: 'online', label: 'Đang hoạt động', color: 'var(--st-online)' },
  { id: 'away', label: 'Vắng mặt', color: 'var(--st-away)' },
  { id: 'busy', label: 'Đừng làm phiền', color: 'var(--st-busy)' },
  { id: 'meeting', label: 'Đang họp', color: 'var(--st-meeting)' },
  { id: 'offline', label: 'Vô hình', color: 'var(--st-offline)' },
];

const RAIL_TABS = [
  { id: 'all', label: 'Tất cả', icon: 'Home' },
  { id: 'group', label: 'Nhóm', icon: 'Users' },
  { id: 'project', label: 'Dự án', icon: 'Briefcase' },
  { id: 'doc', label: 'Chứng từ', icon: 'FileText' },
  { id: 'dm', label: 'Cá nhân', icon: 'User' },
];

const RAIL_TABS_BOTTOM = [
  { id: 'contacts', label: 'Danh bạ', icon: 'Contacts' },
  { id: 'saved', label: 'Đã lưu', icon: 'Bookmark' },
];

const Rail = ({ activeTab, onChangeTab, unreadCounts, currentUser, userStatus, userStatusText, onSetStatus, onSetStatusText }) => {
  const Icons = window.Icons;
  const [statusOpen, setStatusOpen] = useStateRail(false);
  const [customText, setCustomText] = useStateRail(userStatusText || '');
  const popoverRef = useRefRail(null);

  useEffectRail(() => {
    if (!statusOpen) return;
    const onClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) setStatusOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [statusOpen]);

  const renderItem = (t) => {
    const Ico = Icons[t.icon] || Icons.Home;
    const count = unreadCounts?.[t.id];
    return (
      <div key={t.id} className={`rail-item ${activeTab === t.id ? 'active' : ''}`} onClick={() => onChangeTab(t.id)} title={t.label}>
        <Ico size={20} />
        <span className="label">{t.label}</span>
        {count > 0 && <span className="rail-badge">{count > 99 ? '99+' : count}</span>}
      </div>
    );
  };

  const currentStatus = STATUS_OPTIONS.find(s => s.id === userStatus) || STATUS_OPTIONS[0];

  return (
    <div className="rail">
      <div className="rail-logo" title="Chat hệ thống">CG</div>
      <div className="rail-sep"></div>

      <div className="rail-group">
        {RAIL_TABS.map(renderItem)}
      </div>

      <div className="rail-sep"></div>

      <div className="rail-group">
        {RAIL_TABS_BOTTOM.map(renderItem)}
      </div>

      <div className="rail-group bottom">
        <div className="rail-item" title="Cài đặt">
          <Icons.Cog size={20} />
          <span className="label">Cài đặt</span>
        </div>

        <div className="rail-avatar-wrap" onClick={() => setStatusOpen(o => !o)} title={`${currentUser.name} · ${currentStatus.label}`}>
          <div className="rail-avatar">{currentUser.short}</div>
          <span className={`rail-avatar-status ${userStatus}`}></span>

          {statusOpen && (
            <div className="status-popover" ref={popoverRef} onClick={e => e.stopPropagation()}>
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

              {STATUS_OPTIONS.map(s => (
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
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      onSetStatusText(customText);
                      setStatusOpen(false);
                    }
                  }}
                />
                <button className="icon-btn" style={{ background: 'var(--primary)', color: 'white', width: 30, height: 30 }} onClick={() => { onSetStatusText(customText); setStatusOpen(false); }}>
                  <Icons.Check size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

window.Rail = Rail;
