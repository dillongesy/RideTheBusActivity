// Discord Embedded App SDK setup + OAuth flow, with a browser mock fallback.
//
// When running inside Discord, the iframe URL contains a `frame_id` query param.
// If it's absent we're in a plain browser (local dev): skip the SDK entirely and
// return a mock user so the whole game UI is testable without Discord.

import { DiscordSDK } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID;

function isInsideDiscord() {
  const params = new URLSearchParams(window.location.search);
  return params.has('frame_id');
}

// Produce a stable-ish mock identity for local browser testing.
// A `?user=` query param lets you open two tabs as two different users against
// the same instance to exercise spectator/nomination flows.
function mockAuth() {
  const params = new URLSearchParams(window.location.search);
  const suffix = params.get('user') || Math.random().toString(36).slice(2, 7);
  return {
    instanceId: params.get('instance') || 'local-dev-instance',
    user: {
      id: `mock-${suffix}`,
      username: `Guest-${suffix}`,
      avatar: null,
    },
    mock: true,
  };
}

// Full Discord auth: ready -> authorize -> exchange code -> authenticate.
async function discordAuth() {
  const discordSdk = new DiscordSDK(CLIENT_ID);
  await discordSdk.ready();

  const { code } = await discordSdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds'],
  });

  // Exchange the code for an access token via our backend. Surface a precise
  // error so setup problems (bad secret, proxy/routing) are visible on screen.
  const res = await fetch('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Token exchange failed (HTTP ${res.status}): ${raw.slice(0, 300)}`);
  }

  let access_token;
  try {
    ({ access_token } = JSON.parse(raw));
  } catch {
    // Non-JSON almost always means the request hit Discord's proxy / a wrong
    // host instead of our /api/token route (check URL Mappings).
    throw new Error(`/api/token did not return JSON — got: ${raw.slice(0, 200)}`);
  }
  if (!access_token) {
    throw new Error(`No access_token in response: ${raw.slice(0, 200)}`);
  }

  const auth = await discordSdk.commands.authenticate({ access_token });
  if (!auth) throw new Error('discordSdk authenticate() returned null');

  return {
    instanceId: discordSdk.instanceId,
    user: {
      id: auth.user.id,
      username: auth.user.global_name || auth.user.username,
      avatar: auth.user.avatar
        ? `https://cdn.discordapp.com/avatars/${auth.user.id}/${auth.user.avatar}.png`
        : null,
    },
    mock: false,
  };
}

export async function initAuth() {
  if (!isInsideDiscord()) {
    return mockAuth();
  }
  return discordAuth();
}
