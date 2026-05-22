// LEFT SIDEBAR — conversation list

function Avatar({ user, channel, icon, size = 'md', showStatus = true }) {
  if (channel) {
    const iconMap = {
      warehouse: <Icons.warehouse size={18}/>,
      sales: <Icons.sales size={18}/>,
      accounting: <Icons.accounting size={18}/>,
      megaphone: <Icons.megaphone size={18}/>,
      document: <Icons.doc size={18}/>,
    };
    return (
      <div className={`avatar channel ${size === 'sm' ? 'sm' : ''} ${size === 'lg' ? 'lg' : ''} ${size === 'xl' ? 'xl' : ''}`}>
        {iconMap[icon] || <Icons.hash size={18}/>}
      </div>
    );
  }
  if (!user) return null;
  const sizeCls = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : size === 'xl' ? 'xl' : '';
  return (
    <div className={`avatar color-${user.color} ${sizeCls}`}>
      {user.short}
      {showStatus && user.status !== 'offline' && (
        <span className={`status-dot ${user.status}`} />
      )}
    </div>
  );
}

function ConvItem({ conv, users, isActive, onClick }) {
  const isChannel = conv.type === 'channel';
  const user = !isChannel ? users[conv.user] : null;
  const name = isChannel ? conv.name : user.name;
  return (
    <div
      className={`conv-item ${isActive ? 'active' : ''} ${conv.unread > 0 ? 'unread' : ''}`}
      onClick={onClick}
    >
      {isChannel
        ? <Avatar channel icon={conv.icon}/>
        : <Avatar user={user}/>}
      <div className="body">
        <div className="name">
          <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{name}</span>
          {conv.pinned && <Icons.pin size={11} className="pin" style={{color:'var(--amber)', flexShrink:0}}/>}
        </div>
        <div className="preview">{conv.lastPreview}</div>
      </div>
      <div className="meta">
        <span className="time">{conv.lastTime}</span>
        {conv.unread > 0 && <span className="unread-badge">{conv.unread}</span>}
      </div>
    </div>
  );
}

function Sidebar({ conversations, users, activeId, onSelectConv, searchQuery, onSearch, activeTab, onTab, totalUnread }) {
  const filtered = React.useMemo(() => {
    let arr = conversations;
    if (activeTab === 'unread') arr = arr.filter(c => c.unread > 0);
    if (activeTab === 'channels') arr = arr.filter(c => c.type === 'channel');
    if (activeTab === 'dms') arr = arr.filter(c => c.type === 'dm');
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      arr = arr.filter(c => {
        const name = c.type === 'channel' ? c.name : users[c.user].name;
        return name.toLowerCase().includes(q) ||
               (c.lastPreview || '').toLowerCase().includes(q);
      });
    }
    return arr;
  }, [conversations, activeTab, searchQuery, users]);

  const pinned = filtered.filter(c => c.pinned);
  const channels = filtered.filter(c => c.type === 'channel' && !c.pinned);
  const dms = filtered.filter(c => c.type === 'dm' && !c.pinned);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="row-1">
          <h2>Trò chuyện</h2>
          <span className="count">{conversations.length}</span>
        </div>
        <div className="search-box">
          <Icons.search size={14} className="ic"/>
          <input
            type="text"
            placeholder="Tìm kiếm tin nhắn, nhóm, nhân viên..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
          />
          {searchQuery && (
            <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Search_Clear" onClick={() => onSearch('')} data-otel-label="SEARCH_CLEAR">
              <span className="t-Icon fa fa-times" aria-hidden="true"></span>
              <span className="t-Button-label u-VisuallyHidden">Xóa tìm kiếm</span>
            </button>
          )}
        </div>
        <div className="tabs">
          <button className={`t-Button${activeTab === 'all' ? ' t-Button--hot' : ''}`} type="button" id="Btn_Tab_All" onClick={() => onTab('all')} data-otel-label="TAB_ALL">
            <span className="t-Button-label">Tất cả</span>
          </button>
          <button className={`t-Button${activeTab === 'unread' ? ' t-Button--hot' : ''}`} type="button" id="Btn_Tab_Unread" onClick={() => onTab('unread')} data-otel-label="TAB_UNREAD">
            <span className="t-Button-label">Chưa đọc {totalUnread > 0 && <span className="dot">{totalUnread}</span>}</span>
          </button>
          <button className={`t-Button${activeTab === 'channels' ? ' t-Button--hot' : ''}`} type="button" id="Btn_Tab_Channels" onClick={() => onTab('channels')} data-otel-label="TAB_CHANNELS">
            <span className="t-Button-label">Nhóm</span>
          </button>
          <button className={`t-Button${activeTab === 'dms' ? ' t-Button--hot' : ''}`} type="button" id="Btn_Tab_DMs" onClick={() => onTab('dms')} data-otel-label="TAB_DMS">
            <span className="t-Button-label">Riêng</span>
          </button>
        </div>
      </div>

      <div className="conv-list">
        {filtered.length === 0 && (
          <div className="state-block" style={{height:'auto', paddingTop:48}}>
            <div className="ic"><Icons.search size={24}/></div>
            <h4>Không tìm thấy</h4>
            <p>Không có hội thoại nào khớp với "{searchQuery}". Thử từ khoá khác.</p>
          </div>
        )}

        {pinned.length > 0 && (
          <>
            <div className="conv-section-label">
              <span><Icons.pin size={10} style={{display:'inline', marginRight:4, color:'var(--amber)'}}/> Đã ghim ({pinned.length})</span>
            </div>
            {pinned.map(c => (
              <ConvItem key={c.id} conv={c} users={users}
                isActive={c.id === activeId} onClick={() => onSelectConv(c.id)}/>
            ))}
          </>
        )}

        {channels.length > 0 && (
          <>
            <div className="conv-section-label">
              <span>Phòng & Nhóm ({channels.length})</span>
              <button className="t-Button t-Button--icon t-Button--noLabel chev" type="button" id="Btn_Add_Channel" data-otel-label="ADD_CHANNEL">
                <span className="t-Icon fa fa-plus" aria-hidden="true"></span>
                <span className="t-Button-label u-VisuallyHidden">Thêm nhóm</span>
              </button>
            </div>
            {channels.map(c => (
              <ConvItem key={c.id} conv={c} users={users}
                isActive={c.id === activeId} onClick={() => onSelectConv(c.id)}/>
            ))}
          </>
        )}

        {dms.length > 0 && (
          <>
            <div className="conv-section-label">
              <span>Tin nhắn riêng ({dms.length})</span>
              <button className="t-Button t-Button--icon t-Button--noLabel chev" type="button" id="Btn_Add_DM" data-otel-label="ADD_DM">
                <span className="t-Icon fa fa-plus" aria-hidden="true"></span>
                <span className="t-Button-label u-VisuallyHidden">Thêm tin nhắn riêng</span>
              </button>
            </div>
            {dms.map(c => (
              <ConvItem key={c.id} conv={c} users={users}
                isActive={c.id === activeId} onClick={() => onSelectConv(c.id)}/>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}

window.Avatar = Avatar;
window.Sidebar = Sidebar;
