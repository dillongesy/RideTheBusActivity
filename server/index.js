require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');

const rooms = require('./rooms');

const PORT = process.env.PORT || 3001;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;

const app = express();
app.use(express.json());

// --- Discord OAuth2 token exchange --------------------------------------
// The Embedded App SDK sends us an authorization `code`; we swap it for an
// access_token using our client secret (which must never reach the browser).
app.post('/api/token', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'missing_code' });

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Token exchange failed:', data);
      return res.status(response.status).json({ error: 'token_exchange_failed', detail: data });
    }
    return res.json({ access_token: data.access_token });
  } catch (err) {
    console.error('Token exchange error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// In production, serve the built client. In dev, Vite serves the client and
// proxies /api + /ws here, so this static mount is harmless.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
// `extensions: ['html']` lets the standalone legal pages be served at clean paths
// (/pokebot-tos, /privacy-policy, /privacy, /terms) instead of falling through to
// the catch-all below and rendering the game. They are not linked from the game UI.
app.use(express.static(clientDist, { extensions: ['html'] }));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) res.status(404).end();
  });
});

// --- WebSocket game server ----------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'join':
        if (msg.instanceId && msg.userId) {
          rooms.join(msg.instanceId, {
            userId: msg.userId,
            name: msg.username,
            avatar: msg.avatar,
          }, ws);
        }
        break;
      case 'guess':
        rooms.handleGuess(ws._roomId, ws._userId, msg.guess);
        break;
      case 'cursor':
        rooms.handleCursor(ws._roomId, ws._userId, msg.cursor);
        break;
      case 'redraw':
        rooms.handleRedraw(ws._roomId, ws._userId);
        break;
      case 'nominate':
        rooms.handleNominate(ws._roomId, ws._userId, msg.targetId);
        break;
      default:
        break;
    }
  });

  ws.on('close', () => rooms.leave(ws));
  ws.on('error', () => rooms.leave(ws));
});

server.listen(PORT, () => {
  console.log(`Ride the Bus server listening on :${PORT}`);
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn('WARNING: DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET not set — /api/token will fail.');
  }
});
