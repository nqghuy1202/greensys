// Apex Oracle 24.2 — Chat sample data
// Bối cảnh: trao đổi quanh Phiếu xuất bán 17399 (Cty TNHH Thiết bị điện Quý Dần)
// Mixed: Kho · Sale · Kế toán · IT

const SAMPLE_USERS = {
  me:        { id: 'me',  name: 'Bạn (Trần Đức Anh)',     short: 'TĐ', role: 'Sale',     color: 4, status: 'online' },
  u_khoa:    { id: 'u1',  name: 'Lê Văn Khoa',             short: 'LK', role: 'Thủ kho',  color: 3, status: 'online' },
  u_mai:     { id: 'u2',  name: 'Nguyễn Thị Mai',          short: 'NM', role: 'Kế toán',  color: 5, status: 'online' },
  u_hung:    { id: 'u3',  name: 'Phạm Quốc Hùng',          short: 'PH', role: 'Quản lý kho', color: 1, status: 'away' },
  u_linh:    { id: 'u4',  name: 'Đỗ Mỹ Linh',              short: 'ĐL', role: 'Sale Lead', color: 6, status: 'online' },
  u_son:     { id: 'u5',  name: 'Vũ Hoàng Sơn',            short: 'VS', role: 'IT',       color: 7, status: 'offline' },
  u_tu:      { id: 'u6',  name: 'Bùi Anh Tú',              short: 'BT', role: 'Sale',     color: 2, status: 'away' },
  u_thao:    { id: 'u7',  name: 'Trịnh Phương Thảo',       short: 'TT', role: 'Kế toán trưởng', color: 4, status: 'online' },
  u_quan:    { id: 'u8',  name: 'Hoàng Minh Quân',         short: 'HQ', role: 'Giao nhận',color: 3, status: 'offline' },
  u_bot:     { id: 'bot', name: 'Apex Bot',                short: 'AX', role: 'System',   color: 1, status: 'online' },
};

const SAMPLE_CONVERSATIONS = [
  // Pinned channel — gắn với phiếu xuất 17399
  {
    id: 'ch_pxb_17399',
    type: 'channel',
    name: 'Phiếu xuất #17399',
    icon: 'document',
    pinned: true,
    members: ['me','u_khoa','u_mai','u_hung','u_linh','u_quan'],
    linkedDoc: { type: 'Phiếu xuất bán', no: '17399', date: '13-05-2026', customer: 'Cty TNHH Thiết bị điện Quý Dần', kho: 'K01MT' },
    unread: 3,
    lastTime: '14:32',
    lastPreview: 'Khoa: Đã xác nhận xuất 10 đôi, lệch 5 do thiếu lô...',
    active: true,
  },
  {
    id: 'ch_kho_k01',
    type: 'channel',
    name: 'Kho K01MT - Trung chuyển',
    icon: 'warehouse',
    pinned: true,
    members: ['u_khoa','u_hung','u_quan','me','u_linh','u_tu','u_thao','u_son','u_mai','u_bot'],
    unread: 0,
    lastTime: '13:58',
    lastPreview: 'Hùng: Tồn thực tế cuối ngày đã khớp với hệ thống ✓',
  },
  {
    id: 'ch_sale_north',
    type: 'channel',
    name: 'Sale Khu vực Bắc',
    icon: 'sales',
    members: ['u_linh','me','u_tu','u_thao','u_mai'],
    unread: 7,
    lastTime: '13:42',
    lastPreview: 'Linh: @Tú nhớ check công nợ KH 503760 trước khi xuất',
  },
  {
    id: 'ch_ketoan',
    type: 'channel',
    name: 'Kế toán Tổng hợp',
    icon: 'accounting',
    members: ['u_thao','u_mai','me','u_linh'],
    unread: 0,
    lastTime: 'Hôm qua',
    lastPreview: 'Mai: Đã hạch toán bút toán xuất kho lô tháng 5',
  },
  {
    id: 'ch_announce',
    type: 'channel',
    name: 'Thông báo công ty',
    icon: 'megaphone',
    members: ['u_bot','me','u_khoa','u_mai','u_hung','u_linh','u_son','u_tu','u_thao','u_quan'],
    unread: 1,
    lastTime: '08:00',
    lastPreview: 'Apex Bot: Hệ thống sẽ bảo trì 22:00 - 23:00 ngày 15/05',
  },
  // DMs
  {
    id: 'dm_khoa',
    type: 'dm',
    user: 'u_khoa',
    unread: 0,
    lastTime: '14:35',
    lastPreview: 'Bạn: Ok cảm ơn anh nhé',
  },
  {
    id: 'dm_mai',
    type: 'dm',
    user: 'u_mai',
    unread: 2,
    lastTime: '12:18',
    lastPreview: 'Mai: Chứng từ này thiếu chữ ký GD chưa em ơi?',
  },
  {
    id: 'dm_linh',
    type: 'dm',
    user: 'u_linh',
    unread: 0,
    lastTime: 'Hôm qua',
    lastPreview: 'Linh: Tốt lắm em, gửi báo cáo trước 17h nhé',
  },
  {
    id: 'dm_son',
    type: 'dm',
    user: 'u_son',
    unread: 0,
    lastTime: '10/05',
    lastPreview: 'Sơn: Đã fix lỗi không gen được mã phiếu xuất',
  },
  {
    id: 'dm_tu',
    type: 'dm',
    user: 'u_tu',
    unread: 0,
    lastTime: '08/05',
    lastPreview: 'Tú: Ok đi cà phê chiều nay nhé 😄',
  },
];

// Messages cho phòng "Phiếu xuất #17399"
const SAMPLE_MESSAGES_PXB17399 = [
  { kind: 'date', label: 'Hôm qua, Thứ Ba 12/05/2026' },
  {
    id: 'm1', author: 'u_linh', time: '16:42',
    text: 'Mọi người ơi, KH <span class="mention">@Cty Quý Dần</span> vừa chốt đơn đợt 1. Mình đã lập phiếu xuất, mọi người chuẩn bị giúp nhé.',
  },
  {
    id: 'm2', author: 'u_linh', time: '16:43', continuation: true,
    linkedDoc: { kind: 'pxb', no: '17399', customer: '503760 - Cty TNHH Thiết bị điện Quý Dần', kho: 'K01MT - Kho Trung chuyển', date: '13-05-2026', lines: 2, status: 'Chờ xác nhận' },
  },
  {
    id: 'm3', author: 'u_khoa', time: '16:55',
    text: 'Đã nhận. Mình check tồn lô LHH rồi sẽ phản hồi sớm nhất ạ.',
    reactions: [{ emoji: '👍', count: 2, mine: true, users: ['me','u_linh'] }],
  },
  {
    id: 'm4', author: 'u_hung', time: '17:10',
    text: 'Lô LHH chỉ còn 20 đôi <b>Dây giày nylon</b> và 18 cái <b>Adidas UltraBoost 27</b>. Có đủ cho phiếu này.',
  },

  { kind: 'date', label: 'Hôm nay, Thứ Tư 13/05/2026' },
  {
    id: 'sys1', kind: 'system',
    text: 'Apex Bot đã gắn phiếu xuất này vào cuộc trò chuyện', ic: 'link',
  },
  {
    id: 'm5', author: 'me', time: '08:15', mine: true,
    text: 'Sáng nay em sẽ qua kho lúc 9h để hỗ trợ kiểm hàng, mọi người nhé.',
  },
  {
    id: 'm6', author: 'u_khoa', time: '09:02',
    replyTo: { author: 'me', body: 'Sáng nay em sẽ qua kho lúc 9h để hỗ trợ kiểm hàng, mọi người nhé.' },
    text: 'Ok em. Anh ra cổng kho đợi rồi.',
  },
  {
    id: 'm7', author: 'u_khoa', time: '11:24',
    text: 'Đang kiểm thực tế:\n• Dây giày nylon: kiểm được <b>10 đôi</b> (chứng từ 15) — thiếu 5\n• Adidas UltraBoost 27: kiểm được <b>10 cái</b> (chứng từ 12) — thiếu 2\nLý do: lô LHH có hàng lỗi chưa loại trừ.',
  },
  {
    id: 'm8', author: 'u_khoa', time: '11:25', continuation: true,
    attachments: [
      { type: 'img', name: 'kiem-hang-LHH-130526.jpg', size: '2.4 MB', label: 'Ảnh kiểm hàng' },
    ],
  },
  {
    id: 'm9', author: 'u_mai', time: '11:38',
    text: 'Vậy phiếu này mình xuất theo SL Thực Xuất nhé. Em ghi rõ <span class="mention">@Tất cả</span> lý do "Lô lỗi chưa loại" vào cột Lý Do Xuất Thiếu trên phiếu.',
    reactions: [{ emoji: '✅', count: 3, users: ['me','u_linh','u_khoa'] }],
  },
  {
    id: 'm10', author: 'u_linh', time: '13:05',
    text: 'Ok mọi người. Em đã liên hệ KH Quý Dần thông báo đợt 1 giao 10/15 + 10/12, phần thiếu sẽ giao đợt 2 cuối tuần. KH đồng ý.',
  },
  {
    id: 'm11', author: 'me', time: '13:42', mine: true,
    text: 'Em cập nhật phiếu xong rồi. Anh <span class="mention">@Khoa</span> kiểm tra giúp em với ạ.',
    reactions: [{ emoji: '👀', count: 1, users: ['u_khoa'] }],
  },
  {
    id: 'sys2', kind: 'system',
    text: 'Trần Đức Anh đã cập nhật phiếu xuất #17399 — SL Thực Xuất: 10, 10', ic: 'edit',
  },
  {
    id: 'm12', author: 'u_khoa', time: '14:30',
    text: 'Anh kiểm rồi, các con số đã khớp với biên bản kiểm tay. Anh xác nhận xuất nhé.',
  },
  {
    id: 'sys3', kind: 'system',
    text: 'Lê Văn Khoa đã xác nhận xuất phiếu #17399', ic: 'check', status: 'success',
  },
  {
    id: 'm13', author: 'u_khoa', time: '14:32', isPinned: true,
    text: 'Đã xác nhận xuất 10 đôi + 10 cái, lệch 5/2 do thiếu lô. KH đã nhận thông báo đợt 2.',
    reactions: [
      { emoji: '🎉', count: 4, users: ['me','u_linh','u_mai','u_hung'] },
      { emoji: '❤️', count: 2, users: ['u_linh','u_mai'] },
    ],
  },
];

const SAMPLE_FILES = [
  { type: 'pdf',  name: 'Phieu-xuat-17399-signed.pdf', size: '184 KB', by: 'u_khoa', when: '14:35' },
  { type: 'img',  name: 'kiem-hang-LHH-130526.jpg',    size: '2.4 MB', by: 'u_khoa', when: '11:25' },
  { type: 'xlsx', name: 'Ton-kho-LHH-T05.xlsx',        size: '42 KB',  by: 'u_hung', when: 'Hôm qua' },
  { type: 'docx', name: 'Hop-dong-503760-Quy-Dan.docx',size: '96 KB',  by: 'u_linh', when: '11/05' },
  { type: 'pdf',  name: 'Bien-ban-kiem-hang-130526.pdf', size: '210 KB', by: 'u_khoa', when: '11:30' },
  { type: 'img',  name: 'mau-san-pham-UB27.png',       size: '1.1 MB', by: 'u_linh', when: '11/05' },
];

const SAMPLE_LINKED_DOCS = [
  { kind: 'pxb', no: '17399', label: 'Phiếu xuất bán', customer: 'Cty Quý Dần', when: '13/05', status: 'Đã xuất', statusColor: 'success' },
  { kind: 'don', no: 'DH-2026-0892', label: 'Đơn hàng', customer: 'Cty Quý Dần', when: '12/05', status: 'Đang giao', statusColor: 'warn' },
  { kind: 'hd',  no: 'HD-Q1-2026/05', label: 'Hợp đồng', customer: 'Cty Quý Dần', when: '01/05', status: 'Còn hạn',  statusColor: 'success' },
];

const SAMPLE_AUDIT = [
  { time: '14:35:21', tag: 'EXPORT', tagType: 'success', text: 'Phiếu xuất #17399 đã được xác nhận bởi LK' },
  { time: '14:32:04', tag: 'UPDATE', tagType: '', text: 'Trường "SL Thực Xuất" thay đổi 0 → 10 (dòng 1)' },
  { time: '13:42:18', tag: 'UPDATE', tagType: '', text: 'Trường "SL Thực Xuất" thay đổi 0 → 10 (dòng 2)' },
  { time: '11:25:33', tag: 'ATTACH', tagType: '', text: 'File kiem-hang-LHH-130526.jpg đính kèm' },
  { time: '08:14:02', tag: 'OPEN',   tagType: '', text: 'Phiếu xuất #17399 được mở bởi TĐ' },
];

window.SAMPLE_USERS = SAMPLE_USERS;
window.SAMPLE_CONVERSATIONS = SAMPLE_CONVERSATIONS;
window.SAMPLE_MESSAGES_PXB17399 = SAMPLE_MESSAGES_PXB17399;
window.SAMPLE_FILES = SAMPLE_FILES;
window.SAMPLE_LINKED_DOCS = SAMPLE_LINKED_DOCS;
window.SAMPLE_AUDIT = SAMPLE_AUDIT;
