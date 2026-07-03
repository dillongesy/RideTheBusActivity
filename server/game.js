// Authoritative Ride the Bus engine. Models the game the same way the reference
// (github.com/marcinlukanus/RideTheBusV2) does: draw all four cards up front face
// down, then flip them one at a time as the driver guesses. Rounds 2 and 3 allow a
// "same" guess, and a tie WINS if the driver called "same".
//
// The server never sends face-down cards' values to clients (anti-cheat / spectators),
// so it holds the full hand here and only reveals cards as they flip.

const SUITS = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
const SUIT_LETTER = { HEARTS: 'H', DIAMONDS: 'D', CLUBS: 'C', SPADES: 'S' };
const RED_SUITS = new Set(['HEARTS', 'DIAMONDS']);

// Rank codes map to the existing PNG filenames in client/public/cards/PNG
// (e.g. "10H.png", "ACES.png", "KD.png"). Ace is high (value 14).
const RANKS = [
  { rank: '2', value: 2 }, { rank: '3', value: 3 }, { rank: '4', value: 4 },
  { rank: '5', value: 5 }, { rank: '6', value: 6 }, { rank: '7', value: 7 },
  { rank: '8', value: 8 }, { rank: '9', value: 9 }, { rank: '10', value: 10 },
  { rank: 'J', value: 11 }, { rank: 'Q', value: 12 }, { rank: 'K', value: 13 },
  { rank: 'A', value: 14 },
];

const TOTAL_ROUNDS = 4;

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const r of RANKS) {
      const fileRank = r.rank === 'A' ? 'ACE' : r.rank; // filenames use "ACE"
      deck.push({
        id: `${fileRank}${SUIT_LETTER[suit]}`, // matches "<rank><suit>.png"
        suit,
        rank: r.rank,
        value: r.value,
        color: RED_SUITS.has(suit) ? 'red' : 'black',
      });
    }
  }
  return deck;
}

// Draw `amount` distinct random cards (Fisher-Yates style pick).
function drawCards(amount) {
  const deck = buildDeck();
  const hand = [];
  for (let i = 0; i < amount; i++) {
    const idx = Math.floor(Math.random() * deck.length);
    hand.push(deck[idx]);
    deck.splice(idx, 1);
  }
  return hand;
}

// --- Round validation (mirrors the reference's rules) -------------------

function validateRound1(card, guess) {
  // guess: 'red' | 'black'
  return card.color === guess;
}

function validateRound2(c1, c2, guess) {
  // guess: 'higher' | 'lower' | 'same'
  if (c2.value > c1.value) return guess === 'higher';
  if (c2.value < c1.value) return guess === 'lower';
  return guess === 'same';
}

function validateRound3(c1, c2, c3, guess) {
  // guess: 'inside' | 'outside' | 'same'. Equal to either bound => 'same' wins.
  const low = Math.min(c1.value, c2.value);
  const high = Math.max(c1.value, c2.value);
  if (c3.value === c1.value || c3.value === c2.value) return guess === 'same';
  if (c3.value > low && c3.value < high) return guess === 'inside';
  return guess === 'outside';
}

function validateRound4(card, guess) {
  // guess: 'HEARTS' | 'DIAMONDS' | 'CLUBS' | 'SPADES'
  return card.suit === guess;
}

function validate(round, hand, guess) {
  switch (round) {
    case 1: return validateRound1(hand[0], guess);
    case 2: return validateRound2(hand[0], hand[1], guess);
    case 3: return validateRound3(hand[0], hand[1], hand[2], guess);
    case 4: return validateRound4(hand[3], guess);
    default: return false;
  }
}

// --- State --------------------------------------------------------------

// Fresh run for the current driver: new hand face down, back to round 1.
function startRun(state) {
  state.hand = drawCards(TOTAL_ROUNDS);
  state.revealed = [false, false, false, false];
  state.round = 1;
  state.phase = 'playing'; // 'playing' | 'lost' | 'won'
  state.lastGuess = null; // { round, guess, correct }
  return state;
}

function createGame() {
  const state = { activePlayerId: null };
  startRun(state);
  return state;
}

// Driver guesses the current round. Reveals the round's card either way.
function applyGuess(state, userId, guess) {
  if (state.phase !== 'playing') return { ok: false, error: 'not_playing' };
  if (userId !== state.activePlayerId) return { ok: false, error: 'not_your_turn' };

  const round = state.round;
  const idx = round - 1;
  const correct = validate(round, state.hand, guess);

  state.revealed[idx] = true;
  state.lastGuess = { round, guess, correct };

  if (!correct) {
    state.phase = 'lost';
    return { ok: true, lost: true };
  }

  if (round === TOTAL_ROUNDS) {
    state.phase = 'won';
    state.revealed = [true, true, true, true];
    return { ok: true, won: true };
  }

  state.round += 1;
  return { ok: true };
}

// Start a fresh run for the same driver. Allowed only after the game is over.
function redraw(state, userId) {
  if (state.phase === 'playing') return { ok: false, error: 'in_progress' };
  if (userId !== state.activePlayerId) return { ok: false, error: 'not_your_turn' };
  startRun(state);
  return { ok: true };
}

// After a win, the driver nominates a spectator to take the wheel.
function nominate(state, userId, targetId) {
  if (state.phase !== 'won') return { ok: false, error: 'not_won' };
  if (userId !== state.activePlayerId) return { ok: false, error: 'not_your_turn' };
  if (targetId === userId) return { ok: false, error: 'cannot_nominate_self' };
  state.activePlayerId = targetId;
  startRun(state);
  return { ok: true };
}

// Force a driver (used when the current driver disconnects).
function setActivePlayer(state, userId) {
  state.activePlayerId = userId;
  startRun(state);
  return state;
}

// Client-facing view of the hand: only revealed cards expose their identity.
function serializeCards(state) {
  return state.hand.map((card, i) =>
    state.revealed[i]
      ? { faceUp: true, id: card.id, rank: card.rank, suit: card.suit, color: card.color }
      : { faceUp: false }
  );
}

module.exports = {
  TOTAL_ROUNDS,
  createGame,
  startRun,
  applyGuess,
  redraw,
  nominate,
  setActivePlayer,
  serializeCards,
};
