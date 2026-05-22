// CENTER — Chat window

function MessageRichText({ text }) {
  // Render text with HTML escaped except <span class="mention">, <b>, <i>
  return <span dangerouslySetInnerHTML={{__html: text.replace(/\n/g, '<br/>')}} />;
}

function FileIcon({ type, size = 'md' }) {
  const cls = `file-ic ${type}`;
  const label = type.toUpperCase();
  return <div className={cls}>{label}</div>;
}

function Attachment({ att }) {
  if (att.type === 'img') {
    return (
      <div className="attach">
        <FileIcon type="img"/>
        <div className="body">
          <div className="file-name">{att.name}</div>
          <div className="file-meta">{att.size} · {att.label || 'Hình ảnh'}</div>
        </div>
        <div className="file-actions">
          <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Att_Dl_img" data-tip="Tải xuống" data-otel-label="ATT_DOWNLOAD">
            <span className="t-Icon fa fa-download" aria-hidden="true"></span>
            <span className="t-Button-label u-VisuallyHidden">Tải xuống</span>
          </button>
          <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Att_More_img" data-tip="Thêm" data-otel-label="ATT_MORE">
            <span className="t-Icon fa fa-ellipsis-v" aria-hidden="true"></span>
            <span className="t-Button-label u-VisuallyHidden">Thêm</span>
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="attach">
      <FileIcon type={att.type}/>
      <div className="body">
        <div className="file-name">{att.name}</div>
        <div className="file-meta">{att.size}</div>
      </div>
      <div className="file-actions">
        <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Att_Dl" data-tip="Tải xuống" data-otel-label="ATT_DOWNLOAD">
          <span className="t-Icon fa fa-download" aria-hidden="true"></span>
          <span className="t-Button-label u-VisuallyHidden">Tải xuống</span>
        </button>
        <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Att_More" data-tip="Thêm" data-otel-label="ATT_MORE">
          <span className="t-Icon fa fa-ellipsis-v" aria-hidden="true"></span>
          <span className="t-Button-label u-VisuallyHidden">Thêm</span>
        </button>
      </div>
    </div>
  );
}

function LinkedDocCard({ doc }) {
  const labels = {
    pxb: 'Phiếu xuất bán', don: 'Đơn hàng', hd: 'Hợp đồng'
  };
  return (
    <div className="linked-doc">
      <div className="head">
        <Icons.doc size={12}/>
        <span>{labels[doc.kind] || 'Chứng từ'} #{doc.no}</span>
      </div>
      <div className="doc-title">{doc.customer}</div>
      <div className="doc-meta">
        {doc.kho && <span><b>Kho:</b> {doc.kho}</span>}
        {doc.date && <span><b>Ngày:</b> {doc.date}</span>}
        {doc.lines && <span><b>Mặt hàng:</b> {doc.lines}</span>}
      </div>
      <div className="doc-footer">
        <span style={{color: doc.status === 'Chờ xác nhận' ? 'var(--amber)' : 'var(--green)'}}>
          ● {doc.status}
        </span>
        <a className="open-link" href="#" onClick={(e) => e.preventDefault()}>
          Mở phiếu <Icons.chev_r size={12}/>
        </a>
      </div>
    </div>
  );
}

function MessageGroup({ msg, prevMsg, users, onReply, onReact, onPin, isPinned, isLastMine }) {
  const author = users[msg.author] || { name: 'Unknown', short: '?', color: 0, status: 'offline' };
  const isMine = msg.mine || msg.author === 'me';
  const isContinuation = msg.continuation;

  return (
    <div className={`msg-group ${isMine ? 'mine' : ''} ${isContinuation ? 'continuation' : ''}`}>
      {!isMine && (
        <div className="gutter">
          {!isContinuation && <Avatar user={author} showStatus={false}/>}
        </div>
      )}
      <div className="body">
        {!isContinuation && (
          <div className="header-row">
            {!isMine && <span className="author">{author.name}</span>}
            {!isMine && <span className="author-role">{author.role}</span>}
            <span className="ts">{msg.time}</span>
            {isMine && <span className="author">Bạn</span>}
          </div>
        )}

        <div className="msg-wrap">
          {msg.text || msg.attachments || msg.linkedDoc ? (
            <div className={`msg ${isMine ? 'mine' : ''}`}>
              {msg.replyTo && (
                <div className="reply-quote">
                  <span className="who">↳ {msg.replyTo.author === 'me' ? 'Bạn' : (users[msg.replyTo.author]?.name || msg.replyTo.author)}</span>
                  <div className="body">{msg.replyTo.body}</div>
                </div>
              )}
              {msg.text && <MessageRichText text={msg.text}/>}
              {msg.attachments && msg.attachments.map((a, i) => <Attachment key={i} att={a}/>)}
              {msg.linkedDoc && <LinkedDocCard doc={msg.linkedDoc}/>}
            </div>
          ) : null}

          <div className="msg-actions">
            <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id={`Btn_Msg_React_${msg.id}`} data-tip="Thả cảm xúc" onClick={() => onReact(msg.id, '👍')} data-otel-label="MSG_REACT">
              <span className="t-Icon fa fa-smile-o" aria-hidden="true"></span>
              <span className="t-Button-label u-VisuallyHidden">Cảm xúc</span>
            </button>
            <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id={`Btn_Msg_Reply_${msg.id}`} data-tip="Trả lời" onClick={() => onReply(msg)} data-otel-label="MSG_REPLY">
              <span className="t-Icon fa fa-reply" aria-hidden="true"></span>
              <span className="t-Button-label u-VisuallyHidden">Trả lời</span>
            </button>
            <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id={`Btn_Msg_Pin_${msg.id}`} data-tip={isPinned ? 'Bỏ ghim' : 'Ghim'} onClick={() => onPin(msg.id)} data-otel-label="MSG_PIN">
              <span className={`t-Icon fa fa-thumb-tack${isPinned ? ' pinned' : ''}`} aria-hidden="true" style={isPinned ? {color:'var(--amber)'} : {}}></span>
              <span className="t-Button-label u-VisuallyHidden">{isPinned ? 'Bỏ ghim' : 'Ghim'}</span>
            </button>
            <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id={`Btn_Msg_Forward_${msg.id}`} data-tip="Chuyển tiếp" data-otel-label="MSG_FORWARD">
              <span className="t-Icon fa fa-share" aria-hidden="true"></span>
              <span className="t-Button-label u-VisuallyHidden">Chuyển tiếp</span>
            </button>
            <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id={`Btn_Msg_More_${msg.id}`} data-tip="Thêm" data-otel-label="MSG_MORE">
              <span className="t-Icon fa fa-ellipsis-h" aria-hidden="true"></span>
              <span className="t-Button-label u-VisuallyHidden">Thêm</span>
            </button>
          </div>
        </div>

        {msg.reactions && msg.reactions.length > 0 && (
          <div className="reactions">
            {msg.reactions.map((r, i) => (
              <div key={i} className={`reaction ${r.mine ? 'mine' : ''}`} onClick={() => onReact(msg.id, r.emoji)}>
                <span>{r.emoji}</span>
                <span className="count">{r.count}</span>
              </div>
            ))}
            <button className="reaction add t-Button t-Button--icon t-Button--noLabel" type="button" id={`Btn_Msg_AddReact_${msg.id}`} data-tip="Thêm cảm xúc" onClick={() => onReact(msg.id, '👍')} data-otel-label="MSG_ADD_REACT">
              <span className="t-Icon fa fa-smile-o" aria-hidden="true"></span>
              <span className="t-Button-label u-VisuallyHidden">Thêm cảm xúc</span>
            </button>
          </div>
        )}

        {isMine && msg.id && isLastMine && (
          <div className="read-row">
            <Icons.check_2 size={13} style={{color:'var(--primary)'}}/>
            <span>Đã đọc</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatHeader({ conv, users, onTogglePanel, onToggleSearch, onlineCount }) {
  const isChannel = conv.type === 'channel';
  const user = !isChannel ? (users[conv.user] || { name: 'Unknown', short: '?', color: 0, status: 'offline' }) : null;
  const name = isChannel ? conv.name : user.name;
  const memberCount = isChannel ? conv.members.length : 2;

  return (
    <div className="chat-head">
      {isChannel
        ? <Avatar channel icon={conv.icon} size="md"/>
        : <Avatar user={user}/>}
      <div className="title-block">
        <h3>
          {isChannel && <Icons.hash size={14} style={{color:'var(--text-muted)'}}/>}
          {name}
          {conv.linkedDoc && (
            <span style={{
              fontSize: 11, background:'var(--primary-soft)', color:'var(--primary)',
              padding:'2px 8px', borderRadius:4, fontWeight:500, letterSpacing:'.02em'
            }}>
              <Icons.link size={10} style={{display:'inline', marginRight:3, verticalAlign:'-1px'}}/>
              {conv.linkedDoc.type} #{conv.linkedDoc.no}
            </span>
          )}
        </h3>
        <div className="sub">
          {isChannel ? (
            <>
              <span><Icons.users size={11} style={{display:'inline', marginRight:3, verticalAlign:'-1px'}}/> {memberCount} thành viên</span>
              <span className="sep"/>
              <span style={{color:'var(--green)'}}>● {onlineCount || 0} đang online</span>
            </>
          ) : (
            <span style={{color: user.status === 'online' ? 'var(--green)' : user.status === 'away' ? 'var(--amber)' : 'var(--text-muted)'}}>
              ● {user.status === 'online' ? 'Đang hoạt động' : user.status === 'away' ? 'Vắng mặt' : 'Ngoại tuyến'} · {user.role}
            </span>
          )}
        </div>
      </div>
      <div className="head-actions">
        <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Chat_Search" data-tip="Tìm trong hội thoại" onClick={onToggleSearch} data-otel-label="CHAT_SEARCH">
          <span className="t-Icon fa fa-search" aria-hidden="true"></span>
          <span className="t-Button-label u-VisuallyHidden">Tìm kiếm</span>
        </button>
        <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Chat_Phone" data-tip="Gọi thoại" data-otel-label="CHAT_PHONE">
          <span className="t-Icon fa fa-phone" aria-hidden="true"></span>
          <span className="t-Button-label u-VisuallyHidden">Gọi thoại</span>
        </button>
        <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Chat_Bell" data-tip="Tắt thông báo" data-otel-label="CHAT_BELL">
          <span className="t-Icon fa fa-bell" aria-hidden="true"></span>
          <span className="t-Button-label u-VisuallyHidden">Thông báo</span>
        </button>
        <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Chat_Panel" data-tip="Ẩn/hiện panel" onClick={onTogglePanel} data-otel-label="CHAT_PANEL">
          <span className="t-Icon fa fa-columns" aria-hidden="true"></span>
          <span className="t-Button-label u-VisuallyHidden">Panel</span>
        </button>
      </div>
    </div>
  );
}

function Composer({ onSend, replyTo, onCancelReply, users, mentionList, onTyping }) {
  const [text, setText] = React.useState('');
  const [showMention, setShowMention] = React.useState(false);
  const [mentionQ, setMentionQ] = React.useState('');
  const taRef = React.useRef(null);
  const typingThrottleRef = React.useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    // auto height
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(160, e.target.scrollHeight) + 'px';
    // mention detect
    const cursor = e.target.selectionStart;
    const before = val.substring(0, cursor);
    const m = before.match(/@(\w*)$/);
    if (m) {
      setShowMention(true);
      setMentionQ(m[1].toLowerCase());
    } else {
      setShowMention(false);
    }
    // typing indicator — throttle 2.5s
    if (onTyping && val.trim() && !typingThrottleRef.current) {
      onTyping();
      typingThrottleRef.current = setTimeout(() => {
        typingThrottleRef.current = null;
      }, 2500);
    }
  };

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    clearTimeout(typingThrottleRef.current);
    typingThrottleRef.current = null;
    onSend(trimmed);
    setText('');
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  const insertMention = (user) => {
    const cursor = taRef.current.selectionStart;
    const before = text.substring(0, cursor).replace(/@\w*$/, '');
    const after = text.substring(cursor);
    setText(before + '@' + user.name.split(' ').pop() + ' ' + after);
    setShowMention(false);
    setTimeout(() => taRef.current && taRef.current.focus(), 0);
  };

  const mentionResults = React.useMemo(() => {
    return mentionList.filter(u => !mentionQ || u.name.toLowerCase().includes(mentionQ)).slice(0, 5);
  }, [mentionQ, mentionList]);

  return (
    <div className="composer">
      {replyTo && (
        <div className="composer-reply">
          <Icons.reply size={14} style={{color:'var(--primary)'}}/>
          <div className="info">
            <div className="who">Trả lời {replyTo.author === 'me' ? 'chính bạn' : (users[replyTo.author]?.name || replyTo.author)}</div>
            <div className="body" dangerouslySetInnerHTML={{__html: (replyTo.text || '').slice(0, 80)}}/>
          </div>
          <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Compose_CloseReply" onClick={onCancelReply} data-otel-label="COMPOSE_CLOSE_REPLY">
            <span className="t-Icon fa fa-times" aria-hidden="true"></span>
            <span className="t-Button-label u-VisuallyHidden">Hủy trả lời</span>
          </button>
        </div>
      )}
      <div className="composer-box" style={{position:'relative'}}>
        {showMention && mentionResults.length > 0 && (
          <div className="mention-popup">
            <div className="label">@ đề cập đến</div>
            {mentionResults.map((u, i) => (
              <div key={u.id} className={`mention-item ${i === 0 ? 'active' : ''}`} onClick={() => insertMention(u)}>
                <Avatar user={u} size="sm" showStatus={false}/>
                <div>
                  <div>{u.name}</div>
                </div>
                <span className="role">{u.role}</span>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          value={text}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Nhập tin nhắn... Dùng @ để đề cập, # để gắn phiếu"
          rows={1}
        />
        <div className="composer-toolbar">
          <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Compose_Attach" data-tip="Đính kèm tệp" data-otel-label="COMPOSE_ATTACH">
            <span className="t-Icon fa fa-paperclip" aria-hidden="true"></span>
            <span className="t-Button-label u-VisuallyHidden">Đính kèm tệp</span>
          </button>
          <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Compose_Doc" data-tip="Đính kèm phiếu/chứng từ" data-otel-label="COMPOSE_DOC">
            <span className="t-Icon fa fa-file-text-o" aria-hidden="true"></span>
            <span className="t-Button-label u-VisuallyHidden">Đính kèm chứng từ</span>
          </button>
          <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Compose_Mention" data-tip="Đề cập @" data-otel-label="COMPOSE_MENTION">
            <span className="t-Icon fa fa-at" aria-hidden="true"></span>
            <span className="t-Button-label u-VisuallyHidden">Đề cập</span>
          </button>
          <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Compose_Emoji" data-tip="Emoji" data-otel-label="COMPOSE_EMOJI">
            <span className="t-Icon fa fa-smile-o" aria-hidden="true"></span>
            <span className="t-Button-label u-VisuallyHidden">Emoji</span>
          </button>
          <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Compose_Format" data-tip="Định dạng" data-otel-label="COMPOSE_FORMAT">
            <span className="t-Icon fa fa-bold" aria-hidden="true"></span>
            <span className="t-Button-label u-VisuallyHidden">Định dạng</span>
          </button>
          <div className="spacer"/>
          <button className="t-Button t-Button--icon t-Button--mobileHideLabel t-Button--iconLeft t-Button--hot" type="button" id="Btn_Compose_Send" onClick={send} disabled={!text.trim()} data-otel-label="COMPOSE_SEND">
            <span className="t-Icon t-Icon--left fa fa-paper-plane-o" aria-hidden="true"></span>
            <span className="t-Button-label">Gửi</span>
            <span className="t-Icon t-Icon--right fa fa-paper-plane-o" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <div className="composer-hint">
        <span><kbd>Enter</kbd> gửi · <kbd>Shift</kbd>+<kbd>Enter</kbd> xuống dòng</span>
        <span>·</span>
        <span>Mọi tin nhắn được lưu trong nhật ký hệ thống</span>
      </div>
    </div>
  );
}

function ChatCenter({ conv, messages, users, onSend, onTogglePanel, isLoading, pinnedMessage, onPin, typingUsers, onTyping, onlineCount }) {
  const [replyTo, setReplyTo] = React.useState(null);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQ, setSearchQ] = React.useState('');
  const msgsRef = React.useRef(null);

  React.useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight;
    }
  }, [conv?.id, messages.length]);

  const handleReact = (msgId, emoji) => {
    // ignored for prototype - already mocked
  };

  if (!conv) {
    return (
      <section className="chat">
        <div className="state-block">
          <div className="ic"><Icons.inbox size={28}/></div>
          <h4>Chưa chọn hội thoại</h4>
          <p>Chọn một nhóm hoặc tin nhắn riêng từ danh sách bên trái để bắt đầu trò chuyện.</p>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="chat">
        <div className="chat-head">
          <div className="skel skel-circle"/>
          <div style={{flex:1}}>
            <div className="skel skel-line w50"/>
            <div className="skel skel-line w70" style={{width:'30%'}}/>
          </div>
        </div>
        <div className="msgs">
          {[1,2,3,4].map(i => (
            <div key={i} className="msg-group">
              <div className="gutter"><div className="skel skel-circle"/></div>
              <div className="body">
                <div className="skel skel-line w50"/>
                <div className="skel" style={{height: 40, width: `${60+i*8}%`, borderRadius: 'var(--radius-bubble)', marginTop:8}}/>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const mentionUsers = Object.values(users).filter(u => u.id !== 'me' && u.id !== 'bot');

  // Index của tin nhắn cuối cùng do mình gửi — để hiển thị "Đã đọc" đúng chỗ
  let lastMineIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].mine) { lastMineIndex = i; break; }
  }

  return (
    <section className="chat">
      <ChatHeader conv={conv} users={users} onTogglePanel={onTogglePanel} onToggleSearch={() => setSearchOpen(!searchOpen)} onlineCount={onlineCount}/>

      {searchOpen && (
        <div style={{padding:'8px 16px', borderBottom:'1px solid var(--border)', background:'var(--surface)'}}>
          <div className="search-box">
            <Icons.search size={14} className="ic"/>
            <input
              autoFocus
              placeholder="Tìm trong hội thoại này..."
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
            />
            <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Chat_SearchClose" onClick={() => { setSearchOpen(false); setSearchQ(''); }} data-otel-label="CHAT_SEARCH_CLOSE">
              <span className="t-Icon fa fa-times" aria-hidden="true"></span>
              <span className="t-Button-label u-VisuallyHidden">Đóng tìm kiếm</span>
            </button>
          </div>
        </div>
      )}

      {pinnedMessage && (
        <div className="pinned-bar">
          <Icons.pin size={12} className="pin-ic"/>
          <div className="pinned-msg">
            <b>{users[pinnedMessage.author]?.name || pinnedMessage.author}:</b>{' '}
            <span dangerouslySetInnerHTML={{__html: (pinnedMessage.text || '').replace(/<[^>]+>/g, '').slice(0, 100)}}/>
          </div>
          <a href="#" onClick={(e) => e.preventDefault()}>Xem</a>
          <button className="t-Button t-Button--icon t-Button--noLabel" type="button" id="Btn_Pinned_Close" onClick={() => onPin(pinnedMessage.id)} data-otel-label="PINNED_CLOSE">
            <span className="t-Icon fa fa-times" aria-hidden="true"></span>
            <span className="t-Button-label u-VisuallyHidden">Đóng</span>
          </button>
        </div>
      )}

      <div className="msgs" ref={msgsRef}>
        {messages.map((m, i) => {
          if (m.kind === 'date') {
            return <div key={i} className="date-sep">{m.label}</div>;
          }
          if (m.kind === 'system') {
            const icMap = {
              link: <Icons.link size={11}/>, edit: <Icons.edit size={11}/>, check: <Icons.check size={11}/>
            };
            return (
              <div key={i} className="system-msg">
                {icMap[m.ic] || <Icons.info size={11}/>}
                <span style={m.status === 'success' ? {color:'var(--green)'} : {}}>{m.text}</span>
              </div>
            );
          }
          return (
            <MessageGroup
              key={m.id || i}
              msg={m}
              users={users}
              onReply={setReplyTo}
              onReact={handleReact}
              onPin={onPin}
              isPinned={pinnedMessage?.id === m.id}
              isLastMine={i === lastMineIndex}
            />
          );
        })}
        {/* Typing indicator */}
        {typingUsers && typingUsers.length > 0 && (
          <div className="typing-indicator">
            <span>
              {typingUsers.length === 1
                ? `${typingUsers[0]} đang nhập`
                : `${typingUsers.slice(0, 2).join(', ')}${typingUsers.length > 2 ? ' và ' + (typingUsers.length - 2) + ' người khác' : ''} đang nhập`}
            </span>
            <span className="typing-dots"><span/><span/><span/></span>
          </div>
        )}
      </div>

      <Composer
        onSend={(text) => { onSend(text, replyTo); setReplyTo(null); }}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        users={users}
        mentionList={mentionUsers}
        onTyping={onTyping}
      />
    </section>
  );
}

window.ChatCenter = ChatCenter;
