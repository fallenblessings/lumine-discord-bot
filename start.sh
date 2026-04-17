#!/usr/bin/env bash
set -euo pipefail

cd /home/lumine/discord

while true; do
  echo "[$(date -u)] starting discord..."
  npm run start || true
  echo "[$(date -u)] discord crashed, retrying in 1s..."
  sleep 1
done
