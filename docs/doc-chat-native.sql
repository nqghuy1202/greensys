-- ============================================================
-- DOC CHAT MODAL — Native APEX Page Callbacks (HTML-returning)
-- Tất cả là PAGE-LEVEL AJAX CALLBACK trên page 10022710201
-- Khác với doc-chat-callbacks.sql (trả JSON), các callback
-- này trả HTML trực tiếp để JS dùng innerHTML swap.
-- ============================================================
-- Gọi từ doc-chat-page.js: dataType: 'text'
-- apex.server.process(proc, params, { pageId: 10022710201, dataType: 'text', success: fn })
--
-- Callback mới (thay thế docChatConversations/Messages/Members):
--   dcConvListHtml   x01=doc_type | x02=doc_no | x03=filter | x04=search
--   dcMsgThreadHtml  x01=conv_id  | x02=search_query
--   dcInfoHtml       x01=conv_id
--   dcContactsHtml   (không tham số — trả danh sách users để tạo cuộc trò chuyện)
--
-- Giữ nguyên (trả JSON, không đổi):
--   docChatCreate / docChatSend / docChatRead / docChatTyping
-- ============================================================


-- ============================================================
-- 1. dcConvListHtml
--    Trả HTML danh sách hội thoại (convo-pane nội dung)
--    x01=doc_type | x02=doc_no | x03=filter(ALL/DM/CHANNEL) | x04=search
-- ============================================================
DECLARE
  l_aus_id   NUMBER;
  l_doc_type VARCHAR2(50)  := TRIM(apex_application.g_x01);
  l_doc_no   VARCHAR2(100) := TRIM(apex_application.g_x02);
  l_filter   VARCHAR2(20)  := NVL(UPPER(TRIM(apex_application.g_x03)), 'ALL');
  l_search   VARCHAR2(200) := LOWER(TRIM(apex_application.g_x04));
  l_count    NUMBER := 0;

  FUNCTION avatar_color(p_id NUMBER) RETURN VARCHAR2 IS
    l_colors VARCHAR2(500) :=
      '#6366F1,#EC4899,#F59E0B,#06B6D4,#10B981,#F97316,#8B5CF6,#EF4444';
  BEGIN
    RETURN REGEXP_SUBSTR(l_colors, '[^,]+', 1, MOD(NVL(p_id,0), 8) + 1);
  END;
BEGIN
  OWA_UTIL.MIME_HEADER('text/html', TRUE, 'UTF-8');

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('<div class="dc-err">Phiên đăng nhập hết hạn</div>'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('<div class="dc-err">Không tìm thấy user</div>'); RETURN;
  END;

  IF l_doc_type IS NULL OR l_doc_no IS NULL THEN
    HTP.p('<div class="dc-err">Thiếu doc_type/doc_no</div>'); RETURN;
  END IF;

  -- Toolbar: search + filter tabs
  HTP.p('<div class="convo-toolbar">');
  HTP.p('  <label class="convo-search">');
  HTP.p('    <span class="fa fa-search" style="color:var(--text-4);font-size:13px"></span>');
  HTP.p('    <input type="text" id="dc-conv-search" placeholder="Tìm kiếm..." value="'
        || HTF.ESCAPE_SC(NVL(apex_application.g_x04,'')) || '"/>');
  HTP.p('  </label>');
  HTP.p('  <div class="convo-tabs">');
  FOR t IN (SELECT 'ALL' f, 'Tất cả' lbl FROM DUAL
            UNION ALL SELECT 'DM','DM' FROM DUAL
            UNION ALL SELECT 'CHANNEL','Nhóm' FROM DUAL) LOOP
    HTP.p('    <button type="button" class="convo-tab'
          || CASE WHEN l_filter = t.f THEN ' active' END
          || '" data-filter="' || t.f || '">' || t.lbl || '</button>');
  END LOOP;
  HTP.p('  </div>');
  HTP.p('</div>');

  -- Conversation items
  HTP.p('<div class="convo-list" id="dc-conv-list-inner">');

  FOR conv IN (
    SELECT c.conv_id,
           c.conv_type,
           c.last_msg_preview,
           TO_CHAR(c.last_msg_date, 'HH24:MI')       AS last_time,
           TO_CHAR(c.last_msg_date, 'DD/MM')          AS last_date,
           CASE WHEN c.last_msg_date >= TRUNC(SYSDATE) THEN TO_CHAR(c.last_msg_date,'HH24:MI')
                ELSE TO_CHAR(c.last_msg_date,'DD/MM') END AS display_time,
           p.last_read_msg_id,
           CASE c.conv_type
             WHEN 'CHANNEL' THEN NVL(c.name,'(Không tên)')
             ELSE (SELECT NVL(e2.full_name,'Unknown')
                   FROM   CHAT_PARTICIPANTS p2
                   JOIN   APP_USERS u2 ON u2.aus_id = p2.aus_id
                   JOIN   EMPLOYEES e2 ON e2.emp_id = u2.emp_id
                   WHERE  p2.conv_id = c.conv_id AND p2.aus_id != l_aus_id
                   FETCH FIRST 1 ROW ONLY)
           END AS display_name,
           CASE c.conv_type
             WHEN 'DM' THEN (SELECT p2.aus_id FROM CHAT_PARTICIPANTS p2
                             WHERE  p2.conv_id = c.conv_id AND p2.aus_id != l_aus_id
                             FETCH FIRST 1 ROW ONLY)
           END AS partner_aus_id,
           (SELECT COUNT(*) FROM CHAT_MESSENGERS m
            WHERE  m.conv_id = c.conv_id AND m.delete_date IS NULL
            AND    m.msg_id  > NVL(p.last_read_msg_id, 0)) AS unread_count
    FROM   CHAT_CONVERSATIONS c
    JOIN   CHAT_PARTICIPANTS  p ON p.conv_id = c.conv_id AND p.aus_id = l_aus_id
    WHERE  c.doc_type = l_doc_type
      AND  c.doc_no   = l_doc_no
      AND  (l_filter = 'ALL' OR c.conv_type = l_filter)
      AND  (l_search IS NULL
            OR LOWER(NVL(c.name,'')) LIKE '%' || l_search || '%'
            OR LOWER(NVL(c.last_msg_preview,'')) LIKE '%' || l_search || '%')
    ORDER  BY c.last_msg_date DESC NULLS LAST
  ) LOOP
    l_count := l_count + 1;

    DECLARE
      l_name   VARCHAR2(200) := REGEXP_REPLACE(NVL(conv.display_name,'?'),'[[:cntrl:]]','');
      l_initl  VARCHAR2(4)   := UPPER(SUBSTR(REGEXP_SUBSTR(l_name,'\S+$'),1,1));
      l_color  VARCHAR2(30)  := avatar_color(NVL(conv.partner_aus_id, conv.conv_id));
      l_unread BOOLEAN       := conv.unread_count > 0;
      l_cls    VARCHAR2(100) := 'convo-item' || CASE WHEN l_unread THEN ' unread' END;
    BEGIN
      HTP.p('<div class="' || l_cls || '" data-conv-id="' || conv.conv_id
            || '" data-partner-aus-id="' || NVL(conv.partner_aus_id,'') || '">');
      HTP.p('  <div class="convo-avatar-wrap">');
      IF conv.conv_type = 'CHANNEL' THEN
        HTP.p('    <div class="convo-avatar group"><span class="fa fa-users"></span></div>');
      ELSE
        HTP.p('    <div class="convo-avatar" style="background:' || l_color || '">'
              || l_initl || '</div>');
      END IF;
      HTP.p('  </div>');
      HTP.p('  <div class="convo-content">');
      HTP.p('    <div class="convo-row1">');
      HTP.p('      <span class="convo-name">' || HTF.ESCAPE_SC(l_name) || '</span>');
      HTP.p('      <span class="convo-time">' || NVL(conv.display_time,'') || '</span>');
      HTP.p('    </div>');
      HTP.p('    <div class="convo-row2">');
      HTP.p('      <span class="convo-preview">'
            || HTF.ESCAPE_SC(SUBSTR(NVL(conv.last_msg_preview,''),1,60)) || '</span>');
      IF l_unread THEN
        HTP.p('      <div class="convo-meta"><span class="convo-badge">'
              || conv.unread_count || '</span></div>');
      END IF;
      HTP.p('    </div>');
      HTP.p('  </div>');
      HTP.p('</div>');
    END;
  END LOOP;

  IF l_count = 0 THEN
    HTP.p('<div style="text-align:center;color:var(--text-3);padding:32px 16px;font-size:13px">');
    HTP.p('  Chưa có hội thoại nào.<br>Nhấn "+ Tạo hội thoại" để bắt đầu.');
    HTP.p('</div>');
  END IF;

  HTP.p('</div>'); -- .convo-list
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('<div class="dc-err">Lỗi: ' || HTF.ESCAPE_SC(SQLERRM) || '</div>');
END;


-- ============================================================
-- 2. dcMsgThreadHtml
--    Trả HTML danh sách tin nhắn (chat-messages nội dung)
--    x01=conv_id | x02=search_query (rỗng = tắt filter)
--    Dùng MATERIALIZE vì REGEXP_REPLACE trên remote column.
-- ============================================================
DECLARE
  l_conv_id  NUMBER    := TO_NUMBER(NVL(TRIM(apex_application.g_x01),'0'));
  l_search   VARCHAR2(200) := LOWER(TRIM(apex_application.g_x02));
  l_aus_id   NUMBER;
  l_last_day DATE := NULL;
BEGIN
  OWA_UTIL.MIME_HEADER('text/html', TRUE, 'UTF-8');

  IF l_conv_id = 0 THEN
    HTP.p('<div style="text-align:center;color:var(--text-3);margin-top:60px;font-size:13px">← Chọn hội thoại</div>');
    RETURN;
  END IF;

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('<div class="dc-err">Phiên đăng nhập hết hạn</div>'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('<div class="dc-err">Không tìm thấy user</div>'); RETURN;
  END;

  IF l_search IS NOT NULL THEN
    HTP.p('<div style="padding:6px 16px 2px;font-size:12px;color:var(--text-3)">');
    HTP.p('  Kết quả tìm kiếm: <strong>' || HTF.ESCAPE_SC(apex_application.g_x02) || '</strong>');
    HTP.p('</div>');
  END IF;

  -- Render messages
  FOR msg IN (
    WITH msg_raw AS (
      SELECT /*+ MATERIALIZE */
        m.msg_id,
        m.from_aus_id,
        REGEXP_REPLACE(NVL(e.full_name,'Unknown'), '[[:cntrl:]]', '') AS from_name,
        CASE WHEN m.delete_date IS NOT NULL THEN NULL ELSE m.body END AS body,
        m.delete_date,
        m.reply_to_msg_id,
        TRUNC(m.create_date)                AS msg_day,
        TO_CHAR(m.create_date, 'HH24:MI')  AS msg_time,
        CASE WHEN qm.delete_date IS NOT NULL THEN '[Tin nhắn đã bị xóa]' ELSE qm.body END AS reply_body,
        REGEXP_REPLACE(NVL(qe.full_name,''), '[[:cntrl:]]', '') AS reply_from_name
      FROM   CHAT_MESSENGERS m
      JOIN   APP_USERS       u  ON u.aus_id  = m.from_aus_id
      JOIN   EMPLOYEES       e  ON e.emp_id  = u.emp_id
      LEFT JOIN CHAT_MESSENGERS qm ON qm.msg_id  = m.reply_to_msg_id
      LEFT JOIN APP_USERS    qu  ON qu.aus_id = qm.from_aus_id
      LEFT JOIN EMPLOYEES    qe  ON qe.emp_id = qu.emp_id
      WHERE  m.conv_id = l_conv_id
        AND  (l_search IS NULL OR LOWER(m.body) LIKE '%' || l_search || '%')
      ORDER  BY m.msg_id ASC
      FETCH FIRST 50 ROWS ONLY
    )
    SELECT * FROM msg_raw
  ) LOOP
    -- Date divider
    IF l_last_day IS NULL OR msg.msg_day > l_last_day THEN
      l_last_day := msg.msg_day;
      HTP.p('<div class="chat-day-divider">' || TO_CHAR(msg.msg_day,'DD/MM/YYYY') || '</div>');
    END IF;

    DECLARE
      l_mine  BOOLEAN := (msg.from_aus_id = l_aus_id);
      l_cls   VARCHAR2(50) := 'msg-row' || CASE WHEN l_mine THEN ' mine' END;
      l_av    VARCHAR2(4);
      l_body_esc VARCHAR2(32767);
    BEGIN
      -- Avatar initial (last word of full_name)
      l_av := UPPER(SUBSTR(REGEXP_SUBSTR(msg.from_name, '\S+$'), 1, 1));
      IF l_av IS NULL THEN l_av := '?'; END IF;

      HTP.p('<div class="' || l_cls || '" data-msg-id="' || msg.msg_id || '">');

      -- Avatar (hide for mine messages)
      IF l_mine THEN
        HTP.p('  <div class="msg-avatar hidden"></div>');
      ELSE
        HTP.p('  <div class="msg-avatar" style="background:hsl('
              || MOD(msg.from_aus_id * 47, 360) || ',55%,52%)">' || l_av || '</div>');
      END IF;

      HTP.p('  <div class="msg-col">');

      -- Sender name + time
      HTP.p('    <div class="msg-meta">');
      IF NOT l_mine THEN
        HTP.p('      <span class="msg-meta-name">' || HTF.ESCAPE_SC(msg.from_name) || '</span>');
      END IF;
      HTP.p('      <span class="msg-meta-time">' || msg.msg_time || '</span>');
      HTP.p('    </div>');

      -- Reply context
      IF msg.reply_to_msg_id IS NOT NULL THEN
        HTP.p('    <div class="msg-reply-context">');
        IF msg.reply_from_name IS NOT NULL THEN
          HTP.p('      <span class="name">' || HTF.ESCAPE_SC(msg.reply_from_name) || '</span> ');
        END IF;
        HTP.p('      <span class="body">' || HTF.ESCAPE_SC(SUBSTR(NVL(msg.reply_body,''),1,80)) || '</span>');
        HTP.p('    </div>');
      END IF;

      -- Message body
      IF msg.delete_date IS NOT NULL THEN
        HTP.p('    <div class="msg-bubble deleted">[Tin nhắn đã bị thu hồi]</div>');
      ELSE
        -- Escape HTML, convert newlines to <br>
        l_body_esc := REPLACE(REPLACE(
          REPLACE(REPLACE(HTF.ESCAPE_SC(NVL(msg.body,'')), '&#38;', '&amp;'),
          '&#60;', '&lt;'), CHR(13), ''), CHR(10), '<br>');
        HTP.p('    <div class="msg-bubble">' || l_body_esc || '</div>');
      END IF;

      -- Hover actions (reply button)
      IF msg.delete_date IS NULL THEN
        HTP.p('    <div class="msg-hover-actions">');
        HTP.p('      <button type="button" class="msg-hover-action" title="Trả lời"');
        HTP.p('              data-reply-id="' || msg.msg_id || '"');
        HTP.p('              data-reply-body="' || REPLACE(SUBSTR(NVL(msg.body,''),1,100),'"','&quot;') || '">');
        HTP.p('        <span class="fa fa-reply"></span>');
        HTP.p('      </button>');
        HTP.p('    </div>');
      END IF;

      HTP.p('  </div>'); -- .msg-col
      HTP.p('</div>'); -- .msg-row
    END;
  END LOOP;

  -- Empty state
  IF l_last_day IS NULL THEN
    IF l_search IS NOT NULL THEN
      HTP.p('<div style="text-align:center;color:var(--text-3);margin-top:60px;font-size:13px">');
      HTP.p('  Không tìm thấy tin nhắn nào.</div>');
    ELSE
      HTP.p('<div style="text-align:center;color:var(--text-3);margin-top:60px;font-size:13px">');
      HTP.p('  Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện!</div>');
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('<div class="dc-err">Lỗi: ' || HTF.ESCAPE_SC(SQLERRM) || '</div>');
END;


-- ============================================================
-- 3. dcInfoHtml
--    Trả HTML cho info panel bên phải.
--    Section 1: Doc summary card (shell) — JS điền nội dung từ sessionStorage
--    Section 2: Thao tác nhanh (quick actions)
--    Section 3: Thành viên (members với CSS classes đúng)
--    x01=conv_id
--    Dùng MATERIALIZE + biến l_online_cutoff (tránh ORA-02000).
-- ============================================================
DECLARE
  l_conv_id       NUMBER    := TO_NUMBER(NVL(TRIM(apex_application.g_x01),'0'));
  l_online_cutoff TIMESTAMP := SYSTIMESTAMP - INTERVAL '35' SECOND;
  l_aus_id        NUMBER;
BEGIN
  OWA_UTIL.MIME_HEADER('text/html', TRUE, 'UTF-8');

  -- ── SECTION 1: Doc summary card ──────────────────────────────
  -- Shell được JS điền vào qua injectDocFields() sau khi render xong
  HTP.p('<div class="info-section">');
  HTP.p('  <div class="info-section-title">');
  HTP.p('    <span class="fa fa-file-text-o"></span> Chứng từ');
  HTP.p('  </div>');
  HTP.p('  <div class="doc-summary-card">');
  HTP.p('    <div class="doc-summary-no">');
  HTP.p('      <span class="label" id="dc-doc-no">—</span>');
  HTP.p('      <span class="status" id="dc-doc-status"></span>');
  HTP.p('    </div>');
  HTP.p('    <div class="doc-summary-type" id="dc-doc-label"></div>');
  HTP.p('    <div class="doc-summary-rows" id="dc-doc-fields-placeholder">');
  HTP.p('      <div class="dc-loading" style="padding:8px 0">Đang tải...</div>');
  HTP.p('    </div>');
  HTP.p('    <hr class="doc-summary-divider">');
  HTP.p('    <div class="doc-summary-row">');
  HTP.p('      <span class="k">Giá trị</span>');
  HTP.p('      <span class="v money" id="dc-doc-total">—</span>');
  HTP.p('    </div>');
  HTP.p('  </div>');
  HTP.p('</div>');

  -- ── SECTION 2: Quick actions ──────────────────────────────────
  HTP.p('<div class="info-section">');
  HTP.p('  <div class="info-section-title">');
  HTP.p('    <span class="fa fa-bolt"></span> Thao tác nhanh');
  HTP.p('  </div>');
  HTP.p('  <div class="quick-action" id="dc-qa-open">');
  HTP.p('    <div class="quick-action-icon"><span class="fa fa-external-link"></span></div>');
  HTP.p('    Mở chứng từ');
  HTP.p('  </div>');
  HTP.p('  <div class="quick-action" id="dc-qa-approve">');
  HTP.p('    <div class="quick-action-icon"><span class="fa fa-check-circle-o"></span></div>');
  HTP.p('    Duyệt chứng từ');
  HTP.p('  </div>');
  HTP.p('  <div class="quick-action" id="dc-qa-print">');
  HTP.p('    <div class="quick-action-icon"><span class="fa fa-print"></span></div>');
  HTP.p('    In chứng từ');
  HTP.p('  </div>');
  HTP.p('  <div class="quick-action" id="dc-qa-pdf">');
  HTP.p('    <div class="quick-action-icon"><span class="fa fa-download"></span></div>');
  HTP.p('    Tải PDF');
  HTP.p('  </div>');
  HTP.p('</div>');

  IF l_conv_id = 0 THEN
    HTP.p('<div class="info-section" style="color:var(--text-3);font-size:13px">');
    HTP.p('  Chọn hội thoại để xem thành viên</div>');
    RETURN;
  END IF;

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN RETURN; END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN;
  END;

  -- ── SECTION 3: Members ────────────────────────────────────────
  DECLARE
    l_count NUMBER := 0;
  BEGIN
    HTP.p('<div class="info-section">');
    HTP.p('  <div class="info-section-title">');
    HTP.p('    <span class="fa fa-users"></span> Thành viên');
    HTP.p('    <span class="count" id="dc-member-count">…</span>');
    HTP.p('  </div>');

    FOR mem IN (
      WITH members_raw AS (
        SELECT /*+ MATERIALIZE */
          p.aus_id,
          p.is_admin,
          REGEXP_REPLACE(NVL(e.full_name,'Unknown'), '[[:cntrl:]]', '') AS full_name,
          REGEXP_REPLACE(NVL(d.dep_name,''),          '[[:cntrl:]]', '') AS dep_name
        FROM CHAT_PARTICIPANTS p
        JOIN APP_USERS   u ON u.aus_id  = p.aus_id
        JOIN EMPLOYEES   e ON e.emp_id  = u.emp_id
        LEFT JOIN DEPARTMENTS d ON d.dep_id = e.dep_id
        WHERE p.conv_id = l_conv_id
      )
      SELECT r.aus_id, r.is_admin, r.full_name, r.dep_name,
             CASE WHEN o.last_seen >= l_online_cutoff THEN 'online' ELSE 'offline' END AS presence
      FROM members_raw r
      LEFT JOIN CHAT_USER_ONLINE o ON o.aus_id = r.aus_id
      ORDER BY r.is_admin DESC, r.full_name
    ) LOOP
      l_count := l_count + 1;
      DECLARE
        l_av  VARCHAR2(4) := UPPER(SUBSTR(REGEXP_SUBSTR(mem.full_name,'\S+$'),1,1));
        l_hue VARCHAR2(10) := TO_CHAR(MOD(mem.aus_id * 47, 360));
        l_me  BOOLEAN := (mem.aus_id = l_aus_id);
      BEGIN
        HTP.p('<div class="member-row">');
        HTP.p('  <div class="member-avatar" style="background:hsl(' || l_hue || ',55%,52%)">');
        HTP.p('    ' || NVL(l_av,'?'));
        HTP.p('    <span class="presence ' || mem.presence || '"></span>');
        HTP.p('  </div>');
        HTP.p('  <div class="member-info">');
        HTP.p('    <div class="member-name">'
              || HTF.ESCAPE_SC(mem.full_name)
              || CASE WHEN l_me THEN ' <span style="color:var(--text-3);font-size:11px;font-weight:400">(bạn)</span>' END
              || '</div>');
        IF mem.dep_name IS NOT NULL THEN
          HTP.p('    <div class="member-role">' || HTF.ESCAPE_SC(mem.dep_name) || '</div>');
        END IF;
        HTP.p('  </div>');
        IF mem.is_admin = 1 THEN
          HTP.p('  <span class="member-badge admin">QUẢN TRỊ</span>');
        END IF;
        HTP.p('</div>');
      END;
    END LOOP;

    -- Update count badge via inline script
    HTP.p('<script>');
    HTP.p('(function(){ var el=document.getElementById("dc-member-count");');
    HTP.p('  if(el) el.textContent=' || l_count || '; })();');
    HTP.p('</script>');
    HTP.p('</div>'); -- .info-section members

    -- ── SECTION 4: Files placeholder ─────────────────────────────
    HTP.p('<div class="info-section">');
    HTP.p('  <div class="info-section-title">');
    HTP.p('    <span class="fa fa-paperclip"></span> File đã chia sẻ');
    HTP.p('    <span class="count">0</span>');
    HTP.p('  </div>');
    HTP.p('  <div style="text-align:center;padding:16px 0;color:var(--text-4);font-size:12.5px">');
    HTP.p('    <span class="fa fa-inbox" style="font-size:22px;display:block;margin-bottom:6px"></span>');
    HTP.p('    Chưa có file nào');
    HTP.p('  </div>');
    HTP.p('</div>');
  END;
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('<div class="dc-err">Lỗi: ' || HTF.ESCAPE_SC(SQLERRM) || '</div>');
END;


-- ============================================================
-- 4. dcContactsHtml
--    Trả HTML form chọn thành viên để tạo hội thoại.
--    Không tham số. Dùng MATERIALIZE + l_online_cutoff.
--    JS trong doc-chat-page.js xử lý toàn bộ interaction.
-- ============================================================
DECLARE
  l_aus_id        NUMBER;
  l_online_cutoff TIMESTAMP := SYSTIMESTAMP - INTERVAL '35' SECOND;
BEGIN
  OWA_UTIL.MIME_HEADER('text/html', TRUE, 'UTF-8');

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('<div class="dc-err">Phiên đăng nhập hết hạn</div>'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('<div class="dc-err">Không tìm thấy user</div>'); RETURN;
  END;

  -- 1. Doc context banner (JS sẽ điền text qua injectCreateContext())
  HTP.p('<div class="dc-create-context">');
  HTP.p('  <span class="fa fa-hashtag" style="font-size:11px"></span>');
  HTP.p('  Hội thoại gắn với chứng từ <b id="dc-create-doc-ref">—</b>');
  HTP.p('</div>');

  -- 2. Conv type tabs
  HTP.p('<div class="form-field">');
  HTP.p('  <span class="form-label">Loại hội thoại</span>');
  HTP.p('  <div class="dc-type-tabs" style="margin-top:4px">');
  HTP.p('    <label class="dc-type-tab active">');
  HTP.p('      <input type="radio" name="dc-conv-type" value="DM" checked>');
  HTP.p('      <span class="fa fa-user"></span> Nhắn tin riêng');
  HTP.p('    </label>');
  HTP.p('    <label class="dc-type-tab">');
  HTP.p('      <input type="radio" name="dc-conv-type" value="CHANNEL">');
  HTP.p('      <span class="fa fa-users"></span> Tạo nhóm');
  HTP.p('    </label>');
  HTP.p('  </div>');
  HTP.p('</div>');

  -- 3. Group name (hidden until CHANNEL selected)
  HTP.p('<div id="dc-create-name-wrap" class="form-field" style="display:none">');
  HTP.p('  <span class="form-label">Tên nhóm <span style="color:var(--danger)">*</span></span>');
  HTP.p('  <input type="text" id="dc-create-name" class="form-input" placeholder="Ví dụ: Duyệt giá &amp; chiết khấu"/>');
  HTP.p('  <span style="font-size:11px;color:var(--text-3)">Nhập tên nhóm, hoặc để trống để lấy mặc định.</span>');
  HTP.p('</div>');

  -- 4. Selected chips area
  HTP.p('<div class="form-field">');
  HTP.p('  <span class="form-label">Đã chọn (<span id="dc-selected-count">0</span>)</span>');
  HTP.p('  <div class="member-pick" id="dc-selected-chips">');
  HTP.p('    <span style="color:var(--text-4);font-size:13px;padding:4px">Chưa chọn thành viên nào</span>');
  HTP.p('  </div>');
  HTP.p('</div>');

  -- 5. Search input
  HTP.p('<div class="form-field" style="gap:6px">');
  HTP.p('  <input type="text" class="form-input" id="dc-contact-search" placeholder="Tìm theo tên hoặc phòng ban..."/>');
  HTP.p('</div>');

  -- 6. Member list — nhóm theo phòng ban
  HTP.p('<div class="member-suggest" id="dc-member-suggest-list">');

  DECLARE
    l_prev_dep VARCHAR2(200) := '~~init~~';
  BEGIN
    FOR usr IN (
      WITH users_raw AS (
        SELECT /*+ MATERIALIZE */
          u.aus_id,
          REGEXP_REPLACE(NVL(e.full_name,'Unknown'), '[[:cntrl:]]', '') AS full_name,
          REGEXP_REPLACE(NVL(d.dep_name,'Khác'),     '[[:cntrl:]]', '') AS dep_name
        FROM APP_USERS u
        JOIN EMPLOYEES e ON e.emp_id = u.emp_id
        LEFT JOIN DEPARTMENTS d ON d.dep_id = e.dep_id
        WHERE u.aus_id != l_aus_id
      )
      SELECT r.aus_id, r.full_name, r.dep_name,
             CASE WHEN o.last_seen >= l_online_cutoff THEN 'online' ELSE 'offline' END AS presence
      FROM   users_raw r
      LEFT JOIN CHAT_USER_ONLINE o ON o.aus_id = r.aus_id
      ORDER  BY r.dep_name, r.full_name
    ) LOOP
      IF usr.dep_name <> l_prev_dep THEN
        HTP.p('<div class="dc-dept-h" data-dept-header="1">'
              || HTF.ESCAPE_SC(usr.dep_name) || '</div>');
        l_prev_dep := usr.dep_name;
      END IF;

      DECLARE
        l_av   VARCHAR2(4)   := UPPER(SUBSTR(REGEXP_SUBSTR(usr.full_name,'\S+$'),1,1));
        l_hue  VARCHAR2(10)  := TO_CHAR(MOD(usr.aus_id * 47, 360));
        l_name VARCHAR2(200) := HTF.ESCAPE_SC(usr.full_name);
        l_dept VARCHAR2(200) := HTF.ESCAPE_SC(usr.dep_name);
      BEGIN
        HTP.p('<div class="member-suggest-item"');
        HTP.p('     data-aus-id="' || usr.aus_id || '"');
        HTP.p('     data-name="'   || REPLACE(l_name,'"','&quot;') || '"');
        HTP.p('     data-dept="'   || REPLACE(l_dept,'"','&quot;') || '"');
        HTP.p('     data-hue="'    || l_hue || '">');
        HTP.p('  <div class="member-avatar" style="width:32px;height:32px;font-size:12px;background:hsl('
              || l_hue || ',55%,52%)">');
        HTP.p('    ' || NVL(l_av,'?'));
        HTP.p('    <span class="presence ' || usr.presence || '"></span>');
        HTP.p('  </div>');
        HTP.p('  <div class="member-info">');
        HTP.p('    <div class="member-name">' || l_name || '</div>');
        HTP.p('    <div class="member-role">' || l_dept || '</div>');
        HTP.p('  </div>');
        HTP.p('  <div class="dc-checkbox"></div>');
        HTP.p('</div>');
      END;
    END LOOP;
  END;

  HTP.p('</div>'); -- #dc-member-suggest-list
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('<div class="dc-err">Lỗi: ' || HTF.ESCAPE_SC(SQLERRM) || '</div>');
END;
