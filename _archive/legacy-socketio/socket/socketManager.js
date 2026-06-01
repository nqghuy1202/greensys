'use strict';

const oracledb = require('oracledb');

let _io;

// Cache aus_id → username to avoid a DB hit on every notification
const ausIdCache = new Map();

// ──────────────────────────────────────────────────────────
// INIT — call once after Socket.io server is created
// ──────────────────────────────────────────────────────────
function init(io) {
  _io = io;

  io.on('connection', (socket) => {
    const username = (socket.handshake.query.username || '').toLowerCase().trim();

    if (!username) {
      socket.disconnect(true);
      return;
    }

    const room = `user:${username}`;
    socket.join(room);
    console.log(`[Socket] ${username} connected (${socket.id}), joined ${room}`);

    socket.on('disconnect', (reason) => {
      console.log(`[Socket] ${username} disconnected (${reason})`);
    });
  });
}

// ──────────────────────────────────────────────────────────
// EMIT — send notification to a user's room
// Returns true if at least one socket is in the room
// ──────────────────────────────────────────────────────────
function emitToUser(username, payload) {
  if (!_io || !username) return false;

  const room   = `user:${username}`;
  const sockets = _io.sockets.adapter.rooms.get(room);

  if (!sockets || sockets.size === 0) {
    console.log(`[Socket] ${username} offline — notification will load on next bell refresh`);
    return false;
  }

  _io.to(room).emit('new_notification', payload);
  console.log(`[Socket] Emitted to ${room} (${sockets.size} socket(s))`);
  return true;
}

// ──────────────────────────────────────────────────────────
// RESOLVE USERNAME — aus_id → login username
// conn is the existing pool connection from the CQN handler
// ──────────────────────────────────────────────────────────
async function resolveUsername(conn, ausId) {
  if (!ausId) return null;

  if (ausIdCache.has(ausId)) {
    return ausIdCache.get(ausId);
  }

  try {
    // Adjust table/column names to match your ERP schema
    const result = await conn.execute(
      `SELECT username
       FROM   app_users
       WHERE  id = :ausId`,
      { ausId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const username = result.rows[0]?.USERNAME?.toLowerCase() || null;
    if (username) ausIdCache.set(ausId, username);
    return username;

  } catch (err) {
    console.error('[Socket] resolveUsername error for aus_id', ausId, ':', err.message);
    return null;
  }
}

module.exports = { init, emitToUser, resolveUsername };
