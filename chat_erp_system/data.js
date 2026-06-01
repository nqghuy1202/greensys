/* Mock data for chat modal — Vietnamese ERP context */
/* Exposes window.CHAT_DATA */

const USERS = {
  me:    { id: 'me', name: 'Tôi (support.gc)', short: 'TG', role: 'Quản trị', color: 'user-1', presence: 'online' },
  vananh:{ id: 'vananh', name: 'Nguyễn Văn Anh', short: 'VA', role: 'NV Bán hàng', color: 'user-2', presence: 'online' },
  bich:  { id: 'bich', name: 'Trần Thị Bích', short: 'TB', role: 'Kế toán bán hàng', color: 'user-3', presence: 'online' },
  nam:   { id: 'nam', name: 'Lê Hoàng Nam', short: 'HN', role: 'Trưởng phòng KD', color: 'user-4', presence: 'away' },
  ha:    { id: 'ha', name: 'Phạm Thu Hà', short: 'TH', role: 'Thủ kho K01MT', color: 'user-1', presence: 'online' },
  long:  { id: 'long', name: 'Đỗ Quang Long', short: 'QL', role: 'Giao nhận', color: 'user-2', presence: 'offline' },
  thuy:  { id: 'thuy', name: 'Vũ Thanh Thuý', short: 'TT', role: 'Kế toán trưởng', color: 'user-3', presence: 'online' },
};

const CONVERSATIONS = [
  {
    id: 'duyetgia',
    type: 'group',
    name: 'Duyệt giá & chiết khấu',
    avatarColor: 'group',
    members: ['me', 'vananh', 'nam', 'thuy'],
    pinned: true,
    unread: 3,
    lastTime: '14:42',
    lastSender: 'nam',
    lastPreview: '@Vân Anh ok mình duyệt giá cho dòng 24 chai/thùng. 2 dòng còn...',
    readers: ['vananh','thuy'],
    typing: ['vananh'],
  },
  {
    id: 'kho',
    type: 'group',
    name: 'Kho K01MT - Xuất hàng',
    avatarColor: 'group',
    members: ['me', 'ha', 'long', 'vananh'],
    unread: 1,
    lastTime: '13:08',
    lastSender: 'ha',
    lastPreview: 'Tồn kho TP000017 hiện 1.240 chai. Đủ xuất cho đơn này nhé.',
    readers: ['vananh'],
  },
  {
    id: 'vananh-dm',
    type: 'dm',
    name: 'Nguyễn Văn Anh',
    avatarColor: 'user-2',
    members: ['me', 'vananh'],
    unread: 0,
    lastTime: '11:15',
    lastSender: 'me',
    lastPreview: 'Mình check giúp điều khoản TT 3 lần với khách Connell nhé',
    readers: ['vananh'],
  },
  {
    id: 'ketoan',
    type: 'group',
    name: 'Kế toán - Công nợ Connell Bros',
    avatarColor: 'group',
    members: ['me', 'bich', 'thuy', 'vananh'],
    unread: 0,
    lastTime: 'Hôm qua',
    lastSender: 'bich',
    lastPreview: 'Công nợ hiện tại 287tr, hạn mức còn 213tr — vẫn ok',
    readers: ['me','vananh','thuy'],
  },
  {
    id: 'thuy-dm',
    type: 'dm',
    name: 'Vũ Thanh Thuý',
    avatarColor: 'user-3',
    members: ['me', 'thuy'],
    unread: 0,
    lastTime: '24/05',
    lastSender: 'thuy',
    lastPreview: 'Đơn này cần xem lại bảng giá K2 trước khi chốt',
    readers: ['me'],
  },
];

// Messages for the active conversation 'duyetgia'
const MESSAGES = {
  duyetgia: [
    { id: 'd1', day: 'Hôm nay', divider: true },
    {
      id: 'm1', user: 'vananh', time: '09:12',
      text: 'Chào cả nhà, mình mới tạo đơn SO-2601/010 cho Connell Bros. Khách yêu cầu xuất 3 mức quy cách khác nhau của TP000017 — Nước Mắm Ngọc Huy 80 độ đạm 500mL.',
    },
    {
      id: 'm2', user: 'vananh', time: '09:13',
      docQuote: { title: 'SO-2601/010 · Chi tiết đơn hàng', rows: [
        { k: '24 chai/thùng', v: 'SL 3 · ĐG 2.00' },
        { k: '6 ch/thùng', v: 'SL 1 · ĐG 1.00' },
        { k: '6 chai/thùng', v: 'SL 2 · ĐG 1.00' },
      ]},
    },
    {
      id: 'm3', user: 'thuy', time: '09:45', text: 'Đơn giá 2 dòng cuối thấp hơn bảng giá chuẩn. ',
      mention: { docNo: 'BG-2026/03' }, reactions: [{ emo: '👀', count: 2, mine: false }],
    },
    {
      id: 'm4', user: 'nam', time: '10:02',
      replyTo: { user: 'thuy', text: 'Đơn giá 2 dòng cuối thấp hơn bảng giá chuẩn...' },
      text: 'Mình check thì khách đã ký phụ lục giảm 8% cho quy cách 6 chai. Long gửi lại scan phụ lục lên đây giúp.',
    },
    {
      id: 'm5', user: 'long', time: '10:18',
      attach: { type: 'pdf', name: 'Phu_luc_HD_Connell_2026Q1.pdf', size: '2.4 MB' },
      pinned: true,
    },
    {
      id: 'm6', user: 'me', time: '10:25', mine: true,
      text: 'Cảm ơn cả nhà. Phụ lục ok rồi. Vậy 2 dòng giá 1.00 mình giữ nguyên, chỉ cần Nam duyệt.',
      reactions: [{ emo: '👍', count: 3, mine: false }, { emo: '🙏', count: 1, mine: true }],
      receipts: 'read',
    },
    {
      id: 'm7', user: 'vananh', time: '10:31',
      text: 'Mình thấy SL khả dụng đang 0.00 cho cả 3 dòng. Kho ơi tồn thực tế bao nhiêu? Sợ hết hàng trước ngày 02/10.',
      attach: { type: 'img', name: 'screen_chi_tiet_don.png', size: '184 KB' },
    },
    {
      id: 'm8', user: 'ha', time: '13:08',
      text: 'Tồn TP000017 hôm nay 1.240 chai = 51,6 thùng 24c hoặc 206 thùng 6c. Đủ xuất cho đơn này nhé.',
    },
    {
      id: 'm9', user: 'ha', time: '13:09',
      text: 'Mình block sẵn 200 chai cho đơn này, tag chứng từ kho luôn:',
      docMention: { no: 'PXK-2601/044', label: 'Phiếu xuất kho dự kiến' },
    },
    {
      id: 'm10', user: 'nam', time: '14:42', text: '',
      richText: [
        { mention: 'vananh' }, { text: ' ok mình duyệt giá cho dòng 24 chai/thùng. 2 dòng còn lại đợi mình ký phụ lục xong gửi lại bạn nhé. Trước 15h hôm nay.' },
      ],
      reactions: [{ emo: '👍', count: 1, mine: true }],
    },
  ],
};

const FILES = [
  { type: 'pdf', name: 'Phu_luc_HD_Connell_2026Q1.pdf', size: '2.4 MB', from: 'Long', when: '10:18' },
  { type: 'img', name: 'screen_chi_tiet_don.png', size: '184 KB', from: 'Vân Anh', when: '10:31' },
  { type: 'xls', name: 'BangGia_2026_K2_Connell.xlsx', size: '88 KB', from: 'Thuý', when: 'Hôm qua' },
  { type: 'pdf', name: 'Hop_dong_NT_NM_Ngoc_Huy.pdf', size: '1.1 MB', from: 'Bích', when: '22/05' },
];

const RELATED_DOCS = [
  { no: 'BG-2026/03', label: 'Bảng giá Q2/2026 — Connell Bros', meta: 'Áp dụng từ 01/04/2026' },
  { no: 'PXK-2601/044', label: 'Phiếu xuất kho dự kiến', meta: 'Kho K01MT · Đang lập' },
  { no: 'HD-2025/119', label: 'Hợp đồng nguyên tắc', meta: 'Hiệu lực đến 31/12/2026' },
];

const DOC_SUMMARY = {
  no: 'SO-2601/010',
  type: 'Đơn hàng bán',
  customer: 'Cty TNHH Connell Bros. (VN)',
  dateOrder: '13/01/2026',
  dateExport: '02/10/2025',
  warehouse: 'K01MT - Kho Trung chuyển',
  payment: '04 - Thanh toán 3 lần',
  salesperson: 'Chưa gán',
  total: '6,000,000 ₫',
  status: 'Đang lập',
  itemsCount: 3,
};

window.CHAT_DATA = { USERS, CONVERSATIONS, MESSAGES, FILES, RELATED_DOCS, DOC_SUMMARY };
