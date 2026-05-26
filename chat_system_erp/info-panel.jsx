/* Info panel (RIGHT pane, toggleable) */
/* Exposes window.InfoPanel */

const InfoPanel = ({ convo }) => {
  const Icons = window.Icons;
  const { USERS, DOC_SUMMARY, FILES, RELATED_DOCS } = window.CHAT_DATA;
  const memberPalette = { 'user-1':'linear-gradient(135deg,#6366F1,#4338CA)','user-2':'linear-gradient(135deg,#EC4899,#BE185D)','user-3':'linear-gradient(135deg,#F59E0B,#B45309)','user-4':'linear-gradient(135deg,#06B6D4,#0E7490)' };

  return (
    <div className="info-pane">
      {/* Document summary */}
      <div className="info-section">
        <div className="info-section-title">Chứng từ</div>
        <div className="doc-summary-card">
          <div className="doc-summary-no">
            <span><Icons.Hash size={12} style={{ verticalAlign: '-1px', marginRight: 2 }} />{DOC_SUMMARY.no}</span>
            <span className="status">{DOC_SUMMARY.status}</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 10 }}>{DOC_SUMMARY.type}</div>
          <div className="doc-summary-rows">
            <div className="doc-summary-row"><span className="k">Đối tượng</span><span className="v">Connell Bros. (VN)</span></div>
            <div className="doc-summary-row"><span className="k">Ngày đơn hàng</span><span className="v">{DOC_SUMMARY.dateOrder}</span></div>
            <div className="doc-summary-row"><span className="k">Ngày xuất</span><span className="v">{DOC_SUMMARY.dateExport}</span></div>
            <div className="doc-summary-row"><span className="k">Kho xuất</span><span className="v">K01MT</span></div>
            <div className="doc-summary-row"><span className="k">Thanh toán</span><span className="v">TT 3 lần</span></div>
            <div className="doc-summary-row"><span className="k">Số dòng hàng</span><span className="v">{DOC_SUMMARY.itemsCount}</span></div>
            <div className="doc-summary-row" style={{ borderTop: '1px dashed var(--primary-100)', paddingTop: 6, marginTop: 2 }}>
              <span className="k">Giá trị</span><span className="v money">{DOC_SUMMARY.total}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="info-section">
        <div className="info-section-title">Thao tác nhanh</div>
        <div className="quick-action"><div className="quick-action-icon"><Icons.ExtLink size={14} /></div>Mở chứng từ</div>
        <div className="quick-action"><div className="quick-action-icon"><Icons.CircleCheck size={14} /></div>Duyệt chứng từ</div>
        <div className="quick-action"><div className="quick-action-icon"><Icons.Print size={14} /></div>In chứng từ</div>
        <div className="quick-action"><div className="quick-action-icon"><Icons.Save size={14} /></div>Tải PDF</div>
      </div>

      {/* Members */}
      <div className="info-section">
        <div className="info-section-title">
          Thành viên <span className="count">{convo.members.length}</span>
          <span className="action">+ Thêm</span>
        </div>
        {convo.members.map((uid, i) => {
          const u = USERS[uid];
          if (!u) return null;
          const isOwner = i === 0;
          const isAdmin = uid === 'nam' || uid === 'thuy';
          return (
            <div className="member-row" key={uid}>
              <div className="member-avatar" style={{ background: memberPalette[u.color] }}>
                {u.short}<span className={`presence ${u.presence}`}></span>
              </div>
              <div className="member-info">
                <div className="member-name">{u.name}{uid === 'me' && ' (bạn)'}</div>
                <div className="member-role">{u.role}</div>
              </div>
              {isOwner ? <span className="member-badge owner">CHỦ NHÓM</span> : isAdmin ? <span className="member-badge admin">DUYỆT</span> : null}
            </div>
          );
        })}
      </div>

      {/* Files */}
      <div className="info-section">
        <div className="info-section-title">
          File đã chia sẻ <span className="count">{FILES.length}</span>
          <span className="action">Xem tất cả</span>
        </div>
        {FILES.map((f, i) => (
          <div className="file-row" key={i}>
            <div className={`msg-attach-icon ${f.type}`}>
              {f.type === 'pdf' ? <Icons.FilePdf size={14} /> : f.type === 'xls' ? <Icons.FileXls size={14} /> : f.type === 'img' ? <Icons.Image size={14} /> : <Icons.File size={14} />}
            </div>
            <div className="msg-attach-info">
              <div className="msg-attach-name">{f.name}</div>
              <div className="msg-attach-size">{f.from} · {f.size}</div>
            </div>
            <span className="when">{f.when}</span>
          </div>
        ))}
      </div>

      {/* Related docs */}
      <div className="info-section">
        <div className="info-section-title">Chứng từ liên quan <span className="count">{RELATED_DOCS.length}</span></div>
        {RELATED_DOCS.map((d, i) => (
          <div className="related-doc" key={i}>
            <div className="no">{d.no} · {d.label}</div>
            <div className="meta">{d.meta}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

window.InfoPanel = InfoPanel;
