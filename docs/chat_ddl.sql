-- ===========================================================
-- CHAT MODULE — DDL
-- Schema  : DEV24
-- Run as  : DEV24 trong SQL Workshop (không cần DBA)
-- Phiên bản: Phase 1
-- ===========================================================
-- Thứ tự tạo (phụ thuộc FK):
--   1. CHAT_CONVERSATIONS
--   2. CHAT_PARTICIPANTS   → FK → CHAT_CONVERSATIONS
--   3. CHAT_MESSENGERS       → FK → CHAT_CONVERSATIONS
--   4. CHAT_MESSENGER_READS  → FK → CHAT_MESSENGERS
-- ===========================================================


-- -----------------------------------------------------------
-- 1. CHAT_CONVERSATIONS
--    Mỗi hàng = 1 nhóm (CHANNEL) hoặc 1 chat 1-on-1 (DM)
--    Cache last_msg_* để sidebar load 1 query duy nhất
-- -----------------------------------------------------------
CREATE SEQUENCE CONV_SEQ START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE MSG_SEQ  START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

CREATE TABLE CHAT_CONVERSATIONS (
  conv_id          NUMBER         CONSTRAINT pk_chat_conv PRIMARY KEY,
  conv_type        VARCHAR2(10)   NOT NULL
                                  CONSTRAINT chk_conv_type
                                  CHECK (conv_type IN ('CHANNEL', 'DM')),
  name             VARCHAR2(200),
  aus_id           NUMBER         NOT NULL,  -- creator's aus_id → APP_USERS.aus_id
  pinned_msg_id    NUMBER,        -- msg_id đang ghim (no FK — tránh circular dep)
  last_msg_id      NUMBER,        -- cache: msg_id cuối cùng
  last_msg_preview VARCHAR2(200), -- cache: nội dung cắt ngắn
  last_msg_date    TIMESTAMP,     -- cache: thời điểm tin cuối (dùng sort sidebar)
  created_by       VARCHAR2(100)  NOT NULL,  -- :G_USER_NAME
  create_date      TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
  modified_by      VARCHAR2(100),            -- :G_USER_NAME
  modify_date      TIMESTAMP,
  -- CHANNEL bắt buộc có tên; DM không cần tên (lấy từ người còn lại)
  CONSTRAINT chk_channel_name
    CHECK (conv_type = 'DM' OR name IS NOT NULL)
);

COMMENT ON TABLE  CHAT_CONVERSATIONS                  IS 'Hội thoại chat — CHANNEL (nhóm) hoặc DM (1-on-1)';
COMMENT ON COLUMN CHAT_CONVERSATIONS.conv_type        IS 'CHANNEL = nhóm/phòng ban, DM = tin nhắn riêng';
COMMENT ON COLUMN CHAT_CONVERSATIONS.name             IS 'Tên hiển thị; NULL cho DM (tên lấy từ người kia)';
COMMENT ON COLUMN CHAT_CONVERSATIONS.pinned_msg_id    IS 'msg_id đang ghim, NULL = không ghim. Không có FK constraint để tránh circular dependency với CHAT_MESSENGERS';
COMMENT ON COLUMN CHAT_CONVERSATIONS.last_msg_id      IS 'Cache: msg_id của tin nhắn mới nhất';
COMMENT ON COLUMN CHAT_CONVERSATIONS.last_msg_preview IS 'Cache: nội dung cắt tối đa 200 ký tự, dùng hiển thị sidebar';
COMMENT ON COLUMN CHAT_CONVERSATIONS.last_msg_date    IS 'Cache: thời điểm tin nhắn mới nhất, dùng sort sidebar';


-- -----------------------------------------------------------
-- 2. CHAT_PARTICIPANTS
--    Thành viên của từng conversation
--    last_read_msg_id: vị trí đọc → unread = msg_id > giá trị này
-- -----------------------------------------------------------
CREATE TABLE CHAT_PARTICIPANTS (
  conv_id          NUMBER         NOT NULL,
  aus_id           NUMBER         NOT NULL,
  is_admin         NUMBER(1)      DEFAULT 0 NOT NULL
                                  CONSTRAINT chk_part_admin CHECK (is_admin IN (0, 1)),
  last_read_msg_id NUMBER,        -- NULL = chưa đọc tin nào
  created_by       VARCHAR2(100)  NOT NULL,  -- :G_USER_NAME
  create_date      TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_chat_participants PRIMARY KEY (conv_id, aus_id),
  CONSTRAINT fk_chat_part_conv    FOREIGN KEY (conv_id)
    REFERENCES CHAT_CONVERSATIONS (conv_id)
);

COMMENT ON TABLE  CHAT_PARTICIPANTS                      IS 'Thành viên của từng conversation, lưu vị trí đọc';
COMMENT ON COLUMN CHAT_PARTICIPANTS.aus_id               IS 'Khóa ngoại logic → APP_USERS.aus_id';
COMMENT ON COLUMN CHAT_PARTICIPANTS.is_admin             IS '1 = quản trị viên kênh; với DM cả 2 bên đều là 1';
COMMENT ON COLUMN CHAT_PARTICIPANTS.last_read_msg_id     IS 'Tin nhắn đã đọc gần nhất. Unread count = SELECT COUNT(*) FROM CHAT_MESSENGERS WHERE conv_id = ? AND msg_id > last_read_msg_id AND delete_date IS NULL';


-- -----------------------------------------------------------
-- 3. CHAT_MESSENGERS
--    Lưu toàn bộ tin nhắn; delete_date = NULL là còn hiệu lực
--    reply_to_msg_id: trả lời / trích dẫn tin khác
-- -----------------------------------------------------------
CREATE TABLE CHAT_MESSENGERS (
  msg_id           NUMBER         CONSTRAINT pk_chat_messages PRIMARY KEY,
  conv_id          NUMBER         NOT NULL,
  from_aus_id      NUMBER         NOT NULL,   -- → APP_USERS.aus_id (logic FK)
  body             VARCHAR2(4000) NOT NULL,
  msg_type         VARCHAR2(10)   DEFAULT 'USER' NOT NULL
                                  CONSTRAINT chk_msg_type
                                  CHECK (msg_type IN ('USER', 'SYSTEM')),
  reply_to_msg_id  NUMBER,        -- NULL = không phải reply
  created_by       VARCHAR2(100)  NOT NULL,   -- :G_USER_NAME
  create_date      TIMESTAMP      NOT NULL,
  delete_date      TIMESTAMP,     -- soft delete; khi set → hiển thị "Tin nhắn đã bị xóa"
  CONSTRAINT fk_chat_msg_conv     FOREIGN KEY (conv_id)
    REFERENCES CHAT_CONVERSATIONS (conv_id)
);

COMMENT ON TABLE  CHAT_MESSENGERS                   IS 'Tin nhắn chat; delete_date != NULL = đã xóa mềm';
COMMENT ON COLUMN CHAT_MESSENGERS.from_aus_id       IS 'Người gửi — khóa ngoại logic → APP_USERS.aus_id';
COMMENT ON COLUMN CHAT_MESSENGERS.msg_type          IS 'USER = tin thường, SYSTEM = tin tự động từ ERP/hệ thống';
COMMENT ON COLUMN CHAT_MESSENGERS.reply_to_msg_id   IS 'msg_id của tin đang trả lời / trích dẫn; NULL nếu không reply';
COMMENT ON COLUMN CHAT_MESSENGERS.delete_date       IS 'Soft delete: đặt SYSTIMESTAMP khi xóa. Không DELETE hàng thật.';


-- -----------------------------------------------------------
-- 4. CHAT_MESSENGER_READS
--    Read receipts — dùng cho "Đã đọc" tick ở Phase 2
--    Phase 1 chỉ tạo bảng, chưa cần insert
-- -----------------------------------------------------------
CREATE TABLE CHAT_MESSENGER_READS (
  msg_id           NUMBER         NOT NULL,
  aus_id           NUMBER         NOT NULL,   -- → APP_USERS.aus_id (logic FK)
  create_date      TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
  CONSTRAINT pk_chat_msg_reads PRIMARY KEY (msg_id, aus_id),
  CONSTRAINT fk_chat_reads_msg FOREIGN KEY (msg_id)
    REFERENCES CHAT_MESSENGERS (msg_id)
);

COMMENT ON TABLE  CHAT_MESSENGER_READS        IS 'Read receipts theo từng tin nhắn — Phase 2';
COMMENT ON COLUMN CHAT_MESSENGER_READS.aus_id IS 'Người đã đọc — khóa ngoại logic → APP_USERS.aus_id';


-- ===========================================================
-- INDEXES
-- ===========================================================

-- Load lịch sử tin nhắn của 1 conversation (access pattern chính)
CREATE INDEX idx_chat_msg_conv_date
  ON CHAT_MESSENGERS (conv_id, create_date DESC);

-- Tìm tất cả conversation của 1 user (sidebar query)
CREATE INDEX idx_chat_part_aus
  ON CHAT_PARTICIPANTS (aus_id);

-- Sort sidebar theo tin nhắn mới nhất
CREATE INDEX idx_chat_conv_last_date
  ON CHAT_CONVERSATIONS (last_msg_date DESC);

-- Lookup read receipts theo user (Phase 2 — tạo sẵn)
CREATE INDEX idx_chat_reads_aus
  ON CHAT_MESSENGER_READS (aus_id, msg_id);


-- ===========================================================
-- VERIFY — chạy sau khi tạo xong để kiểm tra
-- ===========================================================
SELECT table_name, num_rows
FROM   user_tables
WHERE  table_name LIKE 'CHAT_%'
ORDER  BY table_name;


-- ===========================================================
-- MIGRATION — chạy khi bảng đã tồn tại (chuyển sang sequence)
-- ===========================================================

-- Sequences
CREATE SEQUENCE CONV_SEQ START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE MSG_SEQ  START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

-- CHAT_CONVERSATIONS: bỏ IDENTITY, đổi created_by/modified_by → VARCHAR2, thêm aus_id
ALTER TABLE CHAT_CONVERSATIONS MODIFY conv_id DROP IDENTITY;

ALTER TABLE CHAT_CONVERSATIONS ADD aus_id_tmp NUMBER;
UPDATE CHAT_CONVERSATIONS SET aus_id_tmp = created_by;
COMMIT;

ALTER TABLE CHAT_CONVERSATIONS ADD aus_id NUMBER;
UPDATE CHAT_CONVERSATIONS SET aus_id = aus_id_tmp;
ALTER TABLE CHAT_CONVERSATIONS MODIFY aus_id NOT NULL;
ALTER TABLE CHAT_CONVERSATIONS DROP COLUMN aus_id_tmp;

ALTER TABLE CHAT_CONVERSATIONS ADD created_by_tmp VARCHAR2(100);
UPDATE CHAT_CONVERSATIONS c
SET created_by_tmp = (SELECT username FROM app_users WHERE aus_id = TO_NUMBER(c.created_by));
ALTER TABLE CHAT_CONVERSATIONS DROP COLUMN created_by;
ALTER TABLE CHAT_CONVERSATIONS RENAME COLUMN created_by_tmp TO created_by;
ALTER TABLE CHAT_CONVERSATIONS MODIFY created_by NOT NULL;

ALTER TABLE CHAT_CONVERSATIONS ADD modified_by_tmp VARCHAR2(100);
UPDATE CHAT_CONVERSATIONS c
SET modified_by_tmp = (SELECT username FROM app_users WHERE aus_id = TO_NUMBER(c.modified_by))
WHERE modified_by IS NOT NULL;
ALTER TABLE CHAT_CONVERSATIONS DROP COLUMN modified_by;
ALTER TABLE CHAT_CONVERSATIONS RENAME COLUMN modified_by_tmp TO modified_by;
COMMIT;

-- Đồng bộ CONV_SEQ với max conv_id hiện tại
DECLARE v NUMBER;
BEGIN
  SELECT NVL(MAX(conv_id), 0) INTO v FROM CHAT_CONVERSATIONS;
  IF v > 0 THEN
    EXECUTE IMMEDIATE 'ALTER SEQUENCE CONV_SEQ INCREMENT BY ' || v;
    SELECT CONV_SEQ.NEXTVAL INTO v FROM DUAL;
    EXECUTE IMMEDIATE 'ALTER SEQUENCE CONV_SEQ INCREMENT BY 1';
  END IF;
END;
/

-- CHAT_MESSENGERS: bỏ IDENTITY, thêm created_by VARCHAR2
ALTER TABLE CHAT_MESSENGERS MODIFY msg_id DROP IDENTITY;
ALTER TABLE CHAT_MESSENGERS ADD created_by VARCHAR2(100);
UPDATE CHAT_MESSENGERS m
SET created_by = (SELECT username FROM app_users WHERE aus_id = m.from_aus_id);
COMMIT;

-- Đồng bộ MSG_SEQ
DECLARE v NUMBER;
BEGIN
  SELECT NVL(MAX(msg_id), 0) INTO v FROM CHAT_MESSENGERS;
  IF v > 0 THEN
    EXECUTE IMMEDIATE 'ALTER SEQUENCE MSG_SEQ INCREMENT BY ' || v;
    SELECT MSG_SEQ.NEXTVAL INTO v FROM DUAL;
    EXECUTE IMMEDIATE 'ALTER SEQUENCE MSG_SEQ INCREMENT BY 1';
  END IF;
END;
/

-- CHAT_PARTICIPANTS: đổi created_by → VARCHAR2
ALTER TABLE CHAT_PARTICIPANTS ADD created_by_tmp VARCHAR2(100);
UPDATE CHAT_PARTICIPANTS p
SET created_by_tmp = (SELECT username FROM app_users WHERE aus_id = TO_NUMBER(p.created_by));
ALTER TABLE CHAT_PARTICIPANTS DROP COLUMN created_by;
ALTER TABLE CHAT_PARTICIPANTS RENAME COLUMN created_by_tmp TO created_by;
ALTER TABLE CHAT_PARTICIPANTS MODIFY created_by NOT NULL;
COMMIT;


-- ===========================================================
-- CLEANUP — chỉ dùng khi cần xóa để tạo lại (dev)
-- Bỏ comment block này ra và chạy TRƯỚC khi chạy script trên
-- ===========================================================
/*
BEGIN
  FOR t IN (SELECT table_name FROM user_tables
            WHERE table_name IN ('CHAT_MESSENGER_READS','CHAT_MESSENGERS',
                                 'CHAT_PARTICIPANTS','CHAT_CONVERSATIONS')
            ORDER BY CASE table_name
              WHEN 'CHAT_MESSENGER_READS' THEN 1
              WHEN 'CHAT_MESSENGERS'      THEN 2
              WHEN 'CHAT_PARTICIPANTS'  THEN 3
              WHEN 'CHAT_CONVERSATIONS' THEN 4
            END) LOOP
    EXECUTE IMMEDIATE 'DROP TABLE ' || t.table_name || ' CASCADE CONSTRAINTS PURGE';
    DBMS_OUTPUT.PUT_LINE('Dropped: ' || t.table_name);
  END LOOP;
END;
/
*/
