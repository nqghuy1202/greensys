/* ============================================================
   notif-panel.jsx — Notification Drawer Panel
   Static Application File → load qua fetch() + Babel.transform()
   Page 0, scope: window.notifRender / window.notifRefresh
   ============================================================ */

/* ── Status config (mapping từ globalHighLightFunction) ─────── */
const NS_CONFIG = {
  W: { label: 'Chờ duyệt',   css: 'ns-W', dot: 'nd-W', bar: 'nb-W' },
  N: { label: 'Đã duyệt',    css: 'ns-N', dot: 'nd-N', bar: 'nb-N' },
  Y: { label: 'Phê duyệt',   css: 'ns-Y', dot: 'nd-Y', bar: 'nb-Y' },
  R: { label: 'Từ chối',     css: 'ns-R', dot: 'nd-R', bar: 'nb-R' },
  A: { label: 'Bổ sung',     css: 'ns-A', dot: 'nd-A', bar: 'nb-A' },
  C: { label: 'Hết hạn',     css: 'ns-C', dot: 'nd-C', bar: 'nb-C' },
  L: { label: 'Bổ sung',     css: 'ns-L', dot: 'nd-L', bar: 'nb-L' },
  F: { label: 'Bổ sung',     css: 'ns-F', dot: 'nd-F', bar: 'nb-F' },
  I: { label: 'Xử lý',       css: 'ns-I', dot: 'nd-I', bar: 'nb-I' },
  O: { label: 'Đang xử lý',  css: 'ns-O', dot: 'nd-O', bar: 'nb-O' },
};

function getNS(status) {
  return NS_CONFIG[status] || NS_CONFIG['W'];
}

const TABS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'W',   label: 'Chờ duyệt' },
  { id: 'N',   label: 'Đã duyệt' },
  { id: 'O',   label: 'Đang xử lý' },
  { id: 'R',   label: 'Từ chối' },
];

const GROUP_ORDER = ['HÔM NAY', 'HÔM QUA', 'TUẦN TRƯỚC', 'THÁNG TRƯỚC', 'CŨ HƠN'];

/* ── Icons ───────────────────────────────────────────────────── */
const ISearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
  </svg>
);
const IBell = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
  </svg>
);
const ICheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
  </svg>
);
const IDblChk = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/>
  </svg>
);
const ITrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
  </svg>
);
const IClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
  </svg>
);
const ILink = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
  </svg>
);
const IDoc = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
  </svg>
);
const IUser = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
  </svg>
);
const IEllipsis = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
  </svg>
);
const ISpinner = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
       style={{animation: 'notif-spin 0.8s linear infinite'}}>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
  </svg>
);

/* ── APEX Ajax helper ─────────────────────────────────────────── */
function apexProcess(name, data) {
  return new Promise((resolve, reject) => {
    apex.server.process(name, data, {
      pageId: 0,
      dataType: 'json',
      success: resolve,
      error: (xhr) => reject(new Error(xhr.responseText || 'Ajax error')),
    });
  });
}

/* ── NotifItem ────────────────────────────────────────────────── */
function NotifItem({ n, onMarkRead, onRemove, onView }) {
  const [hov, setHov] = React.useState(false);
  const ns = getNS(n.status);
  const isUnread = n.is_read !== 'Y';

  return (
    <div
      className="notif-item"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        borderBottom: '1px solid #F3F4F6',
        borderLeft: `3px solid ${isUnread ? 'var(--bar-color, #ccc)' : '#EBEBEB'}`,
        background: hov ? '#F6FBF8' : (isUnread ? '#FAFDF9' : '#fff'),
        transition: 'background .15s',
      }}
      className={`notif-item ${isUnread ? ns.bar : ''}`}
    >
      <div style={{ padding: '11px 14px 10px 13px' }}>

        {/* Row 1: badge + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          {isUnread && (
            <div className={`${ns.dot}`} style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            }}/>
          )}
          <span className={ns.css} style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '.02em',
            border: '1px solid', padding: '2px 9px', borderRadius: 99, flexShrink: 0,
          }}>
            {ns.label}
          </span>
          {n.status_label && n.status_label !== ns.label && (
            <span style={{
              fontSize: 10, color: '#9CA3AF', fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {n.status_label}
            </span>
          )}
          <span
            className="item-time"
            style={{
              marginLeft: 'auto', fontSize: 11, color: '#9CA3AF',
              fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
              opacity: hov ? 0 : 1,
            }}
          >
            {n.rel_time}
          </span>
        </div>

        {/* Row 2: title */}
        <div style={{
          fontSize: 13,
          fontWeight: isUnread ? 700 : 500,
          color: isUnread ? '#111827' : '#4B5563',
          lineHeight: 1.4, marginBottom: 5,
          paddingLeft: isUnread ? 12 : 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {n.ano_name}
        </div>

        {/* Row 3: doc_number + sender */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          paddingLeft: isUnread ? 12 : 0,
        }}>
          <a
            href="#"
            onClick={e => { e.preventDefault(); onView(n); }}
            style={{
              fontSize: 11, fontWeight: 700, color: '#15674C', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%',
            }}
          >
            <IDoc/>{n.doc_number}
          </a>
          {n.jes_name && (
            <span style={{
              fontSize: 11, color: '#9CA3AF',
              display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
            }}>
              <IUser/>{n.jes_name}
            </span>
          )}
        </div>
      </div>

      {/* Floating actions on hover */}
      <div
        className="item-actions"
        style={{
          position: 'absolute', top: 9, right: 12,
          display: 'flex', alignItems: 'center', gap: 4,
          opacity: hov ? 1 : 0,
          transform: hov ? 'translateX(0)' : 'translateX(8px)',
          pointerEvents: hov ? 'auto' : 'none',
        }}
      >
        <button
          type="button"
          onClick={() => onView(n)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, fontWeight: 700, color: '#fff',
            background: '#15674C', border: 'none',
            borderRadius: 6, padding: '5px 11px', cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#0D4A36'}
          onMouseLeave={e => e.currentTarget.style.background = '#15674C'}
        >
          <ILink/>Xem
        </button>
        {isUnread && (
          <button
            type="button"
            onClick={() => onMarkRead(n.ano_id)}
            title="Đánh dấu đã đọc"
            style={{
              width: 28, height: 28, borderRadius: 6,
              border: '1px solid #A8D5C2', background: '#E1F0EB',
              color: '#15674C', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#C5E8D8'}
            onMouseLeave={e => e.currentTarget.style.background = '#E1F0EB'}
          >
            <ICheck/>
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(n.ano_id)}
          title="Xóa thông báo"
          style={{
            width: 28, height: 28, borderRadius: 6,
            border: '1px solid #FECACA', background: '#FEF2F2',
            color: '#DC2626', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#FEE2E2'}
          onMouseLeave={e => e.currentTarget.style.background = '#FEF2F2'}
        >
          <ITrash/>
        </button>
      </div>
    </div>
  );
}

/* ── SectionLabel ─────────────────────────────────────────────── */
function SectionLabel({ label }) {
  return (
    <div style={{
      padding: '10px 16px 7px',
      fontSize: 10, fontWeight: 800, color: '#9CA3AF',
      letterSpacing: '.1em', textTransform: 'uppercase',
      background: '#F9FAFB', borderBottom: '1px solid #EFEFEF',
      display: 'flex', alignItems: 'center', gap: 10,
      position: 'sticky', top: 0, zIndex: 2,
    }}>
      <span style={{ flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: '#EBEBEB' }}/>
    </div>
  );
}

/* ── EmptyState ───────────────────────────────────────────────── */
function EmptyState({ isFiltered, onClear, loading }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', padding: '48px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: '#F3F4F6',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 14,
        color: loading ? '#9CA3AF' : undefined,
        fontSize: loading ? undefined : 24,
      }}>
        {loading ? <ISpinner/> : '🔔'}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
        {loading ? 'Đang tải...' : isFiltered ? 'Không tìm thấy kết quả' : 'Không có thông báo mới'}
      </div>
      {!loading && (
        <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.7, maxWidth: 220 }}>
          {isFiltered
            ? 'Thử từ khóa khác hoặc đổi bộ lọc'
            : 'Bạn đã xem tất cả thông báo rồi 🎉'}
        </div>
      )}
      {isFiltered && !loading && (
        <button
          type="button"
          onClick={onClear}
          style={{
            marginTop: 14, fontSize: 12, fontWeight: 700, color: '#15674C',
            background: '#E1F0EB', border: 'none', borderRadius: 7,
            padding: '7px 18px', cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#C5E8D8'}
          onMouseLeave={e => e.currentTarget.style.background = '#E1F0EB'}
        >
          Xóa bộ lọc
        </button>
      )}
    </div>
  );
}

/* ── ActionDropdown (Portal — thoát overflow:hidden của drawer) ── */
function ActionDropdown({ onMarkAll, onDeleteAll }) {
  const [open, setOpen]   = React.useState(false);
  const [pos,  setPos]    = React.useState({ top: 0, right: 0 });
  const btnRef            = React.useRef(null);
  const timerRef          = React.useRef(null);

  function openMenu() {
    clearTimeout(timerRef.current);
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    setOpen(true);
  }

  function scheduleClose() {
    timerRef.current = setTimeout(() => setOpen(false), 300);
  }

  function cancelClose() {
    clearTimeout(timerRef.current);
  }

  const menuStyle = {
    position:     'fixed',
    top:          pos.top,
    right:        pos.right,
    zIndex:       99999,
    background:   '#fff',
    border:       '1px solid #E5E7EB',
    borderRadius: 10,
    boxShadow:    '0 6px 20px rgba(0,0,0,.13)',
    padding:      '4px 0',
    minWidth:     230,
  };

  const itemStyle = {
    display:     'flex',
    alignItems:  'center',
    gap:         9,
    padding:     '9px 15px',
    fontSize:    13,
    cursor:      'pointer',
    whiteSpace:  'nowrap',
    color:       '#374151',
    transition:  'background .12s',
    userSelect:  'none',
  };

  const menu = open && ReactDOM.createPortal(
    <div
      style={menuStyle}
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <div
        style={itemStyle}
        onMouseEnter={e => e.currentTarget.style.background = '#F0FBF6'}
        onMouseLeave={e => e.currentTarget.style.background = ''}
        onClick={() => { setOpen(false); onMarkAll(); }}
      >
        <IDblChk/><span>Đánh dấu tất cả đã đọc</span>
      </div>
      <div style={{ height: 1, background: '#F3F4F6', margin: '3px 0' }}/>
      <div
        style={{ ...itemStyle, color: '#DC2626' }}
        onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
        onMouseLeave={e => e.currentTarget.style.background = ''}
        onClick={() => { setOpen(false); onDeleteAll(); }}
      >
        <ITrash/><span>Xóa tất cả thông báo</span>
      </div>
    </div>,
    document.body
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        id="Btn_Action"
        title="Tùy chọn"
        aria-label="Tùy chọn"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        style={{
          width: 30, height: 30, borderRadius: 7,
          border: '1.5px solid #E5E7EB', background: open ? '#F3F4F6' : '#fff',
          color: '#6B7280', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        onMouseDown={e => e.currentTarget.style.background = '#E9EDF2'}
        onMouseUp={e => e.currentTarget.style.background = open ? '#F3F4F6' : '#fff'}
      >
        <IEllipsis/>
      </button>
      {menu}
    </>
  );
}

/* ── NotifPanel (main) ────────────────────────────────────────── */
function NotifPanel() {
  const [data,       setData]       = React.useState([]);
  const [search,     setSearch]     = React.useState('');
  const [tab,        setTab]        = React.useState('all');
  const [readFilter, setReadFilter] = React.useState('N');
  const [loading,    setLoading]    = React.useState(true);
  const [error,      setError]      = React.useState(null);

  const scrollRef  = React.useRef(null);
  const hasDataRef = React.useRef(false);
  React.useEffect(() => { hasDataRef.current = data.length > 0; }, [data]);

  /* ── Load data ──
     Lần đầu (chưa có data): show spinner như cũ.
     Refresh sau đó (SSE trigger, đã có data): KHÔNG bật spinner — tránh
     swap toàn bộ list sang EmptyState rồi render lại làm scroll nhảy về đầu.
     Đồng thời lưu/khôi phục scrollTop quanh lần setData để giữ vị trí cuộn. */
  const loadData = React.useCallback(async () => {
    const isRefresh = hasDataRef.current;
    if (!isRefresh) setLoading(true);
    setError(null);
    const el = scrollRef.current;
    const prevScrollTop = el ? el.scrollTop : 0;
    try {
      const result = await apexProcess('notifLoad', {});
      if (result && result.items) setData(result.items);
    } catch (e) {
      setError('Không thể tải thông báo');
    } finally {
      if (!isRefresh) setLoading(false);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = prevScrollTop;
      });
    }
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  /* Expose globals cho SSE handler và static HTML region */
  React.useEffect(() => {
    window.notifRefresh = loadData;
    return () => { delete window.notifRefresh; };
  }, [loadData]);

  React.useEffect(() => {
    window.notifSetReadFilter = (input) => setReadFilter(input.value);
    return () => { delete window.notifSetReadFilter; };
  }, []);

  React.useEffect(() => {
    window.notifMarkAll    = handleMarkAll;
    window.notifDeleteAll  = handleDeleteAll;
    return () => { delete window.notifMarkAll; delete window.notifDeleteAll; };
  }, [handleMarkAll, handleDeleteAll]);

  /* ── Computed ── */
  const unread = data.filter(n => n.is_read !== 'Y').length;

  const counts = React.useMemo(() => {
    const c = { all: data.length };
    TABS.slice(1).forEach(t => { c[t.id] = data.filter(n => n.status === t.id).length; });
    return c;
  }, [data]);

  const filtered = React.useMemo(() => {
    let d = data;
    if (tab !== 'all') d = d.filter(n => n.status === tab);
    d = d.filter(n => readFilter === 'Y' ? n.is_read === 'Y' : n.is_read !== 'Y');
    if (search) {
      const q = search.toLowerCase();
      d = d.filter(n =>
        (n.ano_name   || '').toLowerCase().includes(q) ||
        (n.doc_number || '').toLowerCase().includes(q) ||
        (n.jes_name   || '').toLowerCase().includes(q)
      );
    }
    return d;
  }, [data, tab, readFilter, search]);

  const grouped = React.useMemo(() => {
    const map = {};
    filtered.forEach(n => {
      const k = n.date_group_label || 'CŨ HƠN';
      if (!map[k]) map[k] = [];
      map[k].push(n);
    });
    return GROUP_ORDER.filter(k => map[k]).map(k => ({ label: k, items: map[k] }));
  }, [filtered]);

  /* ── Actions ── */
  const handleMarkRead = async (ano_id) => {
    setData(d => d.map(n => n.ano_id === ano_id ? { ...n, is_read: 'Y' } : n));
    try {
      await apexProcess('notifMarkRead', { x01: ano_id });
    } catch (_) { /* optimistic — silently ignore */ }
  };

  const handleMarkAll = React.useCallback(async () => {
    setData(d => d.map(n => ({ ...n, is_read: 'Y' })));
    try { await apexProcess('notifMarkAll', {}); } catch (_) {}
  }, []);

  const handleDeleteAll = React.useCallback(async () => {
    setData([]);
    try { await apexProcess('notifDeleteAll', {}); } catch (_) {}
  }, []);

  const handleRemove = async (ano_id) => {
    setData(d => d.filter(n => n.ano_id !== ano_id));
    try {
      await apexProcess('notifDelete', { x01: ano_id });
    } catch (_) {}
  };

  const handleView = async (n) => {
    /* Navigate to document page via redirect_page AP */
    /* owner_table_name xác định page ID — cần map trong AP hoặc trả về page_id từ notifLoad */
    if (n.target_url) {
      apex.navigation.redirect(n.target_url);
    } else {
      /* Fallback: dùng redirect_page AP, x01=page_id, x02=item:value, x03=app_item */
      /* Cần bổ sung page_id vào query notifLoad khi biết mapping */
      apex.message.alert('Chức năng xem chứng từ sẽ được cấu hình theo owner_table_name: ' + n.owner_table_name);
    }
    /* Đánh dấu đã đọc khi xem */
    if (n.is_read !== 'Y') handleMarkRead(n.ano_id);
  };

  const isFiltered = !!(search || tab !== 'all' || readFilter !== 'N');

  return (
    <>
      {/* ═══ HEADER ═══ */}
      <div style={{ padding: '14px 16px 0', flexShrink: 0, borderBottom: '1px solid #F0F0F0' }}>

        {/* Top row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: '#E1F0EB', color: '#15674C',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <IBell/>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#111827', letterSpacing: '-0.3px' }}>
                THÔNG BÁO
              </span>
              {unread > 0 && (
                <span style={{
                  background: '#15674C', color: '#fff',
                  fontSize: 10, fontWeight: 800, letterSpacing: '.03em',
                  padding: '2px 8px', borderRadius: 99, lineHeight: 1.6,
                }}>
                  {unread} mới
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1, fontWeight: 500 }}>
              {unread > 0
                ? <span>{unread} chưa đọc · {data.length} tổng</span>
                : <span style={{ color: '#15674C', fontWeight: 600 }}>✓ Tất cả đã đọc</span>}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center' }}>
            <ActionDropdown onMarkAll={handleMarkAll} onDeleteAll={handleDeleteAll}/>
            <button
              type="button"
              onClick={() => window.notifClose && window.notifClose()}
              style={{
                width: 30, height: 30, borderRadius: 7,
                border: '1.5px solid #E5E7EB', background: '#fff',
                color: '#6B7280', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <IClose/>
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: '#9CA3AF', display: 'flex', pointerEvents: 'none',
          }}>
            <ISearch/>
          </span>
          <input
            id="notif-search"
            type="text"
            placeholder="Tìm kiếm thông báo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 32px 8px 32px',
              border: '1.5px solid #E5E7EB', borderRadius: 8,
              fontSize: 12, color: '#374151', background: '#F9FAFB',
              outline: 'none', transition: 'border-color .15s, background .15s',
              fontFamily: 'inherit',
            }}
            onFocus={e => { e.target.style.borderColor = '#15674C'; e.target.style.background = '#fff'; }}
            onBlur={e => { e.target.style.borderColor = '#E5E7EB'; e.target.style.background = '#F9FAFB'; }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#9CA3AF', display: 'flex', padding: 2,
              }}
            >
              <IClose/>
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', marginTop: 8,
          marginLeft: -16, marginRight: -16, paddingLeft: 4,
          borderTop: '1px solid #F3F4F6',
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              className={`notif-tab-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              <span style={{
                display: 'inline-block', marginLeft: 5,
                fontSize: 10, fontWeight: 700, lineHeight: 1.5,
                background: tab === t.id ? '#15674C' : '#F3F4F6',
                color:      tab === t.id ? '#fff'    : '#9CA3AF',
                padding: '0 5px', borderRadius: 99,
                transition: 'background .15s, color .15s',
              }}>
                {counts[t.id] ?? 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ═══ LIST ═══ */}
      <div className="notif-scroll" ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
        {(loading || grouped.length === 0) ? (
          <EmptyState
            isFiltered={isFiltered}
            loading={loading}
            onClear={() => { setSearch(''); setTab('all'); }}
          />
        ) : grouped.map(({ label, items }) => (
          <React.Fragment key={label}>
            <SectionLabel label={label}/>
            {items.map(n => (
              <NotifItem
                key={n.ano_id}
                n={n}
                onMarkRead={handleMarkRead}
                onRemove={handleRemove}
                onView={handleView}
              />
            ))}
          </React.Fragment>
        ))}
      </div>

      {/* ═══ FOOTER ═══ */}
      <div style={{
        padding: '9px 16px', borderTop: '1px solid #F0F0F0',
        background: '#FAFAFA', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500 }}>
          {error
            ? <span style={{ color: '#DC2626' }}>{error}</span>
            : `${filtered.length} thông báo${isFiltered ? ' · đã lọc' : ''}`}
        </span>
        <button
          type="button"
          style={{
            fontSize: 11, fontWeight: 700, color: '#15674C',
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '.7'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          Xem tất cả <ILink/>
        </button>
      </div>

      {/* Keyframe cho spinner */}
      <style>{`@keyframes notif-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </>
  );
}

/* ── Mount ────────────────────────────────────────────────────── */
(function () {
  const container = document.getElementById('notif-root');
  if (!container) return;
  if (container._notifRoot) return; // idempotent
  const root = ReactDOM.createRoot(container);
  root.render(<NotifPanel/>);
  container._notifRoot = root;
})();
