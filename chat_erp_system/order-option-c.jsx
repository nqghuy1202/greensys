/* OPTION C — Document-first (Stripe/Linear inspired) */

const OrderOptionC = () => {
  const D = window.ORDER_DATA;
  const I = window.OrderIcons;
  const totals = window.orderTotals();
  const creditPct = Math.round(D.customer.credit.used / D.customer.credit.limit * 100);

  return (
    <div className="order-frame">
      <window.ErpTopbar />
      <div className="optC-page">
        {/* MAIN COLUMN */}
        <div className="optC-main">

          <div className="optC-pagehead">
            <button className="optC-back"><I.Back/></button>
            <div className="optC-pagehead-info">
              <div className="optC-pagehead-eyebrow">Bán hàng · Đơn hàng bán</div>
              <div className="optC-pagehead-title">
                Lập đơn hàng bán
                <span className="doc-no">{D.meta.docNo}</span>
                <span className="status-pill drafting"><span className="dot"></span>Đang lập</span>
              </div>
            </div>
            <div className="optC-pagehead-actions">
              <button className="btn icon-only danger" title="Xóa"><I.Trash/></button>
              <button className="btn icon-only ghost" title="In"><I.Print/></button>
              <button className="btn icon-only ghost" title="Danh sách"><I.List/></button>
              <button className="btn icon-only ghost" title="Thêm"><I.More/></button>
              <span className="hsep"></span>
              <button className="btn success lg"><I.Check/> Hoàn thành</button>
              <button className="btn primary lg"><I.Save/> Lưu</button>
            </div>
          </div>

          {/* Form card 1 — General info, as compact rows */}
          <div className="optC-formcard">
            <div className="optC-formcard-head">
              <div className="optC-formcard-title">Thông tin đơn hàng</div>
              <div className="optC-formcard-sub">7 trường · 4 bắt buộc</div>
              <button className="optC-formcard-toggle"><I.Caret/></button>
            </div>
            <div className="optC-formgrid">
              <div className="field-row">
                <span className="field-row-label">Loại <span className="req">*</span></span>
                <span className="field-row-value"><span className="input-pill grow">Đơn hàng bán <span className="caret"><I.Caret/></span></span></span>
              </div>
              <div className="field-row">
                <span className="field-row-label">Số đơn hàng <span className="req">*</span></span>
                <span className="field-row-value"><span className="input-pill grow mono">{D.meta.docNo}</span></span>
              </div>
              <div className="field-row">
                <span className="field-row-label">Ngày đơn hàng <span className="req">*</span></span>
                <span className="field-row-value"><span className="input-pill grow"><I.Cal/> {D.meta.orderDate}</span></span>
              </div>
              <div className="field-row">
                <span className="field-row-label">Ngày xuất <span className="req">*</span></span>
                <span className="field-row-value"><span className="input-pill grow"><I.Cal/> {D.meta.deliveryDate}</span></span>
              </div>
              <div className="field-row">
                <span className="field-row-label">Thuộc hợp đồng</span>
                <span className="field-row-value muted"><span className="input-pill grow"><span className="muted">— Chưa chọn —</span><span className="caret"><I.Caret/></span></span></span>
              </div>
              <div className="field-row">
                <span className="field-row-label">Bảng giá</span>
                <span className="field-row-value"><span className="input-pill grow">{D.meta.priceList}<span className="caret"><I.List/></span></span></span>
              </div>
              <div className="field-row">
                <span className="field-row-label">Nhân viên BH</span>
                <span className="field-row-value"><span className="input-pill grow">{D.meta.salesRep.name} · {D.meta.salesRep.dept}<span className="caret"><I.Caret/></span></span></span>
              </div>
              <div className="field-row">
                <span className="field-row-label">Điều khoản TT <span className="req">*</span></span>
                <span className="field-row-value"><span className="input-pill grow">{D.meta.payment}<span className="caret"><I.Caret/></span></span></span>
              </div>
              <div className="field-row span-2">
                <span className="field-row-label">Nội dung</span>
                <span className="field-row-value"><span className="input-pill grow">{D.meta.content}</span></span>
              </div>
            </div>
          </div>

          {/* Form card 2 — Delivery */}
          <div className="optC-formcard">
            <div className="optC-formcard-head">
              <div className="optC-formcard-title">Giao hàng</div>
              <div className="optC-formcard-sub">Kho xuất & địa chỉ giao</div>
              <button className="optC-formcard-toggle"><I.Caret/></button>
            </div>
            <div className="optC-formgrid">
              <div className="field-row">
                <span className="field-row-label">Kho xuất <span className="req">*</span></span>
                <span className="field-row-value"><span className="input-pill grow">{D.meta.warehouse}<span className="caret"><I.Caret/></span></span></span>
              </div>
              <div className="field-row">
                <span className="field-row-label">Số phiếu xuất</span>
                <span className="field-row-value muted"><span className="input-pill grow muted"><span className="muted">Chưa phát sinh</span></span></span>
              </div>
              <div className="field-row span-2">
                <span className="field-row-label">Nơi giao hàng</span>
                <span className="field-row-value"><span className="input-pill grow">{D.meta.deliveryAddr}<span className="caret"><I.Caret/></span></span></span>
              </div>
              <div className="field-row span-2">
                <span className="field-row-label">Ghi chú giao</span>
                <span className="field-row-value"><span className="input-pill grow">{D.meta.notes}</span></span>
              </div>
            </div>
          </div>

          {/* Items table */}
          <div className="optC-items">
            <div className="optC-items-head">
              <div className="optC-items-title">Chi tiết đơn hàng</div>
              <div className="optC-items-sub">{D.lines.length} dòng · {D.lines.reduce((s,l)=>s+l.qty,0)} đơn vị</div>
              <div className="optC-items-actions">
                <button className="btn ghost"><I.Truck/> Kế hoạch giao hàng</button>
                <button className="btn ghost"><I.List/> Chọn nhanh</button>
                <button className="btn primary"><I.Plus/> Thêm chi tiết</button>
              </div>
            </div>
            <table className="dtable">
              <thead>
                <tr>
                  <th className="err-cell"></th>
                  <th style={{width:42}}>STT</th>
                  <th>Sản phẩm</th>
                  <th style={{width:140}}>ĐVT</th>
                  <th className="right" style={{width:60}}>SL</th>
                  <th className="right" style={{width:120}}>Đơn giá</th>
                  <th className="right" style={{width:64}}>CK</th>
                  <th className="right" style={{width:64}}>VAT</th>
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
                      <td className="right num">{window.fmtVND(l.priceBefore)}</td>
                      <td className="right num">{l.discount>0?`${l.discount}%`:<span className="muted">—</span>}</td>
                      <td className="right num muted">{l.taxPct}%</td>
                      <td className="right num row-total">{window.fmtVND(t.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* SIDE PANEL */}
        <div className="optC-side">

          {/* Customer card */}
          <div className="optC-side-section">
            <div className="row"><div className="optC-side-title">Khách hàng</div><a className="optC-side-action">Đổi</a></div>
            <div className="optC-customer-card">
              <div className="optC-customer-avatar">CB</div>
              <div className="optC-customer-info">
                <div className="optC-customer-name">{D.customer.name}</div>
                <div className="optC-customer-meta"><span className="mono">{D.customer.code}</span> · MST {D.customer.taxCode}</div>
                <div className="optC-customer-meta" style={{marginTop:4}}>{D.customer.addr}</div>

                <div className="optC-customer-stats">
                  <div className="optC-customer-stat"><div className="k">Hạn mức</div><div className="v">{window.fmtVNDshort(D.customer.credit.limit)}</div></div>
                  <div className="optC-customer-stat"><div className="k">Đã dùng</div><div className="v">{window.fmtVNDshort(D.customer.credit.used)}</div></div>
                  <div className="optC-customer-stat"><div className="k">Quá hạn</div><div className="v good">Không có</div></div>
                </div>

                <div className="optC-credit">
                  <div className="optC-credit-bar"><div className="optC-credit-fill" style={{width: creditPct+'%'}}></div></div>
                  <div className="optC-credit-text"><span>Đã dùng {creditPct}%</span><span>còn {window.fmtVNDshort(D.customer.credit.limit-D.customer.credit.used)}</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Totals breakdown */}
          <div className="optC-side-section">
            <div className="row"><div className="optC-side-title">Tổng kết</div></div>
            <div className="optC-totals">
              <div className="optC-totals-row"><span className="k">Tạm tính ({D.lines.length} dòng)</span><span className="v">{window.fmtVND(totals.sub)}</span></div>
              <div className="optC-totals-row discount"><span className="k">Chiết khấu</span><span className="v">−{window.fmtVND(totals.disc)}</span></div>
              <div className="optC-totals-row"><span className="k">Thuế VAT (10%)</span><span className="v">+{window.fmtVND(totals.tax)}</span></div>
              <div className="optC-totals-divider"></div>
              <div className="optC-totals-row total">
                <span className="k">Tổng cộng</span>
                <span className="v">{window.fmtVND(totals.total)} <span className="ccy">VND</span></span>
              </div>
            </div>
          </div>

          {/* Workflow */}
          <div className="optC-side-section">
            <div className="row"><div className="optC-side-title">Trạng thái duyệt</div></div>
            <div className="optC-workflow-list">
              <div className="optC-wf-item done">
                <span className="optC-wf-dot"><I.Check/></span>
                <span className="optC-wf-line"></span>
                <div className="optC-wf-content">
                  <div className="optC-wf-label">Khởi tạo</div>
                  <div className="optC-wf-meta">Mai Anh · 08:42 sáng nay</div>
                </div>
              </div>
              <div className="optC-wf-item current">
                <span className="optC-wf-dot"></span>
                <span className="optC-wf-line"></span>
                <div className="optC-wf-content">
                  <div className="optC-wf-label">Đang lập</div>
                  <div className="optC-wf-meta">Bạn · ngay bây giờ</div>
                </div>
              </div>
              <div className="optC-wf-item">
                <span className="optC-wf-dot"></span>
                <span className="optC-wf-line"></span>
                <div className="optC-wf-content">
                  <div className="optC-wf-label">Chờ duyệt giá & công nợ</div>
                  <div className="optC-wf-meta">Trưởng phòng KD</div>
                </div>
              </div>
              <div className="optC-wf-item">
                <span className="optC-wf-dot"></span>
                <span className="optC-wf-line"></span>
                <div className="optC-wf-content">
                  <div className="optC-wf-label">Xuất kho</div>
                  <div className="optC-wf-meta">Thủ kho K01MT</div>
                </div>
              </div>
              <div className="optC-wf-item">
                <span className="optC-wf-dot"></span>
                <div className="optC-wf-content">
                  <div className="optC-wf-label">Hoàn thành</div>
                  <div className="optC-wf-meta">—</div>
                </div>
              </div>
            </div>
          </div>

          {/* Check list */}
          <div className="optC-side-section">
            <div className="row">
              <div className="optC-side-title">Check list ({D.meta.checkList.done}/{D.meta.checkList.total})</div>
              <a className="optC-side-action">Mở</a>
            </div>
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              {[
                {label:'Đầy đủ thông tin khách hàng', done:true},
                {label:'Chọn bảng giá phù hợp', done:true},
                {label:'Khớp tồn kho khả dụng', done:false, warn:true},
                {label:'Duyệt hạn mức công nợ', done:false},
                {label:'Đính kèm đơn đặt hàng (PDF)', done:false},
                {label:'Phê duyệt của trưởng phòng', done:false},
              ].map((c,i) => (
                <div key={i} className="row" style={{padding:'4px 0',fontSize:12.5,color: c.done?'var(--text-2)':'var(--text-1)'}}>
                  <span className={`check ${c.done?'checked':''}`}>{c.done && <I.Check/>}</span>
                  <span style={{textDecoration: c.done?'line-through':'none', color: c.done?'var(--text-3)':'inherit'}}>{c.label}</span>
                  {c.warn && <span className="tag amber" style={{marginLeft:'auto'}}>Kiểm tra</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Trao đổi + File */}
          <div className="optC-side-section">
            <div className="row"><div className="optC-side-title">Trao đổi & File</div></div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
              <div className="optC-customer-card" style={{padding:'12px 14px', flexDirection:'column', alignItems:'flex-start',gap:4, background:'var(--primary-50)', borderColor:'var(--primary-100)'}}>
                <div className="row" style={{width:'100%'}}>
                  <I.Chat style={{color:'var(--primary-700)'}}/>
                  <span style={{marginLeft:'auto', fontSize:18, fontWeight:700, color:'var(--text-1)', fontVariantNumeric:'tabular-nums'}}>{D.meta.documentCount}</span>
                </div>
                <span style={{fontSize:12, color:'var(--text-2)', fontWeight:500}}>Trao đổi</span>
                <span style={{fontSize:11, color:'var(--danger)', fontWeight:500}}>● 3 chưa đọc</span>
              </div>
              <div className="optC-customer-card" style={{padding:'12px 14px', flexDirection:'column', alignItems:'flex-start',gap:4}}>
                <div className="row" style={{width:'100%'}}>
                  <I.File style={{color:'var(--text-2)'}}/>
                  <span style={{marginLeft:'auto', fontSize:18, fontWeight:700, color:'var(--text-1)', fontVariantNumeric:'tabular-nums'}}>{D.meta.fileCount}</span>
                </div>
                <span style={{fontSize:12, color:'var(--text-2)', fontWeight:500}}>File đính kèm</span>
                <span style={{fontSize:11, color:'var(--text-3)'}}>Chưa có file</span>
              </div>
            </div>
          </div>

          {/* Activity */}
          <div className="optC-side-section">
            <div className="row"><div className="optC-side-title">Hoạt động gần đây</div></div>
            <div className="optC-activity">
              {D.activity.map((a,i) => (
                <div key={i} className="optC-act">
                  <span className={`optC-act-avatar ${i%2?'v2':''}`}>{a.who.split(' ').slice(-1)[0].slice(0,2).toUpperCase()}</span>
                  <div>
                    <div className="optC-act-text"><b>{a.who}</b> {a.what}</div>
                    <div className="optC-act-time">{a.when}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

window.OrderOptionC = OrderOptionC;
