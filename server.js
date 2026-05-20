'use strict';
require('dotenv').config();

const oracledb = require('oracledb');

// ① THICK MODE — must be before any other oracledb call
// On Linux: no libDir argument (libs must be in system path via ldconfig)
oracledb.initOracleClient();
console.log('[DB] Mode:', oracledb.thin ? 'Thin (WARNING: CQN needs Thick)' : 'Thick');

const express           = require('express');
const { createServer }  = require('http');
const { Server }        = require('socket.io');
const { startCQN }      = require('./cqn');
const socketMgr         = require('./socket/socketManager');

// ② CONNECTION POOL — shared by CQN data-fetch handlers
oracledb.createPool({
  user:          process.env.DB_USER,
  password:      process.env.DB_PASSWORD,
  connectString: process.env.DB_CONNECTION_STRING,
  poolMin:       parseInt(process.env.DB_POOL_MIN, 10)       || 2,
  poolMax:       parseInt(process.env.DB_POOL_MAX, 10)       || 10,
  poolIncrement: parseInt(process.env.DB_POOL_INCREMENT, 10) || 1
}).then(() => {
  console.log('[DB] Connection pool created');
}).catch(err => {
  console.error('[DB] Pool creation failed:', err.message);
  process.exit(1);
});

// ③ EXPRESS + SOCKET.IO
const app        = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin:      (process.env.APEX_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
    methods:     ['GET', 'POST'],
    credentials: true
  }
});

socketMgr.init(io);

app.get('/health', (req, res) => {
  res.json({ ok: true, mode: oracledb.thin ? 'thin' : 'thick' });
});

// ④ START
const PORT = parseInt(process.env.PORT, 10) || 3140;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Listening on 0.0.0.0:${PORT}`);

  startCQN({
    emitToUser:      socketMgr.emitToUser,
    resolveUsername: socketMgr.resolveUsername
  }).catch(err => {
    console.error('[CQN] Fatal error:', err.message);
    process.exit(1);
  });
});

// ⑤ GRACEFUL SHUTDOWN
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM — shutting down');
  httpServer.close();
  try { await oracledb.getPool().close(10); } catch {}
  process.exit(0);
});
