#!/usr/bin/env bash
# Auto-deploy for the Ride the Bus Activity on the Web VM.
# Install as /opt/deploy-ridethebus.sh; triggered by the deploy-ridethebus webhook.
set -euo pipefail

REPO=/var/www/ridethebus
LOG=/var/log/deploy-ridethebus.log
export PM2_HOME=/opt/pm2

exec >>"$LOG" 2>&1

# Drop overlapping pushes instead of running two deploys at once.
exec 9>/tmp/deploy-ridethebus.lock
flock -n 9 || { echo "$(date -Is) deploy already running, skipping"; exit 0; }

echo "=== $(date -Is) deploy start ==="
cd "$REPO"

# reset --hard keeps the gitignored client/.env and server/.env in place.
git fetch --quiet origin main
git reset --hard origin/main
echo "at $(git rev-parse --short HEAD): $(git log -1 --pretty=%s)"

# Client needs its devDependencies (vite) to build.
cd "$REPO/client"
npm ci --include=dev --no-audit --no-fund
npm run build

cd "$REPO/server"
npm ci --omit=dev --no-audit --no-fund

cd "$REPO"
# Game state is in memory, so this restart ends any games in progress.
pm2 startOrReload ecosystem.config.js --update-env
pm2 save

echo "=== $(date -Is) deploy done ==="
