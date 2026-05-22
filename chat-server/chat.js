'use strict';
const express  = require('express');
const oracledb = require('oracledb');

const router = express.Router();

// ─── In-memory state ─────────────────────────────────────────────────────────
// Mỗi user chỉ có 1 waiter tại 1 thời điểm (tab cuối cùng thắng)
const chatWaiters = new Map();   // aus_id(string) → { res, timeout }
const typingState = new Map();   // `${conv_id}:${aus_id}` → expireHandle
const onlineUsers = new Map();   // aus_id(string) → Date.now()

const POLL_TIMEOUT = 25_000;   // 25s — long-poll timeout
const TYPING_TTL   =  4_000;   // 4s  — tự xóa typing nếu không có heartbeat
const ONLINE_TTL   = 35_000;   // 35s — đánh dấu offline nếu không heartbeat

// ─── Utilities ───────────────────────────────────────────────────────────────

async function withConn(fn) {
  const conn = await oracledb.getPool().getConnection();
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

// Đẩy event tới 1 user đang long-poll (nếu có)
function deliverToUser(ausId, payload) {
  const key = String(ausId);
  const w   = chatWaiters.get(key);
  if (!w) return;
  clearTimeout(w.timeout);
  w.res.json({ events: [payload] });
  chatWaiters.delete(key);
}

// Đẩy event tới tất cả thành viên của conv, trừ excludeAusId
async function deliverToConv(convId, payload, excludeAusId) {
  const rows = await withConn(async conn => {
    const r = await conn.execute(
      `SELECT aus_id FROM CHAT_PARTICIPANTS WHERE conv_id = :conv_id`,
      { conv_id: convId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    return r.rows;
  });
  for (const row of rows) {
    if (row.AUS_ID !== excludeAusId) deliverToUser(row.AUS_ID, payload);
  }
}

// ─── GET /api/chat/conversations/:aus_id ─────────────────────────────────────
// Sidebar: danh sách conversation của user, sort theo tin nhắn mới nhất
router.get('/conversations/:aus_id', async (req, res) => {
  const ausId = Number(req.params.aus_id);
  try {
    const rows = await withConn(async conn => {
      const r = await conn.execute(
        `SELECT
           c.conv_id,
           c.conv_type,
           c.last_msg_preview,
           c.last_msg_date,
           c.pinned_msg_id,
           p.is_admin,
           p.last_read_msg_id,
           -- Tên hiển thị: CHANNEL dùng name, DM dùng tên người kia
           CASE c.conv_type
             WHEN 'CHANNEL' THEN c.name
             ELSE (SELECT NVL(e2.full_name, 'Unknown')
                   FROM   CHAT_PARTICIPANTS p2
                   JOIN   APP_USERS  u2 ON u2.aus_id = p2.aus_id
                   JOIN   EMPLOYEES  e2 ON e2.emp_id = u2.emp_id
                   WHERE  p2.conv_id = c.conv_id AND p2.aus_id != :aus_id
                   FETCH FIRST 1 ROW ONLY)
           END AS display_name,
           -- aus_id của người kia (chỉ có ý nghĩa với DM)
           CASE c.conv_type
             WHEN 'DM' THEN (SELECT p2.aus_id
                             FROM   CHAT_PARTICIPANTS p2
                             WHERE  p2.conv_id = c.conv_id AND p2.aus_id != :aus_id
                             FETCH FIRST 1 ROW ONLY)
           END AS dm_partner_aus_id,
           (SELECT COUNT(*)
            FROM   CHAT_MESSENGERS m
            WHERE  m.conv_id     = c.conv_id
              AND  m.delete_date IS NULL
              AND  m.msg_id      > NVL(p.last_read_msg_id, 0)
           ) AS unread_count,
           (SELECT COUNT(*)
            FROM   CHAT_PARTICIPANTS p2
            WHERE  p2.conv_id = c.conv_id
           ) AS member_count
         FROM CHAT_CONVERSATIONS c
         JOIN CHAT_PARTICIPANTS   p
           ON p.conv_id = c.conv_id AND p.aus_id = :aus_id
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
// Body: { conv_id, aus_id, body, reply_to_msg_id? }
router.post('/send', async (req, res) => {
  const { conv_id, aus_id, partner_aus_id, username, body, reply_to_msg_id } = req.body;

  if (!conv_id || !aus_id || !String(body || '').trim()) {
    return res.status(400).json({ error: 'conv_id, aus_id và body là bắt buộc' });
  }

  const trimmedBody = String(body).trim();

  try {
    const msg = await withConn(async conn => {
      // 1. Insert tin nhắn dùng MSG_SEQ
      const ins = await conn.execute(
        `INSERT INTO CHAT_MESSENGERS
           (msg_id, conv_id, from_aus_id, aus_id, body, msg_type, reply_to_msg_id, created_by, create_date)
         VALUES
           (MSG_SEQ.NEXTVAL, :conv_id, :from_aus_id, :aus_id, :body, 'USER', :reply_to_msg_id, :created_by, SYSDATE)
         RETURNING msg_id, create_date INTO :out_msg_id, :out_date`,
        {
          conv_id,
          from_aus_id:     aus_id,                   // người gửi = G_AUS_ID
          aus_id:          partner_aus_id || null,   // người nhận = partner
          body:            trimmedBody,
          reply_to_msg_id: reply_to_msg_id || null,
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

      // 4. Lấy tên người gửi để đính kèm vào response
      const nameRes = await conn.execute(
        `SELECT e.full_name
         FROM   APP_USERS u JOIN EMPLOYEES e ON e.emp_id = u.emp_id
         WHERE  u.aus_id = :aus_id`,
        { aus_id },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      await conn.commit();

      return {
        msg_id:          msgId,
        conv_id,
        from_aus_id:     aus_id,
        from_name:       nameRes.rows[0]?.FULL_NAME || 'Unknown',
        body:            trimmedBody,
        msg_type:        'USER',
        reply_to_msg_id: reply_to_msg_id || null,
        create_date:     msgDate,
      };
    });

    // 5. Notify các thành viên khác (async, không block response)
    deliverToConv(conv_id, { type: 'message', conv_id, msg }, aus_id)
      .catch(err => console.error('[Chat] deliverToConv:', err.message));

    res.json({ status: 'ok', msg });

  } catch (err) {
    console.error('[Chat] POST /send:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/chat/events/:aus_id ────────────────────────────────────────────
// Long-poll: treo kết nối tối đa 25s, trả về ngay khi có event mới
router.get('/events/:aus_id', (req, res) => {
  const key = String(req.params.aus_id);

  // Đóng waiter cũ nếu có (tab mới thay thế tab cũ)
  const old = chatWaiters.get(key);
  if (old) {
    clearTimeout(old.timeout);
    old.res.json({ events: [], status: 'replaced' });
  }

  const timeout = setTimeout(() => {
    chatWaiters.delete(key);
    res.json({ events: [], status: 'timeout' });
  }, POLL_TIMEOUT);

  chatWaiters.set(key, { res, timeout });

  // Client đóng kết nối sớm (navigate đi trang khác)
  req.on('close', () => {
    const w = chatWaiters.get(key);
    if (w && w.res === res) {
      clearTimeout(w.timeout);
      chatWaiters.delete(key);
    }
  });
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

  // Chỉ broadcast khi lần đầu bắt đầu gõ (tránh spam)
  if (isNew) {
    deliverToConv(convId, { type: 'typing', conv_id: convId, aus_id: ausId }, ausId)
      .catch(() => {});
  }

  res.json({ status: 'ok' });
});

// ─── POST /api/chat/heartbeat/:aus_id ────────────────────────────────────────
// APEX gọi mỗi 20s để duy trì trạng thái online
router.post('/heartbeat/:aus_id', (req, res) => {
  onlineUsers.set(String(req.params.aus_id), Date.now());
  res.json({ status: 'ok' });
});

// ─── GET /api/chat/online ─────────────────────────────────────────────────────
// Trả về danh sách aus_id đang online (heartbeat trong 35s gần nhất)
router.get('/online', (req, res) => {
  const now    = Date.now();
  const online = [];
  for (const [ausId, ts] of onlineUsers) {
    if (now - ts <= ONLINE_TTL) {
      online.push(Number(ausId));
    } else {
      onlineUsers.delete(ausId);
    }
  }
  res.json({ online });
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
      const r = await conn.execute(
        `SELECT MAX(msg_id) AS max_id
         FROM   CHAT_MESSENGERS
         WHERE  conv_id = :conv_id AND delete_date IS NULL`,
        { conv_id: convId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const maxId = r.rows[0]?.MAX_ID;
      if (!maxId) return;

      await conn.execute(
        `UPDATE CHAT_PARTICIPANTS
         SET    last_read_msg_id = :max_id
         WHERE  conv_id = :conv_id AND aus_id = :aus_id`,
        { max_id: maxId, conv_id: convId, aus_id: ausId }
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
// Tạo DM hoặc CHANNEL mới
// Body: { conv_type: 'DM'|'CHANNEL', name?: string, aus_id, member_aus_ids: number[] }
router.post('/create', async (req, res) => {
  const { conv_type, name, aus_id, username, member_aus_ids } = req.body;

  if (!conv_type || !aus_id || !Array.isArray(member_aus_ids) || member_aus_ids.length === 0) {
    return res.status(400).json({ error: 'conv_type, aus_id và member_aus_ids là bắt buộc' });
  }
  if (conv_type !== 'DM' && conv_type !== 'CHANNEL') {
    return res.status(400).json({ error: 'conv_type phải là DM hoặc CHANNEL' });
  }
  if (conv_type === 'CHANNEL' && !String(name || '').trim()) {
    return res.status(400).json({ error: 'CHANNEL phải có name' });
  }

  // Với DM, kiểm tra nếu đã có conversation giữa 2 người này
  if (conv_type === 'DM') {
    const partnerId = member_aus_ids.find(id => Number(id) !== Number(aus_id)) || member_aus_ids[0];
    try {
      const existing = await withConn(async conn => {
        const r = await conn.execute(
          `SELECT c.conv_id
           FROM   CHAT_CONVERSATIONS c
           JOIN   CHAT_PARTICIPANTS p1 ON p1.conv_id = c.conv_id AND p1.aus_id = :aus_id
           JOIN   CHAT_PARTICIPANTS p2 ON p2.conv_id = c.conv_id AND p2.aus_id = :partner_id
           WHERE  c.conv_type = 'DM'
             AND  (SELECT COUNT(*) FROM CHAT_PARTICIPANTS WHERE conv_id = c.conv_id) = 2
           FETCH FIRST 1 ROW ONLY`,
          { aus_id: Number(aus_id), partner_id: Number(partnerId) },
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
      const convName  = conv_type === 'CHANNEL' ? String(name).trim() : null;
      const createdBy = username || null;
      // Tạo conversation dùng CONV_SEQ
      const ins = await conn.execute(
        `INSERT INTO CHAT_CONVERSATIONS
           (conv_id, conv_type, name, aus_id, created_by, create_date)
         VALUES
           (CONV_SEQ.NEXTVAL, :conv_type, :name, :aus_id, :created_by, SYSTIMESTAMP)
         RETURNING conv_id INTO :out_id`,
        {
          conv_type,
          name:       convName,
          aus_id:     Number(aus_id),
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

    res.json({ status: 'ok', conv_id: convId });
  } catch (err) {
    console.error('[Chat] POST /create:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, chatWaiters, onlineUsers };
