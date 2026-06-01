/* OPTION A — Refined ERP polish pass */

const OrderOptionA = ({ mode = 'edit' }) => {
  const D = window.ORDER_DATA;
  const I = window.OrderIcons;
  const totals = window.orderTotals();

  return (
    <div className="order-frame">
      <window.ErpTopbar />
      <div className="optA-page">
        <div className="optA-main">

          {/* Header bar */}
          <div className="optA-pagehead">
            <button className="optA-back"><I.Back/></button>
            <div className="optA-h1">Lập đơn hàng bán <span className="doc-no">{D.meta.docNo}</span></div>
            <div className="optA-actions">
              <button className="btn icon-only danger" title="Xóa"><I.Trash/></button>
              <button className="btn success"><I.Check/> Hoàn thành</button>
              <button className="btn icon-only ghost" title="Danh sách"><I.List/></button>
              <button className="btn icon-only ghost" title="In"><I.Print/></button>
              <button className="btn primary"><I.Save/> Lưu</button>
              <button className="btn ghost"><I.Plus/> Thêm mới</button>
            </div>
          </div>

          {/* Object header */}
          <div className="optA-objhead">
            <div className="objhead-customer">
              <div className="objhead-customer-avatar">CB</div>
              <div className="objhead-customer-info">
                <div className="objhead-customer-name">{D.customer.name}</div>
                <div className="objhead-customer-meta">
                  <span className="mono">{D.customer.code}</span>
                  <span className="sep">·</span> MST {D.customer.taxCode}
                  <span className="sep">·</span> {D.customer.phone}
                </div>
              </div>
            </div>
            <div className="objhead-kv">
              <span className="k">Giá trị đơn hàng</span>
              <span className="v money">{window.fmtVND(totals.total)} <span className="ccy">VND</span></span>
            </div>
            <div className="objhead-kv">
              <span className="k">Ngày đơn hàng</span>
              <span className="v">{D.meta.orderDate}</span>
            </div>
            <div className="objhead-kv">
              <span className="k">Trạng thái</span>
              <span className="v"><span className="status-pill drafting"><span className="dot"></span>Đang lập</span></span>
            </div>
          </div>

          {/* Workflow stepper */}
          <div className="optA-stepper">
            <div className="optA-step done"><div className="optA-step-num"><I.Check/></div><div className="optA-step-label">Khởi tạo</div></div>
            <div className="optA-step current"><div className="optA-step-num">2</div><div className="optA-step-label">Đang lập</div></div>
            <div className="optA-step"><div className="optA-step-num">3</div><div className="optA-step-label">Chờ duyệt</div></div>
            <div className="optA-step"><div className="optA-step-num">4</div><div className="optA-step-label">Xuất kho</div></div>
            <div className="optA-step"><div className="optA-step-num">5</div><div className="optA-step-label">Hoàn thành</div></div>
          </div>

          {/* Group 1 — Thông tin chung */}
          <div className="optA-section">
            <div className="optA-section-head">
              <span className="optA-section-icon"><I.Tag/></span>
              <span className="optA-section-title">Thông tin chung</span>
              <button className="optA-section-toggle"><I.Caret/></button>
            </div>
            <div className="optA-section-body cols-4">
              <div className="field">
                <div className="field-label">Loại <span className="req">*</span></div>
                <div className="field-input">Đơn hàng bán <span className="caret"><I.Caret/></span></div>
              </div>
              <div className="field span-2">
                <div className="field-label">Đối tượng <span className="req">*</span></div>
                <div className="field-input">{D.customer.name} <span className="caret"><I.List/></span></div>
              </div>
              <div className="field">
                <div className="field-label">Số đơn hàng <span className="req">*</span></div>
                <div className="field-input mono">{D.meta.docNo}</div>
              </div>
              <div className="field">
                <div className="field-label">Ngày đơn hàng <span className="req">*</span></div>
                <div className="field-input"><span className="leading"><I.Cal/></span>{D.meta.orderDate}</div>
              </div>
              <div className="field">
                <div className="field-label">Ngày xuất <span className="req">*</span></div>
                <div className="field-input"><span className="leading"><I.Cal/></span>{D.meta.deliveryDate}</div>
              </div>
              <div className="field">
                <div className="field-label">Thuộc hợp đồng</div>
                <div className="field-input muted">— Chưa chọn — <span className="caret"><I.Caret/></span></div>
              </div>
              <div className="field">
                <div className="field-label">Nhân viên bán hàng</div>
                <div className="field-input">{D.meta.salesRep.name} <span className="caret"><I.Caret/></span></div>
              </div>
            </div>
          </div>

          {/* Group 2 — Thương mại & thanh toán */}
          <div className="optA-section">
            <div className="optA-section-head">
              <span className="optA-section-icon"><I.Box/></span>
              <span className="optA-section-title">Thương mại & Thanh toán</span>
              <button className="optA-section-toggle"><I.Caret/></button>
            </div>
            <div className="optA-section-body cols-4">
              <div className="field">
                <div className="field-label">Bảng giá</div>
                <div className="field-input">{D.meta.priceList} <span className="caret"><I.List/></span></div>
              </div>
              <div className="field">
                <div className="field-label">Điều khoản thanh toán <span className="req">*</span></div>
                <div className="field-input">{D.meta.payment} <span className="caret"><I.Caret/></span></div>
              </div>
              <div className="field">
                <div className="field-label">Giá trị đơn hàng</div>
                <div className="field-input readonly num">{window.fmtVND(totals.total)} <span className="muted" style={{fontSize:11,marginLeft:'auto'}}>VND</span></div>
              </div>
              <div className="field">
                <div className="field-label">Số phiếu xuất</div>
                <div className="field-input muted">Chưa phát sinh</div>
              </div>
            </div>
          </div>

          {/* Group 3 — Giao hàng */}
          <div className="optA-section">
            <div className="optA-section-head">
              <span className="optA-section-icon"><I.Truck/></span>
              <span className="optA-section-title">Giao hàng & Kho</span>
              <button className="optA-section-toggle"><I.Caret/></button>
            </div>
            <div className="optA-section-body cols-4">
              <div className="field">
                <div className="field-label">Kho xuất hàng <span className="req">*</span></div>
                <div className="field-input">{D.meta.warehouse} <span className="caret"><I.Caret/></span></div>
              </div>
              <div className="field span-2">
                <div className="field-label">Nơi giao hàng</div>
                <div className="field-input">{D.meta.deliveryAddr} <span className="caret"><I.Caret/></span></div>
              </div>
              <div className="field">
                <div className="field-label">Ghi chú</div>
                <div className="field-input muted">— Trống —</div>
              </div>
              <div className="field span-2">
                <div className="field-label">Nội dung</div>
                <div className="field-input">{D.meta.content}</div>
              </div>
            </div>
          </div>

          {/* Detail table */}
          <div className="optA-detail">
            <div className="optA-detail-head">
              <span className="optA-section-icon"><I.List/></span>
              <span className="optA-detail-title">Chi tiết đơn hàng</span>
              <span className="optA-detail-count">{D.lines.length} dòng</span>
              <div className="optA-detail-actions">
                <button className="btn icon-only danger" title="Xóa dòng"><I.Trash/></button>
                <button className="btn ghost"><I.Truck/> Kế hoạch giao hàng</button>
                <button className="btn ghost"><I.List/> Chọn nhanh chi tiết</button>
                <button className="btn primary"><I.Plus/> Thêm chi tiết</button>
                <button className="btn icon-only ghost" title="Mở rộng"><I.Expand/></button>
              </div>
            </div>
            <div className="optA-detail-search">
              <I.Search/>
              <input placeholder="Tìm kiếm: Tất cả các cột văn bản" defaultValue="" />
              <button className="btn ghost" style={{height:24,fontSize:11.5,padding:'0 10px'}}>Tìm kiếm</button>
              <button className="btn ghost" style={{height:24,fontSize:11.5,padding:'0 10px'}}>Hành động <I.Caret/></button>
            </div>
            <table className="dtable">
              <thead>
                <tr>
                  <th className="checkbox-cell"></th>
                  <th className="err-cell"></th>
                  <th style={{width:42}}>STT</th>
                  <th>Sản phẩm</th>
                  <th style={{width:140}}>ĐVT</th>
                  <th className="right" style={{width:82}}>Số lượng</th>
                  <th className="right" style={{width:90}}>Khả dụng</th>
                  <th className="right" style={{width:120}}>ĐG trước thuế</th>
                  <th className="right" style={{width:60}}>CK %</th>
                  <th className="right" style={{width:60}}>Thuế %</th>
                  <th className="right" style={{width:130}}>TT trước thuế</th>
                  <th className="right" style={{width:140}}>TT sau thuế</th>
                </tr>
              </thead>
              <tbody>
                {D.lines.map((l, i) => {
                  const t = window.lineTotals(l);
                  const thumbClass = ['', 'v2', 'v3', 'v4', 'v5'][i] || '';
                  const initials = l.name.split(' ').slice(-1)[0].slice(0,2).toUpperCase();
                  return (
                    <tr key={l.code+i} className={i === 0 ? 'selected' : ''}>
                      <td className="checkbox-cell"><span className={`check ${i===0?'checked':''}`}>{i===0 && <I.Check/>}</span></td>
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
                      <td className="right num">{l.discount > 0 ? `${l.discount}%` : '—'}</td>
                      <td className="right num muted">{l.taxPct}%</td>
                      <td className="right num">{window.fmtVND(l.qty * l.priceBefore)}</td>
                      <td className="right num row-total">{window.fmtVND(t.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}></td>
                  <td className="right num">{D.lines.reduce((s,l) => s+l.qty, 0)}</td>
                  <td colSpan={4} className="right label">Tổng giá trị đơn hàng (đã gồm VAT)</td>
                  <td className="right num">{window.fmtVND(totals.sub - totals.disc)}</td>
                  <td className="right num row-total" style={{color:'var(--primary-700)',fontSize:14}}>{window.fmtVND(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

        </div>

        {/* Right rail */}
        <div className="optA-rail">
          <div className="optA-rail-item has-alert">
            <span className="optA-rail-num">{D.meta.documentCount}</span>
            <span className="optA-rail-label">Trao đổi</span>
          </div>
          <div className="optA-rail-divider"></div>
          <div className="optA-rail-item">
            <span className="optA-rail-num">{D.meta.fileCount}</span>
            <span className="optA-rail-label">File đính kèm</span>
          </div>
          <div className="optA-rail-divider"></div>
          <div className="optA-rail-item">
            <span className="optA-rail-num">{D.meta.checkList.done}/{D.meta.checkList.total}</span>
            <span className="optA-rail-label">Check list hoàn thành</span>
          </div>
        </div>
      </div>
    </div>
  );
};

window.OrderOptionA = OrderOptionA;
