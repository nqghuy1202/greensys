/* Chat hệ thống — full-page chat data */
/* Exposes window.PAGE_DATA */

const PAGE_USERS = {
  me:     { id: 'me',     name: 'Bạn (support.gc)', short: 'TG', role: 'Quản trị', dept: 'IT', color: 'user-1', presence: 'online', statusText: 'Đang làm việc' },
  vananh: { id: 'vananh', name: 'Nguyễn Văn Anh',   short: 'VA', role: 'NV Bán hàng', dept: 'Kinh doanh', color: 'user-2', presence: 'online' },
  bich:   { id: 'bich',   name: 'Trần Thị Bích',    short: 'TB', role: 'Kế toán bán hàng', dept: 'Kế toán', color: 'user-3', presence: 'online' },
  nam:    { id: 'nam',    name: 'Lê Hoàng Nam',     short: 'HN', role: 'Trưởng phòng KD', dept: 'Kinh doanh', color: 'user-4', presence: 'meeting', statusText: 'Đang họp' },
  ha:     { id: 'ha',     name: 'Phạm Thu Hà',      short: 'TH', role: 'Thủ kho K01MT', dept: 'Kho vận', color: 'user-1', presence: 'online' },
  long:   { id: 'long',   name: 'Đỗ Quang Long',    short: 'QL', role: 'Giao nhận', dept: 'Kho vận', color: 'user-2', presence: 'offline' },
  thuy:   { id: 'thuy',   name: 'Vũ Thanh Thuý',    short: 'TT', role: 'Kế toán trưởng', dept: 'Kế toán', color: 'user-3', presence: 'busy', statusText: 'Đừng làm phiền' },
  duc:    { id: 'duc',    name: 'Hoàng Anh Đức',    short: 'AD', role: 'Giám đốc', dept: 'BĐH', color: 'user-4', presence: 'away', statusText: 'Đi công tác' },
  linh:   { id: 'linh',   name: 'Nguyễn Mỹ Linh',   short: 'ML', role: 'HR Manager', dept: 'Nhân sự', color: 'user-2', presence: 'online' },
  son:    { id: 'son',    name: 'Trần Thanh Sơn',   short: 'TS', role: 'IT Support', dept: 'IT', color: 'user-1', presence: 'online' },
  mai:    { id: 'mai',    name: 'Phạm Thị Mai',     short: 'PM', role: 'Marketing', dept: 'Marketing', color: 'user-3', presence: 'away' },
  tuan:   { id: 'tuan',   name: 'Vũ Minh Tuấn',     short: 'VT', role: 'Trưởng phòng IT', dept: 'IT', color: 'user-4', presence: 'meeting', statusText: 'Sprint review' },
};

const CHATS = [
  // ========== NHÓM CHUNG ==========
  {
    id: 'all-staff', type: 'group', name: 'Toàn công ty',
    members: ['me','vananh','bich','nam','ha','long','thuy','duc','linh','son','mai','tuan'],
    unread: 0, lastTime: '15:20', lastSender: 'duc',
    lastPreview: 'Mời cả nhà tham gia All-hands meeting thứ 6 tuần này, 9h sáng.',
    readers: ['me','vananh','linh','thuy'],
    pinned: true,
    typeMeta: { color: 'group', icon: 'Users', label: 'Nhóm' },
  },
  {
    id: 'sales-team', type: 'group', name: 'Phòng Kinh doanh',
    members: ['me','vananh','nam','duc','mai'],
    unread: 2, lastTime: '15:45', lastSender: 'mai',
    lastPreview: 'Bên Connell Bros vừa hỏi mình về promo Q2, mình gửi proposal nhé',
    readers: ['nam'],
    typeMeta: { color: 'group', icon: 'Users', label: 'Nhóm' },
  },
  {
    id: 'it-helpdesk', type: 'group', name: 'IT Helpdesk',
    members: ['me','son','tuan','linh'],
    unread: 0, lastTime: '14:02', lastSender: 'son',
    lastPreview: 'Vấn đề đăng nhập SSO đã fix xong. Mọi người thử lại nhé.',
    readers: ['me','linh','tuan'],
    typeMeta: { color: 'group', icon: 'Users', label: 'Nhóm' },
  },

  // ========== DỰ ÁN ==========
  {
    id: 'p-erp-v2', type: 'project', name: 'Triển khai ERP v2',
    projectCode: 'PRJ-2026/001', progress: 64,
    deadline: '30/09/2026', startDate: '01/02/2026',
    members: ['me','tuan','son','duc','nam','linh'],
    unread: 5, lastTime: '16:18', lastSender: 'tuan',
    lastPreview: 'Module Kế toán đã pass UAT round 2. Tuần sau bắt đầu UAT phân hệ Kho.',
    readers: ['son'],
    pinned: true,
    typeMeta: { color: 'project', icon: 'Briefcase', label: 'Dự án' },
    milestones: [
      { name: 'Phân tích yêu cầu', date: '15/03/2026', done: true },
      { name: 'Thiết kế chi tiết', date: '30/04/2026', done: true },
      { name: 'Phát triển module KD/Kế toán', date: '31/07/2026', done: true },
      { name: 'UAT toàn bộ', date: '15/09/2026', done: false, current: true },
      { name: 'Go-live', date: '30/09/2026', done: false },
    ],
    todos: [
      { text: 'Hoàn thiện UAT phân hệ Kho', assignee: 'ha', dueDate: '02/06', priority: 'high', done: false },
      { text: 'Migration data từ hệ thống cũ (round 3)', assignee: 'son', dueDate: '05/06', priority: 'high', done: false },
      { text: 'Training cho team Kế toán', assignee: 'linh', dueDate: '10/06', priority: 'medium', done: false },
      { text: 'Setup môi trường staging', assignee: 'tuan', dueDate: '28/05', priority: 'high', done: true },
    ],
  },
  {
    id: 'p-marketing', type: 'project', name: 'Campaign Q2 2026',
    projectCode: 'PRJ-2026/008', progress: 35,
    deadline: '30/06/2026', startDate: '01/04/2026',
    members: ['me','mai','duc','linh'],
    unread: 0, lastTime: 'Hôm qua', lastSender: 'mai',
    lastPreview: 'Đã lên xong content plan tuần 23-26, gửi mọi người review',
    readers: ['me','duc'],
    typeMeta: { color: 'project', icon: 'Briefcase', label: 'Dự án' },
    milestones: [
      { name: 'Lên concept', date: '15/04/2026', done: true },
      { name: 'Sản xuất content', date: '31/05/2026', done: false, current: true },
      { name: 'Triển khai', date: '15/06/2026', done: false },
      { name: 'Đánh giá kết quả', date: '30/06/2026', done: false },
    ],
    todos: [
      { text: 'Quay video TVC', assignee: 'mai', dueDate: '20/06', priority: 'high', done: false },
      { text: 'Duyệt ngân sách Q2', assignee: 'duc', dueDate: '01/06', priority: 'medium', done: false },
    ],
  },

  // ========== CHỨNG TỪ ==========
  {
    id: 'd-so2601-010', type: 'doc', name: 'Duyệt giá & chiết khấu',
    docNo: 'SO-2601/010', docType: 'Đơn hàng bán', docStatus: 'Đang lập',
    customer: 'Connell Bros. (VN)', docValue: '6,000,000 ₫',
    members: ['me','vananh','nam','thuy'],
    unread: 3, lastTime: '14:42', lastSender: 'nam',
    lastPreview: '@Vân Anh ok mình duyệt giá cho dòng 24 chai/thùng. 2 dòng còn...',
    readers: ['vananh','thuy'],
    typing: ['vananh'],
    typeMeta: { color: 'doc', icon: 'FileText', label: 'Chứng từ' },
  },
  {
    id: 'd-pxk2601-044', type: 'doc', name: 'Phiếu xuất kho K01MT',
    docNo: 'PXK-2601/044', docType: 'Phiếu xuất kho', docStatus: 'Chờ duyệt',
    customer: 'Connell Bros. (VN)', docValue: '6,000,000 ₫',
    members: ['me','ha','long','vananh'],
    unread: 1, lastTime: '13:08', lastSender: 'ha',
    lastPreview: 'Tồn kho TP000017 hiện 1.240 chai. Đủ xuất cho đơn này nhé.',
    readers: ['vananh'],
    typeMeta: { color: 'doc', icon: 'FileText', label: 'Chứng từ' },
  },
  {
    id: 'd-hd2025-119', type: 'doc', name: 'Hợp đồng nguyên tắc',
    docNo: 'HD-2025/119', docType: 'Hợp đồng', docStatus: 'Hoàn thành',
    customer: 'Connell Bros. (VN)', docValue: '—',
    members: ['me','duc','thuy','vananh'],
    unread: 0, lastTime: '22/05', lastSender: 'thuy',
    lastPreview: 'Hợp đồng đã ký, scan upload xong. Hiệu lực 31/12/2026.',
    readers: ['me','duc','vananh'],
    typeMeta: { color: 'doc', icon: 'FileText', label: 'Chứng từ' },
  },
  {
    id: 'd-po2601-005', type: 'doc', name: 'Đơn mua nguyên liệu',
    docNo: 'PO-2601/005', docType: 'Đơn mua hàng', docStatus: 'Đã duyệt',
    customer: 'NCC Bao bì Tân Phú', docValue: '14,500,000 ₫',
    members: ['me','bich','duc'],
    unread: 0, lastTime: '20/05', lastSender: 'duc',
    lastPreview: 'OK duyệt. Gửi cho NCC luôn nhé.',
    readers: ['me','bich'],
    typeMeta: { color: 'doc', icon: 'FileText', label: 'Chứng từ' },
  },

  // ========== CÁ NHÂN (DM) ==========
  {
    id: 'dm-tuan', type: 'dm', name: 'Vũ Minh Tuấn', userId: 'tuan',
    members: ['me','tuan'],
    unread: 1, lastTime: '16:05', lastSender: 'tuan',
    lastPreview: 'Mai 10h họp sprint nhé, mình share màn hình demo module mới.',
    readers: [],
    typeMeta: { color: 'dm', icon: 'User', label: 'Cá nhân' },
  },
  {
    id: 'dm-linh', type: 'dm', name: 'Nguyễn Mỹ Linh', userId: 'linh',
    members: ['me','linh'],
    unread: 0, lastTime: '11:32', lastSender: 'me',
    lastPreview: 'Cảm ơn Linh, mình gửi hồ sơ trong tuần này nhé',
    readers: ['linh'],
    typeMeta: { color: 'dm', icon: 'User', label: 'Cá nhân' },
  },
  {
    id: 'dm-vananh', type: 'dm', name: 'Nguyễn Văn Anh', userId: 'vananh',
    members: ['me','vananh'],
    unread: 0, lastTime: 'Hôm qua', lastSender: 'vananh',
    lastPreview: 'OK mình xem rồi, để mình confirm khách rồi báo lại',
    readers: ['me'],
    typeMeta: { color: 'dm', icon: 'User', label: 'Cá nhân' },
  },
  {
    id: 'dm-duc', type: 'dm', name: 'Hoàng Anh Đức', userId: 'duc',
    members: ['me','duc'],
    unread: 0, lastTime: '23/05', lastSender: 'duc',
    lastPreview: 'Tốt, anh nắm rồi. Triển khai luôn nhé.',
    readers: ['me'],
    typeMeta: { color: 'dm', icon: 'User', label: 'Cá nhân' },
  },
];

// Sample messages for the default-open conversation "sales-team"
const PAGE_MESSAGES = {
  'sales-team': [
    { id: 'd1', day: 'Hôm nay', divider: true },
    { id: 's1', user: 'nam', time: '09:15', text: 'Chào team, hôm nay chúng ta review pipeline Q2. Mình đã update sheet trên drive, mọi người xem trước nhé.' },
    { id: 's2', user: 'nam', time: '09:16', attach: { type: 'xls', name: 'Pipeline_Q2_2026.xlsx', size: '142 KB' } },
    { id: 's3', user: 'vananh', time: '09:32', text: 'Thấy rồi sếp. Mình thấy Connell Bros đang là deal lớn nhất quý này, đã có đơn SO-2601/010 rồi.' },
    { id: 's4', user: 'mai', time: '10:05', text: 'Marketing đang build case study cho Connell, mình cần thêm thông tin về sản phẩm họ mua chính.', reactions: [{ emo: '👍', count: 2, mine: false }] },
    { id: 's5', user: 'me', mine: true, time: '10:12', text: 'Mình gửi anh chị dashboard sales tổng hợp Q2 nhé, có cả breakdown theo khách hàng:', receipts: 'read' },
    { id: 's6', user: 'me', mine: true, time: '10:13', attach: { type: 'img', name: 'sales_dashboard_q2.png', size: '320 KB' }, receipts: 'read' },
    { id: 's7', user: 'duc', time: '14:20', replyTo: { user: 'me', text: 'Mình gửi anh chị dashboard sales tổng hợp Q2 nhé...' }, text: 'Số đẹp đấy. Đặt target tăng 20% so với plan ban đầu được không Nam?', reactions: [{ emo: '🔥', count: 1, mine: true }, { emo: '💪', count: 2, mine: false }] },
    { id: 's8', user: 'nam', time: '14:35', text: 'Được anh, mình sẽ điều chỉnh KPI. Team chuẩn bị thêm nhân sự cho mảng F&B nhé.' },
    { id: 's9', user: 'mai', time: '15:45', text: 'Bên Connell Bros vừa hỏi mình về promo Q2, mình gửi proposal nhé' },
  ],
  'd-so2601-010': [
    { id: 'd1', day: 'Hôm nay', divider: true },
    { id: 'm1', user: 'vananh', time: '09:12', text: 'Chào cả nhà, mình mới tạo đơn SO-2601/010 cho Connell Bros. Khách yêu cầu xuất 3 mức quy cách.' },
    { id: 'm2', user: 'thuy', time: '09:45', text: 'Đơn giá 2 dòng cuối thấp hơn bảng giá chuẩn BG-2026/03.' },
    { id: 'm3', user: 'nam', time: '10:02', replyTo: { user: 'thuy', text: 'Đơn giá 2 dòng cuối thấp hơn bảng giá chuẩn...' }, text: 'Khách đã ký phụ lục giảm 8% cho quy cách 6 chai.' },
    { id: 'm4', user: 'nam', time: '14:42', richText: [{ mention: 'vananh' }, { text: ' ok mình duyệt giá cho dòng 24 chai/thùng.' }] },
  ],
  'p-erp-v2': [
    { id: 'd1', day: 'Hôm nay', divider: true },
    { id: 'p1', user: 'tuan', time: '09:00', text: 'Good morning team! Hôm nay là day 1 của UAT round 3.' },
    { id: 'p2', user: 'son', time: '09:30', text: 'Mình đã setup xong môi trường staging, mọi người có thể bắt đầu test từ giờ.' },
    { id: 'p3', user: 'me', mine: true, time: '10:00', text: 'OK, mình sẽ test luồng tạo đơn hàng bán trước. Báo bug qua kênh này luôn nhé?', receipts: 'read' },
    { id: 'p4', user: 'tuan', time: '16:18', text: 'Module Kế toán đã pass UAT round 2. Tuần sau bắt đầu UAT phân hệ Kho.' },
  ],
};

// Contacts grouped by department
const CONTACTS = [
  { dept: 'Ban Điều hành', users: ['duc'] },
  { dept: 'Kinh doanh', users: ['nam', 'vananh', 'mai'] },
  { dept: 'Kế toán', users: ['thuy', 'bich'] },
  { dept: 'Kho vận', users: ['ha', 'long'] },
  { dept: 'IT', users: ['tuan', 'son', 'me'] },
  { dept: 'Nhân sự', users: ['linh'] },
];

const SAVED_MESSAGES = [
  { id: 'sv1', from: 'Vũ Thanh Thuý', context: 'Kế toán - Công nợ Connell', time: 'Hôm qua', text: 'Công nợ Connell Bros: dư nợ hiện 287tr, hạn mức còn 213tr — vẫn ok cho đơn này.' },
  { id: 'sv2', from: 'Đỗ Quang Long', context: 'Duyệt giá & chiết khấu', time: '25/05', text: '', attach: { type: 'pdf', name: 'Phu_luc_HD_Connell_2026Q1.pdf', size: '2.4 MB' } },
  { id: 'sv3', from: 'Lê Hoàng Nam', context: 'Phòng Kinh doanh', time: '20/05', text: 'Target Q2: tăng 20% so với plan. Team chuẩn bị thêm nhân sự cho mảng F&B.' },
  { id: 'sv4', from: 'Vũ Minh Tuấn', context: 'Triển khai ERP v2', time: '15/05', text: 'Roadmap go-live: 30/09/2026. Cutoff data migration cuối tháng 8.' },
];

window.PAGE_DATA = { USERS: PAGE_USERS, CHATS, MESSAGES: PAGE_MESSAGES, CONTACTS, SAVED_MESSAGES };
