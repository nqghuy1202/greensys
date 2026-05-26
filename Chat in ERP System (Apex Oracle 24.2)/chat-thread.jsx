/* Chat thread (CENTER pane) */
/* Exposes window.ChatThread */

const { useState, useRef, useEffect, useMemo } = React;

const AvatarMini = ({ user, size = 32 }) => {
  const u = window.CHAT_DATA.USERS[user];
  if (!u) return null;
  const grad = {
    'user-1': 'linear-gradient(135deg,#6366F1,#4338CA)',
    'user-2': 'linear-gradient(135deg,#EC4899,#BE185D)',
    'user-3': 'linear-gradient(135deg,#F59E0B,#B45309)',
    'user-4': 'linear-gradient(135deg,#06B6D4,#0E7490)',
  }[u.color];
  return (
    <div className="msg-avatar" style={{ width: size, height: size, background: grad, fontSize: size * 0.36 }}>
      {u.short}
    </div>
  );
};

const FileIcon = ({ type }) => {
  const Icons = window.Icons;
  if (type === 'pdf') return <div className="msg-attach-icon pdf"><Icons.FilePdf size={18} /></div>;
  if (type === 'xls') return <div className="msg-attach-icon xls"><Icons.FileXls size={18} /></div>;
  if (type === 'img') return <div className="msg-attach-icon"><Icons.Image size={18} /></div>;
  return <div className="msg-attach-icon"><Icons.File size={18} /></div>;
};

const MessageRow = ({ m, prev, onReply, onReact, onPin }) => {
  const Icons = window.Icons;
  const USERS = window.CHAT_DATA.USERS;
  if (m.divider) return <div className="chat-day-divider">{m.day}</div>;

  const user = USERS[m.user];
  const isMine = m.mine || m.user === 'me';
  const hideAvatar = prev && prev.user === m.user && !prev.divider;
  const hideHeader = hideAvatar;

  const renderRichText = () => {
    if (m.richText) {
      return m.richText.map((part, i) => {
        if (part.mention) {
          const u = USERS[part.mention];
          return <span key={i} className="mention">@{u.name.split(' ').slice(-1)[0]}</span>;
        }
        return <span key={i}>{part.text}</span>;
      });
    }
    let text = m.text || '';
    // Auto-render @mentions and document mentions
    const parts = text.split(/(@\w+|\bSO-\d+\/\d+\b|\bPXK-\d+\/\d+\b|\bBG-\d+\/\d+\b)/g);
    return parts.map((p, i) => {
      if (/^@\w+$/.test(p)) return <span key={i} className="mention">{p}</span>;
      if (/^(SO|PXK|BG|HD)-\d+/.test(p)) return <span key={i} className="doc-tag"><Icons.Hash size={11} />{p}</span>;
      return <span key={i}>{p}</span>;
    });
  };

  return (
    <div className={`msg-row ${isMine ? 'mine' : ''}`}>
      {!isMine && (hideAvatar ? <div className="msg-avatar hidden" style={{ width: 32, height: 32 }} /> : <AvatarMini user={m.user} />)}
      <div className="msg-col">
        {!isMine && !hideHeader && (
          <div className="msg-meta">
            <span className="msg-meta-name">{user.name}</span>
            <span className="msg-meta-role">{user.role}</span>
            <span className="msg-meta-time">{m.time}</span>
          </div>
        )}
        {isMine && !hideHeader && (
          <div className="msg-meta" style={{ flexDirection: 'row-reverse' }}>
            <span className="msg-meta-time">{m.time}</span>
          </div>
        )}

        {m.replyTo && (
          <div className="msg-reply-context">
            <span className="name">{USERS[m.replyTo.user]?.name.split(' ').slice(-1)[0]}</span>{' · '}
            <span className="body">{m.replyTo.text}</span>
          </div>
        )}

        {(m.text || m.richText || m.docQuote || m.attach || m.docMention) && (
          <div className="msg-bubble">
            {m.pinned && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--warning)', marginBottom: 4 }}>
                <Icons.Pin size={11} /> Đã ghim
              </span>
            )}
            {(m.text || m.richText) && <div>{renderRichText()}</div>}

            {m.docQuote && (
              <div className="msg-quote-from-doc">
                <div className="label">Trích từ chứng từ</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{m.docQuote.title}</div>
                {m.docQuote.rows.map((r, i) => (
                  <div key={i} className="row"><span className="k">{r.k}</span><span>{r.v}</span></div>
                ))}
              </div>
            )}

            {m.docMention && (
              <div style={{ marginTop: 6 }}>
                <span className="doc-tag"><Icons.Hash size={11} /> {m.docMention.no} · {m.docMention.label}</span>
              </div>
            )}

            {m.attach && m.attach.type === 'img' && (
              <div className="msg-image">
                <div className="msg-image-placeholder">{m.attach.name}</div>
              </div>
            )}

            {m.attach && m.attach.type !== 'img' && (
              <div className="msg-attach">
                <FileIcon type={m.attach.type} />
                <div className="msg-attach-info">
                  <div className="msg-attach-name">{m.attach.name}</div>
                  <div className="msg-attach-size">{m.attach.size}</div>
                </div>
                <button className="icon-btn" style={{ width: 28, height: 28 }}><Icons.ExtLink size={14} /></button>
              </div>
            )}
          </div>
        )}

        {m.reactions && m.reactions.length > 0 && (
          <div className="msg-reactions">
            {m.reactions.map((r, i) => (
              <span key={i} className={`msg-reaction ${r.mine ? 'mine' : ''}`}>
                <span>{r.emo}</span><span>{r.count}</span>
              </span>
            ))}
          </div>
        )}

        {isMine && m.receipts && (
          <div className={`msg-receipts ${m.receipts === 'read' ? 'read' : ''}`}>
            <Icons.CheckCheck size={12} />
            <span>{m.receipts === 'read' ? 'Đã đọc' : m.receipts === 'sent' ? 'Đã gửi' : 'Đã nhận'}</span>
          </div>
        )}

        {/* Hover actions */}
        <div className="msg-hover-actions">
          <button className="msg-hover-action" onClick={() => onReact && onReact(m, '❤️')} title="Thả cảm xúc"><Icons.Heart size={14} /></button>
          <button className="msg-hover-action" onClick={() => onReply && onReply(m)} title="Trả lời"><Icons.Reply size={14} /></button>
          <button className="msg-hover-action" onClick={() => onPin && onPin(m)} title="Ghim"><Icons.Pin size={14} /></button>
          {isMine && <button className="msg-hover-action" title="Sửa"><Icons.Edit size={14} /></button>}
          {isMine && <button className="msg-hover-action danger" title="Thu hồi"><Icons.Trash size={14} /></button>}
          <button className="msg-hover-action" title="Thêm"><Icons.More size={14} /></button>
        </div>
      </div>
    </div>
  );
};

const ChatHeader = ({ convo, onToggleInfo, infoOpen, onClose }) => {
  const Icons = window.Icons;
  const USERS = window.CHAT_DATA.USERS;
  const memberPalette = { 'user-1':'#6366F1','user-2':'#EC4899','user-3':'#F59E0B','user-4':'#06B6D4' };
  const onlineCount = convo.members.filter(m => USERS[m]?.presence === 'online').length;
  return (
    <div className="chat-head">
      <div style={{ width: 36, height: 36, borderRadius: 999, background: 'linear-gradient(135deg, var(--primary), var(--primary-700))', color: 'white', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {convo.type === 'group' ? <Icons.Users size={18} /> : <Icons.User size={18} />}
      </div>
      <div className="chat-head-info">
        <div className="chat-head-title">
          {convo.name}
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>· {convo.members.length} thành viên</span>
        </div>
        <div className="chat-head-sub">
          <div className="chat-head-members">
            {convo.members.slice(0, 4).map((m, i) => (
              <span key={i} className="chat-head-member" style={{ background: memberPalette[USERS[m]?.color] || '#9CA3AF' }}>
                {USERS[m]?.short}
              </span>
            ))}
          </div>
          <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 999, background: 'var(--online)', marginRight: 4, verticalAlign: 'middle' }}></span>{onlineCount} đang online</span>
        </div>
      </div>
      <div className="chat-head-actions">
        <button className="icon-btn" title="Tìm trong hội thoại"><Icons.Search size={16} /></button>
        <button className="icon-btn" title="Ghim"><Icons.Pin size={16} /></button>
        <button className="icon-btn" title="Thêm thành viên"><Icons.Users size={16} /></button>
        <button className={`icon-btn ${infoOpen ? 'active' : ''}`} title="Thông tin chứng từ" onClick={onToggleInfo}><Icons.PanelR size={16} /></button>
        <button className="icon-btn" title="Thêm"><Icons.More size={16} /></button>
        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 4px' }}></div>
        <button className="icon-btn" title="Đóng" onClick={onClose}><Icons.Close size={16} /></button>
      </div>
    </div>
  );
};

const Composer = ({ replyingTo, onCancelReply, onSend, convoMembers, showTypingDemo }) => {
  const Icons = window.Icons;
  const USERS = window.CHAT_DATA.USERS;
  const [val, setVal] = useState('');
  const [mentionQuery, setMentionQuery] = useState(null);
  const taRef = useRef(null);

  useEffect(() => {
    if (taRef.current) {
      taRef.current.style.height = 'auto';
      taRef.current.style.height = Math.min(140, taRef.current.scrollHeight) + 'px';
    }
  }, [val]);

  const handleChange = (e) => {
    const v = e.target.value;
    setVal(v);
    // mention trigger
    const caret = e.target.selectionStart;
    const before = v.slice(0, caret);
    const match = before.match(/@(\w*)$/);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  };

  const insertMention = (uid) => {
    const u = USERS[uid];
    const tag = '@' + u.name.split(' ').slice(-1)[0] + ' ';
    setVal(v => v.replace(/@\w*$/, tag));
    setMentionQuery(null);
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const mentionList = mentionQuery !== null
    ? convoMembers.filter(uid => uid !== 'me').map(uid => USERS[uid]).filter(u => u && u.name.toLowerCase().includes(mentionQuery))
    : [];

  const submit = () => {
    if (!val.trim()) return;
    onSend(val.trim());
    setVal('');
  };

  return (
    <div className="composer-wrap" style={{ position: 'relative' }}>
      {showTypingDemo && (
        <div className="typing-row">
          <AvatarMini user="vananh" size={28} />
          <div className="typing-bubble">
            <span className="typing-dot"></span><span className="typing-dot"></span><span className="typing-dot"></span>
          </div>
          <div className="typing-text">Văn Anh đang nhập...</div>
        </div>
      )}

      {replyingTo && (
        <div className="composer-reply-banner">
          <Icons.Reply size={13} />
          <div className="preview">
            <span className="who">Trả lời {USERS[replyingTo.user]?.name}: </span>
            {replyingTo.text || (replyingTo.attach ? `[${replyingTo.attach.name}]` : '...')}
          </div>
          <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={onCancelReply}><Icons.X size={12} /></button>
        </div>
      )}

      {mentionList.length > 0 && (
        <div className="mention-pop">
          {mentionList.map((u, i) => (
            <div key={u.id} className={`mention-item ${i === 0 ? 'active' : ''}`} onClick={() => insertMention(u.id)}>
              <div className={`mention-item-avatar`} style={{ background: { 'user-1':'#6366F1','user-2':'#EC4899','user-3':'#F59E0B','user-4':'#06B6D4' }[u.color] }}>{u.short}</div>
              <span className="mention-item-name">{u.name}</span>
              <span className="mention-item-role">{u.role}</span>
            </div>
          ))}
        </div>
      )}

      <div className={`composer ${replyingTo ? 'with-reply' : ''}`}>
        <textarea
          ref={taRef}
          className="composer-input"
          placeholder="Nhập tin nhắn... Dùng @ để nhắc thành viên, dán mã chứng từ (SO-..., PXK-...) để tag"
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
          <button className="icon-btn" title="Đính kèm file"><Icons.Paperclip size={16} /></button>
          <button className="icon-btn" title="Gửi ảnh"><Icons.Image size={16} /></button>
          <button className="icon-btn" title="Nhắc người"><Icons.At size={16} /></button>
          <button className="icon-btn" title="Tag chứng từ"><Icons.Hash size={16} /></button>
          <button className="icon-btn" title="Emoji"><Icons.Smile size={16} /></button>
          <button className="composer-send" onClick={submit} disabled={!val.trim()}>
            <Icons.Send size={14} /> Gửi
          </button>
        </div>
      </div>
    </div>
  );
};

const ChatThread = ({ convo, onToggleInfo, infoOpen, onClose, showTypingDemo }) => {
  const Icons = window.Icons;
  const baseMessages = window.CHAT_DATA.MESSAGES[convo.id] || [];
  const [extra, setExtra] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const messagesRef = useRef(null);

  const messages = [...baseMessages, ...extra];

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [convo.id, extra.length]);

  const pinned = messages.find(m => m.pinned);

  const handleSend = (text) => {
    const newMsg = {
      id: 'tmp' + Date.now(), user: 'me', mine: true,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      text,
      replyTo: replyingTo ? { user: replyingTo.user, text: replyingTo.text || '...' } : null,
      receipts: 'sent',
    };
    setExtra(e => [...e, newMsg]);
    setReplyingTo(null);
  };

  return (
    <div className="chat-pane">
      <ChatHeader convo={convo} onToggleInfo={onToggleInfo} infoOpen={infoOpen} onClose={onClose} />

      {pinned && pinned.attach && (
        <div className="chat-pinned">
          <Icons.Pin size={14} className="chat-pinned-icon" />
          <div className="chat-pinned-content">
            <div className="chat-pinned-label">Tin ghim · {window.CHAT_DATA.USERS[pinned.user].name}</div>
            <div>📎 {pinned.attach.name} <span style={{ color: 'var(--text-3)' }}>({pinned.attach.size})</span></div>
          </div>
          <button className="icon-btn" style={{ width: 24, height: 24 }}><Icons.ChevDown size={14} /></button>
        </div>
      )}

      <div className="chat-messages" ref={messagesRef}>
        {messages.map((m, i) => (
          <MessageRow key={m.id} m={m} prev={messages[i - 1]} onReply={setReplyingTo} />
        ))}
      </div>

      <Composer
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSend={handleSend}
        convoMembers={convo.members}
        showTypingDemo={showTypingDemo}
      />
    </div>
  );
};

window.ChatThread = ChatThread;
