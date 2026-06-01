/* Main app - root component */

const { useState } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "cozy",
  "bubbleStyle": "filled",
  "showInfo": true,
  "showTyping": true,
  "showEmpty": false,
  "listWidth": 320
}/*EDITMODE-END*/;

const App = () => {
  const Icons = window.Icons;
  const { CONVERSATIONS } = window.CHAT_DATA;
  const [modalOpen, setModalOpen] = useState(true);
  const [convos, setConvos] = useState(CONVERSATIONS);
  const [activeId, setActiveId] = useState('duyetgia');
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // Listen for typing dot demo cycling
  const activeConvo = convos.find(c => c.id === activeId);

  const onCreate = ({ name, members }) => {
    const newConvo = {
      id: 'new-' + Date.now(), type: members.length > 2 ? 'group' : 'dm',
      name, avatarColor: 'group', members, unread: 0,
      lastTime: 'Vừa xong', lastPreview: 'Nhóm vừa được tạo. Chào mọi người!',
      readers: [],
    };
    setConvos(c => [newConvo, ...c]);
    setActiveId(newConvo.id);
    setCreateOpen(false);
  };

  const showEmpty = t.showEmpty || convos.length === 0;

  // Hide active convo + simulate "empty" state if toggled
  const displayConvos = t.showEmpty ? [] : convos;
  const displayActive = t.showEmpty ? null : (activeConvo || convos[0]);

  return (
    <div className={`app density-${t.density} bubble-${t.bubbleStyle}`}>
      <ErpBackground onOpenChat={() => setModalOpen(true)} />

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className={`modal`} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="modal-header">
              <div className="modal-title">
                <div className="modal-title-icon"><Icons.Users size={16} /></div>
                <span>Trao đổi chứng từ</span>
              </div>
              <span className="modal-doc-pill">
                <Icons.Hash size={11} /> SO-2601/010 · Đơn hàng bán
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Connell Bros. (VN)</span>

              <div className="modal-header-actions">
                <button className="icon-btn" title="Lọc"><Icons.Filter size={16} /></button>
                <button className="icon-btn" title="Cài đặt"><Icons.Cog size={16} /></button>
                <button className="icon-btn danger" title="Đóng" onClick={() => setModalOpen(false)}><Icons.Close size={18} /></button>
              </div>
            </div>

            {/* Body */}
            <div className={`modal-body ${t.showInfo && displayActive ? 'with-info' : ''}`} style={{ '--list-w': t.listWidth + 'px' }}>
              <ConversationList
                activeId={displayActive?.id}
                onSelect={setActiveId}
                onCreateNew={() => setCreateOpen(true)}
                query={query}
                setQuery={setQuery}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                conversations={displayConvos}
              />

              {displayActive ? (
                <ChatThread
                  key={displayActive.id}
                  convo={displayActive}
                  onToggleInfo={() => setTweak('showInfo', !t.showInfo)}
                  infoOpen={t.showInfo}
                  onClose={() => setModalOpen(false)}
                  showTypingDemo={t.showTyping}
                />
              ) : (
                <EmptyState onCreate={() => setCreateOpen(true)} />
              )}

              {t.showInfo && displayActive && <InfoPanel convo={displayActive} />}
            </div>

            {createOpen && <CreateGroupModal onCancel={() => setCreateOpen(false)} onCreate={onCreate} />}
          </div>
        </div>
      )}

      {/* Tweaks panel */}
      <window.TweaksPanel>
        <window.TweakSection title="Layout">
          <window.TweakRadio label="Mật độ" value={t.density} onChange={v => setTweak('density', v)}
            options={[{ value: 'compact', label: 'Compact' }, { value: 'cozy', label: 'Cozy' }, { value: 'spacious', label: 'Spacious' }]} />
          <window.TweakRadio label="Kiểu bubble" value={t.bubbleStyle} onChange={v => setTweak('bubbleStyle', v)}
            options={[{ value: 'filled', label: 'Filled' }, { value: 'outline', label: 'Outline' }, { value: 'soft', label: 'Soft' }]} />
          <window.TweakSlider label="Rộng cột danh sách" value={t.listWidth} onChange={v => setTweak('listWidth', v)} min={260} max={400} step={10} unit="px" />
          <window.TweakToggle label="Hiện panel thông tin chứng từ" value={t.showInfo} onChange={v => setTweak('showInfo', v)} />
        </window.TweakSection>
        <window.TweakSection title="Demo">
          <window.TweakToggle label="Hiện typing indicator" value={t.showTyping} onChange={v => setTweak('showTyping', v)} />
          <window.TweakToggle label="Xem trạng thái rỗng (chưa có nhóm)" value={t.showEmpty} onChange={v => setTweak('showEmpty', v)} />
        </window.TweakSection>
        <window.TweakSection title="Thao tác nhanh">
          <window.TweakButton label="Mở Tạo nhóm trao đổi mới" onClick={() => { setModalOpen(true); setCreateOpen(true); }} />
          <window.TweakButton label="Mở/đóng modal" onClick={() => setModalOpen(o => !o)} />
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
