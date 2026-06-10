-- ============================================================
-- notif-callbacks.sql
-- Tạo 4 Ajax Callback trên Page 0 của APEX app
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. notifLoad  — GET danh sách thông báo của current user
--    Gọi: apex.server.process('notifLoad', {}, { pageId: 0, dataType:'json' })
-- ────────────────────────────────────────────────────────────
DECLARE
  l_aus_id   NUMBER;
  l_cutoff   TIMESTAMP := SYSTIMESTAMP;   -- placeholder, dùng nếu cần filter
BEGIN
  -- Xác thực user (app_users là remote → MATERIALIZE)
  IF :APP_USER IS NULL OR UPPER(:APP_USER) IN ('NOBODY','ANONYMOUS') THEN
    HTP.p('{"error":"auth"}');
    RETURN;
  END IF;

  BEGIN
    -- app_users remote → dùng subquery MATERIALIZE
    WITH remote_user AS (
      SELECT /*+ MATERIALIZE */ aus_id
      FROM   app_users
      WHERE  LOWER(user_name) = LOWER(:APP_USER)
        AND  ROWNUM = 1
    )
    SELECT aus_id INTO l_aus_id FROM remote_user;
  EXCEPTION
    WHEN NO_DATA_FOUND THEN
      HTP.p('{"error":"user_not_found"}');
      RETURN;
  END;

  -- Trả JSON
  DECLARE
    l_json CLOB;
  BEGIN
    SELECT JSON_OBJECT(
             'items' VALUE JSON_ARRAYAGG(
               JSON_OBJECT(
                 'ano_id'           VALUE ano.ano_id,
                 'ahh_id'           VALUE ahh.ahh_id,
                 'owner_table_name' VALUE ahh.owner_table_name,
                 'doc_number'       VALUE ahh.doc_number,
                 'status'           VALUE ahh.status,
                 'status_label'     VALUE dom.rv_meaning,
                 'ano_name'         VALUE ano.ano_name,
                 'ano_summary'      VALUE ano.ano_summary,
                 'jes_name'         VALUE jes.name,
                 'is_read'          VALUE uno.read,
                 'rel_time'         VALUE
                   CASE
                     WHEN ROUND((SYSDATE - TRUNC(ano.from_date)) * 24 * 60) < 1
                       THEN 'Vừa xong'
                     WHEN ROUND((SYSDATE - ano.from_date) * 24 * 60) < 60
                       THEN ROUND((SYSDATE - ano.from_date) * 24 * 60) || ' phút trước'
                     WHEN ROUND((SYSDATE - ano.from_date) * 24) < 24
                       THEN ROUND((SYSDATE - ano.from_date) * 24) || ' giờ trước'
                     WHEN TRUNC(SYSDATE) - TRUNC(ano.from_date) = 1
                       THEN 'Hôm qua'
                     WHEN TRUNC(SYSDATE) - TRUNC(ano.from_date) < 7
                       THEN (TRUNC(SYSDATE) - TRUNC(ano.from_date)) || ' ngày trước'
                     WHEN TRUNC(SYSDATE) - TRUNC(ano.from_date) < 30
                       THEN FLOOR((TRUNC(SYSDATE) - TRUNC(ano.from_date)) / 7) || ' tuần trước'
                     WHEN TRUNC(SYSDATE) - TRUNC(ano.from_date) < 365
                       THEN FLOOR((TRUNC(SYSDATE) - TRUNC(ano.from_date)) / 30) || ' tháng trước'
                     ELSE FLOOR((TRUNC(SYSDATE) - TRUNC(ano.from_date)) / 365) || ' năm trước'
                   END,
                 'date_group_label' VALUE
                   CASE
                     WHEN TRUNC(ano.from_date) = TRUNC(SYSDATE)       THEN 'HÔM NAY'
                     WHEN TRUNC(ano.from_date) = TRUNC(SYSDATE) - 1   THEN 'HÔM QUA'
                     WHEN TRUNC(ano.from_date) >= TRUNC(SYSDATE) - 7  THEN 'TUẦN TRƯỚC'
                     WHEN TRUNC(ano.from_date) >= TRUNC(SYSDATE) - 30 THEN 'THÁNG TRƯỚC'
                     ELSE 'CŨ HƠN'
                   END,
                 'date_group_order' VALUE
                   CASE
                     WHEN TRUNC(ano.from_date) = TRUNC(SYSDATE)       THEN 1
                     WHEN TRUNC(ano.from_date) = TRUNC(SYSDATE) - 1   THEN 2
                     WHEN TRUNC(ano.from_date) >= TRUNC(SYSDATE) - 7  THEN 3
                     WHEN TRUNC(ano.from_date) >= TRUNC(SYSDATE) - 30 THEN 4
                     ELSE 5
                   END
               ) ORDER BY ano.from_date DESC
               RETURNING CLOB
             )
           )
    INTO l_json
    FROM app_notifications          ano
    JOIN approval_histories_headers ahh ON ahh.ahh_id = ano.owner_id
    JOIN user_notifications         uno ON uno.ano_id = ano.ano_id
                                      AND uno.aus_id  = l_aus_id
    LEFT JOIN je_sources            jes ON jes.jes_id = ano.jes_id
    JOIN domain                     dom ON dom.rv_domain    = 'APPROVAL'
                                      AND dom.rv_low_value  = ahh.status
    WHERE uno.deleted = 'N'
      AND TRUNC(ano.from_date) <= TRUNC(SYSDATE)
      AND (   (ano.to_date IS NOT NULL AND TRUNC(ano.to_date) >= TRUNC(SYSDATE))
           OR  ano.to_date IS NULL);

    HTP.p(l_json);
  END;
END;


-- ────────────────────────────────────────────────────────────
-- 2. notifMarkRead  — đánh dấu 1 thông báo đã đọc
--    x01 = ano_id
-- ────────────────────────────────────────────────────────────
DECLARE
  l_aus_id NUMBER;
  l_ano_id NUMBER := TO_NUMBER(:x01);
BEGIN
  IF :APP_USER IS NULL OR UPPER(:APP_USER) IN ('NOBODY','ANONYMOUS') THEN
    HTP.p('{"ok":false}'); RETURN;
  END IF;

  WITH remote_user AS (
    SELECT /*+ MATERIALIZE */ aus_id FROM app_users
    WHERE  LOWER(user_name) = LOWER(:APP_USER) AND ROWNUM = 1
  )
  SELECT aus_id INTO l_aus_id FROM remote_user;

  UPDATE user_notifications
  SET    read = 'Y'
  WHERE  ano_id = l_ano_id
    AND  aus_id = l_aus_id;

  HTP.p('{"ok":true}');
EXCEPTION WHEN OTHERS THEN
  HTP.p('{"ok":false,"err":"' || SQLERRM || '"}');
END;


-- ────────────────────────────────────────────────────────────
-- 3. notifMarkAll  — đánh dấu TẤT CẢ đã đọc
-- ────────────────────────────────────────────────────────────
DECLARE
  l_aus_id NUMBER;
BEGIN
  IF :APP_USER IS NULL OR UPPER(:APP_USER) IN ('NOBODY','ANONYMOUS') THEN
    HTP.p('{"ok":false}'); RETURN;
  END IF;

  WITH remote_user AS (
    SELECT /*+ MATERIALIZE */ aus_id FROM app_users
    WHERE  LOWER(user_name) = LOWER(:APP_USER) AND ROWNUM = 1
  )
  SELECT aus_id INTO l_aus_id FROM remote_user;

  UPDATE user_notifications
  SET    read = 'Y'
  WHERE  aus_id  = l_aus_id
    AND  read    = 'N'
    AND  deleted = 'N';

  HTP.p('{"ok":true,"updated":' || SQL%ROWCOUNT || '}');
EXCEPTION WHEN OTHERS THEN
  HTP.p('{"ok":false,"err":"' || SQLERRM || '"}');
END;


-- ────────────────────────────────────────────────────────────
-- 4. notifDelete  — soft delete 1 thông báo (ẩn khỏi list)
--    x01 = ano_id
-- ────────────────────────────────────────────────────────────
DECLARE
  l_aus_id NUMBER;
  l_ano_id NUMBER := TO_NUMBER(:x01);
BEGIN
  IF :APP_USER IS NULL OR UPPER(:APP_USER) IN ('NOBODY','ANONYMOUS') THEN
    HTP.p('{"ok":false}'); RETURN;
  END IF;

  WITH remote_user AS (
    SELECT /*+ MATERIALIZE */ aus_id FROM app_users
    WHERE  LOWER(user_name) = LOWER(:APP_USER) AND ROWNUM = 1
  )
  SELECT aus_id INTO l_aus_id FROM remote_user;

  UPDATE user_notifications
  SET    deleted = 'Y'
  WHERE  ano_id = l_ano_id
    AND  aus_id = l_aus_id;

  HTP.p('{"ok":true}');
EXCEPTION WHEN OTHERS THEN
  HTP.p('{"ok":false,"err":"' || SQLERRM || '"}');
END;
