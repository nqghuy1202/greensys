/* Info panel — RIGHT pane of Doc Chat Modal */
/* Exposes window.InfoPanel */

const InfoPanel = ({ conv, members, docCtx }) => {
  const Icons = window.Icons;
  const { doc_no, doc_label, doc_status, doc_fields } = docCtx || {};

  return (
    <div className="info-pane">
      {/* Document summary */}
      <div className="info-section">
        <div className="info-section-title">Chứng từ</div>
        <div className="doc-summary-card">
          <div className="doc-summary-no">
            <span>
              <Icons.Hash size={12} style={{ verticalAlign: '-1px', marginRight: 2 }} />
              {doc_no}
            </span>
            {doc_status && <span className="status">{doc_status}</span>}
          </div>
          {doc_label && (
            <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 10 }}>{doc_label}</div>
          )}
          <div className="doc-summary-rows">
            {(doc_fields || []).map(([label, value], i) => (
              <div key={i} className="doc-summary-row">
                <span className="k">{label}</span>
                <span className="v">{value || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="info-section">
        <div className="info-section-title">Thao tác nhanh</div>
        <div className="quick-action" onClick={() => {}}>
          <div className="quick-action-icon"><Icons.ExtLink size={14} /></div>
          Mở chứng từ
        </div>
        <div className="quick-action" onClick={() => {}}>
          <div className="quick-action-icon"><Icons.CircleCheck size={14} /></div>
          Duyệt chứng từ
        </div>
        <div className="quick-action" onClick={() => {}}>
          <div className="quick-action-icon"><Icons.Print size={14} /></div>
          In chứng từ
        </div>
        <div className="quick-action" onClick={() => {}}>
          <div className="quick-action-icon"><Icons.Save size={14} /></div>
          Tải PDF
        </div>
      </div>

      {/* Members */}
      {(members || []).length > 0 && (
        <div className="info-section">
          <div className="info-section-title">
            Thành viên <span className="count">{members.length}</span>
          </div>
          {members.map((m) => (
            <div className="member-row" key={m.aus_id}>
              <div className="member-avatar" style={{ background: window.avatarColor(m.aus_id) }}>
                {window.avatarShort(m.full_name)}
                <span className={`presence ${m.presence || 'offline'}`}></span>
              </div>
              <div className="member-info">
                <div className="member-name">{m.full_name}</div>
                <div className="member-role">{m.user_name}</div>
              </div>
              {Number(m.is_admin) === 1 && (
                <span className="member-badge admin">ADMIN</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

window.InfoPanel = InfoPanel;
