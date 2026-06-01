/* ERP background — the order form screen behind the modal */
/* Exposes window.ErpBackground */

const ErpBackground = ({ onOpenChat }) => {
  const Icons = window.Icons;
  return (
    <div className="erp">
      <div className="erp-topbar">
        <div className="erp-topbar-burger">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
        </div>
        <div className="erp-topbar-title">DEV_APEX XEM TOAN BO PHONG BAN (671 - 748)</div>
        <div className="erp-topbar-right">
          <Icons.Cog size={18} />
          <Icons.Bell size={18} />
          <span className="erp-avatar"></span>
        </div>
      </div>

      <div className="erp-page">
        <div className="erp-main">
          <div className="erp-page-header">
            <div className="erp-back"><Icons.ArrowLeft size={14} /></div>
            <div className="erp-h1">LẬP ĐƠN HÀNG BÁN</div>
            <div className="erp-actions">
              <button className="erp-btn danger"><Icons.Trash size={14} /></button>
              <button className="erp-btn ghost" style={{ background: '#E8F5EE', color: '#1F7444', border: '1px solid #D4ECDF' }}><Icons.Check size={14} /> Hoàn thành</button>
              <button className="erp-btn ghost"><Icons.Hash size={14} /></button>
              <button className="erp-btn ghost"><Icons.Print size={14} /></button>
              <button className="erp-btn ghost" style={{ background: '#E8F5EE', color: '#1F7444', border: '1px solid #D4ECDF' }}><Icons.Save size={14} /> Lưu</button>
              <button className="erp-btn ghost"><Icons.Plus size={14} /> Thêm mới</button>
            </div>
          </div>

          <div className="erp-form-grid">
            {[
              ['Loại', 'Đơn hàng bán', true],
              ['Đối tượng', 'Công ty TNHH CONNELL BROS. (Việt Nam)', true],
              ['Ngày đơn hàng', '13-01-2026', true],
              ['Ngày xuất', '02-10-2025', true],
              ['Thuộc hợp đồng', '', false],
              ['Bảng giá', '', false],
              ['Số đơn hàng', 'SO-2601/010', true],
              ['Nhân viên bán hàng', '', false],
              ['Điều khoản thanh toán', '04 - Thanh toán 3 lần', true],
              ['Kho xuất hàng', 'K01MT - Kho Trung chuyển', true],
              ['Giá trị đơn hàng', '6', false],
              ['Số phiếu xuất', '', false],
              ['Trạng thái', 'Đang lập', false],
            ].slice(0,8).map(([label, val, req], i) => (
              <div className="erp-field" key={i}>
                <div className="erp-field-label">{label}{req && <span className="req">*</span>}</div>
                <div className={`erp-input ${val ? '' : 'muted'}`}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val || 'Chọn...'}</span>
                  <span className="caret"><Icons.ChevDown size={12} /></span>
                </div>
              </div>
            ))}
          </div>

          <div className="erp-section-card">
            <div className="erp-section-title">CHI TIẾT ĐƠN HÀNG</div>
          </div>

          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}>☐</th><th>STT</th><th>Mã Hàng</th><th>Tên Hàng</th><th>ĐVT</th>
                <th>Số Lượng</th><th>SL Khả Dụng</th><th>ĐG Trước Thuế</th><th>TT Trước Thuế</th><th>TT Sau Thuế</th>
              </tr>
            </thead>
            <tbody>
              <tr className="selected"><td>✓</td><td>1</td><td>TP000017</td><td>Nước Mắm Ngọc Huy | 80 độ đạm | 500 mL</td><td>24 chai/thùng</td><td>3.00</td><td>0.00</td><td>2.00</td><td>6</td><td>6</td></tr>
              <tr><td>☐</td><td>2</td><td>TP000017</td><td>Nước Mắm Ngọc Huy | 80 độ đạm | 500 mL</td><td>6ch/thùng</td><td>1.00</td><td>0.00</td><td>1.00</td><td>1</td><td>1</td></tr>
              <tr><td>☐</td><td>3</td><td>TP000017</td><td>Nước Mắm Ngọc Huy | 80 độ đạm | 500 mL</td><td>6 chai/thùng</td><td>2.00</td><td>0.00</td><td>1.00</td><td>2</td><td>2</td></tr>
            </tbody>
          </table>
        </div>

        <div className="erp-sidebar">
          <div className="erp-sidebar-item chat-trigger" onClick={onOpenChat}>
            <span className="num">12</span>
            Trao đổi
          </div>
          <div className="erp-sidebar-item">
            <span className="num">0</span>
            File đính kèm
          </div>
          <div className="erp-sidebar-item">
            <span className="num">0/0</span>
            Check list hoàn thành
          </div>
        </div>
      </div>
    </div>
  );
};

window.ErpBackground = ErpBackground;
