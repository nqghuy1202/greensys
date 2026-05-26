-- ===========================================================
-- CHAT HỆ THỐNG — APEX Ajax Callbacks (v2)
-- Dùng :APP_USER thay :G_AUS_ID (an toàn hơn, luôn có trong Application Process)
-- Tạo dưới dạng Application Process (Shared Components) — không cần pageId
-- ===========================================================
--
-- PATTERN CHUNG (đầu mỗi callback):
--   IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
--     HTP.p('{"error":"auth"}'); RETURN;
--   END IF;
--   BEGIN
--     SELECT aus_id INTO l_aus_id FROM APP_USERS
--     WHERE LOWER(user_name) = LOWER(:APP_USER);
--   EXCEPTION WHEN NO_DATA_FOUND THEN
--     HTP.p('{"error":"user_not_found"}'); RETURN;
--   END;
-- ===========================================================


-- -----------------------------------------------------------
-- 1. chatConvList
--    Danh sách hội thoại của user hiện tại
-- -----------------------------------------------------------
DECLARE
  l_aus_id  NUMBER;
  l_result  VARCHAR2(32767);
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('{"error":"auth"}'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('{"error":"user_not_found"}'); RETURN;
  END;

  SELECT NVL(
    (
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'id'             VALUE c.conv_id,
          'type'           VALUE CASE
                                   WHEN c.conv_type = 'DM'      THEN 'dm'
                                   WHEN c.doc_type IS NOT NULL   THEN 'doc'
                                   ELSE                               'group'
                                 END,
          'name'           VALUE CASE c.conv_type
                                   WHEN 'DM' THEN (
                                     SELECT NVL(e2.full_name, 'Unknown')
                                     FROM   CHAT_PARTICIPANTS p2
                                     JOIN   APP_USERS  u2 ON u2.aus_id = p2.aus_id
                                     JOIN   EMPLOYEES  e2 ON e2.emp_id = u2.emp_id
                                     WHERE  p2.conv_id = c.conv_id
                                       AND  p2.aus_id != l_aus_id
                                     FETCH FIRST 1 ROW ONLY
                                   )
                                   ELSE REGEXP_REPLACE(c.name, '[[:cntrl:]]', '')
                                 END,
          'doc_type'       VALUE c.doc_type,
          'doc_no'         VALUE c.doc_no,
          'unread'         VALUE (
                             SELECT COUNT(*)
                             FROM   CHAT_MESSENGERS m
                             WHERE  m.conv_id      = c.conv_id
                               AND  m.delete_date  IS NULL
                               AND  m.msg_id       > NVL(p.last_read_msg_id, 0)
                               AND  m.from_aus_id != l_aus_id
                           ),
          'last_preview'   VALUE REGEXP_REPLACE(c.last_msg_preview, '[[:cntrl:]]', ' '),
          'last_time'      VALUE TO_CHAR(c.last_msg_date, 'HH24:MI'),
          'last_date'      VALUE TO_CHAR(c.last_msg_date, 'YYYY-MM-DD"T"HH24:MI:SS'),
          'last_sender_id' VALUE (
                             SELECT m2.from_aus_id FROM CHAT_MESSENGERS m2
                             WHERE  m2.msg_id = c.last_msg_id
                           ),
          'member_count'   VALUE (
                             SELECT COUNT(*) FROM CHAT_PARTICIPANTS p2
                             WHERE  p2.conv_id = c.conv_id
                           ),
          'partner_id'     VALUE CASE c.conv_type
                                   WHEN 'DM' THEN (
                                     SELECT p2.aus_id FROM CHAT_PARTICIPANTS p2
                                     WHERE  p2.conv_id = c.conv_id
                                       AND  p2.aus_id != l_aus_id
                                     FETCH FIRST 1 ROW ONLY
                                   )
                                   ELSE NULL
                                 END
          ABSENT ON NULL
        )
        ORDER BY NVL(c.last_msg_date, c.create_date) DESC
        RETURNING CLOB
      )
      FROM CHAT_CONVERSATIONS c
      JOIN CHAT_PARTICIPANTS  p ON p.conv_id = c.conv_id AND p.aus_id = l_aus_id
    ),
    JSON_ARRAY()
  )
  INTO l_result FROM DUAL;

  HTP.p('{"conversations":' || l_result || '}');
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('{"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;


-- -----------------------------------------------------------
-- 2. chatMsgList
--    x01 = conv_id | x02 = before_id | x03 = limit
-- -----------------------------------------------------------
DECLARE
  l_aus_id    NUMBER;
  l_conv_id   NUMBER;
  l_before_id NUMBER;
  l_limit     NUMBER;
  l_result    VARCHAR2(32767);
  l_has_more  NUMBER := 0;
  l_count     NUMBER;
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('{"error":"auth"}'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('{"error":"user_not_found"}'); RETURN;
  END;

  IF apex_application.g_x01 IS NULL THEN
    HTP.p('{"error":"conv_id required"}'); RETURN;
  END IF;

  l_conv_id   := TO_NUMBER(apex_application.g_x01);
  l_limit     := NVL(NULLIF(TRIM(apex_application.g_x03),''), '30');
  l_before_id := CASE
                   WHEN TRIM(apex_application.g_x02) IS NULL OR TRIM(apex_application.g_x02) = ''
                   THEN NULL ELSE TO_NUMBER(apex_application.g_x02)
                 END;

  SELECT COUNT(*) INTO l_count FROM CHAT_PARTICIPANTS
  WHERE conv_id = l_conv_id AND aus_id = l_aus_id;
  IF l_count = 0 THEN HTP.p('{"error":"forbidden"}'); RETURN; END IF;

  SELECT COUNT(*) INTO l_count FROM CHAT_MESSENGERS
  WHERE conv_id = l_conv_id AND delete_date IS NULL
    AND (l_before_id IS NULL OR msg_id < l_before_id);
  IF l_count > l_limit THEN l_has_more := 1; END IF;

  SELECT NVL(
    (
      SELECT JSON_ARRAYAGG(
        JSON_OBJECT(
          'id'                VALUE m.msg_id,
          'from_aus_id'       VALUE m.from_aus_id,
          'from_name'         VALUE NVL(e.full_name, 'Unknown'),
          'body'              VALUE CASE WHEN m.delete_date IS NOT NULL THEN NULL ELSE m.body END,
          'is_deleted'        VALUE CASE WHEN m.delete_date IS NOT NULL THEN 1 ELSE 0 END,
          'msg_type'          VALUE m.msg_type,
          'time'              VALUE TO_CHAR(m.create_date, 'HH24:MI'),
          'date'              VALUE TO_CHAR(m.create_date, 'YYYY-MM-DD"T"HH24:MI:SS'),
          'reply_to_id'       VALUE m.reply_to_msg_id,
          'reply_body'        VALUE CASE WHEN m.reply_to_msg_id IS NULL THEN NULL
                                ELSE (SELECT SUBSTR(qm.body,1,100) FROM CHAT_MESSENGERS qm
                                      WHERE qm.msg_id = m.reply_to_msg_id) END,
          'reply_from_name'   VALUE CASE WHEN m.reply_to_msg_id IS NULL THEN NULL
                                ELSE (SELECT NVL(qe.full_name,'Unknown')
                                      FROM CHAT_MESSENGERS qm
                                      JOIN APP_USERS qu ON qu.aus_id = qm.from_aus_id
                                      JOIN EMPLOYEES qe ON qe.emp_id = qu.emp_id
                                      WHERE qm.msg_id = m.reply_to_msg_id) END,
          'reply_from_aus_id' VALUE CASE WHEN m.reply_to_msg_id IS NULL THEN NULL
                                ELSE (SELECT qm.from_aus_id FROM CHAT_MESSENGERS qm
                                      WHERE qm.msg_id = m.reply_to_msg_id) END
          ABSENT ON NULL
        )
        ORDER BY m.msg_id ASC
        RETURNING CLOB
      )
      FROM (
        SELECT * FROM (
          SELECT m_inner.msg_id, m_inner.from_aus_id, m_inner.body,
                 m_inner.msg_type, m_inner.reply_to_msg_id,
                 m_inner.create_date, m_inner.delete_date
          FROM   CHAT_MESSENGERS m_inner
          WHERE  m_inner.conv_id = l_conv_id
            AND  (l_before_id IS NULL OR m_inner.msg_id < l_before_id)
          ORDER  BY m_inner.msg_id DESC
          FETCH FIRST l_limit ROWS ONLY
        ) ORDER BY msg_id ASC
      ) m
      JOIN APP_USERS u ON u.aus_id = m.from_aus_id
      JOIN EMPLOYEES e ON e.emp_id = u.emp_id
    ),
    JSON_ARRAY()
  )
  INTO l_result FROM DUAL;

  HTP.p('{"messages":' || l_result || ',"has_more":' || l_has_more || '}');
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('{"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;


-- -----------------------------------------------------------
-- 3. chatMemberList
--    x01 = conv_id
-- -----------------------------------------------------------
DECLARE
  l_aus_id        NUMBER;
  l_conv_id       NUMBER;
  l_count         NUMBER;
  l_result        VARCHAR2(32767);
  l_online_cutoff TIMESTAMP := SYSTIMESTAMP - INTERVAL '35' SECOND;
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('{"error":"auth"}'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('{"error":"user_not_found"}'); RETURN;
  END;

  IF apex_application.g_x01 IS NULL THEN
    HTP.p('{"error":"conv_id required"}'); RETURN;
  END IF;
  l_conv_id := TO_NUMBER(apex_application.g_x01);

  SELECT COUNT(*) INTO l_count FROM CHAT_PARTICIPANTS
  WHERE conv_id = l_conv_id AND aus_id = l_aus_id;
  IF l_count = 0 THEN HTP.p('{"error":"forbidden"}'); RETURN; END IF;

  WITH members_remote AS (
    SELECT /*+ MATERIALIZE */
           p.aus_id, p.is_admin,
           NVL(e.full_name, 'Unknown') AS full_name,
           u.user_name
    FROM   CHAT_PARTICIPANTS p
    JOIN   APP_USERS  u ON u.aus_id = p.aus_id
    JOIN   EMPLOYEES  e ON e.emp_id = u.emp_id
    WHERE  p.conv_id = l_conv_id
  )
  SELECT NVL(
    JSON_ARRAYAGG(
      JSON_OBJECT(
        'aus_id'    VALUE r.aus_id,
        'full_name' VALUE REGEXP_REPLACE(r.full_name, '[[:cntrl:]]', ''),
        'user_name' VALUE REGEXP_REPLACE(r.user_name, '[[:cntrl:]]', ''),
        'is_admin'  VALUE r.is_admin,
        'is_online' VALUE CASE WHEN o.last_seen >= l_online_cutoff THEN 1 ELSE 0 END
      )
      ORDER BY r.is_admin DESC, r.full_name ASC
      RETURNING CLOB
    ),
    JSON_ARRAY()
  )
  INTO l_result
  FROM   members_remote r
  LEFT JOIN CHAT_USER_ONLINE o ON o.aus_id = r.aus_id;

  HTP.p('{"members":' || l_result || '}');
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('{"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;


-- -----------------------------------------------------------
-- 4. chatContactList
--    Toàn bộ users trong hệ thống, grouped by dept
-- -----------------------------------------------------------
DECLARE
  l_aus_id        NUMBER;
  l_me_json       VARCHAR2(4000);
  l_users_json    VARCHAR2(32767);
  l_online_cutoff TIMESTAMP := SYSTIMESTAMP - INTERVAL '35' SECOND;
  l_tmp_fname     VARCHAR2(500);
  l_tmp_uname     VARCHAR2(200);
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('{"error":"auth"}'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('{"error":"user_not_found"}'); RETURN;
  END;

  -- Fetch raw values từ remote vào local PL/SQL vars, sau đó REGEXP_REPLACE chạy local
  SELECT NVL(e.full_name, 'Unknown'), u.user_name
  INTO l_tmp_fname, l_tmp_uname
  FROM APP_USERS u
  JOIN EMPLOYEES e ON e.emp_id = u.emp_id
  WHERE u.aus_id = l_aus_id;

  l_tmp_fname := REGEXP_REPLACE(l_tmp_fname, '[[:cntrl:]]', '');
  l_tmp_uname := REGEXP_REPLACE(l_tmp_uname, '[[:cntrl:]]', '');

  SELECT JSON_OBJECT(
    'aus_id'    VALUE l_aus_id,
    'full_name' VALUE l_tmp_fname,
    'user_name' VALUE l_tmp_uname,
    'is_online' VALUE 1
  ) INTO l_me_json FROM DUAL;

  -- MATERIALIZE fetch remote data trước, sau đó outer query chạy REGEXP_REPLACE + JOIN local table
  WITH users_remote AS (
    SELECT /*+ MATERIALIZE */
           u.aus_id,
           NVL(e.full_name, 'Unknown') AS full_name,
           u.user_name,
           d.dep_name,
           pos.position_name
    FROM   APP_USERS u
    JOIN   EMPLOYEES e   ON e.emp_id   = u.emp_id
    LEFT JOIN DEPARTMENTS d ON d.dep_id = e.dep_id
    LEFT JOIN POSITIONS pos ON pos.pos_id = e.emp_position
    WHERE  u.aus_id != l_aus_id
      AND  u.status = 'Y'
  )
  SELECT NVL(
    JSON_ARRAYAGG(
      JSON_OBJECT(
        'aus_id'    VALUE r.aus_id,
        'full_name' VALUE REGEXP_REPLACE(r.full_name,     '[[:cntrl:]]', ''),
        'user_name' VALUE REGEXP_REPLACE(r.user_name,     '[[:cntrl:]]', ''),
        'dept'      VALUE REGEXP_REPLACE(r.dep_name,      '[[:cntrl:]]', ''),
        'role'      VALUE REGEXP_REPLACE(r.position_name, '[[:cntrl:]]', ''),
        'is_online' VALUE CASE WHEN o.last_seen >= l_online_cutoff THEN 1 ELSE 0 END
        ABSENT ON NULL
      )
      ORDER BY r.dep_name ASC, r.full_name ASC
      RETURNING CLOB
    ),
    JSON_ARRAY()
  )
  INTO l_users_json
  FROM users_remote r
  LEFT JOIN CHAT_USER_ONLINE o ON o.aus_id = r.aus_id;

  HTP.p('{"me":' || l_me_json || ',"users":' || l_users_json || '}');
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('{"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;


-- -----------------------------------------------------------
-- 5. chatSend
--    x01=conv_id | x02=body | x03=reply_to_msg_id | x04=partner_aus_id
-- -----------------------------------------------------------
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
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('{"error":"user_not_found"}'); RETURN;
  END;

  l_payload := JSON_OBJECT(
    'conv_id'         VALUE TO_NUMBER(apex_application.g_x01),
    'aus_id'          VALUE l_aus_id,
    'body'            VALUE apex_application.g_x02,
    'reply_to_msg_id' VALUE NULLIF(TRIM(apex_application.g_x03), ''),
    'partner_aus_id'  VALUE NULLIF(TRIM(apex_application.g_x04), '')
    ABSENT ON NULL
  );

  UTL_HTTP.SET_TRANSFER_TIMEOUT(10);
  l_url := 'http://172.25.10.38:3410/api/chat/send';
  l_req := UTL_HTTP.BEGIN_REQUEST(l_url, 'POST', 'HTTP/1.1');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Type', 'application/json');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Length', LENGTHB(l_payload));
  UTL_HTTP.WRITE_TEXT(l_req, l_payload);
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN
    LOOP UTL_HTTP.READ_TEXT(l_resp, l_buffer, 32767); l_body := l_body || l_buffer; END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL;
  END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.p(l_body);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.p('{"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;


-- -----------------------------------------------------------
-- 6. chatCreate
--    x01=conv_type | x02=name | x03=members JSON | x04=doc_type | x05=doc_no
-- -----------------------------------------------------------
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
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('{"error":"user_not_found"}'); RETURN;
  END;

  l_payload := '{"conv_type":"' || apex_application.g_x01 || '"'
    || ',"name":"'    || REPLACE(apex_application.g_x02, '"', '\"') || '"'
    || ',"members":'  || NVL(NULLIF(TRIM(apex_application.g_x03),''), '[]')
    || ',"aus_id":'   || TO_CHAR(l_aus_id)
    || CASE WHEN TRIM(apex_application.g_x04) IS NOT NULL
            THEN ',"doc_type":"' || REPLACE(apex_application.g_x04,'"','\"') || '"' ELSE '' END
    || CASE WHEN TRIM(apex_application.g_x05) IS NOT NULL
            THEN ',"doc_no":"'   || REPLACE(apex_application.g_x05,'"','\"') || '"' ELSE '' END
    || '}';

  UTL_HTTP.SET_TRANSFER_TIMEOUT(10);
  l_url := 'http://172.25.10.38:3410/api/chat/create';
  l_req := UTL_HTTP.BEGIN_REQUEST(l_url, 'POST', 'HTTP/1.1');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Type', 'application/json');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Length', LENGTHB(l_payload));
  UTL_HTTP.WRITE_TEXT(l_req, l_payload);
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN
    LOOP UTL_HTTP.READ_TEXT(l_resp, l_buffer, 32767); l_body := l_body || l_buffer; END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL;
  END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.p(l_body);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.p('{"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;


-- -----------------------------------------------------------
-- 7. chatRead
--    x01 = conv_id
-- -----------------------------------------------------------
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
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
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
  UTL_HTTP.SET_HEADER(l_req, 'Content-Length', '0');
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN LOOP UTL_HTTP.READ_TEXT(l_resp, l_tmp, 4000); l_buf := l_buf || l_tmp; END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL; END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.p(l_buf);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.p('{"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;


-- -----------------------------------------------------------
-- 8. chatTyping
--    x01 = conv_id
-- -----------------------------------------------------------
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
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
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
  UTL_HTTP.SET_HEADER(l_req, 'Content-Length', '0');
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN LOOP UTL_HTTP.READ_TEXT(l_resp, l_tmp, 4000); l_buf := l_buf || l_tmp; END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL; END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.p(l_buf);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.p('{"error":"' || REPLACE(SQLERRM,'"','\"') || '"}');
END;


-- -----------------------------------------------------------
-- 9. chatEvents  (long-poll 25s)
-- -----------------------------------------------------------
DECLARE
  l_aus_id NUMBER;
  l_url    VARCHAR2(500);
  l_req    UTL_HTTP.REQ;
  l_resp   UTL_HTTP.RESP;
  l_body   VARCHAR2(32767) := '';
  l_buffer VARCHAR2(32767);
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody','NOBODY') THEN
    HTP.p('{"type":"timeout"}'); RETURN;
  END IF;
  BEGIN
    SELECT aus_id INTO l_aus_id FROM APP_USERS
    WHERE LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION WHEN NO_DATA_FOUND THEN
    HTP.p('{"type":"timeout"}'); RETURN;
  END;

  l_url := 'http://172.25.10.38:3410/api/chat/events/' || TO_CHAR(l_aus_id);
  UTL_HTTP.SET_TRANSFER_TIMEOUT(28);
  l_req  := UTL_HTTP.BEGIN_REQUEST(l_url, 'GET', 'HTTP/1.1');
  UTL_HTTP.SET_HEADER(l_req, 'Connection', 'close');
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN
    LOOP UTL_HTTP.READ_TEXT(l_resp, l_buffer, 32767); l_body := l_body || l_buffer; END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL;
  END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.p(l_body);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.p('{"type":"timeout"}');
END;
