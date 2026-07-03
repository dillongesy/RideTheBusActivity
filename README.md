# Ride the Bus — Discord Activity

A voice-channel **Discord Activity** (embedded app) for playing *Ride the Bus*, the
card guessing game (inspired by [ridethebus.party](https://ridethebus.party/) /
[marcinlukanus/RideTheBusV2](https://github.com/marcinlukanus/RideTheBusV2)).

One person is the **driver** and plays a 4-stage run while everyone else spectates
live. Complete a full run and you nominate a spectator to take the wheel.

## How the game works

Four cards are dealt face down and flip one at a time as the driver guesses:

1. **Red or Black** — guess the color of card 1.
2. **Higher, Lower or Same** — is card 2 higher, lower, or the same rank as card 1?
3. **Inside, Outside or Same** — is card 3 between the first two, outside them, or equal to one?
4. **Guess the Suit** — name the exact suit of card 4.

A tie is a **win** if you called "Same". Guess wrong at any round → **take a drink**
and **Redraw Cards** to try again (your 🍺 count ticks up). Complete all four →
🎉 you won, and you **nominate** a spectator to take the wheel (or take *Another
Ride?* if you're playing solo).

## Architecture

```
client/   Vite + vanilla JS frontend (Discord Embedded App SDK, game UI)
server/   Express + ws backend (OAuth token exchange + authoritative game state)
```

The backend is authoritative: it owns the deck, stage logic, and turn order, and
broadcasts a full state snapshot to every client over WebSocket. Rooms are keyed by
the Discord Activity `instanceId`, so everyone in the same voice-channel activity
shares one game.

## Prerequisites

- Node.js **18+**
- A Discord account with a server you can test in
- [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) for exposing your local server over HTTPS

## 1. Create the Discord application

1. Go to the [Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. On **OAuth2**, copy the **Client ID** and **Client Secret**.
3. **Activities → Settings**: toggle **Enable Activities**.
4. **Activities → URL Mappings**: add a mapping with prefix `/` → your cloudflared
   tunnel URL (you'll get this in step 4; you can come back and fill it in).
5. Add the app to your test server (Installation → add to a guild, or use the
   generated install link).

## 2. Configure environment

```bash
# server
cd server
cp .env.example .env    # fill DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET
npm install

# client
cd ../client
cp .env.example .env    # fill VITE_DISCORD_CLIENT_ID (same Client ID)
npm install
```

## 3. Run locally

Two terminals:

```bash
# Terminal A — backend on :3001
cd server && npm run dev

# Terminal B — frontend on :5173 (Vite proxies /api and /ws to the backend)
cd client && npm run dev
```

**Quick UI check without Discord:** open <http://localhost:5173> in a browser. The
app detects it's not inside Discord and gives you a mock user, so you can play a full
run, ride the bus, complete a run, and use the nomination picker. Open a second tab
with `?user=bob` (e.g. <http://localhost:5173/?user=bob>) to join the same game as a
second player and test spectating / nomination.

## 4. Run inside Discord

```bash
# Terminal C — expose the frontend over HTTPS
cloudflared tunnel --url http://localhost:5173
```

1. Copy the `https://<random>.trycloudflare.com` URL it prints.
2. Paste it into **Activities → URL Mappings** (prefix `/`) in the Developer Portal.
3. In Discord, join a voice channel → open the **App Launcher** (rocket icon) →
   launch your activity.
4. Have a second account join the same activity — they appear as a spectator and see
   the live game. When the driver completes a run, they pick that spectator to drive next.

> The frontend's Vite dev server proxies `/api` and `/ws` to the backend, so the
> single tunnel to `:5173` covers everything.

## Production build

```bash
cd client && npm run build     # outputs client/dist
cd ../server && npm start       # serves client/dist and the WebSocket API on one port
```

Point your URL Mapping (or your host's public URL) at the server, and set the same
env vars in your hosting provider.

## Card assets

The 52-card PNG deck lives in `client/public/cards/PNG/` (filenames like `10H.png`,
`KD.png`, `ACES.png`). The originals also remain in the repo root `cards/` folder.
