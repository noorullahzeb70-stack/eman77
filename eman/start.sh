#!/usr/bin/env bash
# EMAN starter for macOS / Linux: ./start.sh
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then echo "Install Node.js 22+ from https://nodejs.org first."; exit 1; fi
major=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$major" -lt 22 ]; then echo "EMAN needs Node.js 22 or newer (you have $(node -v))."; exit 1; fi
[ -f .env ] || node scripts/setup-env.mjs
[ -d node_modules ] || npm install --no-audit --no-fund
npm run build
echo "EMAN is starting at http://localhost:3000"
( sleep 2; (command -v open >/dev/null && open http://localhost:3000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:3000) || true ) &
npm start
