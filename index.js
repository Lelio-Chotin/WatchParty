const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cors());

const rooms = {};

app.post('/room', (req, res) => {
  const roomId = uuidv4().slice(0, 8);
  rooms[roomId] = { clients: new Set(), state: null };
  res.json({ roomId });
});

app.get('/room/:id', (req, res) => {
  const id = req.params.id;
  if (!rooms[id]) return res.status(404).json({ error: 'not found' });
  res.json({ roomId: id, clients: rooms[id].clients.size, state: rooms[id].state });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

function broadcastToRoom(roomId, message, exceptWs = null) {
  if (!rooms[roomId]) return;
  const str = JSON.stringify(message);
  for (const client of rooms[roomId].clients) {
    if (client.readyState === WebSocket.OPEN && client !== exceptWs) {
      client.send(str);
    }
  }
}

wss.on('connection', (ws, req) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { console.warn('bad json', raw); return; }

    const { type, roomId, payload } = msg;

    if (type === 'join') {
      if (!rooms[roomId]) rooms[roomId] = { clients: new Set(), state: null };
      ws.roomId = roomId;
      rooms[roomId].clients.add(ws);
      if (rooms[roomId].state) {
        ws.send(JSON.stringify({ type: 'stateResponse', roomId, payload: rooms[roomId].state }));
      }
      broadcastToRoom(roomId, { type: 'presence', roomId, payload: { clients: rooms[roomId].clients.size } }, ws);
    }

    else if (type === 'leave') {
      const r = roomId || ws.roomId;
      if (r && rooms[r]) {
        rooms[r].clients.delete(ws);
        broadcastToRoom(r, { type: 'presence', roomId: r, payload: { clients: rooms[r].clients.size } });
      }
    }

    else if (type === 'sync') {
      if (!rooms[roomId]) rooms[roomId] = { clients: new Set(), state: null };
      const s = rooms[roomId].state || {};
      rooms[roomId].state = Object.assign(s, payload);
      broadcastToRoom(roomId, { type: 'sync', roomId, payload }, ws);
    }

    else if (type === 'chat') {
      broadcastToRoom(roomId, { type: 'chat', roomId, payload }, ws);
    }

    else if (type === 'emote') {
      broadcastToRoom(roomId, { type: 'emote', roomId, payload }, ws);
    }

    else if (type === 'stateRequest') {
      if (rooms[roomId] && rooms[roomId].state) {
        ws.send(JSON.stringify({ type: 'stateResponse', roomId, payload: rooms[roomId].state }));
      }
    }

  });

  ws.on('close', () => {
    const r = ws.roomId;
    if (r && rooms[r]) {
      rooms[r].clients.delete(ws);
      broadcastToRoom(r, { type: 'presence', roomId: r, payload: { clients: rooms[r].clients.size } });
      if (rooms[r].clients.size === 0) {
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

setInterval(() => {
  if (rooms) {
    const count = Object.keys(rooms).length;
    console.log("KeepAlive : rooms =", count);
  }
}, 25000);

app.get('/health', (req, res) => {
  res.json({ ok: true, rooms: Object.keys(rooms).length });
});

server.listen(PORT, () => console.log('Server listening on', PORT));
