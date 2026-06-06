-- ============================================================
-- CHAT HỆ THỐNG — Native APEX Callbacks
-- Tất cả là PAGE-LEVEL AJAX CALLBACK trên Messenger page
-- Gọi từ chat-page.js: apex.server.process(name, data, { pageId: window.pageId, ... })
--
-- HTML-returning (mới — thay JSON callbacks cũ):
--   chatConvListHtml   x01=filter(ALL/DM/GROUP/DOC) | x02=search | x03=quick(UNREAD/PINNED)
--   chatMsgThreadHtml  x01=conv_id
--   chatMembersHtml    x01=conv_id
--   chatContactsHtml   (không tham số)
--
-- Action-only (giữ nguyên từ chat_apex_callbacks_v2.sql):
--   chatSend    x01=conv_id | x02=body | x03=reply_to_msg_id | x04=partner_aus_id
--   chatCreate  x01=conv_type | x02=name | x03=members JSON
--   chatRead    x01=conv_id
--   chatTyping  x01=conv_id
--   chatPin     x01=conv_id | x02=1/0   (ghim/bỏ ghim — local DB, per-user)
-- ============================================================
--
-- SCHEMA (chạy 1 lần như DEV24 trước khi deploy filter "Ghim"):
--   ALTER TABLE CHAT_PARTICIPANTS ADD (
--     is_pinned NUMBER(1) DEFAULT 0 NOT NULL
--       CONSTRAINT chk_part_pinned CHECK (is_pinned IN (0,1)));
--   -- is_pinned: ghim hội thoại lên đầu danh sách, RIÊNG cho từng user.
--   -- KHÁC với CHAT_CONVERSATIONS.pinned_msg_id (ghim 1 tin nhắn trong hội thoại).
-- ============================================================


-- ============================================================
-- 1. chatConvListHtml
--    Trả HTML danh sách hội thoại (cho #cs-conv-list)
--    x01=filter(ALL/DM/GROUP/DOC) | x02=search | x03=quick(UNREAD/PINNED)
--    ALL : tất cả hội thoại (gồm CẢ chứng từ)
--    DM / GROUP: chỉ hội thoại chung (doc_type IS NULL)
--    DOC : chỉ hội thoại chứng từ (doc_type IS NOT NULL)
-- ============================================================
DECLARE
  l_aus_id        NUMBER;
  l_filter        VARCHAR2(20)  := NVL(UPPER(TRIM(apex_application.g_x01)), 'ALL');
  l_search        VARCHAR2(200) := LOWER(TRIM(apex_application.g_x02));
  l_quick         VARCHAR2(20)  := UPPER(TRIM(apex_application.g_x03));  -- UNREAD | PINNED | (null)
  l_online_cutoff TIMESTAMP     := SYSTIMESTAMP - INTERVAL '35' SECOND;
  l_found         NUMBER        := 0;
BEGIN
  OWA_UTIL.MIME_HEADER('text/html', TRUE, 'UTF-8');

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('<div class="cs-err">Phiên đăng nhập hết hạn</div>'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('<div class="cs-err">Không tìm thấy user</div>'); RETURN;
  END;

  FOR conv IN (
    SELECT c.conv_id,
           c.conv_type,
           -- DM: lấy tên partner; GROUP/DOC: dùng conv.name
           CASE c.conv_type
             WHEN 'DM' THEN (
               SELECT NVL(e2.full_name,'Unknown')
               FROM   CHAT_PARTICIPANTS p2
               JOIN   APP_USERS  u2 ON u2.aus_id = p2.aus_id
               JOIN   EMPLOYEES  e2 ON e2.emp_id = u2.emp_id
               WHERE  p2.conv_id = c.conv_id AND p2.aus_id != l_aus_id
               FETCH FIRST 1 ROW ONLY
             )
             ELSE NVL(c.name, '(Không tên)')
           END AS display_name,
           CASE c.conv_type
             WHEN 'DM' THEN (
               SELECT vf.v_file_name
               FROM   CHAT_PARTICIPANTS p2
               JOIN   APP_USERS  u2 ON u2.aus_id = p2.aus_id
               JOIN   v_employees_v6 vf ON vf.emp_id = u2.emp_id
               WHERE  p2.conv_id = c.conv_id AND p2.aus_id != l_aus_id
               FETCH FIRST 1 ROW ONLY
             )
             ELSE NULL
           END AS partner_img,
           -- DM: partner aus_id cho presence check và chatSend x04
           CASE c.conv_type
             WHEN 'DM' THEN (
               SELECT p2.aus_id FROM CHAT_PARTICIPANTS p2
               WHERE  p2.conv_id = c.conv_id AND p2.aus_id != l_aus_id
               FETCH FIRST 1 ROW ONLY
             )
             ELSE NULL
           END AS partner_aus_id,
           c.doc_type, c.doc_no,
           p.is_pinned,
           c.last_msg_preview,
           CASE WHEN c.last_msg_date >= TRUNC(SYSDATE)
                THEN TO_CHAR(c.last_msg_date, 'HH24:MI')
                ELSE TO_CHAR(c.last_msg_date, 'DD/MM')
           END AS display_time,
           p.last_read_msg_id,
           (SELECT COUNT(*) FROM CHAT_MESSENGERS m
            WHERE  m.conv_id = c.conv_id AND m.delete_date IS NULL
              AND  m.msg_id > NVL(p.last_read_msg_id, 0)
              AND  m.from_aus_id != l_aus_id) AS unread_count,
           (SELECT m.from_aus_id FROM CHAT_MESSENGERS m
            WHERE  m.conv_id = c.conv_id AND m.delete_date IS NULL
            ORDER BY m.msg_id DESC FETCH FIRST 1 ROW ONLY) AS last_sender_aus_id,
           (SELECT REGEXP_SUBSTR(REGEXP_REPLACE(NVL(e3.full_name,'?'),'[[:cntrl:]]',''),'\S+$')
            FROM   CHAT_MESSENGERS m3
            JOIN   APP_USERS  u3 ON u3.aus_id = m3.from_aus_id
            JOIN   EMPLOYEES  e3 ON e3.emp_id = u3.emp_id
            WHERE  m3.conv_id = c.conv_id AND m3.delete_date IS NULL
            ORDER BY m3.msg_id DESC FETCH FIRST 1 ROW ONLY) AS last_sender_word,
           -- ảnh avatar người gửi tin cuối (mini-badge) — nguồn v_employees_v6.v_file_name
           (SELECT vf.v_file_name
            FROM   CHAT_MESSENGERS m4
            JOIN   APP_USERS  u4 ON u4.aus_id = m4.from_aus_id
            JOIN   v_employees_v6 vf ON vf.emp_id = u4.emp_id
            WHERE  m4.conv_id = c.conv_id AND m4.delete_date IS NULL
            ORDER BY m4.msg_id DESC FETCH FIRST 1 ROW ONLY) AS last_sender_img
    FROM CHAT_CONVERSATIONS c
    JOIN CHAT_PARTICIPANTS  p ON p.conv_id = c.conv_id AND p.aus_id = l_aus_id
    WHERE (
      l_filter = 'ALL'                                              -- ALL: gồm cả chứng từ
      OR (l_filter = 'DM'    AND c.conv_type = 'DM'      AND c.doc_type IS NULL)
      OR (l_filter = 'GROUP' AND c.conv_type = 'CHANNEL' AND c.doc_type IS NULL)
      OR (l_filter = 'DOC'   AND c.doc_type IS NOT NULL)
    )
    AND (l_search IS NULL
         OR LOWER(NVL(c.name,''))             LIKE '%' || l_search || '%'
         OR LOWER(NVL(c.last_msg_preview,'')) LIKE '%' || l_search || '%'
         -- khớp tên thành viên: phủ cả DM (tên partner) lẫn GROUP/CHANNEL (mọi thành viên)
         OR EXISTS (
              SELECT 1 FROM CHAT_PARTICIPANTS ps
              JOIN   APP_USERS  us ON us.aus_id = ps.aus_id
              JOIN   EMPLOYEES  es ON es.emp_id = us.emp_id
              WHERE  ps.conv_id = c.conv_id
                AND  ps.aus_id != l_aus_id
                AND (LOWER(NVL(es.full_name,'')) LIKE '%' || l_search || '%'
                  OR LOWER(NVL(us.user_name,'')) LIKE '%' || l_search || '%')))
    -- NVL(l_quick,'X') để khi KHÔNG bấm chip (l_quick NULL) điều kiện ra TRUE,
    -- tránh logic 3-trị NULL loại nhầm hội thoại đã đọc hết.
    AND (NVL(l_quick,'X') != 'UNREAD' OR
         (SELECT COUNT(*) FROM CHAT_MESSENGERS m
          WHERE m.conv_id = c.conv_id AND m.delete_date IS NULL
          AND m.msg_id > NVL(p.last_read_msg_id,0) AND m.from_aus_id != l_aus_id) > 0)
    AND (NVL(l_quick,'X') != 'PINNED' OR p.is_pinned = 1)
    ORDER BY p.is_pinned DESC, NVL(c.last_msg_date, c.create_date) DESC NULLS LAST
  ) LOOP
    l_found := l_found + 1;
    DECLARE
      l_name        VARCHAR2(200) := REGEXP_REPLACE(NVL(conv.display_name,'?'), '[[:cntrl:]]', '');
      l_unread      BOOLEAN       := conv.unread_count > 0;
      l_pinned      BOOLEAN       := conv.is_pinned = 1;
      l_cls         VARCHAR2(100) := 'convo-item'
                                     || CASE WHEN l_unread THEN ' unread'  END
                                     || CASE WHEN l_pinned THEN ' pinned'  END;
      l_badge_hue   VARCHAR2(10)  := TO_CHAR(MOD(NVL(conv.last_sender_aus_id, 0) * 47, 360));
      l_badge_initl VARCHAR2(4)   := UPPER(SUBSTR(NVL(conv.last_sender_word,'?'), 1, 1));
      l_badge_img   VARCHAR2(1000):= conv.last_sender_img;
      l_is_mine     BOOLEAN       := (conv.last_sender_aus_id = l_aus_id);
      l_sender_lbl  VARCHAR2(200);
      l_preview     VARCHAR2(300) := REGEXP_REPLACE(NVL(conv.last_msg_preview, ''), '[[:cntrl:]]', ' ');
    BEGIN
      IF l_is_mine THEN l_sender_lbl := 'Bạn';
      ELSIF conv.last_sender_word IS NOT NULL THEN l_sender_lbl := conv.last_sender_word;
      END IF;

      HTP.p('<div class="' || l_cls || '" data-conv-id="' || conv.conv_id
            || '" data-partner-aus-id="' || NVL(TO_CHAR(conv.partner_aus_id),'') || '">');
      HTP.p('  <div class="convo-avatar-wrap">');

      -- Avatar: DM = initials; GROUP = group icon; DOC = doc icon
      IF conv.conv_type = 'DM' THEN
        DECLARE
          l_initl VARCHAR2(4) := UPPER(SUBSTR(REGEXP_SUBSTR(l_name, '\S+$'), 1, 1));
          l_hue   VARCHAR2(10) := TO_CHAR(MOD(NVL(conv.partner_aus_id, 0) * 47, 360));
          l_dummy NUMBER;
          l_pres  VARCHAR2(10) := 'offline';
        BEGIN
          IF conv.partner_aus_id IS NOT NULL THEN
            BEGIN
              SELECT 1 INTO l_dummy FROM DUAL WHERE EXISTS (
                SELECT 1 FROM CHAT_USER_ONLINE
                WHERE aus_id = conv.partner_aus_id AND last_seen >= l_online_cutoff
              );
              l_pres := 'online';
            EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
            END;
          END IF;
          HTP.p('    <div class="convo-avatar" style="background:hsl(' || l_hue || ',55%,52%)">');
          IF conv.partner_img IS NOT NULL THEN
            HTP.p('<img class="av-img" loading="lazy" onerror="this.remove()" src="' || HTF.ESCAPE_SC(conv.partner_img) || '">');
          END IF;
          HTP.p(NVL(l_initl,'?') || '<span class="presence ' || l_pres || '"></span></div>');
        END;
      ELSIF conv.doc_type IS NOT NULL THEN
        HTP.p('    <div class="convo-avatar doc"><span class="fa fa-file-text-o"></span></div>');
        IF conv.last_sender_aus_id IS NOT NULL THEN
          HTP.p('    <div class="convo-sender-badge" style="background:hsl('
                || l_badge_hue || ',55%,52%)">');
          IF l_badge_img IS NOT NULL THEN
            HTP.p('<img class="av-img" loading="lazy" onerror="this.remove()" src="'
                  || HTF.ESCAPE_SC(l_badge_img) || '">');
          END IF;
          HTP.p(l_badge_initl || '</div>');
        END IF;
      ELSE
        HTP.p('    <div class="convo-avatar group"><span class="fa fa-users"></span></div>');
        IF conv.last_sender_aus_id IS NOT NULL THEN
          HTP.p('    <div class="convo-sender-badge" style="background:hsl('
                || l_badge_hue || ',55%,52%)">');
          IF l_badge_img IS NOT NULL THEN
            HTP.p('<img class="av-img" loading="lazy" onerror="this.remove()" src="'
                  || HTF.ESCAPE_SC(l_badge_img) || '">');
          END IF;
          HTP.p(l_badge_initl || '</div>');
        END IF;
      END IF;

      HTP.p('  </div>');
      HTP.p('  <div class="convo-content">');
      HTP.p('    <div class="convo-row1">');
      IF l_pinned THEN
        HTP.p('      <span class="convo-pin-flag fa fa-thumb-tack" title="Đã ghim"></span>');
      END IF;
      HTP.p('      <span class="convo-name">' || HTF.ESCAPE_SC(l_name) || '</span>');
      HTP.p('      <span class="convo-time">' || NVL(conv.display_time,'') || '</span>');
      HTP.p('    </div>');
      HTP.p('    <div class="convo-row2">');
      HTP.p('      <span class="convo-preview">'
            || CASE WHEN l_sender_lbl IS NOT NULL
               THEN '<span class="convo-sender-name">' || HTF.ESCAPE_SC(l_sender_lbl) || ':</span> '
               END
            || HTF.ESCAPE_SC(SUBSTR(l_preview, 1, 55))
            || '</span>');
      IF l_unread THEN
        HTP.p('      <div class="convo-meta"><span class="convo-badge">' || conv.unread_count || '</span></div>');
      END IF;
      HTP.p('    </div>');
      -- Doc tag for DOC convs
      IF conv.doc_type IS NOT NULL THEN
        HTP.p('    <div class="convo-row-doc">');
        HTP.p('      <span class="convo-doc-tag">' || HTF.ESCAPE_SC(conv.doc_type || ' · ' || NVL(conv.doc_no,'')) || '</span>');
        HTP.p('    </div>');
      END IF;
      HTP.p('  </div>');
      -- Nút "..." (menu) — hiện khi hover. data-conv-menu cho JS mở dropdown ghim/bỏ ghim.
      HTP.p('  <button type="button" class="convo-menu" data-conv-menu="1" data-conv-id="' || conv.conv_id
            || '" data-pinned="' || CASE WHEN l_pinned THEN '1' ELSE '0' END
            || '" title="Tùy chọn"><span class="fa fa-ellipsis-h"></span></button>');
      HTP.p('</div>');
    END;
  END LOOP;

  IF l_found = 0 THEN
    HTP.p('<div style="text-align:center;color:var(--text-3);padding:32px 16px;font-size:13px">');
    IF l_quick = 'PINNED' THEN
      HTP.p('  Chưa ghim hội thoại nào.<br>Di chuột vào hội thoại rồi nhấn <span class="fa fa-thumb-tack"></span>.');
    ELSIF l_quick = 'UNREAD' THEN
      HTP.p('  Không có hội thoại chưa đọc.');
    ELSIF l_filter = 'DOC' THEN
      HTP.p('  Chưa có hội thoại chứng từ nào.');
    ELSIF l_search IS NOT NULL THEN
      HTP.p('  Không tìm thấy kết quả.');
    ELSE
      HTP.p('  Chưa có hội thoại nào.<br>Nhấn <b>+</b> để bắt đầu.');
    END IF;
    HTP.p('</div>');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('<div class="cs-err">Lỗi: ' || HTF.ESCAPE_SC(SQLERRM) || '</div>');
END;


-- ============================================================
-- 2. chatMsgThreadHtml
--    Trả HTML danh sách tin nhắn (cho #cs-messages)
--    x01=conv_id
--    MATERIALIZE vì REGEXP_REPLACE trên remote columns.
-- ============================================================
DECLARE
  l_conv_id  NUMBER        := TO_NUMBER(NVL(TRIM(apex_application.g_x01), '0'));
  l_aus_id   NUMBER;
  l_last_day DATE := NULL;
BEGIN
  OWA_UTIL.MIME_HEADER('text/html', TRUE, 'UTF-8');

  IF l_conv_id = 0 THEN
    HTP.p('<div style="text-align:center;color:var(--text-3);margin-top:60px;font-size:13px">← Chọn hội thoại để bắt đầu</div>');
    RETURN;
  END IF;

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('<div class="cs-err">Phiên đăng nhập hết hạn</div>'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('<div class="cs-err">Không tìm thấy user</div>'); RETURN;
  END;

  FOR msg IN (
    WITH msg_raw AS (
      SELECT /*+ MATERIALIZE */
        m.msg_id,
        m.from_aus_id,
        u.emp_id,
        REGEXP_REPLACE(NVL(e.full_name, 'Unknown'), '[[:cntrl:]]', '') AS from_name,
        CASE WHEN m.delete_date IS NOT NULL THEN NULL ELSE m.body END  AS body,
        m.delete_date,
        m.reply_to_msg_id,
        TRUNC(m.create_date)               AS msg_day,
        TO_CHAR(m.create_date, 'HH24:MI')  AS msg_time,
        CASE WHEN qm.delete_date IS NOT NULL THEN '[Tin nhắn đã bị xóa]' ELSE qm.body END AS reply_body,
        REGEXP_REPLACE(NVL(qe.full_name, ''), '[[:cntrl:]]', '')       AS reply_from_name
      FROM   CHAT_MESSENGERS m
      JOIN   APP_USERS       u  ON u.aus_id  = m.from_aus_id
      JOIN   EMPLOYEES       e  ON e.emp_id  = u.emp_id
      LEFT JOIN CHAT_MESSENGERS qm ON qm.msg_id  = m.reply_to_msg_id
      LEFT JOIN APP_USERS    qu  ON qu.aus_id = qm.from_aus_id
      LEFT JOIN EMPLOYEES    qe  ON qe.emp_id = qu.emp_id
      WHERE  m.conv_id = l_conv_id
        AND  m.delete_date IS NULL OR m.delete_date IS NOT NULL
      ORDER  BY m.msg_id ASC
      FETCH FIRST 50 ROWS ONLY
    )
    SELECT mr.*, vf.v_file_name AS img
    FROM   msg_raw mr
    LEFT JOIN v_employees_v6 vf ON vf.emp_id = mr.emp_id
  ) LOOP
    IF l_last_day IS NULL OR msg.msg_day > l_last_day THEN
      l_last_day := msg.msg_day;
      HTP.p('<div class="chat-day-divider">' || TO_CHAR(msg.msg_day, 'DD/MM/YYYY') || '</div>');
    END IF;

    DECLARE
      l_mine     BOOLEAN       := (msg.from_aus_id = l_aus_id);
      l_cls      VARCHAR2(50)  := 'msg-row' || CASE WHEN l_mine THEN ' mine' END;
      l_av       VARCHAR2(4);
      l_body_esc VARCHAR2(32767);
    BEGIN
      l_av := UPPER(SUBSTR(REGEXP_SUBSTR(msg.from_name, '\S+$'), 1, 1));
      IF l_av IS NULL THEN l_av := '?'; END IF;

      HTP.p('<div class="' || l_cls || '" data-msg-id="' || msg.msg_id || '">');

      IF l_mine THEN
        HTP.p('  <div class="msg-avatar hidden"></div>');
      ELSE
        HTP.p('  <div class="msg-avatar" style="background:hsl(' || MOD(msg.from_aus_id * 47, 360) || ',55%,52%)">');
        IF msg.img IS NOT NULL THEN
          HTP.p('<img class="av-img" loading="lazy" onerror="this.remove()" src="' || HTF.ESCAPE_SC(msg.img) || '">');
        END IF;
        HTP.p(l_av || '</div>');
      END IF;

      HTP.p('  <div class="msg-col">');
      HTP.p('    <div class="msg-meta">');
      IF NOT l_mine THEN
        HTP.p('      <span class="msg-meta-name">' || HTF.ESCAPE_SC(msg.from_name) || '</span>');
      END IF;
      HTP.p('      <span class="msg-meta-time">' || msg.msg_time || '</span>');
      HTP.p('    </div>');

      IF msg.reply_to_msg_id IS NOT NULL THEN
        HTP.p('    <div class="msg-reply-context">');
        IF msg.reply_from_name IS NOT NULL THEN
          HTP.p('      <span class="name">' || HTF.ESCAPE_SC(msg.reply_from_name) || '</span> ');
        END IF;
        HTP.p('      <span class="body">' || HTF.ESCAPE_SC(SUBSTR(NVL(msg.reply_body,''), 1, 80)) || '</span>');
        HTP.p('    </div>');
      END IF;

      IF msg.delete_date IS NOT NULL THEN
        HTP.p('    <div class="msg-bubble deleted">[Tin nhắn đã bị thu hồi]</div>');
      ELSE
        l_body_esc := REPLACE(REPLACE(
          REPLACE(REPLACE(HTF.ESCAPE_SC(NVL(msg.body,'')), '&#38;', '&amp;'),
          '&#60;', '&lt;'), CHR(13), ''), CHR(10), '<br>');
        HTP.p('    <div class="msg-bubble">' || l_body_esc || '</div>');
      END IF;

      IF msg.delete_date IS NULL THEN
        HTP.p('    <div class="msg-hover-actions">');
        HTP.p('      <button type="button" class="msg-hover-action" title="Trả lời"');
        HTP.p('              data-reply-id="'   || msg.msg_id || '"');
        HTP.p('              data-reply-body="' || REPLACE(SUBSTR(NVL(msg.body,''), 1, 100), '"', '&quot;') || '">');
        HTP.p('        <span class="fa fa-reply"></span>');
        HTP.p('      </button>');
        HTP.p('    </div>');
      END IF;

      HTP.p('  </div>');
      HTP.p('</div>');
    END;
  END LOOP;

  IF l_last_day IS NULL THEN
    HTP.p('<div style="text-align:center;color:var(--text-3);margin-top:60px;font-size:13px">Chưa có tin nhắn. Hãy bắt đầu!</div>');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('<div class="cs-err">Lỗi: ' || HTF.ESCAPE_SC(SQLERRM) || '</div>');
END;


-- ============================================================
-- 3. chatMembersHtml
--    Trả HTML info panel bên phải (cho #cs-info-content)
--    x01=conv_id
-- ============================================================
DECLARE
  l_conv_id       NUMBER    := TO_NUMBER(NVL(TRIM(apex_application.g_x01), '0'));
  l_online_cutoff TIMESTAMP := SYSTIMESTAMP - INTERVAL '35' SECOND;
  l_aus_id        NUMBER;
  l_conv_name     VARCHAR2(300);
  l_conv_type     VARCHAR2(20);
BEGIN
  OWA_UTIL.MIME_HEADER('text/html', TRUE, 'UTF-8');

  IF l_conv_id = 0 THEN
    HTP.p('<div class="info-section" style="color:var(--text-3);font-size:13px;text-align:center;padding:32px 16px">');
    HTP.p('  Chọn hội thoại để xem thông tin.');
    HTP.p('</div>');
    RETURN;
  END IF;

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN RETURN; END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN;
  END;

  -- Lấy thông tin conv
  BEGIN
    SELECT NVL(c.name,'(Hội thoại)'), c.conv_type
    INTO   l_conv_name, l_conv_type
    FROM   CHAT_CONVERSATIONS c
    WHERE  c.conv_id = l_conv_id;
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN;
  END;

  -- SECTION 1: Conversation / partner info
  HTP.p('<div class="info-section">');
  IF l_conv_type = 'CHANNEL' THEN
    HTP.p('  <div class="info-section-title"><span class="fa fa-comment-o"></span> Hội thoại</div>');
    HTP.p('  <div class="cs-conv-info-card">');
    HTP.p('    <div class="cs-conv-info-avatar group"><span class="fa fa-users"></span></div>');
    HTP.p('    <div class="cs-conv-info-name">' || HTF.ESCAPE_SC(REGEXP_REPLACE(l_conv_name,'[[:cntrl:]]','')) || '</div>');
    HTP.p('    <div class="cs-conv-info-type">Nhóm trao đổi</div>');
    HTP.p('  </div>');
  ELSE
    -- DM: hồ sơ người đối thoại (không để trống)
    DECLARE
      l_p_aus  NUMBER;
      l_p_name VARCHAR2(200) := '(Không rõ)';
      l_p_dept VARCHAR2(200);
      l_p_pres VARCHAR2(10)  := 'offline';
      l_p_hue  VARCHAR2(10);
      l_p_av   VARCHAR2(4);
      l_p_img  VARCHAR2(1000);
    BEGIN
      BEGIN
        WITH partner_raw AS (
          SELECT /*+ MATERIALIZE */
            p.aus_id,
            u.emp_id,
            REGEXP_REPLACE(NVL(e.full_name,'Unknown'),'[[:cntrl:]]','') AS full_name,
            REGEXP_REPLACE(NVL(d.dep_name,''),'[[:cntrl:]]','')         AS dep_name
          FROM CHAT_PARTICIPANTS p
          JOIN APP_USERS  u ON u.aus_id = p.aus_id
          JOIN EMPLOYEES  e ON e.emp_id = u.emp_id
          LEFT JOIN DEPARTMENTS d ON d.dep_id = e.dep_id
          WHERE p.conv_id = l_conv_id AND p.aus_id != l_aus_id
        )
        SELECT r.aus_id, r.full_name, r.dep_name,
               CASE WHEN o.last_seen >= l_online_cutoff THEN 'online' ELSE 'offline' END,
               vf.v_file_name
        INTO   l_p_aus, l_p_name, l_p_dept, l_p_pres, l_p_img
        FROM   partner_raw r
        LEFT JOIN CHAT_USER_ONLINE o ON o.aus_id = r.aus_id
        LEFT JOIN v_employees_v6 vf ON vf.emp_id = r.emp_id
        FETCH FIRST 1 ROW ONLY;
      EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
      END;

      l_p_hue := TO_CHAR(MOD(NVL(l_p_aus,0) * 47, 360));
      l_p_av  := UPPER(SUBSTR(REGEXP_SUBSTR(l_p_name,'\S+$'),1,1));

      HTP.p('  <div class="info-section-title"><span class="fa fa-user"></span> Thông tin liên hệ</div>');
      HTP.p('  <div class="cs-conv-info-card">');
      HTP.p('    <div class="cs-conv-info-avatar dm" style="background:hsl(' || l_p_hue || ',55%,52%)">');
      IF l_p_img IS NOT NULL THEN
        HTP.p('<img class="av-img" loading="lazy" onerror="this.remove()" src="' || HTF.ESCAPE_SC(l_p_img) || '">');
      END IF;
      HTP.p(NVL(l_p_av,'?') || '<span class="presence ' || l_p_pres || '"></span></div>');
      HTP.p('    <div class="cs-conv-info-name">' || HTF.ESCAPE_SC(l_p_name) || '</div>');
      IF l_p_dept IS NOT NULL THEN
        HTP.p('    <div class="cs-conv-info-type">' || HTF.ESCAPE_SC(l_p_dept) || '</div>');
      END IF;
      HTP.p('    <div class="cs-conv-info-status ' || l_p_pres || '">'
            || CASE WHEN l_p_pres = 'online' THEN 'Đang hoạt động' ELSE 'Ngoại tuyến' END
            || '</div>');
      HTP.p('  </div>');
    END;
  END IF;
  HTP.p('</div>');

  -- SECTION 2: Members (chỉ cho nhóm — DM đã có hồ sơ ở Section 1)
  IF l_conv_type = 'CHANNEL' THEN
  DECLARE
    l_count NUMBER := 0;
  BEGIN
    HTP.p('<div class="info-section">');
    HTP.p('  <div class="info-section-title">');
    HTP.p('    <span class="fa fa-users"></span> Thành viên');
    HTP.p('    <span class="count" id="cs-member-count">…</span>');
    HTP.p('  </div>');

    FOR mem IN (
      WITH members_raw AS (
        SELECT /*+ MATERIALIZE */
          p.aus_id,
          p.is_admin,
          u.emp_id,
          REGEXP_REPLACE(NVL(e.full_name, 'Unknown'), '[[:cntrl:]]', '') AS full_name,
          REGEXP_REPLACE(NVL(d.dep_name, ''),          '[[:cntrl:]]', '') AS dep_name
        FROM CHAT_PARTICIPANTS p
        JOIN APP_USERS    u ON u.aus_id  = p.aus_id
        JOIN EMPLOYEES    e ON e.emp_id  = u.emp_id
        LEFT JOIN DEPARTMENTS d ON d.dep_id = e.dep_id
        WHERE p.conv_id = l_conv_id
      )
      SELECT r.aus_id, r.is_admin, r.full_name, r.dep_name, vf.v_file_name AS img,
             CASE WHEN o.last_seen >= l_online_cutoff THEN 'online' ELSE 'offline' END AS presence
      FROM members_raw r
      LEFT JOIN CHAT_USER_ONLINE o ON o.aus_id = r.aus_id
      LEFT JOIN v_employees_v6 vf ON vf.emp_id = r.emp_id
      ORDER BY r.is_admin DESC, r.full_name
    ) LOOP
      l_count := l_count + 1;
      DECLARE
        l_av  VARCHAR2(4)  := UPPER(SUBSTR(REGEXP_SUBSTR(mem.full_name, '\S+$'), 1, 1));
        l_hue VARCHAR2(10) := TO_CHAR(MOD(mem.aus_id * 47, 360));
        l_me  BOOLEAN      := (mem.aus_id = l_aus_id);
      BEGIN
        HTP.p('<div class="member-row">');
        HTP.p('  <div class="member-avatar" style="background:hsl(' || l_hue || ',55%,52%)">');
        IF mem.img IS NOT NULL THEN
          HTP.p('    <img class="av-img" loading="lazy" onerror="this.remove()" src="' || HTF.ESCAPE_SC(mem.img) || '">');
        END IF;
        HTP.p('    ' || NVL(l_av, '?'));
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

    HTP.p('<script>(function(){ var el=document.getElementById("cs-member-count"); if(el) el.textContent=' || l_count || '; })();</script>');
    HTP.p('</div>'); -- .info-section members
  END;
  END IF; -- chỉ render Thành viên cho CHANNEL

  -- SECTION 3: Files placeholder
  HTP.p('<div class="info-section">');
  HTP.p('  <div class="info-section-title"><span class="fa fa-paperclip"></span> File chia sẻ<span class="count">0</span></div>');
  HTP.p('  <div style="text-align:center;padding:16px 0;color:var(--text-4);font-size:12.5px">');
  HTP.p('    <span class="fa fa-inbox" style="font-size:22px;display:block;margin-bottom:6px"></span>Chưa có file nào');
  HTP.p('  </div>');
  HTP.p('</div>');
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('<div class="cs-err">Lỗi: ' || HTF.ESCAPE_SC(SQLERRM) || '</div>');
END;


-- ============================================================
-- 4. chatContactsHtml
--    Trả HTML form chọn thành viên (cho #cs-contacts-content)
--    Không tham số. JS xử lý toàn bộ interaction.
--    IDs dùng cs- prefix (cs-member-suggest-list, cs-selected-chips, v.v.)
-- ============================================================
DECLARE
  l_aus_id        NUMBER;
  l_online_cutoff TIMESTAMP := SYSTIMESTAMP - INTERVAL '35' SECOND;
BEGIN
  OWA_UTIL.MIME_HEADER('text/html', TRUE, 'UTF-8');

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('<div class="cs-err">Phiên đăng nhập hết hạn</div>'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('<div class="cs-err">Không tìm thấy user</div>'); RETURN;
  END;

  -- Chỉ sinh nội dung BÊN TRONG #cs-member-suggest-list (JS innerHTML vào đó).
  -- KHÔNG bọc lại <div id="cs-member-suggest-list"> — sẽ trùng ID & lồng .emp-modal-list.
  DECLARE
    l_prev_dep VARCHAR2(200) := '~~init~~';
  BEGIN
    FOR usr IN (
      WITH users_raw AS (
        SELECT /*+ MATERIALIZE */
          u.aus_id,
          u.emp_id,
          REGEXP_REPLACE(NVL(e.full_name, 'Unknown'), '[[:cntrl:]]', '') AS full_name,
          REGEXP_REPLACE(NVL(d.dep_name, 'Khác'),     '[[:cntrl:]]', '') AS dep_name
        FROM APP_USERS u
        JOIN EMPLOYEES e    ON e.emp_id  = u.emp_id
        LEFT JOIN DEPARTMENTS d ON d.dep_id = e.dep_id
        WHERE u.aus_id != l_aus_id
          AND u.status = 'Y'
      )
      SELECT r.aus_id, r.full_name, r.dep_name, vf.v_file_name AS img,
             COUNT(*) OVER (PARTITION BY r.dep_name) AS dep_count,
             CASE WHEN o.last_seen >= l_online_cutoff THEN 'online' ELSE 'offline' END AS presence
      FROM   users_raw r
      LEFT JOIN CHAT_USER_ONLINE o ON o.aus_id = r.aus_id
      LEFT JOIN v_employees_v6 vf ON vf.emp_id = r.emp_id
      ORDER  BY r.dep_name, r.full_name
    ) LOOP
      IF usr.dep_name <> l_prev_dep THEN
        HTP.p('<div class="emp-section-h" data-dept-header="1">'
              || HTF.ESCAPE_SC(usr.dep_name)
              || ' <span class="sep">·</span> <span class="cnt">' || usr.dep_count || '</span></div>');
        l_prev_dep := usr.dep_name;
      END IF;
      DECLARE
        l_av   VARCHAR2(4)    := UPPER(SUBSTR(REGEXP_SUBSTR(usr.full_name, '\S+$'), 1, 1));
        l_hue  VARCHAR2(10)   := TO_CHAR(MOD(usr.aus_id * 47, 360));
        l_name VARCHAR2(200)  := HTF.ESCAPE_SC(usr.full_name);
        l_dept VARCHAR2(200)  := HTF.ESCAPE_SC(usr.dep_name);
        l_img  VARCHAR2(1000) := usr.img;
      BEGIN
        HTP.p('<div class="emp-item"');
        HTP.p('     data-aus-id="' || usr.aus_id || '"');
        HTP.p('     data-name="'   || REPLACE(l_name, '"', '&quot;') || '"');
        HTP.p('     data-dept="'   || REPLACE(l_dept, '"', '&quot;') || '"');
        HTP.p('     data-img="'    || HTF.ESCAPE_SC(NVL(l_img,'')) || '"');
        HTP.p('     data-hue="'    || l_hue || '">');
        HTP.p('  <div class="av" style="background:hsl(' || l_hue || ',55%,52%)">');
        IF l_img IS NOT NULL THEN
          HTP.p('    <img class="av-img" loading="lazy" onerror="this.remove()" src="' || HTF.ESCAPE_SC(l_img) || '">');
        END IF;
        HTP.p('    ' || NVL(l_av, '?'));
        HTP.p('    <span class="pres ' || usr.presence || '"></span>');
        HTP.p('  </div>');
        HTP.p('  <div class="info">');
        HTP.p('    <div class="name">' || l_name || '</div>');
        HTP.p('    <div class="role">' || l_dept || '</div>');
        HTP.p('  </div>');
        HTP.p('  <div class="check"></div>');
        HTP.p('</div>');
      END;
    END LOOP;
  END;
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('<div class="cs-err">Lỗi: ' || HTF.ESCAPE_SC(SQLERRM) || '</div>');
END;


-- ============================================================
-- 5. chatSend  (Action-only — từ chat_apex_callbacks_v2.sql)
--    x01=conv_id | x02=body | x03=reply_to_msg_id | x04=partner_aus_id
-- ============================================================
DECLARE
  l_aus_id  NUMBER;
  l_url     VARCHAR2(500);
  l_req     UTL_HTTP.REQ;
  l_resp    UTL_HTTP.RESP;
  l_body    VARCHAR2(32767) := '';
  l_buffer  VARCHAR2(32767);
  l_payload VARCHAR2(4000);
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('{"error":"auth"}'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('{"error":"user_not_found"}'); RETURN;
  END;

  l_payload := JSON_OBJECT(
    'conv_id'         VALUE TO_NUMBER(apex_application.g_x01),
    'aus_id'          VALUE l_aus_id,
    'username'        VALUE :APP_USER,
    'body'            VALUE apex_application.g_x02,
    'reply_to_msg_id' VALUE NULLIF(TRIM(apex_application.g_x03), ''),
    'partner_aus_id'  VALUE NULLIF(TRIM(apex_application.g_x04), '')
    ABSENT ON NULL
  );

  UTL_HTTP.SET_TRANSFER_TIMEOUT(10);
  l_url := 'http://172.25.10.38:3410/api/chat/send';
  l_req  := UTL_HTTP.BEGIN_REQUEST(l_url, 'POST', 'HTTP/1.1');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Type',   'application/json; charset=utf-8');
  UTL_HTTP.SET_HEADER(l_req, 'Connection',     'close');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Length',  TO_CHAR(UTL_RAW.LENGTH(UTL_RAW.CAST_TO_RAW(l_payload))));
  UTL_HTTP.WRITE_RAW(l_req, UTL_RAW.CAST_TO_RAW(l_payload));
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN LOOP UTL_HTTP.READ_TEXT(l_resp, l_buffer, 32767); l_body := l_body || l_buffer; END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL; END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.p(l_body);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.p('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- ============================================================
-- 6. chatCreate  (Action-only)
--    x01=conv_type | x02=name | x03=members JSON
-- ============================================================
DECLARE
  l_aus_id  NUMBER;
  l_url     VARCHAR2(500);
  l_req     UTL_HTTP.REQ;
  l_resp    UTL_HTTP.RESP;
  l_body    VARCHAR2(32767) := '';
  l_buffer  VARCHAR2(32767);
  l_payload VARCHAR2(4000);
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('{"error":"auth"}'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('{"error":"user_not_found"}'); RETURN;
  END;

  l_payload := '{"conv_type":"' || apex_application.g_x01 || '"'
    || ',"name":"'   || REPLACE(apex_application.g_x02, '"', '\"') || '"'
    || ',"members":' || NVL(NULLIF(TRIM(apex_application.g_x03), ''), '[]')
    || ',"aus_id":'  || TO_CHAR(l_aus_id)
    || '}';

  UTL_HTTP.SET_TRANSFER_TIMEOUT(10);
  l_url := 'http://172.25.10.38:3410/api/chat/create';
  l_req  := UTL_HTTP.BEGIN_REQUEST(l_url, 'POST', 'HTTP/1.1');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Type',   'application/json; charset=utf-8');
  UTL_HTTP.SET_HEADER(l_req, 'Connection',     'close');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Length',  TO_CHAR(UTL_RAW.LENGTH(UTL_RAW.CAST_TO_RAW(l_payload))));
  UTL_HTTP.WRITE_RAW(l_req, UTL_RAW.CAST_TO_RAW(l_payload));
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN LOOP UTL_HTTP.READ_TEXT(l_resp, l_buffer, 32767); l_body := l_body || l_buffer; END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL; END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.p(l_body);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.p('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- ============================================================
-- 7. chatRead  (Action-only)
--    x01 = conv_id
-- ============================================================
DECLARE
  l_aus_id NUMBER;
  l_url    VARCHAR2(500);
  l_req    UTL_HTTP.REQ;
  l_resp   UTL_HTTP.RESP;
  l_buf    VARCHAR2(4000) := '';
  l_tmp    VARCHAR2(4000);
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('{"error":"auth"}'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('{"error":"user_not_found"}'); RETURN;
  END;
  IF TRIM(apex_application.g_x01) IS NULL THEN
    HTP.p('{"error":"conv_id required"}'); RETURN;
  END IF;

  l_url := 'http://172.25.10.38:3410/api/chat/read/'
           || apex_application.g_x01 || '/' || TO_CHAR(l_aus_id);
  UTL_HTTP.SET_TRANSFER_TIMEOUT(5);
  l_req  := UTL_HTTP.BEGIN_REQUEST(l_url, 'POST', 'HTTP/1.1');
  UTL_HTTP.SET_HEADER(l_req, 'Connection',     'close');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Length', '0');
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN LOOP UTL_HTTP.READ_TEXT(l_resp, l_tmp, 4000); l_buf := l_buf || l_tmp; END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL; END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.p(l_buf);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.p('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- ============================================================
-- 8. chatTyping  (Action-only)
--    x01 = conv_id
-- ============================================================
DECLARE
  l_aus_id NUMBER;
  l_url    VARCHAR2(500);
  l_req    UTL_HTTP.REQ;
  l_resp   UTL_HTTP.RESP;
  l_buf    VARCHAR2(4000) := '';
  l_tmp    VARCHAR2(4000);
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('{"error":"auth"}'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('{"error":"user_not_found"}'); RETURN;
  END;
  IF TRIM(apex_application.g_x01) IS NULL THEN
    HTP.p('{"error":"conv_id required"}'); RETURN;
  END IF;

  l_url := 'http://172.25.10.38:3410/api/chat/typing/'
           || apex_application.g_x01 || '/' || TO_CHAR(l_aus_id);
  UTL_HTTP.SET_TRANSFER_TIMEOUT(5);
  l_req  := UTL_HTTP.BEGIN_REQUEST(l_url, 'POST', 'HTTP/1.1');
  UTL_HTTP.SET_HEADER(l_req, 'Connection',     'close');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Length', '0');
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN LOOP UTL_HTTP.READ_TEXT(l_resp, l_tmp, 4000); l_buf := l_buf || l_tmp; END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL; END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.p(l_buf);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.p('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- ============================================================
-- 9. chatPin  (Action-only — LOCAL DB, không relay Node)
--    x01 = conv_id | x02 = 1 (ghim) / 0 (bỏ ghim)
--    Ghim là trạng thái RIÊNG mỗi user (CHAT_PARTICIPANTS.is_pinned),
--    người khác không cần biết → không cần đẩy event qua Node.
-- ============================================================
DECLARE
  l_aus_id NUMBER;
  l_pin    NUMBER := CASE WHEN TRIM(apex_application.g_x02) = '1' THEN 1 ELSE 0 END;
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('{"error":"auth"}'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('{"error":"user_not_found"}'); RETURN;
  END;
  IF TRIM(apex_application.g_x01) IS NULL THEN
    HTP.p('{"error":"conv_id required"}'); RETURN;
  END IF;

  UPDATE CHAT_PARTICIPANTS
     SET is_pinned = l_pin
   WHERE conv_id = TO_NUMBER(apex_application.g_x01)
     AND aus_id  = l_aus_id;
  COMMIT;

  HTP.p('{"status":"ok","pinned":' || l_pin || '}');
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;
