-- ===========================================================
-- CHAT MODULE — APEX Ajax Callback Processes (Page 0)
-- ===========================================================
-- Cách tạo trong APEX Page Designer:
--   Page 0 → Processing (tab) → Ajax Callback (section)
--   Right-click → Create Process
--   Name: <tên bên dưới>
--   Type: Execute Code
--   PL/SQL Code: copy đoạn tương ứng
--   Point: Ajax Callback
-- ===========================================================
-- Node.js base URL — đổi IP nếu Server B thay đổi
--   http://172.25.10.38:3410
-- ===========================================================
-- Tham số x01..x10 được truyền từ JS qua:
--   apex.server.process('callbackName', { x01: ..., x02: ... })
-- Trong PL/SQL đọc bằng: apex_application.g_x01, g_x02, ...
-- ===========================================================


-- -----------------------------------------------------------
-- 1. chatGetConversations
--    GET /api/chat/conversations/:aus_id
--    JS: apex.server.process('chatGetConversations', {})
-- -----------------------------------------------------------
DECLARE
  l_req    UTL_HTTP.REQ;
  l_resp   UTL_HTTP.RESP;
  l_text   VARCHAR2(32767);
  l_result VARCHAR2(32767) := '';
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  IF :G_AUS_ID IS NULL THEN
    HTP.P('{"error":"G_AUS_ID is null"}');
    RETURN;
  END IF;
  UTL_HTTP.SET_TRANSFER_TIMEOUT(10);
  l_req  := UTL_HTTP.BEGIN_REQUEST(
              'http://172.25.10.38:3410/api/chat/conversations/' || :G_AUS_ID);
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN
    LOOP
      UTL_HTTP.READ_TEXT(l_resp, l_text, 32767);
      l_result := l_result || l_text;
    END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL;
  END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.P(l_result);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.P('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- -----------------------------------------------------------
-- 2. chatGetMessages
--    GET /api/chat/messages/:conv_id[?before_id=&limit=]
--    JS: apex.server.process('chatGetMessages', {
--          x01: conv_id,
--          x02: before_id,  -- optional, '' nếu không có
--          x03: limit        -- optional, '' nếu dùng default
--        })
-- -----------------------------------------------------------
DECLARE
  l_req    UTL_HTTP.REQ;
  l_resp   UTL_HTTP.RESP;
  l_text   VARCHAR2(32767);
  l_result VARCHAR2(32767) := '';
  l_url    VARCHAR2(1000);
  l_sep    VARCHAR2(1) := '?';
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  l_url := 'http://172.25.10.38:3410/api/chat/messages/' || apex_application.g_x01;
  IF apex_application.g_x02 IS NOT NULL AND apex_application.g_x02 != '' THEN
    l_url := l_url || l_sep || 'before_id=' || TO_NUMBER(apex_application.g_x02);
    l_sep := '&';
  END IF;
  IF apex_application.g_x03 IS NOT NULL AND apex_application.g_x03 != '' THEN
    l_url := l_url || l_sep || 'limit=' || TO_NUMBER(apex_application.g_x03);
  END IF;

  UTL_HTTP.SET_TRANSFER_TIMEOUT(10);
  l_req  := UTL_HTTP.BEGIN_REQUEST(l_url);
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN
    LOOP
      UTL_HTTP.READ_TEXT(l_resp, l_text, 32767);
      l_result := l_result || l_text;
    END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL;
  END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.P(l_result);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.P('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- -----------------------------------------------------------
-- 3. chatSend
--    POST /api/chat/send
--    JS: apex.server.process('chatSend', {
--          x01: conv_id,
--          x02: body (text tin nhắn),
--          x03: reply_to_msg_id  -- optional, '' nếu không reply
--        })
-- -----------------------------------------------------------
DECLARE
  l_req    UTL_HTTP.REQ;
  l_resp   UTL_HTTP.RESP;
  l_text   VARCHAR2(32767);
  l_result VARCHAR2(32767) := '';
  l_body   VARCHAR2(32767);
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  -- Tạo JSON body; APEX_JSON.STRINGIFY xử lý escape ký tự đặc biệt
  l_body := '{'
    || '"conv_id":'          || apex_application.g_x01
    || ',"aus_id":'          || :G_AUS_ID
    || ',"partner_aus_id":'  || CASE WHEN apex_application.g_x04 IS NULL OR apex_application.g_x04 = ''
                                     THEN 'null'
                                     ELSE apex_application.g_x04
                                END
    || ',"username":'        || APEX_JSON.STRINGIFY(:G_USER_NAME)
    || ',"body":'            || APEX_JSON.STRINGIFY(apex_application.g_x02)
    || ',"reply_to_msg_id":' || CASE WHEN apex_application.g_x03 IS NULL OR apex_application.g_x03 = ''
                                     THEN 'null'
                                     ELSE apex_application.g_x03
                                END
    || '}';

  UTL_HTTP.SET_TRANSFER_TIMEOUT(10);
  l_req := UTL_HTTP.BEGIN_REQUEST(
    'http://172.25.10.38:3410/api/chat/send', 'POST', 'HTTP/1.1');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Type',   'application/json; charset=UTF-8');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Length', LENGTHB(l_body));
  UTL_HTTP.WRITE_TEXT(l_req, l_body);
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN
    LOOP
      UTL_HTTP.READ_TEXT(l_resp, l_text, 32767);
      l_result := l_result || l_text;
    END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL;
  END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.P(l_result);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.P('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- -----------------------------------------------------------
-- 4. chatEvents  ← LONG-POLL (timeout 28s)
--    GET /api/chat/events/:aus_id
--    JS: apex.server.process('chatEvents', {}, { timeout: 35000 })
--    Node.js treo tối đa 25s → UTL_HTTP timeout 28s (buffer)
-- -----------------------------------------------------------
DECLARE
  l_req    UTL_HTTP.REQ;
  l_resp   UTL_HTTP.RESP;
  l_text   VARCHAR2(32767);
  l_result VARCHAR2(32767) := '';
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  UTL_HTTP.SET_TRANSFER_TIMEOUT(28);
  l_req  := UTL_HTTP.BEGIN_REQUEST(
              'http://172.25.10.38:3410/api/chat/events/' || :G_AUS_ID);
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN
    LOOP
      UTL_HTTP.READ_TEXT(l_resp, l_text, 32767);
      l_result := l_result || l_text;
    END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL;
  END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.P(l_result);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    -- Timeout UTL_HTTP → trả về timeout để client poll lại
    HTP.P('{"events":[],"status":"timeout"}');
END;


-- -----------------------------------------------------------
-- 5. chatRead
--    POST /api/chat/read/:conv_id/:aus_id
--    JS: apex.server.process('chatRead', { x01: conv_id })
-- -----------------------------------------------------------
DECLARE
  l_req    UTL_HTTP.REQ;
  l_resp   UTL_HTTP.RESP;
  l_text   VARCHAR2(32767);
  l_result VARCHAR2(32767) := '';
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  UTL_HTTP.SET_TRANSFER_TIMEOUT(10);
  l_req := UTL_HTTP.BEGIN_REQUEST(
    'http://172.25.10.38:3410/api/chat/read/'
    || TO_NUMBER(apex_application.g_x01) || '/' || TO_NUMBER(:G_AUS_ID),
    'POST', 'HTTP/1.1');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Length', '0');
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN
    LOOP
      UTL_HTTP.READ_TEXT(l_resp, l_text, 32767);
      l_result := l_result || l_text;
    END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL;
  END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.P(l_result);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.P('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- -----------------------------------------------------------
-- 6. chatTyping
--    POST /api/chat/typing/:conv_id/:aus_id
--    JS: apex.server.process('chatTyping', { x01: conv_id })
--    Gọi mỗi 2-3s khi user đang nhập (throttle ở JS)
-- -----------------------------------------------------------
DECLARE
  l_req    UTL_HTTP.REQ;
  l_resp   UTL_HTTP.RESP;
  l_text   VARCHAR2(32767);
  l_result VARCHAR2(32767) := '';
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  UTL_HTTP.SET_TRANSFER_TIMEOUT(5);
  l_req := UTL_HTTP.BEGIN_REQUEST(
    'http://172.25.10.38:3410/api/chat/typing/'
    || TO_NUMBER(apex_application.g_x01) || '/' || TO_NUMBER(:G_AUS_ID),
    'POST', 'HTTP/1.1');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Length', '0');
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN
    LOOP
      UTL_HTTP.READ_TEXT(l_resp, l_text, 32767);
      l_result := l_result || l_text;
    END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL;
  END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.P(l_result);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.P('{"status":"ok"}');  -- silent fail — typing không cần error UI
END;


-- -----------------------------------------------------------
-- 7. chatHeartbeat
--    POST /api/chat/heartbeat/:aus_id
--    JS: setInterval(() => apex.server.process('chatHeartbeat'), 20000)
-- -----------------------------------------------------------
DECLARE
  l_req    UTL_HTTP.REQ;
  l_resp   UTL_HTTP.RESP;
  l_text   VARCHAR2(32767);
  l_result VARCHAR2(32767) := '';
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  UTL_HTTP.SET_TRANSFER_TIMEOUT(5);
  l_req := UTL_HTTP.BEGIN_REQUEST(
    'http://172.25.10.38:3410/api/chat/heartbeat/' || TO_NUMBER(:G_AUS_ID),
    'POST', 'HTTP/1.1');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Length', '0');
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN
    LOOP
      UTL_HTTP.READ_TEXT(l_resp, l_text, 32767);
      l_result := l_result || l_text;
    END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL;
  END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.P(l_result);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.P('{"status":"ok"}');  -- silent fail
END;


-- -----------------------------------------------------------
-- 8. chatOnline
--    GET /api/chat/online
--    JS: apex.server.process('chatOnline', {})
--    Trả về: { "online": [aus_id1, aus_id2, ...] }
-- -----------------------------------------------------------
DECLARE
  l_req    UTL_HTTP.REQ;
  l_resp   UTL_HTTP.RESP;
  l_text   VARCHAR2(32767);
  l_result VARCHAR2(32767) := '';
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  UTL_HTTP.SET_TRANSFER_TIMEOUT(5);
  l_req  := UTL_HTTP.BEGIN_REQUEST(
              'http://172.25.10.38:3410/api/chat/online');
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN
    LOOP
      UTL_HTTP.READ_TEXT(l_resp, l_text, 32767);
      l_result := l_result || l_text;
    END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL;
  END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.P(l_result);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.P('{"online":[]}');
END;


-- -----------------------------------------------------------
-- 9. chatCreate
--    POST /api/chat/create
--    JS: apex.server.process('chatCreate', {
--          x01: conv_type  ('DM' hoặc 'CHANNEL')
--          x02: name       (bắt buộc nếu CHANNEL, '' nếu DM)
--          x03: member_aus_ids (JSON array string, VD: '[5,12,99]')
--        })
-- -----------------------------------------------------------
DECLARE
  l_req    UTL_HTTP.REQ;
  l_resp   UTL_HTTP.RESP;
  l_text   VARCHAR2(32767);
  l_result VARCHAR2(32767) := '';
  l_body   VARCHAR2(32767);
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  l_body := '{'
    || '"conv_type":'       || APEX_JSON.STRINGIFY(apex_application.g_x01)
    || ',"name":'           || CASE WHEN apex_application.g_x02 IS NULL OR apex_application.g_x02 = ''
                                    THEN 'null'
                                    ELSE APEX_JSON.STRINGIFY(apex_application.g_x02)
                               END
    || ',"aus_id":'         || TO_NUMBER(:G_AUS_ID)
    || ',"username":'       || APEX_JSON.STRINGIFY(:G_USER_NAME)
    || ',"member_aus_ids":' || apex_application.g_x03
    || '}';

  UTL_HTTP.SET_TRANSFER_TIMEOUT(10);
  l_req := UTL_HTTP.BEGIN_REQUEST(
    'http://172.25.10.38:3410/api/chat/create', 'POST', 'HTTP/1.1');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Type',   'application/json; charset=UTF-8');
  UTL_HTTP.SET_HEADER(l_req, 'Content-Length', LENGTHB(l_body));
  UTL_HTTP.WRITE_TEXT(l_req, l_body);
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN
    LOOP
      UTL_HTTP.READ_TEXT(l_resp, l_text, 32767);
      l_result := l_result || l_text;
    END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL;
  END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.P(l_result);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.P('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- -----------------------------------------------------------
-- 10. chatSearchUsers
--     Tìm user để thêm vào DM/CHANNEL (query trực tiếp DB)
--     JS: apex.server.process('chatSearchUsers', { x01: keyword })
--     Trả về: { users: [{ aus_id, full_name, username }] }
-- -----------------------------------------------------------
DECLARE
  l_json CLOB;
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  APEX_JSON.INITIALIZE_CLOB_OUTPUT;
  APEX_JSON.OPEN_OBJECT;
  APEX_JSON.OPEN_ARRAY('users');

  FOR r IN (
    SELECT u.aus_id,
           e.full_name,
           u.user_name
    FROM   APP_USERS  u
    JOIN   EMPLOYEES  e ON e.emp_id = u.emp_id
    WHERE  u.aus_id != TO_NUMBER(:G_AUS_ID)
      AND  (UPPER(e.full_name) LIKE '%' || UPPER(apex_application.g_x01) || '%'
         OR UPPER(u.user_name) LIKE '%' || UPPER(apex_application.g_x01) || '%')
    ORDER BY e.full_name
    FETCH FIRST 20 ROWS ONLY
  ) LOOP
    APEX_JSON.OPEN_OBJECT;
    APEX_JSON.WRITE('aus_id',    r.aus_id);
    APEX_JSON.WRITE('full_name', r.full_name);
    APEX_JSON.WRITE('username',  r.username);
    APEX_JSON.CLOSE_OBJECT;
  END LOOP;

  APEX_JSON.CLOSE_ARRAY;
  APEX_JSON.CLOSE_OBJECT;
  l_json := APEX_JSON.GET_CLOB_OUTPUT;
  APEX_JSON.FREE_OUTPUT;
  HTP.P(l_json);
EXCEPTION
  WHEN OTHERS THEN
    HTP.P('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- -----------------------------------------------------------
-- 11. chatGetMembers
--     GET /api/chat/members/:conv_id
--     JS: apex.server.process('chatGetMembers', { x01: conv_id })
--     Trả về: { members: [{ aus_id, full_name, username, is_admin }] }
-- -----------------------------------------------------------
DECLARE
  l_req    UTL_HTTP.REQ;
  l_resp   UTL_HTTP.RESP;
  l_text   VARCHAR2(32767);
  l_result VARCHAR2(32767) := '';
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');
  UTL_HTTP.SET_TRANSFER_TIMEOUT(8);
  l_req  := UTL_HTTP.BEGIN_REQUEST(
              'http://172.25.10.38:3410/api/chat/members/' || TO_NUMBER(apex_application.g_x01));
  l_resp := UTL_HTTP.GET_RESPONSE(l_req);
  BEGIN
    LOOP
      UTL_HTTP.READ_TEXT(l_resp, l_text, 32767);
      l_result := l_result || l_text;
    END LOOP;
  EXCEPTION WHEN UTL_HTTP.END_OF_BODY THEN NULL;
  END;
  UTL_HTTP.END_RESPONSE(l_resp);
  HTP.P(l_result);
EXCEPTION
  WHEN OTHERS THEN
    BEGIN UTL_HTTP.END_RESPONSE(l_resp); EXCEPTION WHEN OTHERS THEN NULL; END;
    HTP.P('{"error":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;
