/* Employee picker modals - Compose DM + Create Group */
/* Exposes window.ComposeModal, window.CreateGroupPageModal */

const { useState: useStateEmp, useMemo: useMemoEmp } = React;

const memberGradEmp = {
  'user-1': 'linear-gradient(135deg,#6366F1,#4338CA)',
  'user-2': 'linear-gradient(135deg,#EC4899,#BE185D)',
  'user-3': 'linear-gradient(135deg,#F59E0B,#B45309)',
  'user-4': 'linear-gradient(135deg,#06B6D4,#0E7490)',
};

const buildDeptList = (USERS, CONTACTS) => {
  // Filter out "me" from picker
  return CONTACTS.map(d => ({
    dept: d.dept,
    users: d.users.filter(u => u !== 'me'),
  })).filter(d => d.users.length > 0);
};

// ============ COMPOSE DM MODAL ============
const ComposeModal = ({ onCancel, onSelect }) => {
  const Icons = window.Icons;
  const { USERS, CONTACTS } = window.PAGE_DATA;
  const [search, setSearch] = useStateEmp('');
  const [picked, setPicked] = useStateEmp(null);

  const depts = useMemoEmp(() => buildDeptList(USERS, CONTACTS), [USERS, CONTACTS]);

  const filteredDepts = useMemoEmp(() => {
    if (!search) return depts;
    const q = search.toLowerCase();
    return depts.map(d => ({
      ...d,
      users: d.users.filter(uid => {
        const u = USERS[uid];
        return u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q) || d.dept.toLowerCase().includes(q);
      }),
    })).filter(d => d.users.length > 0);
  }, [depts, search]);

  return (
    <div className="emp-modal-overlay" onClick={onCancel}>
      <div className="emp-modal" onClick={e => e.stopPropagation()}>
        <div className="emp-modal-head">
          <div className="ico compose"><Icons.Send size={16} /></div>
          <div style={{ flex: 1 }}>
            <div className="title">Soạn tin mới</div>
            <div className="sub">Chọn 1 thành viên để bắt đầu trao đổi 1-1</div>
          </div>
          <button type="button"className="icon-btn" onClick={onCancel}><Icons.Close size={16} /></button>
        </div>

        <div className="emp-modal-body">
          <div className="emp-modal-search-row">
            <div className="list-search">
              <Icons.Search size={15} />
              <input placeholder="Tìm theo tên, phòng ban, chức vụ..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
            </div>
          </div>

          <div className="emp-modal-list">
            {filteredDepts.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 40, fontSize: 13 }}>
                Không tìm thấy thành viên
              </div>
            )}
            {filteredDepts.map(d => (
              <div key={d.dept}>
                <div className="emp-section-h">{d.dept} <span style={{ marginLeft: 6, color: 'var(--text-4)' }}>·</span> <span style={{ marginLeft: 6, fontWeight: 500 }}>{d.users.length}</span></div>
                {d.users.map(uid => {
                  const u = USERS[uid];
                  return (
                    <div key={uid} className={`emp-item ${picked === uid ? 'selected' : ''}`} onClick={() => setPicked(uid)}>
                      <div className="av" style={{ background: memberGradEmp[u.color] }}>
                        {u.short}
                        <span className="pres" style={{ background: `var(--st-${u.presence})` }}></span>
                      </div>
                      <div className="info">
                        <div className="name">{u.name}</div>
                        <div className="role">{u.role}</div>
                      </div>
                      <div className="radio"></div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="emp-modal-foot">
          <span className="count">{picked ? `Đã chọn: ${USERS[picked]?.name}` : 'Chưa chọn ai'}</span>
          <div className="actions">
            <button type="button"className="btn-ghost" onClick={onCancel}>Huỷ</button>
            <button type="button"className="btn-primary" onClick={() => picked && onSelect(picked)} disabled={!picked} style={!picked ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
              <Icons.Send size={14} /> Bắt đầu trao đổi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ CREATE GROUP MODAL ============
const CreateGroupPageModal = ({ onCancel, onCreate }) => {
  const Icons = window.Icons;
  const { USERS, CONTACTS } = window.PAGE_DATA;
  const [name, setName] = useStateEmp('');
  const [picked, setPicked] = useStateEmp([]);
  const [search, setSearch] = useStateEmp('');

  const depts = useMemoEmp(() => buildDeptList(USERS, CONTACTS), [USERS, CONTACTS]);

  const filteredDepts = useMemoEmp(() => {
    if (!search) return depts;
    const q = search.toLowerCase();
    return depts.map(d => ({
      ...d,
      users: d.users.filter(uid => {
        const u = USERS[uid];
        return u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q) || d.dept.toLowerCase().includes(q);
      }),
    })).filter(d => d.users.length > 0);
  }, [depts, search]);

  const toggle = (uid) => setPicked(p => p.includes(uid) ? p.filter(x => x !== uid) : [...p, uid]);

  return (
    <div className="emp-modal-overlay" onClick={onCancel}>
      <div className="emp-modal" onClick={e => e.stopPropagation()}>
        <div className="emp-modal-head">
          <div className="ico create"><Icons.Users size={16} /></div>
          <div style={{ flex: 1 }}>
            <div className="title">Tạo nhóm mới</div>
            <div className="sub">Tạo nhóm chat với nhiều thành viên</div>
          </div>
          <button type="button"className="icon-btn" onClick={onCancel}><Icons.Close size={16} /></button>
        </div>

        <div className="emp-modal-body">
          <div className="emp-modal-search-row">
            <div className="form-field" style={{ gap: 5 }}>
              <label className="form-label">Tên nhóm</label>
              <input className="form-input" placeholder="VD: Phòng Kinh doanh, Triển khai dự án X..." value={name} onChange={e => setName(e.target.value)} autoFocus />
            </div>

            <div className="form-field" style={{ gap: 5 }}>
              <label className="form-label">Thành viên đã chọn ({picked.length})</label>
              <div className={`emp-selected-row ${picked.length === 0 ? 'empty' : ''}`}>
                {picked.map(uid => {
                  const u = USERS[uid];
                  return (
                    <span className="emp-chip" key={uid}>
                      <span className="av" style={{ background: memberGradEmp[u.color] }}>{u.short}</span>
                      {u.name}
                      <span className="x" onClick={() => toggle(uid)}><Icons.X size={11} /></span>
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="list-search">
              <Icons.Search size={15} />
              <input placeholder="Tìm thành viên thêm vào..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="emp-modal-list">
            {filteredDepts.map(d => (
              <div key={d.dept}>
                <div className="emp-section-h">{d.dept} <span style={{ marginLeft: 6, color: 'var(--text-4)' }}>·</span> <span style={{ marginLeft: 6, fontWeight: 500 }}>{d.users.length}</span></div>
                {d.users.map(uid => {
                  const u = USERS[uid];
                  const sel = picked.includes(uid);
                  return (
                    <div key={uid} className={`emp-item ${sel ? 'selected' : ''}`} onClick={() => toggle(uid)}>
                      <div className="av" style={{ background: memberGradEmp[u.color] }}>
                        {u.short}
                        <span className="pres" style={{ background: `var(--st-${u.presence})` }}></span>
                      </div>
                      <div className="info">
                        <div className="name">{u.name}</div>
                        <div className="role">{u.role}</div>
                      </div>
                      <div className="check">
                        {sel && <Icons.Check size={12} stroke={3} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="emp-modal-foot">
          <span className="count">{picked.length} thành viên · {picked.length >= 1 ? 'Có thể tạo' : 'Chọn ít nhất 1 thành viên'}</span>
          <div className="actions">
            <button type="button"className="btn-ghost" onClick={onCancel}>Huỷ</button>
            <button
              className="btn-primary"
              disabled={!name.trim() || picked.length === 0}
              style={(!name.trim() || picked.length === 0) ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
              onClick={() => onCreate({ name: name.trim(), members: ['me', ...picked] })}
            >
              <Icons.Plus size={14} /> Tạo nhóm ({picked.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

window.ComposeModal = ComposeModal;
window.CreateGroupPageModal = CreateGroupPageModal;
