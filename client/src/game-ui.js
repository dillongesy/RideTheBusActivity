// Renders the game from the authoritative server snapshot.
//
// Unlike a naive innerHTML rebuild, this keeps a persistent DOM skeleton and
// updates it in place. That's what lets the cards actually *flip* (the node
// survives between updates so the CSS 3D transition plays) and lets a spectator
// see the driver's live cursor without it being wiped on every state change.

const ROUND_BUTTONS = {
  1: [
    { label: 'Red', value: 'red', cls: 'red' },
    { label: 'Black', value: 'black', cls: 'black' },
  ],
  2: [
    { label: 'Higher', value: 'higher', cls: 'ghost' },
    { label: 'Lower', value: 'lower', cls: 'ghost' },
    { label: 'Same', value: 'same', cls: 'ghost' },
  ],
  3: [
    { label: 'Inside', value: 'inside', cls: 'ghost' },
    { label: 'Outside', value: 'outside', cls: 'ghost' },
    { label: 'Same', value: 'same', cls: 'ghost' },
  ],
  4: [
    { label: 'Hearts ♥', value: 'HEARTS', cls: 'red' },
    { label: 'Diamonds ♦', value: 'DIAMONDS', cls: 'red' },
    { label: 'Clubs ♣', value: 'CLUBS', cls: 'black' },
    { label: 'Spades ♠', value: 'SPADES', cls: 'black' },
  ],
};

const ROUND_NAME = {
  1: 'Red or Black?',
  2: 'Higher, Lower or Same?',
  3: 'Inside, Outside or Same?',
  4: 'Guess the Suit',
};

// --- module state (persists across renders) ---
let rootEl = null;
let cardNodes = [];
let lastPhase = null;
let lastCursor = null; // { x, y, hover } from the driver, in normalized 0..1 coords
let currentState = null;
let currentMe = null;

function driverOf(state) {
  return state.players.find((p) => p.isActive) || null;
}

// -------- skeleton --------
function buildSkeleton(root) {
  root.innerHTML = `
    <div class="game">
      <header class="topbar"><h1>Ride The Bus</h1></header>
      <div class="cards"></div>
      <section class="controls"></section>
      <p class="drinkcount"></p>
      <aside class="roster"><h3>Players</h3><ul></ul></aside>
      <div class="driver-cursor" hidden><span class="dc-dot"></span><span class="dc-name"></span></div>
    </div>`;

  const cardsEl = root.querySelector('.cards');
  cardNodes = [];
  for (let i = 0; i < 4; i++) {
    const flip = document.createElement('div');
    flip.className = 'flip';
    flip.innerHTML = `<div class="flip-inner show-back"><div class="face"></div><div class="back"></div></div>`;
    cardsEl.appendChild(flip);
    cardNodes.push(flip);
  }
}

// -------- cards (animated in place) --------
function updateCards(state) {
  const activeIndex = state.round - 1;
  state.cards.forEach((card, i) => {
    const flip = cardNodes[i];
    const inner = flip.querySelector('.flip-inner');
    const face = flip.querySelector('.face');

    flip.classList.toggle('current', state.phase === 'playing' && i === activeIndex);
    flip.classList.toggle('loser', state.phase === 'lost' && i === activeIndex);

    if (card.faceUp) {
      if (face.dataset.id !== card.id) {
        face.innerHTML = `<img src="/cards/PNG/${card.id}.png" alt="${card.rank} of ${card.suit}" />`;
        face.dataset.id = card.id;
      }
      inner.classList.remove('show-back'); // reveal — this transition is the flip
    } else {
      inner.classList.add('show-back'); // face down
      face.dataset.id = '';
    }
  });
}

// -------- controls --------
function guessButtons(round, { disabled = false } = {}) {
  const btns = (ROUND_BUTTONS[round] || [])
    .map(
      (b) =>
        `<button class="btn ${b.cls}" data-guess="${b.value}" ${disabled ? 'disabled' : ''}>${b.label}</button>`
    )
    .join('');
  return `<div class="actions${disabled ? ' spectating' : ''}">${btns}</div>`;
}

function controlsHtml(state, me) {
  const iAmDriver = state.activePlayerId === me;
  const driver = driverOf(state);
  const driverName = driver ? driver.name : '—';

  if (state.phase === 'playing') {
    if (iAmDriver) {
      return `<h2 class="prompt">${ROUND_NAME[state.round]}</h2>${guessButtons(state.round)}`;
    }
    // Spectators watch the same buttons (greyed) so the driver's cursor/hover reads clearly.
    return (
      `<h2 class="prompt">${driverName} is driving</h2>` +
      `<p class="sub">Round ${state.round}/4 · ${ROUND_NAME[state.round]}</p>` +
      guessButtons(state.round, { disabled: true })
    );
  }

  if (state.phase === 'lost') {
    const msg = iAmDriver ? '🍺 Take a drink!' : `🍺 ${driverName} took a drink!`;
    const action = iAmDriver
      ? `<div class="actions"><button class="btn ghost" data-redraw="1">Redraw Cards</button></div>`
      : `<p class="sub">Waiting for ${driverName} to redraw…</p>`;
    return `<h2 class="prompt lose">${msg}</h2>${action}`;
  }

  // phase === 'won'
  const perfect = state.drinks === 0;
  const title = iAmDriver
    ? perfect
      ? '🍺 PERFECT RIDE — 0 drinks!'
      : '🎉 You won!'
    : perfect
      ? `🍺 ${driverName} rode perfect — 0 drinks!`
      : `🎉 ${driverName} won the ride!`;

  const spectators = state.players.filter((p) => !p.isActive);
  if (iAmDriver) {
    if (spectators.length) {
      const picks = spectators
        .map((p) => `<button class="btn secondary" data-target="${p.id}">${p.name}</button>`)
        .join('');
      return `<h2 class="prompt win">${title}</h2><p class="sub">Nominate the next driver:</p><div class="actions">${picks}</div>`;
    }
    return `<h2 class="prompt win">${title}</h2><div class="actions"><button class="btn ghost" data-redraw="1">Another Ride?</button></div>`;
  }
  return `<h2 class="prompt win">${title}</h2><p class="sub">They're picking the next driver…</p>`;
}

function updateControls(root, state, me, actions) {
  const el = root.querySelector('.controls');
  el.innerHTML = controlsHtml(state, me);

  el.querySelectorAll('button[data-guess]').forEach((btn) => {
    if (!btn.disabled) btn.addEventListener('click', () => actions.guess(btn.dataset.guess));
  });
  el.querySelectorAll('button[data-target]').forEach((btn) => {
    btn.addEventListener('click', () => actions.nominate(btn.dataset.target));
  });
  const redraw = el.querySelector('button[data-redraw]');
  if (redraw) redraw.addEventListener('click', () => actions.redraw());
}

// -------- roster (shows each player's best/least-drinks ride) --------
function bestLabel(p) {
  if (p.bestDrinks == null) return '<span class="best none">—</span>';
  if (p.bestDrinks === 0) return '<span class="best perfect">🏆 0 drinks</span>';
  return `<span class="best">🍺 best: ${p.bestDrinks}</span>`;
}

function updateRoster(root, state, me) {
  const ul = root.querySelector('.roster ul');
  ul.innerHTML = state.players
    .map((p) => {
      const you = p.id === me ? ' <span class="you">(you)</span>' : '';
      const badge = p.isActive
        ? '<span class="badge driver">🚌 Driver</span>'
        : '<span class="badge">Spectator</span>';
      return `<li>${badge}<span class="pname">${p.name}${you}</span>${bestLabel(p)}</li>`;
    })
    .join('');
}

// -------- driver cursor overlay (spectator view) --------
export function updateCursor(cursor) {
  lastCursor = cursor;
  applyCursor();
}

function applyCursor() {
  if (!rootEl || !currentState) return;
  const overlay = rootEl.querySelector('.driver-cursor');
  const game = rootEl.querySelector('.game');
  if (!overlay || !game) return;

  // Clear any previous hover highlight.
  rootEl.querySelectorAll('.btn.driver-hover').forEach((b) => b.classList.remove('driver-hover'));

  const showToMe =
    currentState.phase === 'playing' && currentMe !== currentState.activePlayerId && lastCursor;
  if (!showToMe) {
    overlay.hidden = true;
    return;
  }

  const rect = game.getBoundingClientRect();
  overlay.hidden = false;
  overlay.style.left = `${lastCursor.x * rect.width}px`;
  overlay.style.top = `${lastCursor.y * rect.height}px`;
  const driver = driverOf(currentState);
  overlay.querySelector('.dc-name').textContent = driver ? driver.name : '';

  if (lastCursor.hover) {
    const btn = rootEl.querySelector(`.btn[data-guess="${lastCursor.hover}"]`);
    if (btn) btn.classList.add('driver-hover');
  }
}

// -------- confetti --------
function maybeConfetti(state) {
  if (state.phase === 'won' && lastPhase !== 'won') {
    burstConfetti(state.drinks === 0); // perfect ride => beer emojis
  }
  lastPhase = state.phase;
}

function burstConfetti(perfect) {
  const colors = ['#dc2626', '#ffd700', '#ffffff', '#22d3ee', '#a3e635'];
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  const count = perfect ? 44 : 80;
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('span');
    if (perfect) {
      bit.className = 'confetti beer';
      bit.textContent = Math.random() < 0.5 ? '🍺' : '🍻';
    } else {
      bit.className = 'confetti';
      bit.style.background = colors[Math.floor(Math.random() * colors.length)];
    }
    bit.style.left = `${Math.random() * 100}vw`;
    bit.style.animationDelay = `${Math.random() * 0.5}s`;
    bit.style.animationDuration = `${2 + Math.random() * 1.5}s`;
    layer.appendChild(bit);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 4500);
}

// -------- entry point --------
export function render(root, state, me, actions) {
  rootEl = root;
  currentMe = me;
  currentState = state;

  if (!root.querySelector('.game')) buildSkeleton(root);

  updateCards(state);
  updateControls(root, state, me, actions);
  root.querySelector('.drinkcount').innerHTML =
    `🍺 Drinks this ride: <strong>${state.drinks}</strong>`;
  updateRoster(root, state, me);
  maybeConfetti(state);
  applyCursor(); // reapply hover highlight after controls were rebuilt
}
