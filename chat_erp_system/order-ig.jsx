/* Interactive Grid — APEX 24.2 inspired, ERP green design system
   Replaces the "Chi tiết đơn hàng" table inside Option B.
   Exposes window.InteractiveGrid */

const { useState: useStateIG } = React;

/* ----------------- Sub-icons (extends OrderIcons) ----------------- */
const IGI = {
  Search:  (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Filter:  (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  SortAZ:  (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 4v16"/></svg>,
  SortDesc:(p) => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="6 9 12 15 18 9"/></svg>,
  SortAsc: (p) => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="6 15 12 9 18 15"/></svg>,
  Dots:    (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>,
  Lock:    (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Eye:     (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  EyeOff:  (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  Sigma:   (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="20 5 5 5 12 12 5 19 20 19"/></svg>,
  Group:   (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  Edit:    (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Save:    (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  Refresh: (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  ViewGrid:(p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="3" y1="4" x2="3" y2="20"/><line x1="21" y1="4" x2="21" y2="20"/></svg>,
  ViewRow: (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/></svg>,
  ViewCol: (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="7" height="18"/><rect x="14" y="3" width="7" int="18" height="18"/></svg>,
  ChevD:   (p) => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="6 9 12 15 18 9"/></svg>,
  ChevR:   (p) => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="9 6 15 12 9 18"/></svg>,
  X:       (p) => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Plus:    (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Alert:   (p) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Check:   (p) => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="20 6 9 17 4 12"/></svg>,
  Drag:    (p) => <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" {...p}><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>,
  Trash:   (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>,
  Copy:    (p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  Download:(p) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Star:    (p) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
};

/* ----------------- Column heading menu (popover, demo-open) ----------------- */
const ColMenu = () => (
  <div className="ig-colmenu">
    <div className="ig-colmenu-arrow"></div>
    <div className="ig-colmenu-section">
      <button className="ig-colmenu-item"><IGI.SortAsc/> Sắp xếp tăng dần</button>
      <button className="ig-colmenu-item active"><IGI.SortDesc/> Sắp xếp giảm dần <span className="ig-colmenu-tick"><IGI.Check/></span></button>
    </div>
    <div className="ig-colmenu-divider"></div>
    <div className="ig-colmenu-section">
      <button className="ig-colmenu-item"><IGI.Group/> Control break <span className="ig-colmenu-meta">theo cột này</span></button>
      <button className="ig-colmenu-item"><IGI.Sigma/> Aggregate… <span className="ig-colmenu-meta">SUM / AVG…</span></button>
    </div>
    <div className="ig-colmenu-divider"></div>
    <div className="ig-colmenu-section">
      <button className="ig-colmenu-item"><IGI.Lock/> Đóng băng cột</button>
      <button className="ig-colmenu-item"><IGI.EyeOff/> Ẩn cột</button>
      <button className="ig-colmenu-item"><IGI.Filter/> Lọc theo cột này…</button>
    </div>
    <div className="ig-colmenu-divider"></div>
    <div className="ig-colmenu-search">
      <IGI.Search/>
      <input placeholder="Tìm nhanh trong cột…" defaultValue="Ngọc Huy" />
    </div>
    <div className="ig-colmenu-lov">
      <label className="ig-colmenu-lov-item"><input type="checkbox" defaultChecked/> <span>Nước Mắm Ngọc Huy</span><span className="ig-colmenu-lov-count">3</span></label>
      <label className="ig-colmenu-lov-item"><input type="checkbox" defaultChecked/> <span>Tương Ớt Ngọc Huy</span><span className="ig-colmenu-lov-count">1</span></label>
      <label className="ig-colmenu-lov-item"><input type="checkbox" defaultChecked/> <span>Bột Nêm Ngọc Huy</span><span className="ig-colmenu-lov-count">1</span></label>
    </div>
  </div>
);

/* ----------------- Interactive Grid ----------------- */
const InteractiveGrid = ({
  density = 'cozy',           // comfortable | cozy | compact
  toolbarStyle = 'standard',  // standard | floating | hover
  group = true,               // control break on family
  headerStyle = 'caps',       // caps | soft
  selectionStyle = 'row',     // row | cell
  openColMenu = false,        // demo: open one column menu
}) => {
  const I = window.OrderIcons;
  const D = window.ORDER_DATA;
  const lines = D.lines;
  const totals = window.orderTotals();
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);

  // Group lines by family for control break
  const groups = group
    ? lines.reduce((acc, l) => {
        const k = l.family;
        if (!acc.find(g => g.key === k)) acc.push({ key: k, items: [] });
        acc.find(g => g.key === k).items.push(l);
        return acc;
      }, [])
    : [{ key: null, items: lines }];

  const groupSum = (g) => g.items.reduce((s, l) => s + window.lineTotals(l).total, 0);
  const groupQty = (g) => g.items.reduce((s, l) => s + l.qty, 0);

  const [selected, setSelected] = useStateIG(new Set([2])); // row 2 pre-selected for demo
  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const selectAll = () => {
    setSelected(selected.size === lines.length ? new Set() : new Set(lines.map(l => l.stt)));
  };

  return (
    <div className={`ig ig-density-${density} ig-toolbar-${toolbarStyle} ig-header-${headerStyle} ig-sel-${selectionStyle} ${selected.size>0?'has-selection':''}`}>

      {/* Saved Reports tabs */}
      <div className="ig-reports">
        <button className="ig-report active">
          <span className="ig-report-icon"><IGI.Star/></span>
          <span>Báo cáo chính</span>
          <span className="ig-report-meta">Primary</span>
        </button>
        <button className="ig-report">Đơn vượt tồn kho <span className="ig-report-dot">⚠ 1</span></button>
        <button className="ig-report">Theo nhân viên</button>
        <button className="ig-report private">Của tôi · Đơn quý 1</button>
        <button className="ig-report-add" title="Lưu báo cáo mới"><IGI.Plus/></button>
        <div className="ig-reports-right">
          <button className="ig-rep-action" title="Tải xuống Excel"><IGI.Download/></button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="ig-toolbar">
        <div className="ig-search">
          <IGI.Search/>
          <input placeholder="Tìm trong chi tiết đơn hàng… (⌘K)" />
          <span className="ig-search-kbd">⌘K</span>
        </div>

        <div className="ig-toolbar-mid">
          <button className="ig-tb-btn"><IGI.Filter/> Bộ lọc <span className="ig-tb-count">2</span></button>
          <button className="ig-tb-btn"><IGI.SortAZ/> Sắp xếp <span className="ig-tb-count">1</span></button>
          <button className="ig-tb-btn"><IGI.Group/> Nhóm <span className="ig-tb-on">Nhóm SP</span></button>
          <button className="ig-tb-btn ig-tb-iconly" title="Actions"><IGI.Dots/></button>
        </div>

        <div className="ig-toolbar-right">
          <button className="ig-tb-btn primary"><IGI.Edit/> Chỉnh sửa <span className="ig-tb-on">Bật</span></button>
          <button className="ig-tb-btn"><IGI.Save/> Lưu</button>
          <button className="ig-tb-btn ig-tb-iconly" title="Tải lại"><IGI.Refresh/></button>
          <div className="ig-view-switch">
            <button className="active" title="Dạng lưới"><IGI.ViewGrid/></button>
            <button title="Dạng phiếu (Single Row View)"><IGI.ViewRow/></button>
          </div>
        </div>
      </div>

      {/* Active filter chips */}
      <div className="ig-chips">
        <span className="ig-chips-label">Đang lọc:</span>
        <span className="ig-chip">
          <span className="ig-chip-k">Nhóm SP</span>
          <span className="ig-chip-op">là</span>
          <span className="ig-chip-v">Nước Mắm Ngọc Huy</span>
          <button className="ig-chip-x"><IGI.X/></button>
        </span>
        <span className="ig-chip">
          <span className="ig-chip-k">SL</span>
          <span className="ig-chip-op">≥</span>
          <span className="ig-chip-v">1</span>
          <button className="ig-chip-x"><IGI.X/></button>
        </span>
        <span className="ig-chip ig-chip-sort">
          <span className="ig-chip-k">Sắp xếp</span>
          <span className="ig-chip-v"><IGI.SortDesc/> Thành tiền</span>
          <button className="ig-chip-x"><IGI.X/></button>
        </span>
        <button className="ig-chip-add"><IGI.Plus/> Thêm điều kiện</button>
        <button className="ig-chips-clear">Xóa tất cả</button>
      </div>

      {/* Selection bulk action bar — appears when rows selected */}
      {selected.size > 0 && (
        <div className="ig-bulkbar">
          <span className="ig-bulk-count"><span className="ig-bulk-num">{selected.size}</span> dòng đã chọn</span>
          <button className="ig-bulk-clear" onClick={()=>setSelected(new Set())}>Bỏ chọn</button>
          <span className="ig-bulk-sep"></span>
          <button className="ig-bulk-btn"><IGI.Copy/> Nhân bản</button>
          <button className="ig-bulk-btn"><IGI.Edit/> Sửa hàng loạt</button>
          <button className="ig-bulk-btn"><I.Truck/> Lập kế hoạch giao</button>
          <button className="ig-bulk-btn danger"><IGI.Trash/> Xóa</button>
        </div>
      )}

      {/* Grid scroll container */}
      <div className="ig-scroll">
        <table className="ig-table">
          <colgroup>
            <col style={{width:36}}/>{/* select */}
            <col style={{width:26}}/>{/* err */}
            <col style={{width:42}}/>{/* stt */}
            <col style={{minWidth:320}}/>{/* product */}
            <col style={{width:130}}/>{/* unit */}
            <col style={{width:78}}/>{/* qty */}
            <col style={{width:88}}/>{/* available */}
            <col style={{width:130}}/>{/* price */}
            <col style={{width:74}}/>{/* discount */}
            <col style={{width:74}}/>{/* tax */}
            <col style={{width:150}}/>{/* total */}
            <col style={{width:42}}/>{/* row actions */}
          </colgroup>
          <thead>
            <tr className="ig-head-row">
              <th className="ig-th ig-th-select ig-frozen ig-frozen-1">
                <span className={`ig-check ${selected.size===lines.length?'checked':selected.size>0?'indeterminate':''}`} onClick={selectAll}>
                  {selected.size===lines.length && <IGI.Check/>}
                  {selected.size>0 && selected.size<lines.length && <span className="ig-check-dash"></span>}
                </span>
              </th>
              <th className="ig-th ig-th-err ig-frozen ig-frozen-2"></th>
              <ColHead label="#" align="left" frozen="3"/>
              <ColHead label="Sản phẩm" sort="asc" hasMenu menuOpen={openColMenu} frozen="4" frozenLast/>
              <ColHead label="ĐVT"/>
              <ColHead label="SL" align="right" sort="none"/>
              <ColHead label="Khả dụng" align="right"/>
              <ColHead label="ĐG trước thuế" align="right"/>
              <ColHead label="CK %" align="right"/>
              <ColHead label="Thuế %" align="right"/>
              <ColHead label="Thành tiền" align="right" sort="desc" agg="SUM"/>
              <th className="ig-th"></th>
            </tr>
          </thead>

          {groups.map((g, gi) => (
            <tbody key={g.key||'flat'} className="ig-tbody">
              {g.key && (
                <tr className="ig-break-row">
                  <td className="ig-frozen ig-frozen-1" colSpan={3}>
                    <span className="ig-break-chev"><IGI.ChevD/></span>
                    <span className="ig-break-label">{g.key}</span>
                    <span className="ig-break-count">{g.items.length} sản phẩm</span>
                  </td>
                  <td className="ig-frozen ig-frozen-2 ig-frozen-last" colSpan={1}></td>
                  <td colSpan={5} className="ig-break-spacer"></td>
                  <td className="ig-break-agg num">
                    <span className="ig-break-agg-label">Σ SL</span>
                    <span className="ig-break-agg-val">{groupQty(g)}</span>
                  </td>
                  <td className="ig-break-agg num" colSpan={2}>
                    <span className="ig-break-agg-label">Σ Thành tiền</span>
                    <span className="ig-break-agg-val accent">{window.fmtVND(groupSum(g))}</span>
                  </td>
                </tr>
              )}

              {g.items.map((l) => {
                const lt = window.lineTotals(l);
                const sel = selected.has(l.stt);
                return (
                  <tr key={l.code} className={`ig-row ${sel?'selected':''} ${l.editing?'editing':''} ${l.hasError?'has-error':''}`}>
                    <td className="ig-td ig-td-select ig-frozen ig-frozen-1">
                      <span className={`ig-check ${sel?'checked':''}`} onClick={()=>toggle(l.stt)}>
                        {sel && <IGI.Check/>}
                      </span>
                    </td>
                    <td className="ig-td ig-td-err ig-frozen ig-frozen-2">
                      {l.hasError && (
                        <span className="ig-err-wrap">
                          <span className="ig-err-icon"><IGI.Alert/></span>
                          <span className="ig-err-tip">
                            <b>Lỗi xác thực</b>
                            <span>{l.errorMsg}</span>
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="ig-td ig-td-stt ig-frozen ig-frozen-3">{l.stt}</td>
                    <td className="ig-td ig-td-product ig-frozen ig-frozen-4 ig-frozen-last">
                      <div className="ig-product">
                        <div className="ig-product-name" title={l.name}>{l.name}</div>
                        <div className="ig-product-meta">
                          <span className="mono">{l.code}</span>
                          <span className="ig-product-sep">·</span>
                          <span>Lô: {l.family.split(' ').pop()}-{l.stt.toString().padStart(3,'0')}</span>
                        </div>
                      </div>
                    </td>
                    <td className="ig-td">{l.unit}</td>
                    <td className={`ig-td num right ${l.editing?'ig-cell-editing':''}`}>
                      {l.editing ? (
                        <span className="ig-edit-wrap">
                          <input className="ig-edit-input num" defaultValue={l.qty}/>
                          <span className="ig-cell-dirty" title="Giá trị đã thay đổi (chưa lưu)"></span>
                        </span>
                      ) : l.qty}
                    </td>
                    <td className="ig-td num right muted">{l.available.toLocaleString('vi-VN')}</td>
                    <td className="ig-td num right">{window.fmtVND(l.priceBefore)}</td>
                    <td className="ig-td num right">{l.discount>0 ? `${l.discount}%` : <span className="muted">—</span>}</td>
                    <td className="ig-td num right muted">{l.taxPct}%</td>
                    <td className="ig-td num right ig-td-total">{window.fmtVND(lt.total)}</td>
                    <td className="ig-td ig-td-rowact">
                      <button className="ig-row-action" title="Hành động dòng"><IGI.Dots/></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}

          <tfoot>
            <tr className="ig-agg-row">
              <td className="ig-frozen ig-frozen-1"></td>
              <td className="ig-frozen ig-frozen-2"></td>
              <td className="ig-frozen ig-frozen-3"></td>
              <td className="ig-frozen ig-frozen-4 ig-frozen-last ig-agg-label">
                <IGI.Sigma/> Tổng cộng <span className="ig-agg-meta">{lines.length} dòng</span>
              </td>
              <td></td>
              <td className="num right ig-agg-val">{totalQty}</td>
              <td></td>
              <td className="num right muted ig-agg-meta">Trung bình: {window.fmtVND(totals.sub/totalQty)}</td>
              <td></td>
              <td></td>
              <td className="num right ig-agg-val accent">{window.fmtVND(totals.total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="ig-pager">
        <div className="ig-pager-left">
          <span className="ig-pager-count"><b>1 – 5</b> / 5 dòng</span>
          <span className="ig-pager-sep"></span>
          <span className="ig-pager-info"><IGI.Group/> Nhóm theo <b>Nhóm SP</b></span>
          <span className="ig-pager-sep"></span>
          <span className="ig-pager-info"><IGI.Sigma/> Aggregate trên <b>Thành tiền</b></span>
        </div>
        <div className="ig-pager-right">
          <span className="ig-pager-info">Hiển thị</span>
          <button className="ig-pager-pgsize">50 <IGI.ChevD/></button>
          <span className="ig-pager-sep"></span>
          <button className="ig-pager-nav" disabled><IGI.ChevR style={{transform:'rotate(180deg)'}}/></button>
          <button className="ig-pager-nav" disabled><IGI.ChevR/></button>
          <span className="ig-pager-sep"></span>
          <button className="ig-pager-action"><IGI.Plus/> Thêm dòng</button>
        </div>
      </div>

    </div>
  );
};

/* ----------------- Column header cell ----------------- */
const ColHead = ({ label, align = 'left', sort, hasMenu, menuOpen, agg, frozen, frozenLast }) => {
  const cls = `ig-th ${align==='right'?'right':''} ${sort?'sorted':''} ${frozen?`ig-frozen ig-frozen-${frozen}`:''} ${frozenLast?'ig-frozen-last':''}`;
  return (
    <th className={cls}>
      <div className="ig-th-inner">
        <span className="ig-th-label">{label}</span>
        {agg && <span className="ig-th-agg" title="Aggregate">{agg}</span>}
        {sort === 'asc' && <span className="ig-th-sort"><IGI.SortAsc/><span className="ig-th-sort-n">1</span></span>}
        {sort === 'desc' && <span className="ig-th-sort"><IGI.SortDesc/><span className="ig-th-sort-n">2</span></span>}
        <button className="ig-th-menu" title="Menu cột"><IGI.ChevD/></button>
      </div>
      {hasMenu && menuOpen && <ColMenu/>}
      <span className="ig-th-resize"></span>
    </th>
  );
};

window.InteractiveGrid = InteractiveGrid;
