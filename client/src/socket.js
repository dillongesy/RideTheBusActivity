// Thin WebSocket client with auto-reconnect. Sends a `join` on every (re)connect
// and forwards server `state` snapshots to a subscriber.

export function createSocket({ instanceId, user }, onState, onCursor) {
  let ws;
  let closedByUs = false;
  let backoff = 500;

  function url() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  function sendJoin() {
    send({
      type: 'join',
      instanceId,
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
    });
  }

  function connect() {
    ws = new WebSocket(url());

    ws.addEventListener('open', () => {
      backoff = 500;
      sendJoin();
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'state') onState(msg);
      else if (msg.type === 'cursor' && onCursor) onCursor(msg.cursor);
    });

    ws.addEventListener('close', () => {
      if (closedByUs) return;
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 5000);
    });

    ws.addEventListener('error', () => ws.close());
  }

  function send(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  connect();

  return {
    guess: (guess) => send({ type: 'guess', guess }),
    cursor: (cursor) => send({ type: 'cursor', cursor }),
    redraw: () => send({ type: 'redraw' }),
    nominate: (targetId) => send({ type: 'nominate', targetId }),
    close: () => {
      closedByUs = true;
      if (ws) ws.close();
    },
  };
}
