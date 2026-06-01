/* Lập đơn hàng bán — sample data */
window.ORDER_DATA = {
  meta: {
    docNo: 'SO-2601/010',
    type: 'Đơn hàng bán',
    orderDate: '13/01/2026',
    deliveryDate: '02/10/2025',
    contract: '—',
    priceList: 'Bảng giá NPP miền Nam Q1/2026',
    status: 'Đang lập',
    salesRep: { name: 'Nguyễn Thị Mai Anh', code: 'NV0241', dept: 'Kinh doanh KV.HCM' },
    payment: '04 - Thanh toán 3 lần',
    warehouse: 'K01MT - Kho Trung chuyển',
    deliveryAddr: '481A Nguyễn Thị Thập, Phường Tân Phong, Quận 7, TP.HCM',
    notes: 'Giao hàng trong giờ hành chính. Liên hệ A. Tuấn (kho NPP) trước khi tới.',
    content: 'Đơn đặt hàng tháng 01/2026 — kênh phân phối truyền thống',
    documentCount: 461,
    fileCount: 0,
    checkList: { done: 0, total: 6 },
  },
  customer: {
    code: 'KH00184',
    name: 'Công ty TNHH CONNELL BROS. (Việt Nam)',
    short: 'CONNELL BROS.',
    taxCode: '0301234567',
    phone: '+84 28 3848 1717',
    addr: '481A Nguyễn Thị Thập, Q.7, TP.HCM',
    credit: { used: 184_500_000, limit: 500_000_000 },
    overdue: 0,
  },
  lines: [
    { stt: 1, code: 'TP000017', family: 'Nước Mắm Ngọc Huy', name: 'Nước Mắm Ngọc Huy | 80 độ đạm | 500 mL', unit: '24 chai/thùng', qty: 3, available: 248, priceBefore: 850_000, taxPct: 10, discount: 0, hasError: false, editing: false },
    { stt: 2, code: 'TP000018', family: 'Nước Mắm Ngọc Huy', name: 'Nước Mắm Ngọc Huy | 60 độ đạm | 500 mL', unit: '6 chai/thùng',  qty: 5, available: 96,  priceBefore: 420_000, taxPct: 10, discount: 2, hasError: true,  editing: true,  errorMsg: 'Vượt số lượng khả dụng (96 thùng) — kiểm tra tồn kho K01MT.' },
    { stt: 3, code: 'TP000019', family: 'Nước Mắm Ngọc Huy', name: 'Nước Mắm Ngọc Huy | 40 độ đạm | 750 mL', unit: '6 chai/thùng',  qty: 2, available: 132, priceBefore: 318_000, taxPct: 10, discount: 0, hasError: false, editing: false },
    { stt: 4, code: 'TP000034', family: 'Tương Ớt Ngọc Huy', name: 'Tương Ớt Ngọc Huy | Cay nồng | 270 g',   unit: '24 chai/thùng', qty: 4, available: 540, priceBefore: 264_000, taxPct: 10, discount: 5, hasError: false, editing: false },
    { stt: 5, code: 'TP000041', family: 'Bột Nêm Ngọc Huy',  name: 'Bột Nêm Ngọc Huy | Heo & Rau củ | 900 g', unit: '12 gói/thùng', qty: 6, available: 88,  priceBefore: 396_000, taxPct: 10, discount: 0, hasError: false, editing: false },
  ],
  activity: [
    { who: 'Mai Anh', what: 'tạo đơn hàng', when: '08:42 sáng nay' },
    { who: 'Quốc Tuấn', what: 'duyệt giá theo bảng giá Q1/2026', when: '09:15 sáng nay' },
    { who: 'Mai Anh', what: 'cập nhật điều khoản thanh toán', when: '09:22 sáng nay' },
  ],
};

// Compute totals for a line
window.lineTotals = (l) => {
  const subtotal = l.qty * l.priceBefore;
  const afterDiscount = subtotal * (1 - l.discount / 100);
  const tax = afterDiscount * (l.taxPct / 100);
  const total = afterDiscount + tax;
  return { subtotal, afterDiscount, tax, total };
};

window.orderTotals = () => {
  let sub = 0, tax = 0, disc = 0;
  window.ORDER_DATA.lines.forEach(l => {
    const t = window.lineTotals(l);
    sub += l.qty * l.priceBefore;
    disc += l.qty * l.priceBefore * (l.discount / 100);
    tax += t.tax;
  });
  return { sub, disc, tax, total: sub - disc + tax };
};

window.fmtVND = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n));
window.fmtVNDshort = (n) => {
  if (n >= 1_000_000_000) return (n/1_000_000_000).toFixed(2) + ' tỷ';
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1) + ' tr';
  if (n >= 1_000) return (n/1_000).toFixed(0) + 'K';
  return String(n);
};
