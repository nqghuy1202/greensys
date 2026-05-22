// RIGHT PANEL — Info/Members/Files/Linked Docs

const _AVATAR_COLORS = ['blue','purple','green','orange','red','teal','amber','indigo'];
function userColor(ausId) { return _AVATAR_COLORS[Math.abs(Number(ausId)) % _AVATAR_COLORS.length]; }
function shortName(full) {
  if (!full) return '?';
  const p = full.trim().split(' ').filter(Boolean);
  return p.length === 1 ? p[0].substring(0,2).toUpperCase() : (p[0][0] + p[p.length-1][0]).toUpperCase();
}

function MembersTab({ conv, users, memberList, currentAusId, onlineCount }) {
  if (conv.type !== 'channel') {
    // DM — hiển thị người kia
    const partner = memberList.find(m => m.aus_id !== currentAusId);
    const partnerId = partner ? partner.aus_id : conv.user;
    const u = users[partnerId] || {
      name: partner?.full_name || 'Unknown',
      short: (partner?.full_name || '?').substring(0, 2).toUpperCase(),
      color: 'blue',
      status: 'offline',
    };
    return (
      <>
        <div className="group-prof">
          <Avatar user={u} size="xl"/>
          <div className="title">{u.name}</div>
          <div className="stat-row">
            <span className="stat">
              <span style={{
                width:6, height:6, borderRadius:999,
                background: u.status === 'online' ? 'var(--green)' : 'var(--text-faint)'
              }}/>
              {u.status === 'online' ? 'Đang hoạt động' : 'Ngoại tuyến'}
            </span>
          </div>
        </div>
        {partner?.username && (
          <div style={{padding:'4px 16px 12px', fontSize:13, color:'var(--text-2)'}}>
            <div>@{partner.username}</div>
          </div>
        )}
      </>
    );
  }

  const memberCount = memberList.length || conv.members.length;
  return (
    <>
      <div className="group-prof">
        <Avatar channel icon={conv.icon} size="xl"/>
        <div className="title">{conv.name}</div>
        <div className="desc">
          {conv.linkedDoc
            ? `Nhóm trao đổi gắn với phiếu ${conv.linkedDoc.type} #${conv.linkedDoc.no}`
            : 'Nhóm phòng ban nội bộ'}
        </div>
        <div className="stat-row">
          <span className="stat"><Icons.users size={11}/> {memberCount} thành viên</span>
          {onlineCount > 0 && (
            <span className="stat" style={{color:'var(--green)'}}>● {onlineCount} online</span>
          )}
        </div>
      </div>

      <div className="panel-section-head">
        Thành viên ({memberCount})
        <a href="#" onClick={(e) => e.preventDefault()}>+ Thêm</a>
      </div>
      <div className="member-list">
        {memberList.map(m => {
          const u = users[m.aus_id] || {
            name: m.full_name || 'Unknown',
            short: shortName(m.full_name),
            color: userColor(m.aus_id),
            status: 'offline',
          };
          const isAdmin = m.is_admin === 1;
          const isMe = m.aus_id === currentAusId;
          return (
            <div className="member" key={m.aus_id}>
              <Avatar user={{...u, status: u.status}} size="sm"/>
              <div>
                <div className="name">{isMe ? `${u.name} (bạn)` : u.name}</div>
                {m.username && <div className="role">@{m.username}</div>}
              </div>
              {isAdmin && <span className="role-badge">Quản trị</span>}
            </div>
          );
        })}
        {memberList.length === 0 && conv.members.length > 0 && (
          <div style={{padding:'8px 16px', color:'var(--text-muted)', fontSize:13}}>Đang tải...</div>
        )}
      </div>
    </>
  );
}

function FilesTab({ files, users }) {
  const [filter, setFilter] = React.useState('all');
  const filtered = filter === 'all' ? files : files.filter(f => {
    if (filter === 'img') return f.type === 'img';
    if (filter === 'doc') return ['pdf','docx'].includes(f.type);
    if (filter === 'sheet') return f.type === 'xlsx';
    return true;
  });

  return (
    <>
      <div style={{padding:'12px 12px 8px', borderBottom:'1px solid var(--divider)'}}>
        <div className="tabs">
          <button className={`t-Button${filter === 'all' ? ' t-Button--hot' : ''}`} type="button" id="Btn_File_All" onClick={() => setFilter('all')} data-otel-label="FILE_ALL">
            <span className="t-Button-label">Tất cả</span>
          </button>
          <button className={`t-Button${filter === 'img' ? ' t-Button--hot' : ''}`} type="button" id="Btn_File_Img" onClick={() => setFilter('img')} data-otel-label="FILE_IMG">
            <span className="t-Button-label">Ảnh</span>
          </button>
          <button className={`t-Button${filter === 'doc' ? ' t-Button--hot' : ''}`} type="button" id="Btn_File_Doc" onClick={() => setFilter('doc')} data-otel-label="FILE_DOC">
            <span className="t-Button-label">Tài liệu</span>
          </button>
          <button className={`t-Button${filter === 'sheet' ? ' t-Button--hot' : ''}`} type="button" id="Btn_File_Sheet" onClick={() => setFilter('sheet')} data-otel-label="FILE_SHEET">
            <span className="t-Button-label">Bảng tính</span>
          </button>
        </div>
      </div>
      <div className="panel-section-head">
        {filtered.length} tệp
        <a href="#" onClick={(e) => e.preventDefault()}>Xem tất cả</a>
      </div>
      {filtered.length === 0 ? (
        <div className="state-block" style={{height:'auto', paddingTop:24}}>
          <div className="ic"><Icons.archive size={20}/></div>
          <p>Chưa có tệp loại này</p>
        </div>
      ) : filtered.map((f, i) => (
        <div className="file-row" key={i}>
          <FileIcon type={f.type}/>
          <div style={{minWidth:0}}>
            <div className="file-name">{f.name}</div>
            <div className="file-meta">
              {f.size} · {users[f.by]?.name?.split(' ').pop() || 'Unknown'} · {f.when}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function LinkedDocsTab({ docs, audit }) {
  return (
    <>
      <div className="panel-section-head">
        Chứng từ liên kết ({docs.length})
        <a href="#" onClick={(e) => e.preventDefault()}>+ Đính kèm</a>
      </div>
      <div className="linked-list">
        {docs.map((d, i) => (
          <div className="linked-doc" key={i} style={{maxWidth:'unset'}}>
            <div className="head">
              <Icons.doc size={11}/>
              <span>{d.label} · #{d.no}</span>
            </div>
            <div className="doc-title" style={{fontSize:13}}>{d.customer}</div>
            <div className="doc-footer">
              <span style={{
                fontSize:11,
                color: d.statusColor === 'success' ? 'var(--green)' : d.statusColor === 'warn' ? 'var(--amber)' : 'var(--text-muted)'
              }}>● {d.status} · {d.when}</span>
              <a className="open-link" href="#" onClick={(e) => e.preventDefault()}>
                Mở <Icons.chev_r size={11}/>
              </a>
            </div>
          </div>
        ))}
      </div>

      <div className="panel-section-head" style={{marginTop:8, borderTop:'1px solid var(--divider)', paddingTop:14}}>
        <span><Icons.history size={11} style={{display:'inline', verticalAlign:'-1px', marginRight:4}}/> Nhật ký hệ thống</span>
        <a href="#" onClick={(e) => e.preventDefault()}>Đầy đủ</a>
      </div>
      <div style={{paddingBottom:16}}>
        {audit.map((a, i) => (
          <div className="audit-entry" key={i}>
            <span style={{color:'var(--text-faint)'}}>{a.time}</span>
            <span className={`tag ${a.tagType}`}>{a.tag}</span>
            <span style={{flex:1, fontFamily:'inherit', color:'var(--text-2)'}}>{a.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function RightPanel({ conv, users, files, linkedDocs, audit, memberList, currentAusId, onlineCount }) {
  const [tab, setTab] = React.useState('members');

  if (!conv) return null;

  const isChannel = conv.type === 'channel';
  const fileCount = files.length;
  const docCount = linkedDocs.length;
  const memberCount = memberList.length || conv.members?.length || 0;

  return (
    <aside className="panel">
      <div className="panel-tabs">
        <button className={`panel-tab t-Button t-Button--icon t-Button--mobileHideLabel${tab === 'members' ? ' t-Button--hot' : ''}`} type="button" id="Btn_Panel_Members" onClick={() => setTab('members')} data-otel-label="PANEL_MEMBERS">
          <span className={`t-Icon fa ${isChannel ? 'fa-users' : 'fa-user'}`} aria-hidden="true"></span>
          <span className="t-Button-label">{isChannel ? 'Thành viên' : 'Hồ sơ'}</span>
          <span className="count">{memberCount}</span>
        </button>
        <button className={`panel-tab t-Button t-Button--icon t-Button--mobileHideLabel${tab === 'files' ? ' t-Button--hot' : ''}`} type="button" id="Btn_Panel_Files" onClick={() => setTab('files')} data-otel-label="PANEL_FILES">
          <span className="t-Icon fa fa-paperclip" aria-hidden="true"></span>
          <span className="t-Button-label">Tệp</span>
          <span className="count">{fileCount}</span>
        </button>
        <button className={`panel-tab t-Button t-Button--icon t-Button--mobileHideLabel${tab === 'docs' ? ' t-Button--hot' : ''}`} type="button" id="Btn_Panel_Docs" onClick={() => setTab('docs')} data-otel-label="PANEL_DOCS">
          <span className="t-Icon fa fa-file-text-o" aria-hidden="true"></span>
          <span className="t-Button-label">Phiếu</span>
          <span className="count">{docCount}</span>
        </button>
      </div>
      <div className="panel-body">
        {tab === 'members' && <MembersTab conv={conv} users={users} memberList={memberList} currentAusId={currentAusId} onlineCount={onlineCount}/>}
        {tab === 'files' && <FilesTab files={files} users={users}/>}
        {tab === 'docs' && <LinkedDocsTab docs={linkedDocs} audit={audit}/>}
      </div>
    </aside>
  );
}

window.RightPanel = RightPanel;
