/* OPTION B — Workspace with tabs (SAP Fiori / Oracle Redwood inspired) */

const OrderOptionB = () => {
  const D = window.ORDER_DATA;
  const I = window.OrderIcons;
  const totals = window.orderTotals();

  return (
    <div className="order-frame">
      <window.ErpTopbar />
      <div className="optB-page">

        {/* OBJECT HEADER */}
        <div className="optB-objhead">
          <div className="optB-objhead-top">
            <button className="optB-back"><I.Back/></button>
            <div className="optB-titleblock">
              <div className="optB-crumb">
                <a>Bán hàng</a> <span className="crumb-sep">/</span>
                <a>Đơn hàng bán</a> <span className="crumb-sep">/</span>
                <span>{D.meta.docNo}</span>
              </div>
              <div className="optB-h1">
                Lập đơn hàng bán
                <span className="status-pill drafting"><span className="dot"></span>Đang lập</span>
                <span className="doc-no">{D.meta.docNo}</span>
              </div>
            </div>
            <div className="optB-objhead-actions">
              <button className="btn icon-only danger" title="Xóa"><I.Trash/></button>
              <button className="btn icon-only ghost" title="In"><I.Print/></button>
              <button className="btn icon-only ghost" title="Danh sách"><I.List/></button>
              <span className="hsep"></span>
              <button className="btn success lg"><I.Check/> Hoàn thành</button>
              <button className="btn primary lg"><I.Save/> Lưu</button>
            </div>
          </div>

          <div className="optB-objhead-stats">
            <div className="optB-stat" style={{minWidth:280}}>
              <span className="k">Khách hàng</span>
              <span className="v" title={D.customer.name}>{D.customer.name}</span>
            </div>
            <div className="optB-stat">
              <span className="k">Giá trị đơn hàng</span>
              <span className="v lg">{window.fmtVND(totals.total)} <span className="ccy">VND</span></span>
            </div>
            <div className="optB-stat">
              <span className="k">Ngày đơn hàng</span>
              <span className="v">{D.meta.orderDate}</span>
            </div>
            <div className="optB-stat">
              <span className="k">Ngày xuất</span>
              <span className="v">{D.meta.deliveryDate}</span>
            </div>
            <div className="optB-stat">
              <span className="k">Nhân viên BH</span>
              <span className="v">{D.meta.salesRep.name}</span>
            </div>
            <div className="optB-stat">
              <span className="k">Kho xuất</span>
              <span className="v">{D.meta.warehouse}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="optB-tabs">
            <button className="optB-tab active"><I.List/> Chi tiết đơn hàng <span className="count">{D.lines.length}</span></button>
            <button className="optB-tab">Thanh toán</button>
            <button className="optB-tab"><I.Truck/> Giao hàng</button>
            <button className="optB-tab"><I.Chat/> Trao đổi <span className="count danger">{D.meta.documentCount}</span></button>
            <button className="optB-tab"><I.File/> File đính kèm <span className="count">{D.meta.fileCount}</span></button>
            <button className="optB-tab"><I.ListCheck/> Check list <span className="count">{D.meta.checkList.done}/{D.meta.checkList.total}</span></button>
            <button className="optB-tab">Lịch sử</button>
          </div>
        </div>

        {/* Body — tab content (Chi tiết) */}
        <div className="optB-body">

          {/* Info summary cards */}
          <div className="optB-info-grid">
            <div className="optB-card span-2">
              <div className="optB-card-head">
                <span className="optB-card-icon"><I.Building/></span>
                <span className="optB-card-title">Khách hàng & Hợp đồng</span>
                <button className="optB-card-action btn ghost" style={{height:24,fontSize:11.5,padding:'0 8px'}}><I.Edit/> Sửa</button>
              </div>
              <div className="optB-kv-list">
                <div className="optB-kv"><span className="k">Mã / Tên</span><span className="v"><span className="mono">{D.customer.code}</span> · {D.customer.name}</span></div>
                <div className="optB-kv"><span className="k">MST · ĐT</span><span className="v"><span className="mono">{D.customer.taxCode}</span> · {D.customer.phone}</span></div>
                <div className="optB-kv"><span className="k">Thuộc hợp đồng</span><span className="v muted">— Chưa chọn —</span></div>
                <div className="optB-kv"><span className="k">Bảng giá</span><span className="v">{D.meta.priceList}</span></div>
              </div>
            </div>

            <div className="optB-card">
              <div className="optB-card-head">
                <span className="optB-card-icon"><I.Tag/></span>
                <span className="optB-card-title">Thương mại</span>
              </div>
              <div className="optB-kv-list">
                <div className="optB-kv"><span className="k">Điều khoản TT</span><span className="v">{D.meta.payment}</span></div>
                <div className="optB-kv"><span className="k">Hạn mức công nợ</span><span className="v"><span className="num">{window.fmtVNDshort(D.customer.credit.used)}</span> / {window.fmtVNDshort(D.customer.credit.limit)}</span></div>
                <div className="optB-kv"><span className="k">Công nợ quá hạn</span><span className="v"><span className="tag green">Không có</span></span></div>
                <div className="optB-kv"><span className="k">Loại đơn</span><span className="v">{D.meta.type}</span></div>
              </div>
            </div>

            <div className="optB-card">
              <div className="optB-card-head">
                <span className="optB-card-icon"><I.Truck/></span>
                <span className="optB-card-title">Giao hàng</span>
              </div>
              <div className="optB-kv-list">
                <div className="optB-kv"><span className="k">Kho xuất</span><span className="v">{D.meta.warehouse}</span></div>
                <div className="optB-kv"><span className="k">Nơi giao</span><span className="v" title={D.meta.deliveryAddr}>{D.meta.deliveryAddr}</span></div>
                <div className="optB-kv"><span className="k">Số phiếu xuất</span><span className="v muted">Chưa phát sinh</span></div>
                <div className="optB-kv"><span className="k">Ghi chú giao</span><span className="v" style={{whiteSpace:'normal',display:'block',overflow:'visible'}}>{D.meta.notes}</span></div>
              </div>
            </div>
          </div>

          {/* Detail table */}
          <div className="optA-detail">
            <div className="optA-detail-head">
              <span className="optA-section-icon"><I.List/></span>
              <span className="optA-detail-title">Chi tiết đơn hàng</span>
              <span className="optA-detail-count">{D.lines.length} dòng · {D.lines.reduce((s,l)=>s+l.qty,0)} đơn vị</span>
              <div className="optA-detail-actions">
                <button className="btn icon-only danger" title="Xóa dòng"><I.Trash/></button>
                <button className="btn ghost"><I.Truck/> Kế hoạch giao hàng</button>
                <button className="btn ghost"><I.List/> Chọn nhanh</button>
                <button className="btn primary"><I.Plus/> Thêm chi tiết</button>
              </div>
            </div>
            <div className="optA-detail-search">
              <I.Search/>
              <input placeholder="Tìm trong chi tiết..." />
              <span className="tag amber"><I.Alert/> 1 dòng có cảnh báo</span>
            </div>
            <table className="dtable">
              <thead>
                <tr>
                  <th className="checkbox-cell"></th>
                  <th className="err-cell"></th>
                  <th style={{width:42}}>STT</th>
                  <th>Sản phẩm</th>
                  <th style={{width:140}}>ĐVT</th>
                  <th className="right" style={{width:82}}>SL</th>
                  <th className="right" style={{width:90}}>Khả dụng</th>
                  <th className="right" style={{width:120}}>ĐG trước thuế</th>
                  <th className="right" style={{width:60}}>CK %</th>
                  <th className="right" style={{width:60}}>Thuế %</th>
                  <th className="right" style={{width:140}}>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {D.lines.map((l, i) => {
                  const t = window.lineTotals(l);
                  const thumbClass = ['', 'v2', 'v3', 'v4', 'v5'][i] || '';
                  const initials = l.name.split(' ').slice(-1)[0].slice(0,2).toUpperCase();
                  return (
                    <tr key={l.code+i}>
                      <td className="checkbox-cell"><span className="check"></span></td>
                      <td className="err-cell">{l.hasError && <span className="err-icon"><I.Alert/></span>}</td>
                      <td className="stt-cell">{l.stt}</td>
                      <td>
                        <div className="product-cell">
                          <div className={`product-thumb ${thumbClass}`}>{initials}</div>
                          <div className="product-info">
                            <div className="product-name">{l.name}</div>
                            <div className="product-code">{l.code}</div>
                          </div>
                        </div>
                      </td>
                      <td>{l.unit}</td>
                      <td className="right num">{l.qty}</td>
                      <td className="right num muted">{l.available}</td>
                      <td className="right num">{window.fmtVND(l.priceBefore)}</td>
                      <td className="right num">{l.discount>0?`${l.discount}%`:'—'}</td>
                      <td className="right num muted">{l.taxPct}%</td>
                      <td className="right num row-total">{window.fmtVND(t.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sticky footer with totals */}
        <div className="optB-footer">
          <div className="total-block">
            <span className="total-label">Tạm tính:</span>
            <span className="total-amt num" style={{fontSize:14,fontWeight:600}}>{window.fmtVND(totals.sub)} <span className="ccy">VND</span></span>
          </div>
          <span className="sep"></span>
          <div className="total-block">
            <span className="total-label">Chiết khấu:</span>
            <span className="total-amt num" style={{fontSize:14,fontWeight:600,color:'var(--danger)'}}>−{window.fmtVND(totals.disc)} <span className="ccy">VND</span></span>
          </div>
          <span className="sep"></span>
          <div className="total-block">
            <span className="total-label">VAT:</span>
            <span className="total-amt num" style={{fontSize:14,fontWeight:600}}>{window.fmtVND(totals.tax)} <span className="ccy">VND</span></span>
          </div>
          <span className="sep"></span>
          <div className="total-block">
            <span className="total-label" style={{fontWeight:600,color:'var(--text-1)'}}>Tổng cộng:</span>
            <span className="total-amt num" style={{color:'var(--primary-700)'}}>{window.fmtVND(totals.total)} <span className="ccy">VND</span></span>
          </div>
          <div className="actions">
            <button className="btn ghost lg"><I.Plus/> Thêm mới</button>
            <button className="btn primary lg"><I.Save/> Lưu đơn hàng</button>
          </div>
        </div>

      </div>
    </div>
  );
};

window.OrderOptionB = OrderOptionB;
