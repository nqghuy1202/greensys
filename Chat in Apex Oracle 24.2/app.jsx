// MAIN APP

function App() {
  const [t, setTweak] = useTweaks(/*EDITMODE-BEGIN*/{
    "density": "default",
    "bubble": "default",
    "theme": "light",
    "accent": "#2B7DE9",
    "panelOpen": true,
    "demoState": "normal"
  }/*EDITMODE-END*/);

  // Apply tweaks via data attributes
  React.useEffect(() => {
    document.documentElement.dataset.density = t.density;
    document.documentElement.dataset.bubble = t.bubble;
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.style.setProperty('--primary', t.accent);
    // recompute hover/soft from accent
    const lighten = (hex, amt) => {
      // simple mix toward white
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      const mix = (c) => Math.round(c + (255 - c) * amt);
      return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
    };
    const darken = (hex, amt) => {
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      const m = (c) => Math.round(c * (1 - amt));
      return `rgb(${m(r)},${m(g)},${m(b)})`;
    };
    document.documentElement.style.setProperty('--primary-hover', darken(t.accent, 0.12));
    document.documentElement.style.setProperty('--primary-soft', lighten(t.accent, 0.85));
    document.documentElement.style.setProperty('--primary-softer', lighten(t.accent, 0.94));
    document.documentElement.style.setProperty('--primary-deep', darken(t.accent, 0.45));
  }, [t.density, t.bubble, t.theme, t.accent]);

  // STATE
  const [conversations, setConversations] = React.useState(SAMPLE_CONVERSATIONS);
  const [activeId, setActiveId] = React.useState('ch_pxb_17399');
  const [messages, setMessages] = React.useState(SAMPLE_MESSAGES_PXB17399);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('all');
  const [isLoading, setIsLoading] = React.useState(false);
  const [pinnedId, setPinnedId] = React.useState('m13');

  const activeConv = conversations.find(c => c.id === activeId);
  const totalUnread = conversations.reduce((s, c) => s + (c.unread || 0), 0);

  // Compute pinned message
  const pinnedMessage = React.useMemo(() => {
    if (!pinnedId) return null;
    return messages.find(m => m.id === pinnedId);
  }, [pinnedId, messages]);

  // Sample messages for non-default convs
  const dummyMessagesByConv = React.useMemo(() => ({
    'ch_kho_k01': [
      { kind: 'date', label: 'Hôm nay, Thứ Tư 13/05/2026' },
      { id: 'k1', author: 'u_hung', time: '08:15', text: 'Chào buổi sáng cả nhóm. Hôm nay có 3 phiếu xuất ưu tiên: <b>#17399, #17401, #17402</b>. Mọi người chia ca nhé.' },
      { id: 'k2', author: 'u_khoa', time: '08:18', text: 'Em nhận phiếu #17399. Đang ở khu vực LHH.' },
      { id: 'k3', author: 'u_quan', time: '08:22', text: 'Em nhận #17401. Đã ra xe.' },
      { id: 'k4', author: 'u_hung', time: '13:58', isPinned: false, text: 'Tồn thực tế cuối ngày đã khớp với hệ thống ✓ Cảm ơn cả team!',
        reactions: [{ emoji: '🎉', count: 3, users:['u_khoa','u_quan','me'] }, { emoji: '💪', count: 2, users:['u_khoa','me'] }] },
    ],
    'ch_sale_north': [
      { kind: 'date', label: 'Hôm nay, Thứ Tư 13/05/2026' },
      { id: 's1', author: 'u_linh', time: '13:20', text: 'Team Bắc ơi, target tháng 5 còn thiếu <b>240M</b> nhé. Mình kiểm với các bạn vào chiều mai.' },
      { id: 's2', author: 'u_tu', time: '13:35', text: 'Em đang push 2 deal lớn, dự kiến chốt được ~150M trong tuần này chị.' },
      { id: 's3', author: 'u_linh', time: '13:42', text: '<span class="mention">@Tú</span> nhớ check công nợ KH <b>503760</b> trước khi xuất nhé, lần trước bị treo do quên.' },
    ],
    'ch_ketoan': [
      { kind: 'date', label: 'Hôm qua, Thứ Ba 12/05/2026' },
      { id: 'a1', author: 'u_thao', time: '15:00', text: 'Các em hoàn thiện báo cáo công nợ tuần trước 17h thứ Sáu nhé.' },
      { id: 'a2', author: 'u_mai', time: '16:42', text: 'Đã hạch toán bút toán xuất kho lô tháng 5. Tổng cộng <b>47 phiếu</b> đã hoàn tất.' },
    ],
    'ch_announce': [
      { kind: 'date', label: 'Hôm nay, Thứ Tư 13/05/2026' },
      { kind: 'system', text: 'Tin nhắn ở đây chỉ Quản trị viên đăng được', ic: 'info' },
      { id: 'an1', author: 'u_bot', time: '08:00', text: '🔔 <b>Lịch bảo trì hệ thống</b>\nApex Oracle sẽ tạm ngưng phục vụ từ <b>22:00 - 23:00 ngày 15/05/2026</b> để cập nhật phiên bản 24.2.1.\n\nMọi phiếu cần xác nhận vui lòng hoàn tất trước 21:30.' },
    ],
    'dm_khoa': [
      { kind: 'date', label: 'Hôm nay, Thứ Tư 13/05/2026' },
      { id: 'd1', author: 'u_khoa', time: '14:33', text: 'Em ơi, biên bản kiểm hàng anh để trên bàn em rồi nhé. Ký xong em scan gửi anh.' },
      { id: 'd2', author: 'me', time: '14:34', mine: true, text: 'Vâng anh, em làm luôn.' },
      { id: 'd3', author: 'me', time: '14:35', mine: true, text: 'Ok cảm ơn anh nhé.' },
    ],
    'dm_mai': [
      { kind: 'date', label: 'Hôm nay, Thứ Tư 13/05/2026' },
      { id: 'd1', author: 'u_mai', time: '12:15', text: 'Em xem giúp chị phiếu xuất #17399 nha.' },
      { id: 'd2', author: 'u_mai', time: '12:18', text: 'Chứng từ này thiếu chữ ký GD chưa em ơi?' },
    ],
    'dm_linh': [
      { kind: 'date', label: 'Hôm qua' },
      { id: 'd1', author: 'u_linh', time: '17:20', text: 'Tốt lắm em, gửi báo cáo trước 17h nhé.' },
    ],
    'dm_son': [
      { kind: 'date', label: '10/05/2026' },
      { id: 'd1', author: 'u_son', time: '10:32', text: 'Đã fix lỗi không gen được mã phiếu xuất. Em test lại giùm anh.' },
    ],
    'dm_tu': [
      { kind: 'date', label: '08/05/2026' },
      { id: 'd1', author: 'u_tu', time: '16:42', text: 'Ok đi cà phê chiều nay nhé 😄' },
    ],
  }), []);

  // Switch conv
  const selectConv = (id) => {
    if (id === activeId) return;
    setActiveId(id);
    setIsLoading(true);
    setPinnedId(null);
    setTimeout(() => {
      const msgs = id === 'ch_pxb_17399' ? SAMPLE_MESSAGES_PXB17399 : (dummyMessagesByConv[id] || []);
      setMessages(msgs);
      if (id === 'ch_pxb_17399') setPinnedId('m13');
      // mark read
      setConversations(prev => prev.map(c => c.id === id ? {...c, unread: 0} : c));
      setIsLoading(false);
    }, 380);
  };

  // Send message
  const sendMessage = (text, replyTo) => {
    const newMsg = {
      id: 'new_' + Date.now(),
      author: 'me',
      mine: true,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      text: text.replace(/@(\w+)/g, '<span class="mention">@$1</span>')
                .replace(/#(\d+)/g, '<a href="#" class="doc-ref" onclick="event.preventDefault()"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>#$1</a>'),
      replyTo: replyTo ? { author: replyTo.author, body: (replyTo.text || '').replace(/<[^>]+>/g, '').slice(0, 80) } : undefined,
    };
    setMessages(prev => [...prev, newMsg]);
  };

  const handleTogglePanel = () => setTweak('panelOpen', !t.panelOpen);
  const handlePin = (msgId) => setPinnedId(p => p === msgId ? null : msgId);

  // ERROR / EMPTY states via tweaks
  const renderCenter = () => {
    if (t.demoState === 'empty') {
      return (
        <section className="chat">
          <ChatHeader conv={activeConv} users={SAMPLE_USERS} onTogglePanel={handleTogglePanel} onToggleSearch={() => {}}/>
          <div className="state-block">
            <div className="ic"><Icons.inbox size={28}/></div>
            <h4>Chưa có tin nhắn nào</h4>
            <p>Hãy là người đầu tiên gửi tin nhắn trong nhóm <b>{activeConv?.name}</b>.</p>
            <div className="actions">
              <button className="btn primary"><Icons.zap size={13}/> Gửi lời chào</button>
              <button className="btn"><Icons.doc size={13}/> Đính kèm phiếu</button>
            </div>
          </div>
          <Composer onSend={sendMessage} replyTo={null} onCancelReply={() => {}} users={SAMPLE_USERS} mentionList={Object.values(SAMPLE_USERS).filter(u => u.id !== 'me')}/>
        </section>
      );
    }
    if (t.demoState === 'error') {
      return (
        <section className="chat">
          <ChatHeader conv={activeConv} users={SAMPLE_USERS} onTogglePanel={handleTogglePanel} onToggleSearch={() => {}}/>
          <div className="state-block">
            <div className="ic" style={{background:'var(--red-soft)', color:'var(--red)'}}><Icons.alert size={28}/></div>
            <h4>Không tải được tin nhắn</h4>
            <p>Mất kết nối tới máy chủ Apex Oracle. Mã lỗi: <b>NET_TIMEOUT_504</b>. Vui lòng thử lại.</p>
            <div className="actions">
              <button className="btn primary" onClick={() => setTweak('demoState', 'normal')}>
                <Icons.refresh size={13}/> Thử lại
              </button>
              <button className="btn"><Icons.info size={13}/> Báo IT</button>
            </div>
          </div>
        </section>
      );
    }
    if (t.demoState === 'loading') {
      return <ChatCenter conv={activeConv} messages={[]} users={SAMPLE_USERS} onSend={sendMessage} onTogglePanel={handleTogglePanel} isLoading={true} pinnedMessage={null} onPin={handlePin}/>;
    }
    return (
      <ChatCenter
        conv={activeConv}
        messages={messages}
        users={SAMPLE_USERS}
        onSend={sendMessage}
        onTogglePanel={handleTogglePanel}
        isLoading={isLoading}
        pinnedMessage={pinnedMessage}
        onPin={handlePin}
      />
    );
  };

  return (
    <div className="app">
      {/* TOP APP BAR — kế thừa style Lập Phiếu Xuất Bán */}
      <div className="appbar">
        <button className="back" data-tip="Quay lại"><Icons.back size={16}/></button>
        <div className="title">
          <Icons.zap size={14}/>
          Chat
          <span className="badge">Apex Oracle 24.2</span>
        </div>
        <span className="breadcrumb">/ <b>{activeConv?.name || 'Hội thoại'}</b></span>
        <div className="spacer"/>
        <div className="actions">
          <button className="btn ghost icon" data-tip="Lọc"><Icons.filter size={14}/></button>
          <button className="btn ghost icon" data-tip="Lưu trữ"><Icons.archive size={14}/></button>
          <button className="btn"><Icons.users size={13}/><span className="label">Tạo nhóm</span></button>
          <button className="btn primary"><Icons.edit size={13}/><span className="label">Soạn tin</span></button>
        </div>
      </div>

      <div className="main" data-panel={t.panelOpen ? 'shown' : 'hidden'}>
        <Sidebar
          conversations={conversations}
          users={SAMPLE_USERS}
          activeId={activeId}
          onSelectConv={selectConv}
          searchQuery={searchQuery}
          onSearch={setSearchQuery}
          activeTab={activeTab}
          onTab={setActiveTab}
          totalUnread={totalUnread}
        />

        {renderCenter()}

        {t.panelOpen && (
          <RightPanel
            conv={activeConv}
            users={SAMPLE_USERS}
            files={SAMPLE_FILES}
            linkedDocs={SAMPLE_LINKED_DOCS}
            audit={SAMPLE_AUDIT}
          />
        )}
      </div>

      {/* TWEAKS PANEL */}
      <TweaksPanel>
        <TweakSection label="Trạng thái demo">
          <TweakSelect label="State" value={t.demoState} onChange={(v) => setTweak('demoState', v)}
            options={[
              {value:'normal', label:'Bình thường'},
              {value:'loading', label:'Đang tải'},
              {value:'empty', label:'Trống'},
              {value:'error', label:'Lỗi kết nối'},
            ]}/>
        </TweakSection>

        <TweakSection label="Bố cục">
          <TweakToggle label="Panel chi tiết bên phải" value={t.panelOpen} onChange={(v) => setTweak('panelOpen', v)}/>
        </TweakSection>

        <TweakSection label="Mật độ tin nhắn">
          <TweakRadio label="Spacing" value={t.density} onChange={(v) => setTweak('density', v)}
            options={[
              {value:'compact', label:'Gọn'},
              {value:'default', label:'Vừa'},
              {value:'comfortable', label:'Thoáng'},
            ]}/>
        </TweakSection>

        <TweakSection label="Kiểu bubble">
          <TweakSelect label="Bo góc" value={t.bubble} onChange={(v) => setTweak('bubble', v)}
            options={[
              {value:'square', label:'Vuông góc'},
              {value:'default', label:'Mặc định'},
              {value:'round', label:'Bo tròn nhiều'},
              {value:'none', label:'Không bubble'},
            ]}/>
        </TweakSection>

        <TweakSection label="Màu accent">
          <TweakColor label="Màu chính" value={t.accent} onChange={(v) => setTweak('accent', v)}
            options={['#2B7DE9', '#1E40AF', '#0891B2', '#7C3AED', '#16A34A', '#DC2626']}/>
        </TweakSection>

        <TweakSection label="Theme">
          <TweakRadio label="Chế độ" value={t.theme} onChange={(v) => setTweak('theme', v)}
            options={[
              {value:'light', label:'Sáng'},
              {value:'dark', label:'Tối'},
            ]}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
