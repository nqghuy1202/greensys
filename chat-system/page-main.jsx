/* Main view: header + chat thread + variant info panels + contacts/saved */
/* Exposes window.PageMain, window.ContactsView, window.SavedView */

const { useState: useStateMain, useRef: useRefMain, useEffect: useEffectMain } = React;

const memberGrad = {
  'user-1': 'linear-gradient(135deg,#6366F1,#4338CA)',
  'user-2': 'linear-gradient(135deg,#EC4899,#BE185D)',
  'user-3': 'linear-gradient(135deg,#F59E0B,#B45309)',
  'user-4': 'linear-gradient(135deg,#06B6D4,#0E7490)',
};

// ============ MAIN HEADER ============
const MainHeader = ({ chat, onToggleInfo, infoOpen, onOpenStatus }) => {
  const Icons = window.Icons;
  const USERS = window.PAGE_DATA.USERS;

  const onlineCount = chat.members.filter(m => USERS[m]?.presence === 'online').length;
  const otherUser = chat.type === 'dm' ? USERS[chat.members.find(m => m !== 'me')] : null;

  const statusVariant = chat.docStatus === 'Đang lập' ? 'draft'
                      : chat.docStatus === 'Đã duyệt' ? 'approved'
                      : chat.docStatus === 'Hoàn thành' ? 'done'
                      : chat.docStatus === 'Chờ duyệt' ? 'draft'
                      : 'draft';

  return (
    <div className="main-head">
      <div className={`main-head-icon t-${chat.type} ${chat.type === 'dm' && otherUser ? otherUser.color : ''}`}>
        {chat.type === 'group' && <Icons.Users size={20} />}
        {chat.type === 'project' && <Icons.Briefcase size={20} />}
        {chat.type === 'doc' && <Icons.FileText size={20} />}
        {chat.type === 'dm' && otherUser?.short}
      </div>

      <div className="main-head-info">
        <div className="main-head-titlerow">
          <span className="main-head-title">{chat.name}</span>
          {chat.type === 'doc' && (
            <React.Fragment>
              <span className="main-head-pill doc" title="Mở chứng từ">
                <Icons.Hash size={11} /> {chat.docNo}
                <Icons.ExtLink size={10} />
              </span>
              <span className={`main-head-pill status ${statusVariant}`}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor' }}></span>
                {chat.docStatus}
              </span>
            </React.Fragment>
          )}
          {chat.type === 'project' && (
            <React.Fragment>
              <span className="main-head-pill project">
                <Icons.Hash size={11} /> {chat.projectCode}
              </span>
              <span className="main-head-pill status">
                <Icons.Clock size={11} /> Hạn {chat.deadline}
              </span>
            </React.Fragment>
          )}
        </div>

        <div className="main-head-sub">
          {chat.type !== 'dm' && (
            <React.Fragment>
              <div className="main-head-members-stack">
                {chat.members.slice(0, 5).map((m, i) => {
                  const u = USERS[m];
                  return (
                    <span key={i} className="main-head-member-mini" style={{ background: memberGrad[u?.color] || '#9CA3AF' }} title={u?.name}>
                      {u?.short}
                    </span>
                  );
                })}
                {chat.members.length > 5 && (
                  <span className="main-head-member-mini" style={{ background: 'var(--bg-2)', color: 'var(--text-2)' }}>
                    +{chat.members.length - 5}
                  </span>
                )}
              </div>
              <span>{chat.memberCount || chat.members.length} thành viên</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--st-online)' }}></span>
                {onlineCount} đang online
              </span>
            </React.Fragment>
          )}
          {chat.type === 'dm' && otherUser && (
            <React.Fragment>
              <span>{otherUser.role}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: `var(--st-${otherUser.presence})` }}></span>
                {otherUser.presence === 'online' ? 'Đang hoạt động'
                  : otherUser.presence === 'away' ? 'Vắng mặt'
                  : otherUser.presence === 'busy' ? 'Đừng làm phiền'
                  : otherUser.presence === 'meeting' ? 'Đang họp'
                  : 'Ngoại tuyến'}
                {otherUser.statusText && <span style={{ marginLeft: 4, color: 'var(--text-2)' }}>· {otherUser.statusText}</span>}
              </span>
            </React.Fragment>
          )}
        </div>
      </div>

      <div className="main-head-actions">
        <button type="button"className="icon-btn" title="Gọi thoại"><Icons.Phone size={16} /></button>
        <button type="button"className="icon-btn" title="Gọi video"><Icons.Video size={16} /></button>
        <button type="button"className="icon-btn" title="Tìm trong hội thoại"><Icons.Search size={16} /></button>
        <button type="button"className="icon-btn" title="Ghim"><Icons.Pin size={16} /></button>
        {chat.type !== 'dm' && <button type="button"className="icon-btn" title="Thêm thành viên"><Icons.Users size={16} /></button>}
        <button type="button"className={`icon-btn ${infoOpen ? 'active' : ''}`} title="Thông tin" onClick={onToggleInfo}><Icons.PanelR size={16} /></button>
        <button type="button"className="icon-btn" title="Thêm"><Icons.More size={16} /></button>
      </div>
    </div>
  );
};

// ============ INFO PANEL VARIANTS ============

const InfoPanelDoc = ({ chat }) => {
  const Icons = window.Icons;
  const USERS = window.PAGE_DATA.USERS;
  return (
    <div className="info-pane-page">
      <div className="info-head">
        <Icons.FileText size={16} style={{ color: 'var(--type-doc)' }} />
        <span className="info-head-title">Thông tin chứng từ</span>
      </div>

      <div className="info-section">
        <div className="doc-summary-card">
          <div className="doc-summary-no">
            <span><Icons.Hash size={12} style={{ verticalAlign: '-1px', marginRight: 2 }} />{chat.docNo}</span>
            <span className="status">{chat.docStatus}</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 10 }}>{chat.docType}</div>
          <div className="doc-summary-rows">
            <div className="doc-summary-row"><span className="k">Đối tượng</span><span className="v">{chat.customer}</span></div>
            <div className="doc-summary-row"><span className="k">Giá trị</span><span className="v money">{chat.docValue}</span></div>
          </div>
        </div>
      </div>

      <div className="info-section">
        <div className="info-section-title">Thao tác nhanh</div>
        <div className="quick-action"><div className="quick-action-icon"><Icons.ExtLink size={14} /></div>Mở chứng từ</div>
        <div className="quick-action"><div className="quick-action-icon"><Icons.CircleCheck size={14} /></div>Duyệt chứng từ</div>
        <div className="quick-action"><div className="quick-action-icon"><Icons.Print size={14} /></div>In chứng từ</div>
        <div className="quick-action"><div className="quick-action-icon"><Icons.Save size={14} /></div>Tải PDF</div>
      </div>

      <div className="info-section">
        <div className="info-section-title">Thành viên <span className="count">{chat.members.length}</span><span className="action">+ Thêm</span></div>
        {chat.members.map(uid => {
          const u = USERS[uid]; if (!u) return null;
          return (
            <div className="member-row" key={uid}>
              <div className="member-avatar" style={{ background: memberGrad[u.color] }}>
                {u.short}<span className={`presence ${u.presence}`} style={{ background: `var(--st-${u.presence})` }}></span>
              </div>
              <div className="member-info">
                <div className="member-name">{u.name}{uid === 'me' && ' (bạn)'}</div>
                <div className="member-role">{u.role}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const InfoPanelProject = ({ chat }) => {
  const Icons = window.Icons;
  const USERS = window.PAGE_DATA.USERS;
  return (
    <div className="info-pane-page">
      <div className="info-head">
        <Icons.Briefcase size={16} style={{ color: 'var(--type-project)' }} />
        <span className="info-head-title">Thông tin dự án</span>
      </div>

      <div className="info-section">
        <div className="progress-card">
          <div className="progress-row">
            <div>
              <div className="progress-label">Tiến độ tổng</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{chat.projectCode}</div>
            </div>
            <span className="progress-val">{chat.progress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: chat.progress + '%' }}></div>
          </div>
          <div className="progress-dates">
            <span>Bắt đầu: {chat.startDate}</span>
            <span>Hạn: {chat.deadline}</span>
          </div>
        </div>
      </div>

      <div className="info-section">
        <div className="info-section-title"><Icons.Flag size={11} /> Milestone <span className="count">{chat.milestones?.length || 0}</span></div>
        <div className="milestones">
          {chat.milestones?.map((m, i) => (
            <div className={`milestone ${m.done ? 'done' : ''} ${m.current ? 'current' : ''}`} key={i}>
              <div className="dot"></div>
              <div className="milestone-info">
                <div className="milestone-name">{m.name}</div>
                <div className="milestone-date">{m.date}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="info-section">
        <div className="info-section-title">
          <Icons.CheckSquare size={11} /> Công việc <span className="count">{chat.todos?.length || 0}</span>
          <span className="action">+ Thêm</span>
        </div>
        {chat.todos?.map((t, i) => {
          const a = USERS[t.assignee];
          return (
            <div className={`todo-row ${t.done ? 'done' : ''}`} key={i}>
              <div className="todo-check">
                {t.done && <Icons.Check size={12} stroke={3} />}
              </div>
              <div className="todo-content">
                <div className="todo-text">{t.text}</div>
                <div className="todo-meta">
                  <span className={`todo-priority ${t.priority}`}>{t.priority === 'high' ? 'Cao' : t.priority === 'medium' ? 'TB' : 'Thấp'}</span>
                  <span className="todo-assignee">
                    <span className="dot-av" style={{ background: memberGrad[a?.color] }}>{a?.short}</span>
                    {a?.name.split(' ').slice(-1)[0]}
                  </span>
                  <span className="todo-due">· {t.dueDate}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="info-section">
        <div className="info-section-title">Thành viên <span className="count">{chat.members.length}</span></div>
        {chat.members.slice(0, 5).map(uid => {
          const u = USERS[uid]; if (!u) return null;
          return (
            <div className="member-row" key={uid}>
              <div className="member-avatar" style={{ background: memberGrad[u.color] }}>
                {u.short}<span className="presence" style={{ background: `var(--st-${u.presence})` }}></span>
              </div>
              <div className="member-info">
                <div className="member-name">{u.name}</div>
                <div className="member-role">{u.role}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const InfoPanelGroup = ({ chat }) => {
  const Icons = window.Icons;
  const USERS = window.PAGE_DATA.USERS;
  return (
    <div className="info-pane-page">
      <div className="info-head">
        <Icons.Users size={16} style={{ color: 'var(--type-group)' }} />
        <span className="info-head-title">Thông tin nhóm</span>
      </div>

      <div className="profile-hero">
        <div className="profile-avatar" style={{ background: 'linear-gradient(135deg,#14B8A6,#0F766E)', borderRadius: 18 }}>
          <Icons.Users size={32} />
        </div>
        <div className="profile-name">{chat.name}</div>
        <div className="profile-role">{chat.members.length} thành viên</div>
      </div>

      <div className="profile-actions">
        <button type="button"className="profile-action"><Icons.Bell size={14} /> Bật/tắt thông báo</button>
        <button type="button"className="profile-action"><Icons.Pin size={14} /> Ghim nhóm</button>
      </div>

      <div className="info-section">
        <div className="info-section-title">Thành viên <span className="count">{chat.members.length}</span><span className="action">+ Mời</span></div>
        {chat.members.map(uid => {
          const u = USERS[uid]; if (!u) return null;
          return (
            <div className="member-row" key={uid}>
              <div className="member-avatar" style={{ background: memberGrad[u.color] }}>
                {u.short}<span className="presence" style={{ background: `var(--st-${u.presence})` }}></span>
              </div>
              <div className="member-info">
                <div className="member-name">{u.name}{uid === 'me' && ' (bạn)'}</div>
                <div className="member-role">{u.role}</div>
              </div>
              {uid === chat.members[0] && <span className="member-badge owner">CHỦ NHÓM</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const InfoPanelDm = ({ chat }) => {
  const Icons = window.Icons;
  const USERS = window.PAGE_DATA.USERS;
  const otherUid = chat.members.find(m => m !== 'me');
  const u = USERS[otherUid];
  if (!u) return null;

  return (
    <div className="info-pane-page">
      <div className="info-head">
        <Icons.User size={16} />
        <span className="info-head-title">Thông tin liên hệ</span>
      </div>

      <div className="profile-hero">
        <div className="profile-avatar" style={{ background: memberGrad[u.color] }}>
          {u.short}<span className="presence" style={{ background: `var(--st-${u.presence})` }}></span>
        </div>
        <div className="profile-name">{u.name}</div>
        <div className="profile-role">{u.role} · {u.dept}</div>
        {u.statusText && <div className="profile-status-text"><Icons.Status size={9} />{u.statusText}</div>}
      </div>

      <div className="profile-actions">
        <button type="button"className="profile-action"><Icons.Phone size={14} /> Gọi</button>
        <button type="button"className="profile-action"><Icons.Video size={14} /> Video</button>
        <button type="button"className="profile-action"><Icons.Bell size={14} /> Tắt báo</button>
      </div>

      <div className="info-section">
        <div className="info-section-title">Thông tin</div>
        <div style={{ fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span style={{ color: 'var(--text-3)' }}>Phòng ban</span><span>{u.dept}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span style={{ color: 'var(--text-3)' }}>Chức vụ</span><span>{u.role}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span style={{ color: 'var(--text-3)' }}>Trạng thái</span><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: `var(--st-${u.presence})` }}></span>{u.presence === 'online' ? 'Hoạt động' : u.presence === 'away' ? 'Vắng mặt' : u.presence === 'busy' ? 'Bận' : u.presence === 'meeting' ? 'Đang họp' : 'Offline'}</span></div>
        </div>
      </div>

      <div className="info-section">
        <div className="info-section-title">File đã chia sẻ <span className="count">3</span></div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Chưa có file nào được chia sẻ gần đây.</div>
      </div>
    </div>
  );
};

const InfoPanelByType = ({ chat }) => {
  if (chat.type === 'doc') return <InfoPanelDoc chat={chat} />;
  if (chat.type === 'project') return <InfoPanelProject chat={chat} />;
  if (chat.type === 'group') return <InfoPanelGroup chat={chat} />;
  if (chat.type === 'dm') return <InfoPanelDm chat={chat} />;
  return null;
};

// ============ MAIN PANE (header + chat thread) ============
const PageMain = ({ chat, onToggleInfo, infoOpen, messages, onSend }) => {
  return (
    <div className="main-pane">
      <MainHeader chat={chat} onToggleInfo={onToggleInfo} infoOpen={infoOpen} />
      <window.ChatThread
        key={chat.id}
        convo={chat}
        onToggleInfo={onToggleInfo}
        infoOpen={infoOpen}
        onClose={() => {}}
        showTypingDemo={false}
        hideHeader={true}
        messages={messages}
        onSend={onSend}
      />
    </div>
  );
};

// ============ CONTACTS VIEW ============
const ContactsView = () => {
  const Icons = window.Icons;
  const { USERS, CONTACTS } = window.PAGE_DATA;
  const [q, setQ] = useStateMain('');

  return (
    <div className="view-pane">
      <div className="view-pane-head">
        <div>
          <h1>Danh bạ</h1>
          <div className="sub">Tổng {Object.keys(USERS).length} thành viên · 6 phòng ban</div>
        </div>
        <div className="contacts-search">
          <div className="list-search">
            <Icons.Search size={15} />
            <input placeholder="Tìm theo tên, phòng ban, chức vụ..." value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      {CONTACTS.map(dept => {
        const matched = dept.users.filter(uid => {
          const u = USERS[uid]; if (!u) return false;
          if (!q) return true;
          const s = q.toLowerCase();
          return u.name.toLowerCase().includes(s) || u.role.toLowerCase().includes(s) || u.dept.toLowerCase().includes(s);
        });
        if (matched.length === 0) return null;
        return (
          <div className="dept-section" key={dept.dept}>
            <div className="dept-header">
              <h2>{dept.dept}</h2>
              <span className="count">{matched.length}</span>
            </div>
            <div className="contacts-grid">
              {matched.map(uid => {
                const u = USERS[uid];
                return (
                  <div className="contact-card" key={uid}>
                    <div className="contact-card-avatar" style={{ background: memberGrad[u.color] }}>
                      {u.short}<span className="presence" style={{ background: `var(--st-${u.presence})` }}></span>
                    </div>
                    <div className="contact-card-info">
                      <div className="contact-card-name">{u.name}{uid === 'me' && ' (bạn)'}</div>
                      <div className="contact-card-role">{u.role}</div>
                      {u.statusText && <div className="contact-card-status">{u.statusText}</div>}
                    </div>
                    <div className="contact-card-actions">
                      <button type="button"className="icon-btn" title="Nhắn tin"><Icons.Send size={14} /></button>
                      <button type="button"className="icon-btn" title="Gọi"><Icons.Phone size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============ SAVED MESSAGES VIEW ============
const SavedView = () => {
  const Icons = window.Icons;
  const { SAVED_MESSAGES } = window.PAGE_DATA;
  return (
    <div className="view-pane">
      <div className="view-pane-head">
        <div>
          <h1>Tin nhắn đã lưu</h1>
          <div className="sub">Tin nhắn quan trọng bạn đã đánh dấu</div>
        </div>
      </div>
      <div className="saved-list">
        {SAVED_MESSAGES.map(m => (
          <div className="saved-card" key={m.id}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--warning-50)', color: 'var(--warning)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icons.Bookmark size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="saved-card-meta">
                <span className="saved-card-from">{m.from}</span>
                <span>·</span>
                <span className="saved-card-context">{m.context}</span>
                <span>·</span>
                <span>{m.time}</span>
              </div>
              {m.text && <div className="saved-card-text">{m.text}</div>}
              {m.attach && (
                <div className="msg-attach" style={{ marginTop: 8 }}>
                  <div className={`msg-attach-icon ${m.attach.type}`}>
                    {m.attach.type === 'pdf' ? <Icons.FilePdf size={18} /> : m.attach.type === 'xls' ? <Icons.FileXls size={18} /> : <Icons.File size={18} />}
                  </div>
                  <div className="msg-attach-info">
                    <div className="msg-attach-name">{m.attach.name}</div>
                    <div className="msg-attach-size">{m.attach.size}</div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button type="button"className="icon-btn" title="Mở hội thoại"><Icons.ExtLink size={14} /></button>
              <button type="button"className="icon-btn" title="Bỏ lưu"><Icons.Bookmark size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

window.PageMain = PageMain;
window.InfoPanelByType = InfoPanelByType;
window.ContactsView = ContactsView;
window.SavedView = SavedView;
