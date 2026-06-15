-- ============================================================
-- DOC CHAT MODAL — Native APEX Page Callbacks (HTML-returning)
-- Tất cả là PAGE-LEVEL AJAX CALLBACK trên page 10022710201
-- Nexus redesign — class names mới, cấu trúc HTML mới.
-- ============================================================
-- Callback trả HTML (dataType:'text'):
--   dcConvListHtml   x01=doc_type | x02=doc_no | x03=filter | x04=search
--   dcMsgThreadHtml  x01=conv_id  | x02=search_query
--   dcInfoHtml       x01=conv_id
--   dcContactsHtml   x01=format(DM|GROUP)
--
-- Callback trả JSON (không đổi):
--   docChatCreate / docChatSend / docChatRead / docChatTyping
-- ============================================================


-- ============================================================
-- 1. dcConvListHtml
--    Inject vào #lp-conv-list (bên trong S1 của slider)
--    Chỉ output list items — toolbar/search/filter là static HTML
--    x01=doc_type | x02=doc_no | x03=filter(ALL/DOC/CHANNEL/DM) | x04=search
-- ============================================================
DECLARE
  l_aus_id        NUMBER;
  l_doc_type      VARCHAR2(50)  := TRIM(apex_application.g_x01);
  l_doc_no        VARCHAR2(100) := TRIM(apex_application.g_x02);
  l_filter        VARCHAR2(20)  := NVL(UPPER(TRIM(apex_application.g_x03)), 'ALL');
  l_search        VARCHAR2(200) := LOWER(TRIM(apex_application.g_x04));
  l_online_cutoff TIMESTAMP     := SYSTIMESTAMP - INTERVAL '35' SECOND;
  l_doc_count     NUMBER        := 0;
  l_other_count   NUMBER        := 0;
  l_dummy         NUMBER;
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

  -- Count doc-scoped convs
  IF l_filter IN ('ALL', 'DOC', 'CHANNEL', 'DM') THEN
    SELECT COUNT(*) INTO l_doc_count
    FROM CHAT_CONVERSATIONS c
    JOIN CHAT_PARTICIPANTS p ON p.conv_id = c.conv_id AND p.aus_id = l_aus_id
    WHERE c.doc_type = l_doc_type AND c.doc_no = l_doc_no
      AND (l_filter = 'ALL' OR l_filter = 'DOC'
           OR (l_filter = 'CHANNEL' AND c.conv_type = 'CHANNEL')
           OR (l_filter = 'DM'      AND c.conv_type = 'DM'))
      AND (l_search IS NULL
           OR LOWER(NVL(c.name,'')) LIKE '%' || l_search || '%'
           OR LOWER(NVL(c.last_msg_preview,'')) LIKE '%' || l_search || '%');
  END IF;

  -- Count other convs (doc_type IS NULL — general)
  IF l_filter IN ('ALL', 'CHANNEL', 'DM') THEN
    SELECT COUNT(*) INTO l_other_count
    FROM CHAT_CONVERSATIONS c
    JOIN CHAT_PARTICIPANTS p ON p.conv_id = c.conv_id AND p.aus_id = l_aus_id
    WHERE c.doc_type IS NULL AND c.doc_no IS NULL
      AND (l_filter = 'ALL'
           OR (l_filter = 'CHANNEL' AND c.conv_type = 'CHANNEL')
           OR (l_filter = 'DM'      AND c.conv_type = 'DM'))
      AND (l_search IS NULL
           OR LOWER(NVL(c.name,'')) LIKE '%' || l_search || '%'
           OR LOWER(NVL(c.last_msg_preview,'')) LIKE '%' || l_search || '%');
  END IF;

  IF l_doc_count + l_other_count = 0 THEN
    HTP.p('<div style="text-align:center;color:var(--n-400);padding:40px 16px;font-size:13px">');
    HTP.p('  Chưa có hội thoại nào.');
    HTP.p('</div>');
    RETURN;
  END IF;

  -- ── SECTION: Chứng từ này ────────────────────────────────────
  IF l_doc_count > 0 THEN
    HTP.p('<div class="lp-section-label">Chứng từ này</div>');
    FOR conv IN (
      SELECT c.conv_id,
             c.conv_type,
             NVL(c.name,'(Không tên)')                  AS display_name,
             c.last_msg_preview,
             CASE WHEN c.last_msg_date >= TRUNC(SYSDATE)
                  THEN TO_CHAR(c.last_msg_date,'HH24:MI')
                  ELSE TO_CHAR(c.last_msg_date,'DD/MM') END AS display_time,
             p.last_read_msg_id,
             (SELECT p2.aus_id FROM CHAT_PARTICIPANTS p2
              WHERE p2.conv_id = c.conv_id AND p2.aus_id != l_aus_id
              FETCH FIRST 1 ROW ONLY)                    AS partner_aus_id,
             (SELECT COUNT(*) FROM CHAT_MESSENGERS m
              WHERE m.conv_id = c.conv_id AND m.delete_date IS NULL
                AND m.msg_id > NVL(p.last_read_msg_id,0)) AS unread_count,
             (SELECT m.from_aus_id FROM CHAT_MESSENGERS m
              WHERE m.conv_id = c.conv_id AND m.delete_date IS NULL
              ORDER BY m.msg_id DESC FETCH FIRST 1 ROW ONLY) AS last_sender_aus_id
      FROM CHAT_CONVERSATIONS c
      JOIN CHAT_PARTICIPANTS p ON p.conv_id = c.conv_id AND p.aus_id = l_aus_id
      WHERE c.doc_type = l_doc_type AND c.doc_no = l_doc_no
        AND (l_filter = 'ALL' OR l_filter = 'DOC'
             OR (l_filter = 'CHANNEL' AND c.conv_type = 'CHANNEL')
             OR (l_filter = 'DM'      AND c.conv_type = 'DM'))
        AND (l_search IS NULL
             OR LOWER(NVL(c.name,'')) LIKE '%' || l_search || '%'
             OR LOWER(NVL(c.last_msg_preview,'')) LIKE '%' || l_search || '%')
      ORDER BY c.last_msg_date DESC NULLS LAST
    ) LOOP
      DECLARE
        l_is_dm    BOOLEAN      := (conv.conv_type = 'DM');
        l_unread   BOOLEAN      := (conv.unread_count > 0);
        l_name     VARCHAR2(200);
        l_initl    VARCHAR2(4);
        l_hue      VARCHAR2(10);
        l_sender   VARCHAR2(200);
      BEGIN
        l_name   := REGEXP_REPLACE(NVL(conv.display_name,'?'), '[[:cntrl:]]', '');
        l_initl  := UPPER(SUBSTR(REGEXP_SUBSTR(l_name,'\S+$'),1,1));
        l_hue    := TO_CHAR(MOD(NVL(CASE WHEN l_is_dm THEN conv.partner_aus_id
                                         ELSE conv.conv_id END, 0)*47, 360));
        l_sender := CASE WHEN conv.last_sender_aus_id = l_aus_id THEN 'Bạn' END;

        HTP.p('<button type="button" class="dc-conv-item' || CASE WHEN l_unread THEN ' unread' END || '"');
        HTP.p('  data-conv-id="' || conv.conv_id || '"');
        HTP.p('  data-partner-aus-id="' || NVL(TO_CHAR(conv.partner_aus_id),'') || '">');

        HTP.p('  <div class="dc-av-wrap">');
        IF l_is_dm THEN
          -- DM: avatar màu + initial
          HTP.p('    <div class="dc-av" style="background:hsl(' || l_hue || ',55%,52%)">'
                || NVL(l_initl,'?') || '</div>');
          -- Presence dot (no DB link query needed — CHAT_USER_ONLINE is local)
          DECLARE l_online BOOLEAN := FALSE; BEGIN
            BEGIN
              SELECT 1 INTO l_dummy FROM CHAT_USER_ONLINE
              WHERE aus_id = conv.partner_aus_id AND last_seen >= l_online_cutoff;
              l_online := TRUE;
            EXCEPTION WHEN NO_DATA_FOUND THEN NULL; END;
            HTP.p('    <div class="dc-av-presence' || CASE WHEN l_online THEN '' ELSE ' offline' END || '"></div>');
          END;
        ELSE
          -- Group/Channel: square avatar với document icon
          HTP.p('    <div class="dc-av square group" style="font-size:11px;">');
          HTP.p('      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">');
          HTP.p('        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>');
          HTP.p('        <polyline points="14 2 14 8 20 8"/></svg>');
          HTP.p('    </div>');
        END IF;
        HTP.p('  </div>');

        HTP.p('  <div class="dc-conv-content">');
        HTP.p('    <div class="dc-conv-row1">');
        HTP.p('      <span class="dc-conv-name">' || HTF.ESCAPE_SC(l_name) || '</span>');
        HTP.p('      <span class="dc-conv-time">' || NVL(conv.display_time,'') || '</span>');
        HTP.p('    </div>');
        HTP.p('    <div class="dc-conv-row2">');
        HTP.p('      <span class="dc-conv-preview">'
              || CASE WHEN l_sender IS NOT NULL
                 THEN '<span class="dc-conv-sender">' || HTF.ESCAPE_SC(l_sender) || ':</span> ' END
              || HTF.ESCAPE_SC(SUBSTR(NVL(conv.last_msg_preview,''),1,55)) || '</span>');
        IF l_unread THEN
          HTP.p('      <div class="dc-conv-badge">' || conv.unread_count || '</div>');
        END IF;
        HTP.p('    </div>');
        HTP.p('  </div>');
        HTP.p('</button>');
      END;
    END LOOP;
  END IF; -- doc section

  -- ── SECTION: Hội thoại khác (general) ───────────────────────
  IF l_other_count > 0 THEN
    HTP.p('<div class="lp-section-label" style="margin-top:4px">Hội thoại khác</div>');
    FOR conv IN (
      SELECT c.conv_id,
             c.conv_type,
             NVL(c.name,'(Không tên)')                  AS display_name,
             c.last_msg_preview,
             CASE WHEN c.last_msg_date >= TRUNC(SYSDATE)
                  THEN TO_CHAR(c.last_msg_date,'HH24:MI')
                  ELSE TO_CHAR(c.last_msg_date,'DD/MM') END AS display_time,
             p.last_read_msg_id,
             (SELECT p2.aus_id FROM CHAT_PARTICIPANTS p2
              WHERE p2.conv_id = c.conv_id AND p2.aus_id != l_aus_id
              FETCH FIRST 1 ROW ONLY)                    AS partner_aus_id,
             (SELECT COUNT(*) FROM CHAT_MESSENGERS m
              WHERE m.conv_id = c.conv_id AND m.delete_date IS NULL
                AND m.msg_id > NVL(p.last_read_msg_id,0)) AS unread_count,
             (SELECT m.from_aus_id FROM CHAT_MESSENGERS m
              WHERE m.conv_id = c.conv_id AND m.delete_date IS NULL
              ORDER BY m.msg_id DESC FETCH FIRST 1 ROW ONLY) AS last_sender_aus_id
      FROM CHAT_CONVERSATIONS c
      JOIN CHAT_PARTICIPANTS p ON p.conv_id = c.conv_id AND p.aus_id = l_aus_id
      WHERE c.doc_type IS NULL AND c.doc_no IS NULL
        AND (l_filter = 'ALL'
             OR (l_filter = 'CHANNEL' AND c.conv_type = 'CHANNEL')
             OR (l_filter = 'DM'      AND c.conv_type = 'DM'))
        AND (l_search IS NULL
             OR LOWER(NVL(c.name,'')) LIKE '%' || l_search || '%'
             OR LOWER(NVL(c.last_msg_preview,'')) LIKE '%' || l_search || '%')
      ORDER BY c.last_msg_date DESC NULLS LAST
    ) LOOP
      DECLARE
        l_is_dm    BOOLEAN      := (conv.conv_type = 'DM');
        l_unread   BOOLEAN      := (conv.unread_count > 0);
        l_name     VARCHAR2(200);
        l_initl    VARCHAR2(4);
        l_hue      VARCHAR2(10);
        l_sender   VARCHAR2(200);
      BEGIN
        l_name   := REGEXP_REPLACE(NVL(conv.display_name,'?'), '[[:cntrl:]]', '');
        l_initl  := UPPER(SUBSTR(REGEXP_SUBSTR(l_name,'\S+$'),1,1));
        l_hue    := TO_CHAR(MOD(NVL(CASE WHEN l_is_dm THEN conv.partner_aus_id
                                         ELSE conv.conv_id END, 0)*47, 360));
        l_sender := CASE WHEN conv.last_sender_aus_id = l_aus_id THEN 'Bạn' END;

        HTP.p('<button type="button" class="dc-conv-item' || CASE WHEN l_unread THEN ' unread' END || '"');
        HTP.p('  data-conv-id="' || conv.conv_id || '"');
        HTP.p('  data-partner-aus-id="' || NVL(TO_CHAR(conv.partner_aus_id),'') || '">');

        HTP.p('  <div class="dc-av-wrap">');
        IF l_is_dm THEN
          HTP.p('    <div class="dc-av" style="background:hsl(' || l_hue || ',55%,52%)">'
                || NVL(l_initl,'?') || '</div>');
          DECLARE l_online BOOLEAN := FALSE; BEGIN
            BEGIN
              SELECT 1 INTO l_dummy FROM CHAT_USER_ONLINE
              WHERE aus_id = conv.partner_aus_id AND last_seen >= l_online_cutoff;
              l_online := TRUE;
            EXCEPTION WHEN NO_DATA_FOUND THEN NULL; END;
            HTP.p('    <div class="dc-av-presence' || CASE WHEN l_online THEN '' ELSE ' offline' END || '"></div>');
          END;
        ELSE
          HTP.p('    <div class="dc-av square group">');
          HTP.p('      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">');
          HTP.p('        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>');
          HTP.p('        <circle cx="9" cy="7" r="4"/>');
          HTP.p('        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>');
          HTP.p('    </div>');
          HTP.p('    <div class="dc-av-type-dot group">');
          HTP.p('      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round">');
          HTP.p('        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>');
          HTP.p('        <circle cx="9" cy="7" r="4"/></svg>');
          HTP.p('    </div>');
        END IF;
        HTP.p('  </div>');

        HTP.p('  <div class="dc-conv-content">');
        HTP.p('    <div class="dc-conv-row1">');
        HTP.p('      <span class="dc-conv-name">' || HTF.ESCAPE_SC(l_name) || '</span>');
        HTP.p('      <span class="dc-conv-time">' || NVL(conv.display_time,'') || '</span>');
        HTP.p('    </div>');
        HTP.p('    <div class="dc-conv-row2">');
        HTP.p('      <span class="dc-conv-preview">'
              || CASE WHEN l_sender IS NOT NULL
                 THEN '<span class="dc-conv-sender">' || HTF.ESCAPE_SC(l_sender) || ':</span> ' END
              || HTF.ESCAPE_SC(SUBSTR(NVL(conv.last_msg_preview,''),1,55)) || '</span>');
        IF l_unread THEN
          HTP.p('      <div class="dc-conv-badge">' || conv.unread_count || '</div>');
        END IF;
        HTP.p('    </div>');
        HTP.p('  </div>');
        HTP.p('</button>');
      END;
    END LOOP;
  END IF; -- other section

EXCEPTION
  WHEN OTHERS THEN
    HTP.p('<div class="dc-err">Lỗi: ' || HTF.ESCAPE_SC(SQLERRM) || '</div>');
END;


-- ============================================================
-- 2. dcMsgThreadHtml
--    Inject vào #dc-messages
--    x01=conv_id | x02=search_query
--    MATERIALIZE vì REGEXP_REPLACE trên remote column.
-- ============================================================
DECLARE
  l_conv_id  NUMBER        := TO_NUMBER(NVL(TRIM(apex_application.g_x01),'0'));
  l_search   VARCHAR2(200) := LOWER(TRIM(apex_application.g_x02));
  l_aus_id   NUMBER;
  l_last_day DATE          := NULL;
BEGIN
  OWA_UTIL.MIME_HEADER('text/html', TRUE, 'UTF-8');

  IF l_conv_id = 0 THEN
    HTP.p('<div style="text-align:center;color:var(--n-400);margin-top:60px;font-size:13px">← Chọn hội thoại</div>');
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
    HTP.p('<div style="padding:6px 16px 2px;font-size:12px;color:var(--n-400)">');
    HTP.p('  Kết quả: <strong>' || HTF.ESCAPE_SC(apex_application.g_x02) || '</strong>');
    HTP.p('</div>');
  END IF;

  FOR msg IN (
    WITH msg_raw AS (
      SELECT /*+ MATERIALIZE */
        m.msg_id,
        m.from_aus_id,
        u.emp_id,
        REGEXP_REPLACE(NVL(e.full_name,'Unknown'), '[[:cntrl:]]', '') AS from_name,
        CASE WHEN m.delete_date IS NOT NULL THEN NULL ELSE m.body END  AS body,
        m.delete_date,
        m.reply_to_msg_id,
        TRUNC(m.create_date)              AS msg_day,
        TO_CHAR(m.create_date,'HH24:MI') AS msg_time,
        CASE WHEN qm.delete_date IS NOT NULL THEN '[Tin nhắn đã bị xóa]'
             ELSE qm.body END             AS reply_body,
        REGEXP_REPLACE(NVL(qe.full_name,''), '[[:cntrl:]]', '') AS reply_from_name
      FROM   CHAT_MESSENGERS m
      JOIN   APP_USERS       u  ON u.aus_id  = m.from_aus_id
      JOIN   EMPLOYEES       e  ON e.emp_id  = u.emp_id
      LEFT JOIN CHAT_MESSENGERS qm ON qm.msg_id = m.reply_to_msg_id
      LEFT JOIN APP_USERS    qu  ON qu.aus_id = qm.from_aus_id
      LEFT JOIN EMPLOYEES    qe  ON qe.emp_id = qu.emp_id
      WHERE  m.conv_id = l_conv_id
        AND  (l_search IS NULL OR LOWER(m.body) LIKE '%' || l_search || '%')
      ORDER  BY m.msg_id ASC
      FETCH FIRST 50 ROWS ONLY
    )
    SELECT mr.*, vf.v_file_name AS img
    FROM   msg_raw mr
    LEFT JOIN v_employees_v6 vf ON vf.emp_id = mr.emp_id
  ) LOOP

    -- Date separator
    IF l_last_day IS NULL OR msg.msg_day > l_last_day THEN
      l_last_day := msg.msg_day;
      HTP.p('<div class="dc-date-sep">' || TO_CHAR(msg.msg_day,'DD tháng MM, YYYY') || '</div>');
    END IF;

    DECLARE
      l_mine     BOOLEAN       := (msg.from_aus_id = l_aus_id);
      l_av       VARCHAR2(4)   := UPPER(SUBSTR(REGEXP_SUBSTR(msg.from_name,'\S+$'),1,1));
      l_hue      VARCHAR2(10)  := TO_CHAR(MOD(msg.from_aus_id * 47, 360));
      l_body_esc VARCHAR2(32767);
    BEGIN
      IF l_av IS NULL THEN l_av := '?'; END IF;

      -- SVG icons tái dùng cho msg-actions
      HTP.p('<div class="message-group' || CASE WHEN l_mine THEN ' msg-me-wrap' END || '"');
      HTP.p('     data-msg-id="' || msg.msg_id || '">');

      -- Hover actions
      IF msg.delete_date IS NULL THEN
        HTP.p('  <div class="msg-actions">');
        HTP.p('    <button type="button" class="msg-action-btn" data-action="reply" title="Trả lời">');
        HTP.p('      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">');
        HTP.p('        <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>');
        HTP.p('    </button>');
        HTP.p('    <button type="button" class="msg-action-btn" title="Thêm">');
        HTP.p('      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">');
        HTP.p('        <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>');
        HTP.p('    </button>');
        HTP.p('  </div>');
      END IF;

      IF l_mine THEN
        -- My messages: right-aligned bubble
        HTP.p('  <div class="msg-me-inner">');
        HTP.p('    <div class="msg-me-time">' || msg.msg_time || '</div>');
        HTP.p('    <div class="msg-me-bubble">');
        -- Reply quote (mine)
        IF msg.reply_to_msg_id IS NOT NULL THEN
          HTP.p('      <div class="reply-quote-me">');
          IF msg.reply_from_name IS NOT NULL THEN
            HTP.p('        <div class="rq-name">' || HTF.ESCAPE_SC(msg.reply_from_name) || '</div>');
          END IF;
          HTP.p('        <div class="rq-text">' || HTF.ESCAPE_SC(SUBSTR(NVL(msg.reply_body,''),1,80)) || '</div>');
          HTP.p('      </div>');
        END IF;
        -- Body
        IF msg.delete_date IS NOT NULL THEN
          HTP.p('      <em style="opacity:.6;font-style:italic">Tin nhắn đã bị thu hồi</em>');
        ELSE
          l_body_esc := REPLACE(REPLACE(
            REPLACE(REPLACE(HTF.ESCAPE_SC(NVL(msg.body,'')), '&#38;', '&amp;'),
            '&#60;', '&lt;'), CHR(13), ''), CHR(10), '<br>');
          HTP.p('      ' || l_body_esc);
        END IF;
        HTP.p('    </div>');
        HTP.p('  </div>');

      ELSE
        -- Other's messages: avatar + bubble
        HTP.p('  <div class="msg-inner">');
        -- Avatar
        HTP.p('    <div class="msg-avatar-col" style="background:hsl(' || l_hue || ',55%,52%)">');
        IF msg.img IS NOT NULL THEN
          HTP.p('      <img class="av-img" loading="lazy" onerror="this.remove()" src="' || HTF.ESCAPE_SC(msg.img) || '">');
        END IF;
        HTP.p('      ' || l_av || '</div>');
        -- Content
        HTP.p('    <div class="msg-content-col">');
        HTP.p('      <div class="msg-header">');
        HTP.p('        <span class="msg-sender">' || HTF.ESCAPE_SC(msg.from_name) || '</span>');
        HTP.p('        <span class="msg-time">' || msg.msg_time || '</span>');
        HTP.p('      </div>');
        -- Reply quote (other)
        IF msg.reply_to_msg_id IS NOT NULL THEN
          HTP.p('      <div class="reply-quote">');
          IF msg.reply_from_name IS NOT NULL THEN
            HTP.p('        <div class="rq-name">' || HTF.ESCAPE_SC(msg.reply_from_name) || '</div>');
          END IF;
          HTP.p('        <div class="rq-text">' || HTF.ESCAPE_SC(SUBSTR(NVL(msg.reply_body,''),1,80)) || '</div>');
          HTP.p('      </div>');
        END IF;
        -- Body
        IF msg.delete_date IS NOT NULL THEN
          HTP.p('      <div class="msg-text" style="opacity:.6;font-style:italic">Tin nhắn đã bị thu hồi</div>');
        ELSE
          l_body_esc := REPLACE(REPLACE(
            REPLACE(REPLACE(HTF.ESCAPE_SC(NVL(msg.body,'')), '&#38;', '&amp;'),
            '&#60;', '&lt;'), CHR(13), ''), CHR(10), '<br>');
          HTP.p('      <div class="msg-text">' || l_body_esc || '</div>');
        END IF;
        HTP.p('    </div>'); -- .msg-content-col
        HTP.p('  </div>'); -- .msg-inner
      END IF;

      HTP.p('</div>'); -- .message-group
    END;
  END LOOP;

  -- Empty state
  IF l_last_day IS NULL THEN
    IF l_search IS NOT NULL THEN
      HTP.p('<div style="text-align:center;color:var(--n-400);margin-top:60px;font-size:13px">Không tìm thấy tin nhắn nào.</div>');
    ELSE
      HTP.p('<div style="text-align:center;color:var(--n-400);margin-top:60px;font-size:13px">Chưa có tin nhắn. Hãy bắt đầu trò chuyện!</div>');
    END IF;
  END IF;

  -- Typing indicator placeholder (hidden by default, JS toggle)
  HTP.p('<div id="dc-typing-row" style="display:none;align-items:center;gap:8px;padding:4px 16px 8px;">');
  HTP.p('  <div class="msg-avatar-col" style="width:28px;height:28px;background:var(--n-300);font-size:10px;"></div>');
  HTP.p('  <div class="dc-typing-bubble">');
  HTP.p('    <div class="dc-typing-dot"></div>');
  HTP.p('    <div class="dc-typing-dot"></div>');
  HTP.p('    <div class="dc-typing-dot"></div>');
  HTP.p('    <span class="dc-typing-label"></span>');
  HTP.p('  </div>');
  HTP.p('</div>');

  HTP.p('<div style="height:16px;"></div>');

EXCEPTION
  WHEN OTHERS THEN
    HTP.p('<div class="dc-err">Lỗi: ' || HTF.ESCAPE_SC(SQLERRM) || '</div>');
END;


-- ============================================================
-- 3. dcInfoHtml
--    Inject vào #dc-right-panel
--    Section 1: Voucher card (shell — JS patch via injectDocFields)
--    Section 2: Quick actions
--    Section 3: Members (collapsible)
--    Section 4: Files placeholder (collapsible)
--    x01=conv_id
-- ============================================================
DECLARE
  l_conv_id       NUMBER    := TO_NUMBER(NVL(TRIM(apex_application.g_x01),'0'));
  l_online_cutoff TIMESTAMP := SYSTIMESTAMP - INTERVAL '35' SECOND;
  l_aus_id        NUMBER;
BEGIN
  OWA_UTIL.MIME_HEADER('text/html', TRUE, 'UTF-8');

  -- ── Voucher card shell (JS fills via injectDocFields) ─────────
  HTP.p('<div class="dc-voucher-card">');
  HTP.p('  <div class="dc-voucher-no">');
  HTP.p('    <span id="dc-doc-no">—</span>');
  HTP.p('    <span class="dc-voucher-status" id="dc-doc-status"></span>');
  HTP.p('  </div>');
  HTP.p('  <div class="dc-voucher-type" id="dc-doc-label"></div>');
  HTP.p('  <div class="dc-voucher-rows" id="dc-doc-fields-placeholder"></div>');
  HTP.p('  <hr class="dc-voucher-divider">');
  HTP.p('  <div class="dc-voucher-row"><span class="k">Tổng tiền</span><span class="v money" id="dc-doc-total">—</span></div>');
  HTP.p('</div>');

  -- ── Quick actions ─────────────────────────────────────────────
  HTP.p('<div class="dc-rp-actions" style="padding:12px 12px 4px;">');
  HTP.p('  <button type="button" class="dc-rp-action" id="dc-qa-open">');
  HTP.p('    <div class="dc-rp-action-icon">');
  HTP.p('      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">');
  HTP.p('        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>');
  HTP.p('        <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>');
  HTP.p('    </div>');
  HTP.p('    <span class="dc-rp-action-label">Mở đơn</span>');
  HTP.p('  </button>');
  HTP.p('  <button type="button" class="dc-rp-action" id="dc-qa-search">');
  HTP.p('    <div class="dc-rp-action-icon">');
  HTP.p('      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">');
  HTP.p('        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>');
  HTP.p('    </div>');
  HTP.p('    <span class="dc-rp-action-label">Tìm tin</span>');
  HTP.p('  </button>');
  HTP.p('</div>');

  IF l_conv_id = 0 THEN
    HTP.p('<div style="padding:16px;color:var(--n-400);font-size:13px">Chọn hội thoại để xem thành viên</div>');
    RETURN;
  END IF;

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN RETURN; END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN;
  END;

  -- ── Members section ───────────────────────────────────────────
  DECLARE
    l_count NUMBER := 0;
  BEGIN
    HTP.p('<div class="dc-rp-section">');
    HTP.p('  <div class="dc-rp-section-header" onclick="this.nextElementSibling.classList.toggle(''collapsed'');this.querySelector(''svg'').style.transform=this.nextElementSibling.classList.contains(''collapsed'')?''rotate(180deg)'':''''">');
    HTP.p('    <span class="dc-rp-section-title" id="dc-member-count-title">Thành viên</span>');
    HTP.p('    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--n-400)" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>');
    HTP.p('  </div>');
    HTP.p('  <div class="dc-rp-section-body">');

    FOR mem IN (
      WITH members_raw AS (
        SELECT /*+ MATERIALIZE */
          p.aus_id,
          p.is_admin,
          u.emp_id,
          REGEXP_REPLACE(NVL(e.full_name,'Unknown'), '[[:cntrl:]]', '') AS full_name,
          REGEXP_REPLACE(NVL(d.dep_name,''),         '[[:cntrl:]]', '') AS dep_name
        FROM CHAT_PARTICIPANTS p
        JOIN APP_USERS    u ON u.aus_id = p.aus_id
        JOIN EMPLOYEES    e ON e.emp_id = u.emp_id
        LEFT JOIN DEPARTMENTS d ON d.dep_id = e.dep_id
        WHERE p.conv_id = l_conv_id
      )
      SELECT r.aus_id, r.is_admin, r.full_name, r.dep_name,
             vf.v_file_name AS img,
             CASE WHEN o.last_seen >= l_online_cutoff THEN 'online' ELSE 'offline' END AS presence
      FROM members_raw r
      LEFT JOIN CHAT_USER_ONLINE  o  ON o.aus_id  = r.aus_id
      LEFT JOIN v_employees_v6    vf ON vf.emp_id = r.emp_id
      ORDER BY r.is_admin DESC, r.full_name
    ) LOOP
      l_count := l_count + 1;
      DECLARE
        l_av  VARCHAR2(4)  := UPPER(SUBSTR(REGEXP_SUBSTR(mem.full_name,'\S+$'),1,1));
        l_hue VARCHAR2(10) := TO_CHAR(MOD(mem.aus_id * 47, 360));
        l_me  BOOLEAN      := (mem.aus_id = l_aus_id);
      BEGIN
        HTP.p('<div class="dc-rp-member">');
        HTP.p('  <div class="dc-rp-member-av" style="background:hsl(' || l_hue || ',55%,52%)">');
        IF mem.img IS NOT NULL THEN
          HTP.p('    <img class="av-img" loading="lazy" onerror="this.remove()" src="' || HTF.ESCAPE_SC(mem.img) || '">');
        END IF;
        HTP.p('    ' || NVL(l_av,'?') || '</div>');
        HTP.p('  <div>');
        HTP.p('    <div class="dc-rp-member-name">' || HTF.ESCAPE_SC(mem.full_name)
              || CASE WHEN l_me THEN ' <span style="color:var(--n-400);font-size:11px;font-weight:400">(bạn)</span>' END
              || '</div>');
        IF mem.dep_name IS NOT NULL THEN
          HTP.p('    <div class="dc-rp-member-role">' || HTF.ESCAPE_SC(mem.dep_name) || '</div>');
        END IF;
        HTP.p('  </div>');
        IF mem.is_admin = 1 THEN
          HTP.p('  <span class="dc-rp-badge owner">Owner</span>');
        END IF;
        HTP.p('</div>');
      END;
    END LOOP;

    -- Update section title with count
    HTP.p('<script>(function(){');
    HTP.p('  var el=document.getElementById("dc-member-count-title");');
    HTP.p('  if(el) el.textContent="Thành viên (' || l_count || ')";');
    HTP.p('})();</script>');

    HTP.p('  </div>'); -- .dc-rp-section-body
    HTP.p('</div>'); -- .dc-rp-section members
  END;

  -- ── Files section placeholder ─────────────────────────────────
  HTP.p('<div class="dc-rp-section">');
  HTP.p('  <div class="dc-rp-section-header" onclick="this.nextElementSibling.classList.toggle(''collapsed'');this.querySelector(''svg'').style.transform=this.nextElementSibling.classList.contains(''collapsed'')?''rotate(180deg)'':''''">');
  HTP.p('    <span class="dc-rp-section-title">File đã chia sẻ</span>');
  HTP.p('    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--n-400)" stroke-width="2.5" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>');
  HTP.p('  </div>');
  HTP.p('  <div class="dc-rp-section-body">');
  HTP.p('    <div style="text-align:center;padding:16px 0;color:var(--n-400);font-size:12.5px">Chưa có file nào</div>');
  HTP.p('  </div>');
  HTP.p('</div>');

  HTP.p('<div style="height:24px;"></div>');

EXCEPTION
  WHEN OTHERS THEN
    HTP.p('<div class="dc-err">Lỗi: ' || HTF.ESCAPE_SC(SQLERRM) || '</div>');
END;


-- ============================================================
-- 4. dcContactsHtml
--    Inject vào #lp-s2-list (format=DM) hoặc #lp-s3-list (format=GROUP)
--    x01=format(DM|GROUP)
--    DM → .lp-cr items (simple list, click tạo DM ngay)
--    GROUP → .gm-row items (checkbox select, multi-select)
-- ============================================================
DECLARE
  l_aus_id        NUMBER;
  l_online_cutoff TIMESTAMP  := SYSTIMESTAMP - INTERVAL '35' SECOND;
  l_format        VARCHAR2(10) := NVL(UPPER(TRIM(apex_application.g_x01)), 'GROUP');
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

  DECLARE
    l_prev_dep VARCHAR2(200) := '~~init~~';
  BEGIN
    FOR usr IN (
      WITH users_raw AS (
        SELECT /*+ MATERIALIZE */
          u.aus_id,
          u.emp_id,
          REGEXP_REPLACE(NVL(e.full_name,'Unknown'), '[[:cntrl:]]', '') AS full_name,
          REGEXP_REPLACE(NVL(d.dep_name,'Khác'),     '[[:cntrl:]]', '') AS dep_name
        FROM APP_USERS  u
        JOIN EMPLOYEES  e ON e.emp_id = u.emp_id
        LEFT JOIN DEPARTMENTS d ON d.dep_id = e.dep_id
        WHERE u.aus_id != l_aus_id
      )
      SELECT r.aus_id, r.full_name, r.dep_name, vf.v_file_name AS img,
             CASE WHEN o.last_seen >= l_online_cutoff THEN 'online' ELSE 'offline' END AS presence
      FROM   users_raw r
      LEFT JOIN CHAT_USER_ONLINE o  ON o.aus_id  = r.aus_id
      LEFT JOIN v_employees_v6   vf ON vf.emp_id = r.emp_id
      ORDER  BY r.dep_name, r.full_name
    ) LOOP
      DECLARE
        l_av   VARCHAR2(4)    := NVL(UPPER(SUBSTR(REGEXP_SUBSTR(usr.full_name,'\S+$'),1,1)), '?');
        l_hue  VARCHAR2(10)   := TO_CHAR(MOD(usr.aus_id * 47, 360));
        l_name VARCHAR2(200)  := HTF.ESCAPE_SC(usr.full_name);
        l_dept VARCHAR2(200)  := HTF.ESCAPE_SC(usr.dep_name);
        l_img  VARCHAR2(1000) := usr.img;
      BEGIN
        -- Dept alpha header
        IF usr.dep_name <> l_prev_dep THEN
          IF l_format = 'DM' THEN
            HTP.p('<div class="lp-alpha">' || l_dept || '</div>');
          ELSE
            -- GROUP format: simple alpha letter
            HTP.p('<div class="lp-alpha">' || l_dept || '</div>');
          END IF;
          l_prev_dep := usr.dep_name;
        END IF;

        IF l_format = 'DM' THEN
          -- S2: simple contact row .lp-cr (click → tạo DM)
          HTP.p('<button type="button" class="lp-cr"');
          HTP.p('  data-aus-id="' || usr.aus_id || '"');
          HTP.p('  data-name="' || REPLACE(l_name,'"','&quot;') || '"');
          HTP.p('  data-dept="' || REPLACE(l_dept,'"','&quot;') || '">');
          HTP.p('  <div style="width:36px;height:36px;border-radius:50%;background:hsl(' || l_hue
                || ',55%,52%);display:flex;align-items:center;justify-content:center;color:white;font-size:12px;font-weight:700;flex-shrink:0;">');
          IF l_img IS NOT NULL THEN
            HTP.p('    <img class="av-img" loading="lazy" onerror="this.remove()" src="' || HTF.ESCAPE_SC(l_img) || '">');
          END IF;
          HTP.p('    ' || l_av || '</div>');
          HTP.p('  <div style="flex:1;min-width:0;text-align:left;">');
          HTP.p('    <div style="font-size:13px;font-weight:600;color:var(--n-800);">' || l_name || '</div>');
          HTP.p('    <div style="font-size:11.5px;color:var(--n-400);">' || l_dept || '</div>');
          HTP.p('  </div>');
          IF usr.presence = 'online' THEN
            HTP.p('  <div style="width:7px;height:7px;border-radius:50%;background:var(--online);flex-shrink:0;"></div>');
          END IF;
          HTP.p('</button>');

        ELSE
          -- S3: member row .gm-row (click → select/deselect)
          HTP.p('<button type="button" class="gm-row"');
          HTP.p('  data-aus-id="' || usr.aus_id || '"');
          HTP.p('  data-name="' || REPLACE(l_name,'"','&quot;') || '"');
          HTP.p('  data-dept="' || REPLACE(l_dept,'"','&quot;') || '"');
          HTP.p('  data-hue="' || l_hue || '"');
          HTP.p('  data-img="' || HTF.ESCAPE_SC(NVL(l_img,'')) || '">');
          HTP.p('  <div class="gm-av-wrap">');
          HTP.p('    <div class="gm-av" style="background:hsl(' || l_hue || ',55%,52%)">');
          IF l_img IS NOT NULL THEN
            HTP.p('      <img class="av-img" loading="lazy" onerror="this.remove()" src="' || HTF.ESCAPE_SC(l_img) || '">');
          END IF;
          HTP.p('      ' || l_av || '</div>');
          HTP.p('    <div class="gm-chk">');
          HTP.p('      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>');
          HTP.p('    </div>');
          HTP.p('  </div>');
          HTP.p('  <div>');
          HTP.p('    <div style="font-size:13px;font-weight:600;color:var(--n-800);">' || l_name || '</div>');
          HTP.p('    <div style="font-size:11.5px;color:var(--n-400);">' || l_dept || '</div>');
          HTP.p('  </div>');
          HTP.p('</button>');
        END IF;
      END;
    END LOOP;
  END;

EXCEPTION
  WHEN OTHERS THEN
    HTP.p('<div class="dc-err">Lỗi: ' || HTF.ESCAPE_SC(SQLERRM) || '</div>');
END;
