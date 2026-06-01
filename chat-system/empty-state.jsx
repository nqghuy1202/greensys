/* Empty state + Create group modal */
/* Exposes window.EmptyState, window.CreateGroupModal */

const { useState } = React;

const EmptyState = ({ onCreate }) => {
  const Icons = window.Icons;
  return (
    <div className="chat-pane">
      <div className="empty" style={{ flex: 1 }}>
        <div className="empty-card">
          <div className="empty-illust">
            <Icons.Users size={36} stroke={1.6} />
          </div>
          <div className="empty-h">Chưa có nhóm trao đổi nào cho chứng từ này</div>
          <div className="empty-p">
            Tạo nhóm trao đổi để cùng các thành viên thảo luận về <b style={{ color: 'var(--primary-700)' }}>SO-2601/010 — Đơn hàng bán Connell Bros.</b> Nhóm sẽ luôn gắn liền với chứng từ này.
          </div>
          <div className="empty-actions">
            <button type="button"className="btn-primary" onClick={onCreate}><Icons.Plus size={14} /> Tạo nhóm trao đổi</button>
            <button type="button"className="btn-ghost"><Icons.User size={14} /> Trao đổi 1-1</button>
          </div>
          <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg-2)', borderRadius: 8, fontSize: 12, color: 'var(--text-3)', textAlign: 'left', maxWidth: 360 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icons.Sparkles size={12} /> Gợi ý
            </div>
            Nhóm thường có: NV bán hàng phụ trách, Trưởng phòng KD (duyệt giá), Kế toán bán hàng, Thủ kho phụ trách kho xuất.
          </div>
        </div>
      </div>
    </div>
  );
};

const CreateGroupModal = ({ onCancel, onCreate }) => {
  const Icons = window.Icons;
  const { USERS, DOC_SUMMARY } = window.CHAT_DATA;
  const allUsers = Object.keys(USERS).filter(u => u !== 'me');
  const [name, setName] = useState(`${DOC_SUMMARY.type} - ${DOC_SUMMARY.no}`);
  const [selected, setSelected] = useState(['vananh', 'nam']);
  const [search, setSearch] = useState('');

  const memberPalette = { 'user-1':'linear-gradient(135deg,#6366F1,#4338CA)','user-2':'linear-gradient(135deg,#EC4899,#BE185D)','user-3':'linear-gradient(135deg,#F59E0B,#B45309)','user-4':'linear-gradient(135deg,#06B6D4,#0E7490)' };

  const toggle = (uid) => setSelected(s => s.includes(uid) ? s.filter(x => x !== uid) : [...s, uid]);

  const filtered = allUsers.filter(uid => {
    const u = USERS[uid];
    if (!search) return true;
    return u.name.toLowerCase().includes(search.toLowerCase()) || u.role.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="nested-overlay" onClick={onCancel}>
      <div className="nested-modal" onClick={e => e.stopPropagation()}>
        <div className="nested-head">
          <div style={{ width: 32, height: 32, background: 'var(--primary-50)', color: 'var(--primary)', borderRadius: 8, display: 'grid', placeItems: 'center' }}>
            <Icons.Users size={16} />
          </div>
          <div className="nested-title">Tạo nhóm trao đổi mới</div>
          <button type="button"className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onCancel}><Icons.Close size={14} /></button>
        </div>
        <div className="nested-body">
          <div style={{ background: 'var(--primary-50)', border: '1px solid var(--primary-100)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: 'var(--primary-700)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icons.Hash size={12} />
            Nhóm gắn với chứng từ <b>{DOC_SUMMARY.no}</b> — {DOC_SUMMARY.customer}
          </div>

          <div className="form-field">
            <label className="form-label">Tên nhóm</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ví dụ: Duyệt giá & chiết khấu" />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Mặc định lấy theo nghiệp vụ + số chứng từ. Bạn có thể đổi.</span>
          </div>

          <div className="form-field">
            <label className="form-label">Thành viên ({selected.length})</label>
            <div className="member-pick">
              {selected.map(uid => {
                const u = USERS[uid];
                return (
                  <span className="member-chip" key={uid}>
                    <span style={{ width: 18, height: 18, borderRadius: 999, background: memberPalette[u.color], display: 'grid', placeItems: 'center', color: 'white', fontSize: 9, fontWeight: 700 }}>{u.short}</span>
                    {u.name}
                    <span className="x" onClick={() => toggle(uid)}><Icons.X size={10} /></span>
                  </span>
                );
              })}
              {selected.length === 0 && <span style={{ color: 'var(--text-4)', fontSize: 13, padding: 4 }}>Chưa chọn thành viên</span>}
            </div>
          </div>

          <div className="form-field">
            <input className="form-input" placeholder="Tìm thành viên theo tên hoặc phòng ban..." value={search} onChange={e => setSearch(e.target.value)} />
            <div className="member-suggest">
              {filtered.map(uid => {
                const u = USERS[uid];
                const isSelected = selected.includes(uid);
                return (
                  <div className={`member-suggest-item ${isSelected ? 'selected' : ''}`} key={uid} onClick={() => toggle(uid)}>
                    <div style={{ width: 32, height: 32, borderRadius: 999, background: memberPalette[u.color], display: 'grid', placeItems: 'center', color: 'white', fontSize: 12, fontWeight: 600, position: 'relative' }}>
                      {u.short}
                      <span className={`presence ${u.presence}`} style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: 999, background: u.presence === 'online' ? 'var(--online)' : u.presence === 'away' ? 'var(--away)' : 'var(--text-4)', boxShadow: '0 0 0 2px var(--surface)' }}></span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{u.role}</div>
                    </div>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: '1.5px solid ' + (isSelected ? 'var(--primary)' : 'var(--border-strong)'), background: isSelected ? 'var(--primary)' : 'transparent', display: 'grid', placeItems: 'center', color: 'white' }}>
                      {isSelected && <Icons.Check size={12} stroke={3} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="nested-foot">
          <button type="button"className="btn-ghost" onClick={onCancel}>Huỷ</button>
          <button type="button"className="btn-primary" onClick={() => onCreate({ name, members: ['me', ...selected] })} disabled={!name.trim() || selected.length === 0}>
            <Icons.Plus size={14} /> Tạo nhóm
          </button>
        </div>
      </div>
    </div>
  );
};

window.EmptyState = EmptyState;
window.CreateGroupModal = CreateGroupModal;
