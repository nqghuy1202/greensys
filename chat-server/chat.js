'use strict';
const express  = require('express');
const oracledb = require('oracledb');
const { deliverToUser } = require('./events');
const registry = require('./db-registry');

// Chat hiện chạy trên 1 schema → deliver ở dbKey mặc định (nhất quán với CQN 1-DB).
// TODO(multi-db): khi chat.js chọn pool theo dbKey, truyền dbKey thật vào deliverToConv.
// LƯU Ý: DEFAULT_DB_KEY (namespace SSE, khớp token cũ) TÁCH BIỆT với pool primary
// của registry (chọn DB để query) — hai khái niệm khác nhau.
const DEFAULT_DB_KEY = process.env.DEFAULT_DB_KEY || 'default';

const router = express.Router();

// ─── In-memory state ─────────────────────────────────────────────────────────
const typingState      = new Map();   // `${conv_id}:${aus_id}` → expireHandle
// LƯU Ý (F7): participantCache chỉ được invalidate ở POST /create. Nếu thành viên
// hội thoại bị thêm/xóa qua luồng KHÁC (vd APEX ghi thẳng CHAT_PARTICIPANTS) thì
// cache có thể lệch tối đa PARTICIPANT_CACHE_TTL (60s): member mới chưa nhận event,
// member vừa rời vẫn nhận. Khi thêm route đổi thành viên → nhớ gọi participantCache.delete(convId).
const participantCache = new Map();   // conv_id(number) → { ausIds: number[], expiresAt: number }
let   onlineCache      = null;        // { ausIds: number[], expiresAt: number } | null

const TYPING_TTL            =  4_000;   // 4s  — tự xóa typing nếu không có heartbeat
const PARTICIPANT_CACHE_TTL = 60_000;   // 60s — cache participant list mỗi conv
const ONLINE_CACHE_TTL      = 30_000;   // 30s — cache online list, tránh Oracle query mỗi request

// ─── Utilities ───────────────────────────────────────────────────────────────

async function withConn(fn) {
  // TODO(multi-db): chọn pool theo dbKey của request; hiện dùng primary.
  const conn = await registry.getPool().getConnection();
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

// Oracle trả về key UPPERCASE → normalize xuống lowercase cho JSON response
const normalize = rows =>
  rows.map(row => Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])
  ));

// Participant list với 60s cache — tránh query DB mỗi lần typing/read event
async function getParticipants(convId) {
  const cached = participantCache.get(convId);
  if (cached && cached.expiresAt > Date.now()) return cached.ausIds;

  const rows = await withConn(async conn => {
    const r = await conn.execute(
      `SELECT aus_id FROM CHAT_PARTICIPANTS WHERE conv_id = :conv_id`,
      { conv_id: convId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return r.rows;
  });
  const ausIds = rows.map(r => r.AUS_ID);
  participantCache.set(convId, { ausIds, expiresAt: Date.now() + PARTICIPANT_CACHE_TTL });
  return ausIds;
}

// Đẩy event tới tất cả thành viên của conv, trừ excludeAusId.
// Ép kiểu số một chỗ: participant aus_id là NUMBER từ Oracle, còn excludeAusId
// có thể tới dạng string từ req.body (APEX gửi JSON). So sánh number-vs-string
// luôn !== → người gửi tự nhận lại tin của mình (self-echo). Number() chặn việc này.
async function deliverToConv(convId, payload, excludeAusId) {
  const ausIds = await getParticipants(convId);
  const exclude = Number(excludeAusId);
  for (const ausId of ausIds) {
    if (Number(ausId) !== exclude) deliverToUser(DEFAULT_DB_KEY, ausId, payload);
  }
}

// ─── GET /api/chat/conversations/:aus_id ─────────────────────────────────────
// Sidebar: danh sách conversation của user, sort theo tin nhắn mới nhất
router.get('/conversations/:aus_id', async (req, res) => {
  const ausId = Number(req.params.aus_id);
  // scope=all → trả TẤT CẢ hội thoại (gồm cả gắn chứng từ) cho modal hợp nhất.
  // Mặc định (không param) → giữ nguyên doc_type IS NULL (messenger cũ, backward-compat).
  const docFilter = req.query.scope === 'all' ? '1 = 1' : 'c.doc_type IS NULL';
  try {
    const rows = await withConn(async conn => {
      const r = await conn.execute(
        // parts:  đếm member_count + lấy "người kia" (1 lần/conv, local).
        //         other_aus_id chỉ được DÙNG khi member_count <= 2 (DM / DOC 1-1) →
        //         lúc đó có đúng 1 người kia nên MAX(...) = chính người đó.
        // emp:    MATERIALIZE remote APP_USERS/EMPLOYEES MỘT lần cho tập "người kia",
        //         thay vì join remote per-row (tránh N round-trip qua DBLINK — pitfall A7).
        // unread: COUNT unread cho mọi conv trong 1 lần GROUP BY, thay scalar subquery/row.
        `WITH parts AS (
           SELECT p.conv_id,
                  COUNT(*) AS member_count,
                  MAX(CASE WHEN p.aus_id != :aus_id THEN p.aus_id END) AS other_aus_id
           FROM   CHAT_PARTICIPANTS p
           WHERE  p.conv_id IN (SELECT conv_id FROM CHAT_PARTICIPANTS WHERE aus_id = :aus_id)
           GROUP  BY p.conv_id
         ),
         emp AS (
           SELECT /*+ MATERIALIZE */ u.aus_id, NVL(e.full_name, 'Unknown') AS full_name
           FROM   APP_USERS u
           JOIN   EMPLOYEES e ON e.emp_id = u.emp_id
           WHERE  u.aus_id IN (SELECT other_aus_id FROM parts WHERE other_aus_id IS NOT NULL)
         ),
         unread AS (
           SELECT m.conv_id, COUNT(*) AS unread_count
           FROM   CHAT_MESSENGERS m
           JOIN   CHAT_PARTICIPANTS p ON p.conv_id = m.conv_id AND p.aus_id = :aus_id
           WHERE  m.delete_date IS NULL
             AND  m.msg_id > NVL(p.last_read_msg_id, 0)
           GROUP  BY m.conv_id
         )
         SELECT
           c.conv_id,
           c.conv_type,
           c.doc_type,
           c.doc_no,
           c.last_msg_preview,
           c.last_msg_date,
           c.pinned_msg_id,
           p.is_admin,
           p.last_read_msg_id,
           -- Tên hiển thị: CHANNEL (hoặc DOC nhóm >2 người) dùng name, còn lại dùng tên người kia
           CASE
             WHEN c.conv_type = 'CHANNEL' THEN c.name
             WHEN c.conv_type = 'DOC' AND pt.member_count > 2 THEN c.name
             ELSE em.full_name
           END AS display_name,
           -- aus_id của người kia (DM, hoặc DOC 1-1)
           CASE
             WHEN c.conv_type = 'DM' THEN pt.other_aus_id
             WHEN c.conv_type = 'DOC' AND pt.member_count <= 2 THEN pt.other_aus_id
           END AS dm_partner_aus_id,
           NVL(ur.unread_count, 0) AS unread_count,
           pt.member_count          AS member_count
         FROM CHAT_CONVERSATIONS c
         JOIN CHAT_PARTICIPANTS   p  ON p.conv_id = c.conv_id AND p.aus_id = :aus_id
         JOIN parts               pt ON pt.conv_id = c.conv_id
         LEFT JOIN emp            em ON em.aus_id  = pt.other_aus_id
         LEFT JOIN unread         ur ON ur.conv_id = c.conv_id
         WHERE ${docFilter}
         ORDER BY c.last_msg_date DESC NULLS LAST`,
        { aus_id: ausId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return r.rows;
    });
    res.json({ conversations: normalize(rows) });
  } catch (err) {
    console.error('[Chat] GET /conversations:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/chat/unread-summary/:aus_id ────────────────────────────────────
// Tổng hợp unread cho badge header + số đếm banner cross-doc (khởi tạo / sau reconnect).
// Trả: { total, by_conv:[{conv_id,unread,doc_type,doc_no}], by_doc:[{doc_type,doc_no,unread}] }
router.get('/unread-summary/:aus_id', async (req, res) => {
  const ausId = Number(req.params.aus_id);
  try {
    const rows = await withConn(async conn => {
      const r = await conn.execute(
        // Gom unread của mọi conv trong 1 lần GROUP BY thay vì scalar subquery/row.
        `WITH unread AS (
           SELECT m.conv_id, COUNT(*) AS unread_count
           FROM   CHAT_MESSENGERS m
           JOIN   CHAT_PARTICIPANTS p ON p.conv_id = m.conv_id AND p.aus_id = :aus_id
           WHERE  m.delete_date IS NULL
             AND  m.msg_id > NVL(p.last_read_msg_id, 0)
           GROUP  BY m.conv_id
         )
         SELECT c.conv_id, c.doc_type, c.doc_no,
                NVL(ur.unread_count, 0) AS unread_count
         FROM   CHAT_CONVERSATIONS c
         JOIN   CHAT_PARTICIPANTS  p  ON p.conv_id = c.conv_id AND p.aus_id = :aus_id
         LEFT JOIN unread          ur ON ur.conv_id = c.conv_id`,
        { aus_id: ausId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return r.rows;
    });

    let total = 0;
    const by_conv = [];
    const docMap = new Map();   // `${doc_type}|${doc_no}` → unread
    for (const row of rows) {
      const unread = Number(row.UNREAD_COUNT) || 0;
      if (unread <= 0) continue;
      total += unread;
      by_conv.push({
        conv_id:  row.CONV_ID,
        unread,
        doc_type: row.DOC_TYPE || null,
        doc_no:   row.DOC_NO   || null,
      });
      if (row.DOC_NO) {
        const key = `${row.DOC_TYPE}|${row.DOC_NO}`;
        docMap.set(key, (docMap.get(key) || 0) + unread);
      }
    }
    const by_doc = [...docMap.entries()].map(([key, unread]) => {
      const [doc_type, doc_no] = key.split('|');
      return { doc_type, doc_no, unread };
    });

    res.json({ total, by_conv, by_doc });
  } catch (err) {
    console.error('[Chat] GET /unread-summary:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/chat/doc-conversations ─────────────────────────────────────────
// Danh sách hội thoại gắn với một chứng từ cụ thể
// Query: ?doc_type=SO&doc_no=SO-2601%2F010&aus_id=123
router.get('/doc-conversations', async (req, res) => {
  const { doc_type, doc_no, aus_id } = req.query;
  if (!doc_type || !doc_no || !aus_id) {
    return res.status(400).json({ error: 'doc_type, doc_no và aus_id là bắt buộc' });
  }
  const ausId = Number(aus_id);
  try {
    const rows = await withConn(async conn => {
      const r = await conn.execute(
        // Cấu trúc CTE giống /conversations (parts/emp/unread) — xem chú thích ở đó.
        `WITH parts AS (
           SELECT p.conv_id,
                  COUNT(*) AS member_count,
                  MAX(CASE WHEN p.aus_id != :aus_id THEN p.aus_id END) AS other_aus_id
           FROM   CHAT_PARTICIPANTS p
           WHERE  p.conv_id IN (SELECT conv_id FROM CHAT_PARTICIPANTS WHERE aus_id = :aus_id)
           GROUP  BY p.conv_id
         ),
         emp AS (
           SELECT /*+ MATERIALIZE */ u.aus_id, NVL(e.full_name, 'Unknown') AS full_name
           FROM   APP_USERS u
           JOIN   EMPLOYEES e ON e.emp_id = u.emp_id
           WHERE  u.aus_id IN (SELECT other_aus_id FROM parts WHERE other_aus_id IS NOT NULL)
         ),
         unread AS (
           SELECT m.conv_id, COUNT(*) AS unread_count
           FROM   CHAT_MESSENGERS m
           JOIN   CHAT_PARTICIPANTS p ON p.conv_id = m.conv_id AND p.aus_id = :aus_id
           WHERE  m.delete_date IS NULL
             AND  m.msg_id > NVL(p.last_read_msg_id, 0)
           GROUP  BY m.conv_id
         )
         SELECT
           c.conv_id,
           c.conv_type,
           c.doc_type,
           c.doc_no,
           c.last_msg_preview,
           c.last_msg_date,
           c.pinned_msg_id,
           p.is_admin,
           p.last_read_msg_id,
           CASE
             WHEN c.conv_type = 'CHANNEL' THEN c.name
             WHEN c.conv_type = 'DOC' AND pt.member_count > 2 THEN c.name
             ELSE em.full_name
           END AS display_name,
           CASE
             WHEN c.conv_type = 'DM' THEN pt.other_aus_id
             WHEN c.conv_type = 'DOC' AND pt.member_count <= 2 THEN pt.other_aus_id
           END AS dm_partner_aus_id,
           NVL(ur.unread_count, 0) AS unread_count,
           pt.member_count          AS member_count
         FROM CHAT_CONVERSATIONS c
         JOIN CHAT_PARTICIPANTS   p  ON p.conv_id = c.conv_id AND p.aus_id = :aus_id
         JOIN parts               pt ON pt.conv_id = c.conv_id
         LEFT JOIN emp            em ON em.aus_id  = pt.other_aus_id
         LEFT JOIN unread         ur ON ur.conv_id = c.conv_id
         WHERE c.doc_type = :doc_type
           AND c.doc_no   = :doc_no
         ORDER BY c.last_msg_date DESC NULLS LAST`,
        { aus_id: ausId, doc_type, doc_no },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return r.rows;
    });
    res.json({ conversations: normalize(rows) });
  } catch (err) {
    console.error('[Chat] GET /doc-conversations:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/chat/messages/:conv_id ─────────────────────────────────────────
// Lịch sử tin nhắn, phân trang ngược (load more)
// Query params: ?before_id=<msg_id>&limit=50
router.get('/messages/:conv_id', async (req, res) => {
  const convId   = Number(req.params.conv_id);
  const beforeId = req.query.before_id ? Number(req.query.before_id) : null;
  const limit    = Math.min(Number(req.query.limit) || 50, 100);

  try {
    const rows = await withConn(async conn => {
      const binds = { conv_id: convId, before_id: beforeId, limit };
      // Inner: lấy N tin mới nhất (trước before_id nếu có), DESC
      // Outer: đảo lại ASC để hiển thị cũ → mới
      const r = await conn.execute(
        `SELECT * FROM (
           SELECT
             m.msg_id,
             m.from_aus_id,
             NVL(e.full_name, 'Unknown')        AS from_name,
             CASE WHEN m.delete_date IS NOT NULL
                  THEN NULL
                  ELSE m.body END               AS body,
             m.msg_type,
             m.reply_to_msg_id,
             m.create_date,
             m.delete_date,
             CASE WHEN qm.delete_date IS NOT NULL
                  THEN '[Tin nhắn đã bị xóa]'
                  ELSE qm.body END              AS reply_body,
             NVL(qe.full_name, 'Unknown')       AS reply_from_name
           FROM CHAT_MESSENGERS m
           JOIN APP_USERS    u   ON u.aus_id  = m.from_aus_id
           JOIN EMPLOYEES    e   ON e.emp_id  = u.emp_id
           LEFT JOIN CHAT_MESSENGERS qm  ON qm.msg_id  = m.reply_to_msg_id
           LEFT JOIN APP_USERS    qu  ON qu.aus_id  = qm.from_aus_id
           LEFT JOIN EMPLOYEES    qe  ON qe.emp_id  = qu.emp_id
           WHERE m.conv_id = :conv_id
             AND (:before_id IS NULL OR m.msg_id < :before_id)
           ORDER BY m.msg_id DESC
           FETCH FIRST :limit ROWS ONLY
         )
         ORDER BY msg_id ASC`,
        binds,
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return r.rows;
    });
    res.json({ messages: normalize(rows) });
  } catch (err) {
    console.error('[Chat] GET /messages:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/chat/send ──────────────────────────────────────────────────────
// Gửi tin nhắn mới
// Body: { conv_id, aus_id, body, reply_to_msg_id?, fil_id?, file_name?, mime_type?, file_size? }
//
// fil_id (tùy chọn): file đã được upload TRƯỚC qua APEX callback (trả về fil_id),
// nên ở đây chỉ cần 1 INSERT duy nhất đã có sẵn fil_id - không còn bước insert-rỗng-
// rồi-update-sau như thiết kế cũ (loại bỏ race condition giữa 2 transaction).
router.post('/send', async (req, res) => {
  const { conv_id, aus_id, partner_aus_id, username, from_name, body, reply_to_msg_id,
          is_file, fil_id, file_name, mime_type, file_size } = req.body;

  // Tin nhắn kèm file (is_file=true / có fil_id) cho phép body rỗng - file mới là
  // nội dung chính, caption chỉ là phần thêm. Tin nhắn thường vẫn bắt buộc có body.
  const hasFile = !!(is_file || fil_id);
  if (!conv_id || !aus_id || (!hasFile && !String(body || '').trim())) {
    return res.status(400).json({ error: 'conv_id, aus_id và body là bắt buộc' });
  }

  const trimmedBody = String(body || '').trim();

  try {
    const result = await withConn(async conn => {
      // 1. Insert tin nhắn dùng MSG_SEQ (kèm fil_id nếu có - 1 transaction duy nhất)
      const ins = await conn.execute(
        `INSERT INTO CHAT_MESSENGERS
           (msg_id, conv_id, from_aus_id, aus_id, body, msg_type, reply_to_msg_id, fil_id, created_by, create_date)
         VALUES
           (MSG_SEQ.NEXTVAL, :conv_id, :from_aus_id, :aus_id, :body, 'USER', :reply_to_msg_id, :fil_id, :created_by, SYSDATE)
         RETURNING msg_id, create_date INTO :out_msg_id, :out_date`,
        {
          conv_id,
          from_aus_id:     aus_id,                   // người gửi = G_AUS_ID
          aus_id:          partner_aus_id || null,   // người nhận = partner
          body:            trimmedBody,
          reply_to_msg_id: reply_to_msg_id || null,
          fil_id:          fil_id || null,
          created_by:      username || null,          // G_USER_NAME
          out_msg_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          out_date:   { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP },
        }
      );

      const msgId  = ins.outBinds.out_msg_id[0];
      const msgDate = ins.outBinds.out_date[0];
      const preview = trimmedBody.replace(/<[^>]+>/g, '').substring(0, 200);

      // 2. Cập nhật cache last_msg trên conversation
      await conn.execute(
        `UPDATE CHAT_CONVERSATIONS
         SET    last_msg_id      = :msg_id,
                last_msg_preview = :preview,
                last_msg_date    = :msg_date,
                modified_by      = :username,
                modify_date      = SYSTIMESTAMP
         WHERE  conv_id = :conv_id`,
        { msg_id: msgId, preview, msg_date: msgDate, username: username || null, conv_id }
      );

      // 3. Cập nhật last_read_msg_id cho người gửi (tự đọc tin của mình)
      await conn.execute(
        `UPDATE CHAT_PARTICIPANTS
         SET    last_read_msg_id = :msg_id
         WHERE  conv_id = :conv_id AND aus_id = :aus_id`,
        { msg_id: msgId, conv_id, aus_id }
      );

      // 4. Tên người gửi: dùng from_name từ APEX nếu có (APEX đã JOIN EMPLOYEES),
      //    fallback query Oracle nếu không có (tương thích với client cũ).
      let senderName = from_name || null;
      if (!senderName) {
        const nameRes = await conn.execute(
          `SELECT e.full_name
           FROM   APP_USERS u JOIN EMPLOYEES e ON e.emp_id = u.emp_id
           WHERE  u.aus_id = :aus_id`,
          { aus_id },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        senderName = nameRes.rows[0]?.FULL_NAME || 'Unknown';
      }

      // Metadata hội thoại để enrich event (cross-doc awareness): biết tin
      // tới thuộc chứng từ nào / hội thoại nào mà không cần frontend lookup.
      const metaRes = await conn.execute(
        `SELECT c.conv_type, c.doc_type, c.doc_no, c.name,
                (SELECT COUNT(*) FROM CHAT_PARTICIPANTS p2 WHERE p2.conv_id = c.conv_id) AS member_count
         FROM   CHAT_CONVERSATIONS c WHERE c.conv_id = :conv_id`,
        { conv_id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const meta = metaRes.rows[0] || {};

      await conn.commit();

      return {
        msg: {
          msg_id:          msgId,
          conv_id,
          from_aus_id:     aus_id,
          from_name:       senderName,
          body:            trimmedBody,
          msg_type:        'USER',
          reply_to_msg_id: reply_to_msg_id || null,
          create_date:     msgDate,
          fil_id:          fil_id || null,
          file_name:       file_name || null,
          mime_type:       mime_type || null,
          file_size:       file_size || null,
        },
        meta: {
          conv_type:    meta.CONV_TYPE     || null,
          doc_type:     meta.DOC_TYPE      || null,
          doc_no:       meta.DOC_NO        || null,
          name:         meta.NAME          || null,
          member_count: meta.MEMBER_COUNT  || 0,
        },
      };
    });

    const msg  = result.msg;
    const meta = result.meta;
    // Tên hiển thị hội thoại: CHANNEL (hoặc DOC nhóm >2 người) dùng name, còn lại dùng tên người gửi
    const isGroup  = meta.conv_type === 'CHANNEL' || (meta.conv_type === 'DOC' && meta.member_count > 2);
    const convName = isGroup ? meta.name : msg.from_name;

    // 5. Notify các thành viên khác (async, không block response)
    //    Payload enrich: doc_type/doc_no/conv_type/conv_name cho cross-doc awareness.
    deliverToConv(conv_id, {
      type:      'message',
      conv_id,
      doc_type:  meta.doc_type,
      doc_no:    meta.doc_no,
      conv_type: meta.conv_type,
      conv_name: convName,
      msg,
    }, aus_id)
      .catch(err => console.error('[Chat] deliverToConv:', err.message));

    res.json({ status: 'ok', msg });

  } catch (err) {
    console.error('[Chat] POST /send:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/chat/upload-send ──────────────────────────────────────────────
// Gửi tin nhắn FILE/ẢNH. Body = bytes file thô (application/octet-stream),
// metadata qua query string. Vì item File Browse của APEX KHÔNG gửi được bytes
// trong AJAX, client đọc thẳng File object rồi POST bytes tới đây.
//
// Luồng: nhận BLOB -> pkg_upload_file.UploadFileChat (sinh fil_id + file_name
// vật lý) -> INSERT CHAT_MESSENGERS với fil_id -> commit -> broadcast 'message'
// (cùng shape với /send => real-time đầy đủ).
//
// Query: conv_id, aus_id, file_name, caption?, reply_to_msg_id?,
//        co_id, oun_id, user_name, ffo_id?
const uploadRaw = express.raw({ type: () => true, limit: '50mb' });
router.post('/upload-send', uploadRaw, async (req, res) => {
  const q = req.query;
  const conv_id   = Number(q.conv_id);
  const aus_id    = Number(q.aus_id);
  const fileName  = (q.file_name || '').toString();
  const caption   = (q.caption || '').toString().trim();
  const replyId   = q.reply_to_msg_id ? Number(q.reply_to_msg_id) : null;
  const coId      = (q.co_id || '').toString();
  const ounId     = (q.oun_id || '').toString();
  const userName  = (q.user_name || '').toString();
  const ffoId     = q.ffo_id ? q.ffo_id.toString() : null;
  const blob      = req.body;   // Buffer (express.raw)

  if (!conv_id || !aus_id || !fileName) {
    return res.status(400).json({ error: 'conv_id, aus_id và file_name là bắt buộc' });
  }
  if (!Buffer.isBuffer(blob) || blob.length === 0) {
    return res.status(400).json({ error: 'Thiếu nội dung file (body rỗng)' });
  }

  try {
    const result = await withConn(async conn => {
      // 1. Upload BLOB qua package hệ thống -> fil_id + file_name vật lý
      const up = await conn.execute(
        `BEGIN
           pkg_upload_file.UploadFileChat(
             p_blob => :p_blob, p_name => :p_name, p_co_id => :p_co_id,
             p_oun_id => :p_oun_id, p_module => :p_module, p_table => :p_table,
             p_user_name => :p_user_name, p_id => :p_id, p_ffo_id => :p_ffo_id,
             p_directory => NULL, p_fil_id => :p_fil_id, p_error => :p_error);
         END;`,
        {
          p_blob:      { dir: oracledb.BIND_IN,  type: oracledb.BLOB,    val: blob },
          p_name:      fileName,
          p_co_id:     coId,
          p_oun_id:    ounId,
          p_module:    '01',
          p_table:     'CHAT_MESSENGERS',
          p_user_name: userName,
          p_id:        { dir: oracledb.BIND_IN,  type: oracledb.NUMBER,  val: null },
          p_ffo_id:    ffoId,
          p_fil_id:    { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          p_error:     { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 2000 },
        }
      );

      const filId    = up.outBinds.p_fil_id;
      const upError  = up.outBinds.p_error;
      if (!filId) {
        throw new Error('UploadFileChat: ' + (upError || 'không tạo được fil_id'));
      }

      // file_name vật lý + tên gốc để broadcast/preview
      const fRes = await conn.execute(
        `SELECT file_name, name, file_size FROM FILES WHERE fil_id = :fil_id`,
        { fil_id: filId }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const fRow = fRes.rows[0] || {};

      // 2. INSERT CHAT_MESSENGERS (1 INSERT, đã có fil_id) — giống /send
      const ins = await conn.execute(
        `INSERT INTO CHAT_MESSENGERS
           (msg_id, conv_id, from_aus_id, aus_id, body, msg_type, reply_to_msg_id, fil_id, created_by, create_date)
         VALUES
           (MSG_SEQ.NEXTVAL, :conv_id, :from_aus_id, NULL, :body, 'USER', :reply_to_msg_id, :fil_id, :created_by, SYSDATE)
         RETURNING msg_id, create_date INTO :out_msg_id, :out_date`,
        {
          conv_id, from_aus_id: aus_id, body: caption || null,
          reply_to_msg_id: replyId, fil_id: filId, created_by: userName || null,
          out_msg_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          out_date:   { dir: oracledb.BIND_OUT, type: oracledb.DB_TYPE_TIMESTAMP },
        }
      );
      const msgId   = ins.outBinds.out_msg_id[0];
      const msgDate = ins.outBinds.out_date[0];

      // 3. Preview hội thoại
      const isImg = /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(fRow.NAME || fileName);
      const preview = caption || (isImg ? '[Hình ảnh]' : '[Tệp tin] ' + (fRow.NAME || fileName));
      await conn.execute(
        `UPDATE CHAT_CONVERSATIONS
         SET last_msg_id = :msg_id, last_msg_preview = :preview,
             last_msg_date = :msg_date, modified_by = :username, modify_date = SYSTIMESTAMP
         WHERE conv_id = :conv_id`,
        { msg_id: msgId, preview: preview.substring(0, 200), msg_date: msgDate,
          username: userName || null, conv_id }
      );
      await conn.execute(
        `UPDATE CHAT_PARTICIPANTS SET last_read_msg_id = :msg_id
         WHERE conv_id = :conv_id AND aus_id = :aus_id`,
        { msg_id: msgId, conv_id, aus_id }
      );

      // 4. Tên người gửi + metadata hội thoại (enrich cho cross-doc)
      const nameRes = await conn.execute(
        `SELECT e.full_name FROM APP_USERS u JOIN EMPLOYEES e ON e.emp_id = u.emp_id
         WHERE u.aus_id = :aus_id`,
        { aus_id }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const metaRes = await conn.execute(
        `SELECT c.conv_type, c.doc_type, c.doc_no, c.name,
                (SELECT COUNT(*) FROM CHAT_PARTICIPANTS p2 WHERE p2.conv_id = c.conv_id) AS member_count
         FROM CHAT_CONVERSATIONS c WHERE c.conv_id = :conv_id`,
        { conv_id }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const meta = metaRes.rows[0] || {};

      await conn.commit();

      return {
        msg: {
          msg_id: msgId, conv_id, from_aus_id: aus_id,
          from_name: nameRes.rows[0]?.FULL_NAME || 'Unknown',
          body: caption || null, msg_type: 'USER',
          reply_to_msg_id: replyId, create_date: msgDate,
          fil_id: filId, file_name: fRow.FILE_NAME || null,
          file_disp_name: fRow.NAME || fileName, file_size: fRow.FILE_SIZE || null,
        },
        meta: {
          conv_type: meta.CONV_TYPE || null, doc_type: meta.DOC_TYPE || null,
          doc_no: meta.DOC_NO || null, name: meta.NAME || null,
          member_count: meta.MEMBER_COUNT || 0,
        },
      };
    });

    const msg = result.msg, meta = result.meta;
    const isGroup  = meta.conv_type === 'CHANNEL' || (meta.conv_type === 'DOC' && meta.member_count > 2);
    const convName = isGroup ? meta.name : msg.from_name;

    deliverToConv(conv_id, {
      type: 'message', conv_id,
      doc_type: meta.doc_type, doc_no: meta.doc_no,
      conv_type: meta.conv_type, conv_name: convName, msg,
    }, aus_id)
      .catch(err => console.error('[Chat] deliverToConv (upload-send):', err.message));

    res.json({ status: 'ok', msg });

  } catch (err) {
    console.error('[Chat] POST /upload-send:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/chat/attach ────────────────────────────────────────────────────
// DEPRECATED: thiết kế cũ (insert msg rỗng -> upload -> update fil_id -> báo qua
// route này). Từ khi /send nhận thẳng fil_id (upload file TRƯỚC, insert 1 lần),
// route này không còn cần thiết - giữ lại để tương thích ngược, không gọi mới.
// Body: { conv_id, msg_id, fil_id, file_name, mime_type, file_size }
router.post('/attach', (req, res) => {
  const { conv_id, msg_id, fil_id, file_name, mime_type, file_size, aus_id } = req.body;

  if (!conv_id || !msg_id || !fil_id) {
    return res.status(400).json({ error: 'conv_id, msg_id và fil_id là bắt buộc' });
  }

  deliverToConv(conv_id, {
    type:      'attachment',
    conv_id,
    msg_id,
    fil_id,
    file_name: file_name || null,
    mime_type: mime_type || null,
    file_size: file_size || null,
  }, aus_id)
    .catch(err => console.error('[Chat] deliverToConv (attach):', err.message));

  res.json({ status: 'ok' });
});

// ─── POST /api/chat/broadcast-message ────────────────────────────────────────
// Phát SSE type:'message' cho tin nhắn ĐÃ được APEX ghi DB (luồng gửi file:
// msUploadAttachment + msCreateFileMessage làm toàn bộ ghi DB, Node CHỈ relay).
// KHÔNG đụng DB ở đây - chỉ enrich payload giống /send rồi deliverToConv.
// Body: { conv_id, msg_id, aus_id, body, fil_id, file_name, file_disp_name,
//         reply_to_msg_id, doc_type, doc_no, conv_type, conv_name, from_name? }
router.post('/broadcast-message', (req, res) => {
  const { conv_id, msg_id, aus_id, body, fil_id, file_name, file_disp_name,
          reply_to_msg_id, doc_type, doc_no, conv_type, conv_name, from_name } = req.body;

  if (!conv_id || !msg_id || !aus_id) {
    return res.status(400).json({ error: 'conv_id, msg_id và aus_id là bắt buộc' });
  }

  // Cùng shape event với /send để onChatEvent xử lý đồng nhất. Client nhận
  // 'message' sẽ refreshThread() qua APEX (đã JOIN FILES) nên các field nội
  // dung chỉ mang tính enrich/cross-doc, không phải nguồn render chính.
  deliverToConv(conv_id, {
    type:      'message',
    conv_id,
    doc_type:  doc_type  || null,
    doc_no:    doc_no    || null,
    conv_type: conv_type || null,
    conv_name: conv_name || null,
    msg: {
      msg_id,
      conv_id,
      from_aus_id:     aus_id,
      from_name:       from_name || null,
      body:            body || null,
      msg_type:        'USER',
      reply_to_msg_id: reply_to_msg_id || null,
      fil_id:          fil_id || null,
      file_name:       file_name || null,
      file_disp_name:  file_disp_name || null,
    },
  }, aus_id)
    .catch(err => console.error('[Chat] deliverToConv (broadcast-message):', err.message));

  res.json({ status: 'ok' });
});

// ─── POST /api/chat/typing/:conv_id/:aus_id ──────────────────────────────────
// Frontend gọi khi user đang nhập; tự expire sau TYPING_TTL ms
router.post('/typing/:conv_id/:aus_id', (req, res) => {
  const convId = Number(req.params.conv_id);
  const ausId  = Number(req.params.aus_id);
  const key    = `${convId}:${ausId}`;

  const isNew = !typingState.has(key);

  // Reset timer
  if (!isNew) clearTimeout(typingState.get(key));

  typingState.set(key, setTimeout(() => {
    typingState.delete(key);
    deliverToConv(convId, { type: 'typing_stop', conv_id: convId, aus_id: ausId }, ausId)
      .catch(() => {});
  }, TYPING_TTL));

  // Respond ngay — không block APEX chờ name lookup
  res.json({ status: 'ok' });

  // Chỉ broadcast khi lần đầu bắt đầu gõ (tránh spam), lookup name async
  if (isNew) {
    withConn(async conn => {
      const r = await conn.execute(
        `SELECT e.full_name
         FROM   APP_USERS  u
         JOIN   EMPLOYEES  e ON e.emp_id = u.emp_id
         WHERE  u.aus_id = :aus_id`,
        { aus_id: ausId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return r.rows[0]?.FULL_NAME || 'Unknown';
    })
    .then(name => {
      deliverToConv(convId, { type: 'typing', conv_id: convId, aus_id: ausId, name }, ausId)
        .catch(() => {});
    })
    .catch(() => {
      deliverToConv(convId, { type: 'typing', conv_id: convId, aus_id: ausId, name: 'Unknown' }, ausId)
        .catch(() => {});
    });
  }
});

// ─── GET /api/chat/online ─────────────────────────────────────────────────────
// Trả về danh sách aus_id đang online — query CHAT_USER_ONLINE table (Oracle).
// APEX chatHeartbeat MERGE vào bảng này mỗi 20s; cutoff 35s = offline.
// Cache 30s: tránh Oracle query mỗi request.
router.get('/online', async (req, res) => {
  if (onlineCache && onlineCache.expiresAt > Date.now()) {
    return res.json({ online: onlineCache.ausIds, cached: true });
  }
  try {
    const rows = await withConn(async conn => {
      const r = await conn.execute(
        `SELECT aus_id
         FROM   CHAT_USER_ONLINE
         WHERE  last_seen >= SYSTIMESTAMP - INTERVAL '35' SECOND`,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return r.rows;
    });
    const ausIds = rows.map(r => Number(r.AUS_ID));
    onlineCache = { ausIds, expiresAt: Date.now() + ONLINE_CACHE_TTL };
    res.json({ online: ausIds, cached: false });
  } catch (err) {
    console.error('[Chat] GET /online:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/chat/members/:conv_id ──────────────────────────────────────────
// Danh sách thành viên của conversation
router.get('/members/:conv_id', async (req, res) => {
  const convId = Number(req.params.conv_id);
  try {
    const rows = await withConn(async conn => {
      const r = await conn.execute(
        `SELECT p.aus_id, p.is_admin,
                NVL(e.full_name, 'Unknown') AS full_name,
                u.user_name
         FROM   CHAT_PARTICIPANTS p
         JOIN   APP_USERS   u ON u.aus_id  = p.aus_id
         JOIN   EMPLOYEES   e ON e.emp_id  = u.emp_id
         WHERE  p.conv_id = :conv_id
         ORDER  BY p.is_admin DESC, e.full_name`,
        { conv_id: convId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return r.rows;
    });
    res.json({ members: normalize(rows) });
  } catch (err) {
    console.error('[Chat] GET /members:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/chat/read/:conv_id/:aus_id ────────────────────────────────────
// Đánh dấu đã đọc tất cả tin trong conversation
router.post('/read/:conv_id/:aus_id', async (req, res) => {
  const convId = Number(req.params.conv_id);
  const ausId  = Number(req.params.aus_id);

  try {
    await withConn(async conn => {
      await conn.execute(
        `UPDATE CHAT_PARTICIPANTS
         SET    last_read_msg_id = (
           SELECT MAX(msg_id) FROM CHAT_MESSENGERS
           WHERE  conv_id = :conv_id AND delete_date IS NULL
         )
         WHERE  conv_id = :conv_id AND aus_id = :aus_id`,
        { conv_id: convId, aus_id: ausId }
      );
      await conn.commit();
    });

    // Thông báo cho người gửi rằng đã có người đọc
    deliverToConv(convId, { type: 'read', conv_id: convId, aus_id: ausId }, ausId)
      .catch(() => {});

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[Chat] POST /read:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/chat/create ────────────────────────────────────────────────────
// Tạo DM, CHANNEL hoặc DOC mới
// Body: { conv_type, name?, aus_id, username?, member_aus_ids, doc_type?, doc_no? }
// doc_type + doc_no: bỏ trống = hội thoại chung (DM/CHANNEL); DOC bắt buộc phải có
router.post('/create', async (req, res) => {
  const { conv_type, name, aus_id, username, doc_type, doc_no } = req.body;
  const member_aus_ids = req.body.member_aus_ids || req.body.members;

  if (!conv_type || !aus_id || !Array.isArray(member_aus_ids) || member_aus_ids.length === 0) {
    return res.status(400).json({ error: 'conv_type, aus_id và member_aus_ids là bắt buộc' });
  }
  if (conv_type !== 'DM' && conv_type !== 'CHANNEL' && conv_type !== 'DOC') {
    return res.status(400).json({ error: 'conv_type phải là DM, CHANNEL hoặc DOC' });
  }
  if (conv_type === 'CHANNEL' && !String(name || '').trim()) {
    return res.status(400).json({ error: 'CHANNEL phải có name' });
  }
  if (conv_type === 'DOC') {
    if (!String(doc_type || '').trim() || !String(doc_no || '').trim()) {
      return res.status(400).json({ error: 'DOC phải có doc_type và doc_no' });
    }
    if (member_aus_ids.length >= 2 && !String(name || '').trim()) {
      return res.status(400).json({ error: 'DOC nhóm (≥2 thành viên) phải có name' });
    }
  }

  const scopedDocType = doc_type || null;
  const scopedDocNo   = doc_no   || null;

  // DM: dedup theo scope (doc hoặc chung). DOC 1-1: dedup theo đúng conv_type + đúng chứng từ.
  // DOC nhóm (≥2 người) và CHANNEL không dedup — luôn tạo hội thoại mới.
  const dedupCheck = conv_type === 'DM' || (conv_type === 'DOC' && member_aus_ids.length === 1);
  if (dedupCheck) {
    const partnerId = member_aus_ids.find(id => Number(id) !== Number(aus_id)) || member_aus_ids[0];
    try {
      const existing = await withConn(async conn => {
        const r = await conn.execute(
          `SELECT c.conv_id
           FROM   CHAT_CONVERSATIONS c
           JOIN   CHAT_PARTICIPANTS p1 ON p1.conv_id = c.conv_id AND p1.aus_id = :aus_id
           JOIN   CHAT_PARTICIPANTS p2 ON p2.conv_id = c.conv_id AND p2.aus_id = :partner_id
           WHERE  c.conv_type = :conv_type
             AND  ((:doc_type IS NULL AND c.doc_type IS NULL) OR c.doc_type = :doc_type)
             AND  ((:doc_no   IS NULL AND c.doc_no   IS NULL) OR c.doc_no   = :doc_no)
             AND  (SELECT COUNT(*) FROM CHAT_PARTICIPANTS WHERE conv_id = c.conv_id) = 2
           FETCH FIRST 1 ROW ONLY`,
          {
            aus_id:     Number(aus_id),
            partner_id: Number(partnerId),
            conv_type,
            doc_type:   scopedDocType,
            doc_no:     scopedDocNo,
          },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        return r.rows[0];
      });
      if (existing) {
        return res.json({ status: 'exists', conv_id: existing.CONV_ID });
      }
    } catch (err) {
      console.error('[Chat] POST /create check existing:', err.message);
    }
  }

  try {
    const convId = await withConn(async conn => {
      const convName  = (conv_type === 'CHANNEL' || conv_type === 'DOC') ? (String(name || '').trim() || null) : null;
      const createdBy = username || null;
      const ins = await conn.execute(
        `INSERT INTO CHAT_CONVERSATIONS
           (conv_id, conv_type, name, aus_id, doc_type, doc_no, created_by, create_date)
         VALUES
           (CONV_SEQ.NEXTVAL, :conv_type, :name, :aus_id, :doc_type, :doc_no, :created_by, SYSTIMESTAMP)
         RETURNING conv_id INTO :out_id`,
        {
          conv_type,
          name:       convName,
          aus_id:     Number(aus_id),
          doc_type:   scopedDocType,
          doc_no:     scopedDocNo,
          created_by: createdBy,
          out_id:     { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        }
      );
      const cid = ins.outBinds.out_id[0];

      // Tạo danh sách thành viên (aus_id + tất cả member_aus_ids, dedupe)
      const allMembers = [...new Set([Number(aus_id), ...member_aus_ids.map(Number)])];
      for (const memberId of allMembers) {
        await conn.execute(
          `INSERT INTO CHAT_PARTICIPANTS (conv_id, aus_id, is_admin, created_by, create_date)
           VALUES (:conv_id, :aus_id, :is_admin, :created_by, SYSTIMESTAMP)`,
          {
            conv_id:     cid,
            aus_id:      memberId,
            is_admin:    memberId === Number(aus_id) ? 1 : 0,
            created_by:  createdBy,
          }
        );
      }
      await conn.commit();
      return cid;
    });

    participantCache.delete(convId);
    res.json({ status: 'ok', conv_id: convId });
  } catch (err) {
    console.error('[Chat] POST /create:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router };
