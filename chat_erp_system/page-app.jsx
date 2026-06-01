/* Chat hệ thống - main app v2 (no rail) */

const { useState: useStatePageApp, useMemo: useMemoPageApp } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "cozy",
  "bubbleStyle": "filled",
  "showInfo": true,
  "badgeStyle": "icon",
  "senderFormat": "short",
  "senderEmphasis": "bold"
}/*EDITMODE-END*/;

const PageApp = () => {
  const Icons = window.Icons;
  const { CHATS, USERS } = window.PAGE_DATA;

  const [chats, setChats] = useStatePageApp(CHATS);
  const [activeId, setActiveId] = useStatePageApp('sales-team');
  const [userStatus, setUserStatus] = useStatePageApp('online');
  const [userStatusText, setUserStatusText] = useStatePageApp('Đang làm việc');
  const [composeOpen, setComposeOpen] = useStatePageApp(false);
  const [createGroupOpen, setCreateGroupOpen] = useStatePageApp(false);

  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // Bridge: chat-thread.jsx reads window.CHAT_DATA
  window.CHAT_DATA = window.PAGE_DATA;

  const activeChat = chats.find(c => c.id === activeId);
  const showInfo = t.showInfo && activeChat;

  const handleStartDM = (uid) => {
    const u = USERS[uid];
    // Check if DM already exists
    const existing = chats.find(c => c.type === 'dm' && c.members.includes(uid));
    if (existing) {
      setActiveId(existing.id);
    } else {
      const newDm = {
        id: 'dm-new-' + uid + '-' + Date.now(),
        type: 'dm', name: u.name, userId: uid,
        members: ['me', uid],
        unread: 0, lastTime: 'Vừa xong', lastSender: null,
        lastPreview: 'Bắt đầu trao đổi với ' + u.name + '...',
        readers: [],
        typeMeta: { color: 'dm', icon: 'User', label: 'Cá nhân' },
      };
      setChats(c => [newDm, ...c]);
      setActiveId(newDm.id);
    }
    setComposeOpen(false);
  };

  const handleCreateGroup = ({ name, members }) => {
    const newGroup = {
      id: 'group-new-' + Date.now(),
      type: 'group', name,
      members,
      unread: 0, lastTime: 'Vừa xong', lastSender: 'me',
      lastPreview: 'Nhóm vừa được tạo. Chào mọi người!',
      readers: [],
      typeMeta: { color: 'group', icon: 'Users', label: 'Nhóm' },
    };
    setChats(c => [newGroup, ...c]);
    setActiveId(newGroup.id);
    setCreateGroupOpen(false);
  };

  return (
    <div className={`page-app density-${t.density} bubble-${t.bubbleStyle} badge-${t.badgeStyle} sender-em-${t.senderEmphasis} ${showInfo ? 'with-info' : ''}`}>
      <PageChatList
        activeId={activeId}
        onSelect={setActiveId}
        chats={chats}
        currentUser={USERS.me}
        userStatus={userStatus}
        userStatusText={userStatusText}
        onSetStatus={setUserStatus}
        onSetStatusText={setUserStatusText}
        onOpenCompose={() => setComposeOpen(true)}
        onOpenCreateGroup={() => setCreateGroupOpen(true)}
        senderFormat={t.senderFormat}
      />

      {activeChat ? (
        <PageMain chat={activeChat} onToggleInfo={() => setTweak('showInfo', !t.showInfo)} infoOpen={showInfo} />
      ) : (
        <div className="main-pane">
          <div className="empty" style={{ flex: 1 }}>
            <div className="empty-card">
              <div className="empty-illust"><Icons.Users size={36} /></div>
              <div className="empty-h">Chọn một hội thoại</div>
              <div className="empty-p">Chọn từ danh sách bên trái để bắt đầu trò chuyện hoặc tạo nhóm/soạn tin mới</div>
            </div>
          </div>
        </div>
      )}

      {showInfo && activeChat && <InfoPanelByType chat={activeChat} />}

      {composeOpen && <ComposeModal onCancel={() => setComposeOpen(false)} onSelect={handleStartDM} />}
      {createGroupOpen && <CreateGroupPageModal onCancel={() => setCreateGroupOpen(false)} onCreate={handleCreateGroup} />}

      <window.TweaksPanel>
        <window.TweakSection title="Danh sách chat">
          <window.TweakRadio label="Định dạng tên người gửi" value={t.senderFormat} onChange={v => setTweak('senderFormat', v)}
            options={[{ value: 'short', label: 'Ngắn' }, { value: 'full', label: 'Đầy đủ' }]} />
          <window.TweakRadio label="Nhấn tên người gửi" value={t.senderEmphasis} onChange={v => setTweak('senderEmphasis', v)}
            options={[{ value: 'plain', label: 'Nhạt' }, { value: 'bold', label: 'Đậm' }, { value: 'color', label: 'Màu' }]} />
        </window.TweakSection>

        <window.TweakSection title="Layout">
          <window.TweakRadio label="Mật độ" value={t.density} onChange={v => setTweak('density', v)}
            options={[{ value: 'compact', label: 'Compact' }, { value: 'cozy', label: 'Cozy' }, { value: 'spacious', label: 'Spacious' }]} />
          <window.TweakRadio label="Kiểu bubble" value={t.bubbleStyle} onChange={v => setTweak('bubbleStyle', v)}
            options={[{ value: 'filled', label: 'Filled' }, { value: 'outline', label: 'Outline' }, { value: 'soft', label: 'Soft' }]} />
          <window.TweakToggle label="Hiện info panel" value={t.showInfo} onChange={v => setTweak('showInfo', v)} />
        </window.TweakSection>

        <window.TweakSection title="Chuyển nhanh demo">
          <window.TweakButton label="Mở Soạn tin mới" onClick={() => setComposeOpen(true)} />
          <window.TweakButton label="Mở Tạo nhóm mới" onClick={() => setCreateGroupOpen(true)} />
          <window.TweakButton label="Xem Chat Dự án" onClick={() => setActiveId('p-erp-v2')} />
          <window.TweakButton label="Xem Chat Chứng từ" onClick={() => setActiveId('d-so2601-010')} />
          <window.TweakButton label="Xem Chat Cá nhân" onClick={() => setActiveId('dm-tuan')} />
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<PageApp />);
