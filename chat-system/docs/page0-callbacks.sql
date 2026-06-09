-- ===========================================================
-- PAGE 0 AJAX CALLBACKS — SSE Architecture
-- Paste vào APEX Builder → Page 0 → Ajax Callbacks
--
-- Dependencies:
--   Application Item G_SSE_SECRET  — hex secret khớp với .env G_SSE_SECRET
--   Page 0 Item     P0_AUS_ID      — populated by server substitution &G_AUS_ID.
--   Table           CHAT_USER_ONLINE (aus_id PK, last_seen TIMESTAMP)
--   Table           USER_NOTIFICATIONS (aus_id, read)
--   Grant:          GRANT EXECUTE ON DBMS_CRYPTO TO DEV24;
-- ===========================================================


-- -----------------------------------------------------------
-- 1. sseToken
--    Mint token HMAC-SHA256 cho SSE client.
--    JS: apex.server.process('sseToken', {}, { dataType:'text', ... })
--    Returns: "<body>.<sig>"  (plain text, không phải JSON)
--
--    Token format (khớp token.js):
--      body = base64url("<aus_id>|<exp_epoch_seconds>")
--      sig  = base64url(HMAC_SHA256(body, G_SSE_SECRET))
--      TTL  = 120 giây
--
--    Pitfalls:
--      - DBMS_CRYPTO.HMAC_SH256 = 3  (typ=>2 là SHA1 — sai)
--      - UTL_ENCODE.BASE64_ENCODE trả RAW → phải UTL_RAW.CAST_TO_VARCHAR2
--        trước khi xử lý chuỗi; gán RAW thẳng vào VARCHAR2 → Oracle hex-encodes
--      - KHÔNG hardcode secret; đọc từ G_SSE_SECRET Application Item
-- -----------------------------------------------------------
DECLARE
  l_aus_id  NUMBER        := TO_NUMBER(:G_AUS_ID);
  l_exp     NUMBER;
  l_body    VARCHAR2(200);
  l_sig_raw RAW(32);
  l_sig     VARCHAR2(100);
  l_secret  VARCHAR2(200) := :G_SSE_SECRET;

  -- Chuyển RAW → base64url (RFC 4648 §5: +→-, /→_, bỏ padding =)
  FUNCTION to_base64url(p_raw IN RAW) RETURN VARCHAR2 IS
    l_v VARCHAR2(200);
  BEGIN
    -- UTL_ENCODE.BASE64_ENCODE trả RAW chứa ASCII base64
    l_v := UTL_RAW.CAST_TO_VARCHAR2(UTL_ENCODE.BASE64_ENCODE(p_raw));
    -- Bỏ CR/LF mà Oracle chèn mỗi 76 ký tự
    l_v := REPLACE(REPLACE(l_v, CHR(13), ''), CHR(10), '');
    -- Đổi alphabet sang URL-safe, bỏ padding
    l_v := REPLACE(REPLACE(REPLACE(l_v, '+', '-'), '/', '_'), '=', '');
    RETURN l_v;
  END;
BEGIN
  OWA_UTIL.MIME_HEADER('text/plain', TRUE, 'UTF-8');

  IF l_aus_id IS NULL OR l_aus_id = 0 THEN
    HTP.p(''); RETURN;
  END IF;
  IF l_secret IS NULL THEN
    HTP.p(''); RETURN;
  END IF;

  -- Epoch hiện tại (UTC) + 120s
  l_exp := FLOOR(
    (CAST(SYS_EXTRACT_UTC(SYSTIMESTAMP) AS DATE) - DATE '1970-01-01') * 86400
  ) + 120;

  -- body = base64url("<aus_id>|<exp>")
  l_body := to_base64url(UTL_RAW.CAST_TO_RAW(TO_CHAR(l_aus_id) || '|' || TO_CHAR(l_exp)));

  -- sig = base64url(HMAC_SHA256(body, secret))
  -- typ => 3 = DBMS_CRYPTO.HMAC_SH256  (KHÔNG dùng 2 — đó là SHA1)
  l_sig_raw := DBMS_CRYPTO.MAC(
    src => UTL_RAW.CAST_TO_RAW(l_body),
    typ => 3,
    key => UTL_RAW.CAST_TO_RAW(l_secret)
  );
  l_sig := to_base64url(l_sig_raw);

  HTP.p(l_body || '.' || l_sig);
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('');
END;


-- -----------------------------------------------------------
-- 2. chatHeartbeat
--    Track online presence — gọi mỗi 20s từ global.js.
--    JS: apex.server.process('chatHeartbeat', {})  — fire-and-forget, không check response
--
--    Dùng MERGE để upsert CHAT_USER_ONLINE (no FK — APP_USERS là remote table).
--    :G_AUS_ID tin cậy tại Page 0 Ajax Callback (APEX session context đầy đủ).
-- -----------------------------------------------------------
DECLARE
  l_aus_id NUMBER := TO_NUMBER(:G_AUS_ID);
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');

  IF l_aus_id IS NULL OR l_aus_id = 0 THEN
    HTP.p('{"status":"skip"}'); RETURN;
  END IF;

  MERGE INTO CHAT_USER_ONLINE o
  USING (SELECT l_aus_id AS aus_id FROM DUAL) src
    ON  (o.aus_id = src.aus_id)
  WHEN MATCHED     THEN UPDATE SET last_seen = SYSTIMESTAMP
  WHEN NOT MATCHED THEN INSERT (aus_id, last_seen) VALUES (src.aus_id, SYSTIMESTAMP);
  COMMIT;

  HTP.p('{"status":"ok"}');
EXCEPTION
  WHEN OTHERS THEN
    ROLLBACK;
    HTP.p('{"status":"error","msg":"' || REPLACE(SQLERRM, '"', '\"') || '"}');
END;


-- -----------------------------------------------------------
-- 3. notificationCount
--    Trả về số thông báo chưa đọc của user hiện tại.
--    JS: apex.server.process('notificationCount', {}, { dataType:'json', ... })
--    Returns: { "count": N }
--
--    Resolve aus_id từ :APP_USER (không tin g_x01 từ client) để chắc security.
--    Dùng Application Process (không pageId) vì global.js chạy trên mọi page.
-- -----------------------------------------------------------
DECLARE
  l_aus_id NUMBER;
  l_count  NUMBER := 0;
BEGIN
  OWA_UTIL.MIME_HEADER('application/json', TRUE, 'UTF-8');

  IF :APP_USER IS NULL OR :APP_USER IN ('nobody', 'NOBODY') THEN
    HTP.p('{"count":0}'); RETURN;
  END IF;

  BEGIN
    SELECT aus_id INTO l_aus_id
    FROM   APP_USERS
    WHERE  LOWER(user_name) = LOWER(:APP_USER);
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      HTP.p('{"count":0}'); RETURN;
  END;

  SELECT COUNT(*) INTO l_count
  FROM   USER_NOTIFICATIONS
  WHERE  aus_id = l_aus_id
    AND  read   = 'N';

  HTP.p('{"count":' || TO_CHAR(l_count) || '}');
EXCEPTION
  WHEN OTHERS THEN
    HTP.p('{"count":0}');
END;
