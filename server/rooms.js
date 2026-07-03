// Room manager: one room per Discord Activity instanceId.
// Holds the authoritative game state plus connected players/sockets, and broadcasts
// a full state snapshot to everyone on any change.

const {
  createGame,
  applyGuess,
  redraw,
  nominate,
  setActivePlayer,
  serializeCards,
} = require('./game');

/** @typedef {{ id: string, name: string, avatar: string|null, drinks: number, ws: import('ws').WebSocket }} Player */

const rooms = new Map(); // instanceId -> room

function getOrCreateRoom(instanceId) {
  let room = rooms.get(instanceId);
  if (!room) {
    room = {
      instanceId,
      players: new Map(), // userId -> Player
      game: createGame(),
    };
    rooms.set(instanceId, room);
  }
  return room;
}

function serialize(room) {
  const g = room.game;
  const players = [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    drinks: p.drinks,
    isActive: p.id === g.activePlayerId,
  }));

  const activePlayer = players.find((p) => p.isActive) || null;

  return {
    type: 'state',
    instanceId: room.instanceId,
    phase: g.phase, // 'playing' | 'lost' | 'won'
    round: g.round, // 1..4
    cards: serializeCards(g),
    lastGuess: g.lastGuess,
    activePlayerId: g.activePlayerId,
    drinks: activePlayer ? activePlayer.drinks : 0,
    players,
    spectators: players.filter((p) => !p.isActive).map((p) => p.id),
  };
}

function broadcast(room) {
  const payload = JSON.stringify(serialize(room));
  for (const p of room.players.values()) {
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(payload);
  }
}

// A client joins (or rejoins). First player to join becomes the driver.
function join(instanceId, { userId, name, avatar }, ws) {
  const room = getOrCreateRoom(instanceId);

  const existing = room.players.get(userId);
  if (existing) {
    existing.ws = ws; // reconnect: swap socket, keep drinks/seat
    existing.name = name || existing.name;
    existing.avatar = avatar ?? existing.avatar;
  } else {
    room.players.set(userId, {
      id: userId,
      name: name || 'Player',
      avatar: avatar || null,
      drinks: 0,
      ws,
    });
  }

  // Seat the driver if the seat is empty.
  if (!room.game.activePlayerId || !room.players.has(room.game.activePlayerId)) {
    setActivePlayer(room.game, userId);
    const seated = room.players.get(userId);
    if (seated) seated.drinks = 0;
  }

  ws._roomId = instanceId;
  ws._userId = userId;
  broadcast(room);
  return room;
}

function handleGuess(instanceId, userId, guess) {
  const room = rooms.get(instanceId);
  if (!room) return;
  applyGuess(room.game, userId, guess);
  broadcast(room);
}

// "Redraw Cards" after a loss (same driver, +1 drink) or "Another Ride?" after a
// win when there is nobody to nominate (score resets).
function handleRedraw(instanceId, userId) {
  const room = rooms.get(instanceId);
  if (!room) return;
  const phase = room.game.phase;
  const player = room.players.get(userId);

  const result = redraw(room.game, userId);
  if (result.ok && player) {
    if (phase === 'lost') player.drinks += 1; // rode the bus again
    else player.drinks = 0; // fresh ride after a win
  }
  broadcast(room);
}

// After a win, the driver nominates a connected spectator to drive next.
function handleNominate(instanceId, userId, targetId) {
  const room = rooms.get(instanceId);
  if (!room) return;
  if (!room.players.has(targetId)) return;
  const result = nominate(room.game, userId, targetId);
  if (result.ok) {
    const next = room.players.get(targetId);
    if (next) next.drinks = 0; // new driver starts with a clean slate
  }
  broadcast(room);
}

// A socket closed: remove the player; pass the wheel if they were driving.
function leave(ws) {
  const instanceId = ws._roomId;
  const userId = ws._userId;
  if (!instanceId || !userId) return;
  const room = rooms.get(instanceId);
  if (!room) return;

  const player = room.players.get(userId);
  if (player && player.ws === ws) room.players.delete(userId);

  if (room.players.size === 0) {
    rooms.delete(instanceId);
    return;
  }

  if (room.game.activePlayerId === userId) {
    const next = room.players.keys().next().value;
    setActivePlayer(room.game, next);
    const seated = room.players.get(next);
    if (seated) seated.drinks = 0;
  }

  broadcast(room);
}

module.exports = {
  join,
  handleGuess,
  handleRedraw,
  handleNominate,
  leave,
};
