const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cors());

// In-memory rooms: { roomId: { clients: Set(ws), state: { time, paused, rate } } }
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
      // send current state to new client
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
      // update server-side state
      if (!rooms[roomId]) rooms[roomId] = { clients: new Set(), state: null };
      const s = rooms[roomId].state || {};
      // merge: payload may have { action, time, paused, rate }
      rooms[roomId].state = Object.assign(s, payload);
      // broadcast to others
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
      // optional: delete room if empty
      if (rooms[r].clients.size === 0) {
        // keep for a short time OR remove immediately:
        // delete rooms[r];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server listening on', PORT));
