import './style.css';
import { initAuth } from './discordSdk.js';
import { createSocket } from './socket.js';
import { render } from './game-ui.js';

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
    setStatus('Failed to connect to Discord. Reload to try again.');
    return;
  }

  const me = auth.user.id;
  let latest = null;

  const socket = createSocket(auth, (state) => {
    latest = state;
    render(app, state, me, {
      guess: (g) => socket.guess(g),
      redraw: () => socket.redraw(),
      nominate: (t) => socket.nominate(t),
    });
  });

  setStatus('Joining game…');

  const actions = {
    guess: (g) => socket.guess(g),
    redraw: () => socket.redraw(),
    nominate: (t) => socket.nominate(t),
  };

  // Re-render on resize so the layout stays sane inside the Discord iframe.
  window.addEventListener('resize', () => {
    if (latest) render(app, latest, me, actions);
  });
}

main();
