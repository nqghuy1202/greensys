/* Chat thread — CENTER pane of Doc Chat Modal */
/* Exposes window.ChatThread */

const { useState, useRef, useEffect } = React;

function fmtTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  } catch (_) { return ''; }
}

function dayLabel(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Hôm nay';
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (_) { return ''; }
}

const AvatarMini = ({ ausId, fullName, size = 32 }) => (
  <div className="msg-avatar" style={{
    width: size, height: size, fontSize: size * 0.36,
    background: window.avatarColor(ausId), flexShrink: 0,
    borderRadius: '50%', display: 'grid', placeItems: 'center', color: 'white', fontWeight: 600
  }}>
    {window.avatarShort(fullName)}
  </div>
);

const MessageRow = ({ m, prev, currentAusId, members, onReply }) => {
  const Icons = window.Icons;
  if (m._divider) return <div className="chat-day-divider">{m._divider}</div>;

  const isMine    = Number(m.from_aus_id) === Number(currentAusId);
  const prevSame  = prev && !prev._divider && prev.from_aus_id === m.from_aus_id;
  const hideAvatar = prevSame;
  const showMeta   = !prevSame;

  const replyFrom = m.reply_from_name || '';
  const replyBody = m.reply_body || '';

  const renderBody = (text) => {
    if (!text) return null;
    const parts = text.split(/(@\S+|\bSO-\S+|\bPXK-\S+|\bHD-\S+|\bBG-\S+)/g);
    return parts.map((p, i) => {
      if (/^@/.test(p)) return <span key={i} className="mention">{p}</span>;
      if (/^(SO|PXK|HD|BG)-/.test(p)) return <span key={i} className="doc-tag"><Icons.Hash size={11} />{p}</span>;
      return <span key={i}>{p}</span>;
    });
  };

  return (
    <div className={`msg-row ${isMine ? 'mine' : ''}`}>
      {!isMine && (
        hideAvatar
          ? <div className="msg-avatar hidden" style={{ width: 32, height: 32 }} />
          : <AvatarMini ausId={m.from_aus_id} fullName={m.from_name} />
      )}
      <div className="msg-col">
        {showMeta && !isMine && (
          <div className="msg-meta">
            <span className="msg-meta-name">{m.from_name}</span>
            <span className="msg-meta-time">{fmtTime(m.create_date)}</span>
          </div>
        )}
        {showMeta && isMine && (
          <div className="msg-meta" style={{ flexDirection: 'row-reverse' }}>
            <span className="msg-meta-time">{fmtTime(m.create_date)}</span>
          </div>
        )}

        {m.reply_to_msg_id && (
          <div className="msg-reply-context">
            <span className="name">{replyFrom.split(' ').slice(-1)[0]}</span>{' · '}
            <span className="body">{replyBody || '...'}</span>
          </div>
        )}

        {m.body && (
          <div className="msg-bubble">
            {renderBody(m.body)}
          </div>
        )}

        <div className="msg-hover-actions">
          <button type="button" className="msg-hover-action" title="Trả lời"
            onClick={() => onReply && onReply(m)}>
            <Icons.Reply size={14} />
          </button>
          <button type="button" className="msg-hover-action" title="Cảm xúc">
            <Icons.Heart size={14} />
          </button>
          <button type="button" className="msg-hover-action" title="Thêm">
            <Icons.More size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

const Composer = ({ onSend, onTyping, replyingTo, onCancelReply, members, currentAusId }) => {
  const Icons = window.Icons;
  const [val, setVal]  = useState('');
  const [mentionQ, setMentionQ] = useState(null);
  const taRef = useRef(null);
  const typingTimer = useRef(null);

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto';
      taRef.current.style.height = Math.min(140, taRef.current.scrollHeight) + 'px';
    }
  }, [val]);

  const handleChange = (e) => {
    const v = e.target.value;
    setVal(v);
    const caret = e.target.selectionStart;
    const match = v.slice(0, caret).match(/@(\w*)$/);
    setMentionQ(match ? match[1].toLowerCase() : null);
    // typing indicator throttled to 1 per 3s
    if (!typingTimer.current) {
      onTyping && onTyping();
      typingTimer.current = setTimeout(() => { typingTimer.current = null; }, 3000);
    }
  };

  const insertMention = (m) => {
    const tag = '@' + m.full_name.split(' ').slice(-1)[0] + ' ';
    setVal(v => v.replace(/@\w*$/, tag));
    setMentionQ(null);
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const mentionList = mentionQ !== null
    ? (members || []).filter(m => Number(m.aus_id) !== Number(currentAusId) &&
        m.full_name.toLowerCase().includes(mentionQ))
    : [];

  const submit = () => {
    if (!val.trim()) return;
    onSend(val.trim(), replyingTo ? replyingTo.msg_id : null);
    setVal('');
    setMentionQ(null);
  };

  return (
    <div className="composer-wrap" style={{ position: 'relative' }}>
      {mentionList.length > 0 && (
        <div className="mention-pop">
          {mentionList.map((m, i) => (
            <div key={m.aus_id} className={`mention-item ${i === 0 ? 'active' : ''}`}
              onClick={() => insertMention(m)}>
              <div className="mention-item-avatar" style={{ background: window.avatarColor(m.aus_id) }}>
                {window.avatarShort(m.full_name)}
              </div>
              <span className="mention-item-name">{m.full_name}</span>
            </div>
          ))}
        </div>
      )}

      {replyingTo && (
        <div className="composer-reply-banner">
          <window.Icons.Reply size={13} />
          <div className="preview">
            <span className="who">Trả lời {replyingTo.from_name}: </span>
            {replyingTo.body || '...'}
          </div>
          <button type="button" className="icon-btn" style={{ width: 24, height: 24 }}
            onClick={onCancelReply}>
            <window.Icons.X size={12} />
          </button>
        </div>
      )}

      <div className={`composer ${replyingTo ? 'with-reply' : ''}`}>
        <textarea
          ref={taRef}
          className="composer-input"
          placeholder="Nhập tin nhắn... Dùng @ để nhắc thành viên"
          value={val}
          onChange={handleChange}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !mentionList.length) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
        />
        <div className="composer-bottom">
          <button type="button" className="icon-btn" title="Đính kèm"><window.Icons.Paperclip size={16} /></button>
          <button type="button" className="icon-btn" title="Ảnh"><window.Icons.Image size={16} /></button>
          <button type="button" className="icon-btn" title="Nhắc người"><window.Icons.At size={16} /></button>
          <button type="button" className="icon-btn" title="Emoji"><window.Icons.Smile size={16} /></button>
          <button type="button" className="composer-send" onClick={submit} disabled={!val.trim()}>
            <window.Icons.Send size={14} /> Gửi
          </button>
        </div>
      </div>
    </div>
  );
};

const ChatThread = ({
  conv, messages, members, typingList, currentAusId, loading,
  onSend, onTyping, onToggleInfo, infoOpen, onClose
}) => {
  const Icons = window.Icons;
  const [replyingTo, setReplyingTo] = useState(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages.length, conv.conv_id]);

  // Inject day-dividers between messages
  const withDividers = [];
  let lastDay = null;
  (messages || []).forEach((m, i) => {
    const day = dayLabel(m.create_date);
    if (day && day !== lastDay) {
      withDividers.push({ _divider: day, _key: 'div_' + i });
      lastDay = day;
    }
    withDividers.push(m);
  });

  const onlineCount = (members || []).filter(m => m.presence === 'online').length;

  return (
    <div className="chat-pane">
      {/* Thread header */}
      <div className="chat-head">
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg,var(--primary),var(--primary-700))',
          color: 'white', display: 'grid', placeItems: 'center', flexShrink: 0
        }}>
          {conv.conv_type === 'CHANNEL' ? <Icons.Users size={18} /> : <Icons.User size={18} />}
        </div>
        <div className="chat-head-info">
          <div className="chat-head-title">
            {conv.display_name}
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>
              · {conv.member_count || (members || []).length} thành viên
            </span>
          </div>
          <div className="chat-head-sub">
            {onlineCount > 0 && (
              <span>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--online)', marginRight: 4, verticalAlign: 'middle' }}></span>
                {onlineCount} online
              </span>
            )}
          </div>
        </div>
        <div className="chat-head-actions">
          <button type="button" className="icon-btn" title="Tìm kiếm"><Icons.Search size={16} /></button>
          <button type="button" className={`icon-btn ${infoOpen ? 'active' : ''}`}
            title="Thông tin chứng từ" onClick={onToggleInfo}>
            <Icons.PanelR size={16} />
          </button>
          <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }}></div>
          <button type="button" className="icon-btn danger" title="Đóng" onClick={onClose}>
            <Icons.X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages" ref={messagesRef}>
        {loading && messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32, fontSize: 13 }}>
            Đang tải tin nhắn...
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 32, fontSize: 13 }}>
            Chưa có tin nhắn nào. Hãy bắt đầu trao đổi!
          </div>
        )}
        {withDividers.map((m, i) => (
          <MessageRow
            key={m._key || m.msg_id}
            m={m}
            prev={withDividers[i - 1]}
            currentAusId={currentAusId}
            members={members}
            onReply={setReplyingTo}
          />
        ))}
      </div>

      {/* Typing indicator */}
      {(typingList || []).length > 0 && (
        <div className="typing-row">
          <AvatarMini ausId={typingList[0].aus_id} fullName={typingList[0].name} size={28} />
          <div className="typing-bubble">
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
            <span className="typing-dot"></span>
          </div>
          <div className="typing-text">
            {typingList[0].name.split(' ').slice(-1)[0]} đang nhập...
          </div>
        </div>
      )}

      <Composer
        onSend={onSend}
        onTyping={onTyping}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        members={members}
        currentAusId={currentAusId}
      />
    </div>
  );
};

window.ChatThread = ChatThread;
