// Renders the game from the authoritative server snapshot. The driver gets the
// round's guess buttons; everyone else sees the same live board read-only. The
// look/flow mirror the reference game (four cards flip one at a time from a golden
// card-back; rounds 2 & 3 include a "Same" option; win/lose messaging + drink count).

// Per-round button config. `cls` picks a colour treatment in the CSS.
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

function cardHtml(card, index, activeIndex, phase) {
  const isCurrent = index === activeIndex ? ' current' : '';
  const isLoser = phase === 'lost' && index === activeIndex ? ' loser' : '';
  const showBack = card.faceUp ? '' : ' show-back';
  const face = card.faceUp
    ? `<img src="/cards/PNG/${card.id}.png" alt="${card.rank} of ${card.suit}" />`
    : '';
  return `
    <div class="flip${isCurrent}${isLoser}">
      <div class="flip-inner${showBack}">
        <div class="face">${face}</div>
        <div class="back"></div>
      </div>
    </div>`;
}

function renderCards(state) {
  // The "current" slot is the one being guessed this round (0-indexed).
  const activeIndex = state.round - 1;
  const cards = state.cards
    .map((c, i) => cardHtml(c, i, activeIndex, state.phase))
    .join('');
  return `<div class="cards">${cards}</div>`;
}

function renderRoster(state, me) {
  const items = state.players
    .map((p) => {
      const you = p.id === me ? ' <span class="you">(you)</span>' : '';
      const badge = p.isActive
        ? '<span class="badge driver">🚌 Driver</span>'
        : '<span class="badge">Spectator</span>';
      const drinks = p.drinks > 0 ? `<span class="drinks">🍺 ${p.drinks}</span>` : '';
      return `<li>${badge}<span class="pname">${p.name}${you}</span>${drinks}</li>`;
    })
    .join('');
  return `<aside class="roster"><h3>Players</h3><ul>${items}</ul></aside>`;
}

function guessButtons(round) {
  const btns = (ROUND_BUTTONS[round] || [])
    .map((b) => `<button class="btn ${b.cls}" data-guess="${b.value}">${b.label}</button>`)
    .join('');
  return `<div class="actions">${btns}</div>`;
}

function renderControls(state, me) {
  const iAmDriver = state.activePlayerId === me;
  const driver = state.players.find((p) => p.isActive);
  const driverName = driver ? driver.name : '—';

  if (state.phase === 'playing') {
    if (iAmDriver) {
      return `<h2 class="prompt">${ROUND_NAME[state.round]}</h2>${guessButtons(state.round)}`;
    }
    return `<h2 class="prompt">${driverName} is driving</h2><p class="sub">Round ${state.round}/4 · ${ROUND_NAME[state.round]}</p>`;
  }

  if (state.phase === 'lost') {
    const msg = iAmDriver ? '🍺 Take a drink!' : `🍺 ${driverName} took a drink!`;
    const action = iAmDriver
      ? `<div class="actions"><button class="btn ghost" data-redraw="1">Redraw Cards</button></div>`
      : `<p class="sub">Waiting for ${driverName} to redraw…</p>`;
    return `<h2 class="prompt lose">${msg}</h2>${action}`;
  }

  // phase === 'won'
  const spectators = state.players.filter((p) => !p.isActive);
  if (iAmDriver) {
    if (spectators.length) {
      const picks = spectators
        .map((p) => `<button class="btn secondary" data-target="${p.id}">${p.name}</button>`)
        .join('');
      return `<h2 class="prompt win">🎉 You won!</h2><p class="sub">Nominate the next driver:</p><div class="actions">${picks}</div>`;
    }
    return `<h2 class="prompt win">🎉 You won!</h2><div class="actions"><button class="btn ghost" data-redraw="1">Another Ride?</button></div>`;
  }
  return `<h2 class="prompt win">🎉 ${driverName} won the ride!</h2><p class="sub">They're picking the next driver…</p>`;
}

// Lightweight confetti burst (no dependencies). Fired once when a win appears.
let lastPhase = null;
function maybeConfetti(phase) {
  if (phase === 'won' && lastPhase !== 'won') burstConfetti();
  lastPhase = phase;
}

function burstConfetti() {
  const colors = ['#dc2626', '#ffd700', '#ffffff', '#22d3ee', '#a3e635'];
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  for (let i = 0; i < 80; i++) {
    const bit = document.createElement('span');
    bit.className = 'confetti';
    bit.style.left = `${Math.random() * 100}vw`;
    bit.style.background = colors[Math.floor(Math.random() * colors.length)];
    bit.style.animationDelay = `${Math.random() * 0.5}s`;
    bit.style.animationDuration = `${2 + Math.random() * 1.5}s`;
    layer.appendChild(bit);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 4000);
}

export function render(root, state, me, actions) {
  root.innerHTML = `
    <div class="game">
      <header class="topbar"><h1>Ride The Bus</h1></header>
      ${renderCards(state)}
      <section class="controls">${renderControls(state, me)}</section>
      <p class="drinkcount">🍺 Drinks this ride: <strong>${state.drinks}</strong></p>
      ${renderRoster(state, me)}
    </div>
  `;

  root.querySelectorAll('button[data-guess]').forEach((btn) => {
    btn.addEventListener('click', () => actions.guess(btn.dataset.guess));
  });
  root.querySelectorAll('button[data-target]').forEach((btn) => {
    btn.addEventListener('click', () => actions.nominate(btn.dataset.target));
  });
  const redrawBtn = root.querySelector('button[data-redraw]');
  if (redrawBtn) redrawBtn.addEventListener('click', () => actions.redraw());

  maybeConfetti(state.phase);
}
