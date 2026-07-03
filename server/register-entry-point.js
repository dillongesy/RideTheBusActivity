// One-time (idempotent) registration of a Primary Entry Point command so the
// Activity can be launched from Discord's App Launcher.
//
// Discord requires this once you enable Activities. handler = 2
// (DISCORD_LAUNCH_ACTIVITY) tells Discord to open the Activity directly instead
// of sending an interaction to your app.
//
// Run once:  DISCORD_BOT_TOKEN=xxxx node register-entry-point.js
// (DISCORD_CLIENT_ID is read from server/.env)

require('dotenv').config();

const APP_ID = process.env.DISCORD_CLIENT_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!APP_ID || !BOT_TOKEN) {
  console.error('Missing DISCORD_CLIENT_ID (server/.env) or DISCORD_BOT_TOKEN (env).');
  process.exit(1);
}

const command = {
  name: 'launch',
  description: 'Launch Ride the Bus',
  type: 4, // PRIMARY_ENTRY_POINT
  handler: 2, // DISCORD_LAUNCH_ACTIVITY — Discord opens the Activity itself
  integration_types: [0, 1], // GUILD_INSTALL, USER_INSTALL
  contexts: [0, 1, 2], // GUILD, BOT_DM, PRIVATE_CHANNEL
};

(async () => {
  // PUT replaces the full global command set with just this entry point command,
  // which is what we want here (no other global commands to preserve).
  const res = await fetch(`https://discord.com/api/v10/applications/${APP_ID}/commands`, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([command]),
  });

  const body = await res.text();
  if (res.ok) {
    console.log('✅ Entry Point command registered. It can take a minute to appear in Discord.');
    console.log(body);
  } else {
    console.error(`❌ Failed (${res.status}):`, body);
    process.exit(1);
  }
})();
