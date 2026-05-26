/* Empty state + Create conversation modal */
/* Exposes window.EmptyState, window.CreateGroupModal */

const { useState } = React;

const EmptyState = ({ onCreate, docCtx }) => {
  const Icons = window.Icons;
  const { doc_no, doc_label } = docCtx || {};

  return (
    <div className="chat-pane">
      <div className="empty" style={{ flex: 1 }}>
        <div className="empty-card">
          <div className="empty-illust">
            <Icons.Users size={36} stroke={1.6} />
          </div>
          <div className="empty-h">Chưa có trao đổi nào cho chứng từ này</div>
          <div className="empty-p">
            Tạo nhóm hoặc trao đổi cá nhân để thảo luận về{' '}
            <b style={{ color: 'var(--primary-700)' }}>
              {doc_no}{doc_label ? ` — ${doc_label}` : ''}
            </b>.
            Tất cả tin nhắn sẽ gắn liền với chứng từ này.
          </div>
          <div className="empty-actions">
            <button type="button" className="btn-primary" onClick={() => onCreate('CHANNEL')}>
              <Icons.Users size={14} /> Tạo nhóm trao đổi
            </button>
            <button type="button" className="btn-ghost" onClick={() => onCreate('DM')}>
              <Icons.User size={14} /> Trao đổi 1-1
            </button>
          </div>
          <div style={{
            marginTop: 16, padding: '12px 14px', background: 'var(--bg-2)', borderRadius: 8,
            fontSize: 12, color: 'var(--text-3)', textAlign: 'left', maxWidth: 360
          }}>
            <div style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icons.Sparkles size={12} /> Gợi ý
            </div>
            Nhóm thường có: NV phụ trách, Trưởng phòng (duyệt), Kế toán và Thủ kho liên quan.
          </div>
        </div>
      </div>
    </div>
  );
};

const CreateGroupModal = ({ contacts, currentAusId, docCtx, onCancel, onCreate }) => {
  const Icons = window.Icons;
  const { doc_no, doc_label } = docCtx || {};
  const [mode, setMode]       = useState('CHANNEL'); // CHANNEL or DM
  const [name, setName]       = useState(doc_label ? `${doc_label} - ${doc_no}` : (doc_no || ''));
  const [selected, setSelected] = useState([]);
  const [search, setSearch]   = useState('');

  const otherContacts = (contacts || []).filter(c => Number(c.aus_id) !== Number(currentAusId));

  const filtered = otherContacts.filter(c => {
    if (!search) return true;
    return (c.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
           (c.user_name || '').toLowerCase().includes(search.toLowerCase());
  });

  const toggle = (ausId) =>
    setSelected(s => s.includes(ausId) ? s.filter(x => x !== ausId) : [...s, ausId]);

  const canSubmit = mode === 'CHANNEL'
    ? name.trim() && selected.length > 0
    : selected.length === 1;

  const handleCreate = () => {
    if (!canSubmit) return;
    onCreate({
      conv_type:     mode,
      name:          mode === 'CHANNEL' ? name.trim() : '',
      memberAusIds:  selected,
    });
  };

  return (
    <div className="nested-overlay" onClick={onCancel}>
      <div className="nested-modal" onClick={e => e.stopPropagation()}>
        <div className="nested-head">
          <div style={{ width: 32, height: 32, background: 'var(--primary-50)', color: 'var(--primary)', borderRadius: 8, display: 'grid', placeItems: 'center' }}>
            {mode === 'CHANNEL' ? <Icons.Users size={16} /> : <Icons.User size={16} />}
          </div>
          <div className="nested-title">
            {mode === 'CHANNEL' ? 'Tạo nhóm trao đổi mới' : 'Trao đổi 1-1'}
          </div>
          <button type="button" className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onCancel}>
            <Icons.X size={14} />
          </button>
        </div>

        <div className="nested-body">
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 8, background: 'var(--bg-2)', padding: 4, borderRadius: 8 }}>
            <button type="button" onClick={() => setMode('CHANNEL')}
              style={{ flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 13, fontWeight: 500,
                background: mode === 'CHANNEL' ? 'var(--surface)' : 'transparent',
                boxShadow: mode === 'CHANNEL' ? 'var(--sh-1)' : 'none',
                color: mode === 'CHANNEL' ? 'var(--text-1)' : 'var(--text-3)' }}>
              <Icons.Users size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Nhóm
            </button>
            <button type="button" onClick={() => setMode('DM')}
              style={{ flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 13, fontWeight: 500,
                background: mode === 'DM' ? 'var(--surface)' : 'transparent',
                boxShadow: mode === 'DM' ? 'var(--sh-1)' : 'none',
                color: mode === 'DM' ? 'var(--text-1)' : 'var(--text-3)' }}>
              <Icons.User size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />Cá nhân
            </button>
          </div>

          {/* Context pill */}
          <div style={{ background: 'var(--primary-50)', border: '1px solid var(--primary-100)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: 'var(--primary-700)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icons.Hash size={12} />
            Gắn với chứng từ <b>{doc_no}</b>{doc_label ? ` — ${doc_label}` : ''}
          </div>

          {/* Group name */}
          {mode === 'CHANNEL' && (
            <div className="form-field">
              <label className="form-label">Tên nhóm</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)}
                placeholder="Ví dụ: Duyệt giá & chiết khấu" />
            </div>
          )}

          {/* Member picker */}
          <div className="form-field">
            <label className="form-label">
              {mode === 'CHANNEL' ? `Thành viên (${selected.length})` : 'Chọn người'}
            </label>

            {mode === 'CHANNEL' && selected.length > 0 && (
              <div className="member-pick">
                {selected.map(ausId => {
                  const c = otherContacts.find(u => u.aus_id === ausId);
                  if (!c) return null;
                  return (
                    <span key={ausId} className="member-chip">
                      <span style={{ width: 18, height: 18, borderRadius: '50%', background: window.avatarColor(ausId), display: 'grid', placeItems: 'center', color: 'white', fontSize: 9, fontWeight: 700 }}>
                        {window.avatarShort(c.full_name)}
                      </span>
                      {c.full_name.split(' ').slice(-1)[0]}
                      <span className="x" onClick={() => toggle(ausId)}>
                        <Icons.X size={10} />
                      </span>
                    </span>
                  );
                })}
              </div>
            )}

            <input className="form-input" placeholder="Tìm theo tên..."
              value={search} onChange={e => setSearch(e.target.value)} />

            <div className="member-suggest">
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '12px 0', fontSize: 13 }}>
                  {search ? 'Không tìm thấy' : 'Đang tải danh sách...'}
                </div>
              )}
              {filtered.map(c => {
                const isSelected = selected.includes(c.aus_id);
                return (
                  <div key={c.aus_id}
                    className={`member-suggest-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => mode === 'DM'
                      ? setSelected(isSelected ? [] : [c.aus_id])
                      : toggle(c.aus_id)
                    }>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: window.avatarColor(c.aus_id), display: 'grid', placeItems: 'center', color: 'white', fontSize: 12, fontWeight: 600 }}>
                      {window.avatarShort(c.full_name)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{c.full_name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{c.user_name}</div>
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
          <button type="button" className="btn-ghost" onClick={onCancel}>Huỷ</button>
          <button type="button" className="btn-primary" onClick={handleCreate} disabled={!canSubmit}>
            <Icons.Plus size={14} />
            {mode === 'CHANNEL' ? 'Tạo nhóm' : 'Bắt đầu trao đổi'}
          </button>
        </div>
      </div>
    </div>
  );
};

window.EmptyState       = EmptyState;
window.CreateGroupModal = CreateGroupModal;
