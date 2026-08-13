import './style.css';
import { initAuth } from './discordSdk.js';
import { createSocket } from './socket.js';
import { render, updateCursor, noteCursorSent } from './game-ui.js';

const app = document.getElementById('app');

function setStatus(text) {
  app.innerHTML = `<div class="status">${text}</div>`;
}

async function main() {
  setStatus('Authenticating…');

  let auth;
  try {
    auth = await initAuth();
  } catch (err) {
    console.error(err);
    setStatus(
      `<strong>Failed to connect to Discord.</strong><br><br>` +
        `<code style="font-size:0.85rem;color:#f88;word-break:break-word">${(err && err.message) || err}</code>` +
        `<br><br>Reload to try again.`
    );
    return;
  }

  const me = auth.user.id;
  let latest = null;

  const socket = createSocket(
    auth,
    (state) => {
      latest = state;
      render(app, state, me, actions);
    },
    (cursor) => updateCursor(cursor) // driver's cursor, shown to spectators
  );

  const actions = {
    guess: (g) => socket.guess(g),
    redraw: () => socket.redraw(),
    nominate: (t) => socket.nominate(t),
  };

  setStatus('Joining game…');

  // Re-render on resize so the layout stays sane inside the Discord iframe.
  window.addEventListener('resize', () => {
    if (latest) render(app, latest, me, actions);
  });

  // When I'm the driver, stream my cursor position + hovered button to spectators.
  // Throttled, normalized to the .game box so it maps onto each spectator's layout.
  let lastSent = 0;
  window.addEventListener('mousemove', (e) => {
    if (!latest || latest.activePlayerId !== me || latest.phase !== 'playing') return;
    const now = performance.now();
    if (now - lastSent < 45) return;

    const game = app.querySelector('.game');
    if (!game) return;
    const rect = game.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return; // outside the board

    lastSent = now;
    const hover = e.target.closest ? e.target.closest('.btn[data-guess]')?.dataset.guess ?? null : null;
    socket.cursor({ x, y, hover });
    noteCursorSent(); // increments the tx counter in the corner diagnostic
  });
}

main();
