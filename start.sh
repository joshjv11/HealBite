#!/bin/bash

# ─────────────────────────────────────────────
#  AaharVoice — One-shot startup script
# ─────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "╔══════════════════════════════════╗"
echo "║       AaharVoice Launcher        ║"
echo "╚══════════════════════════════════╝"
echo ""

# ── 1. MongoDB ───────────────────────────────
echo "▶ Checking MongoDB..."
if ! pgrep -x "mongod" > /dev/null; then
  echo "  MongoDB not running. Starting it..."
  mongod --fork --logpath /tmp/mongod.log --dbpath /usr/local/var/mongodb 2>/dev/null \
    || mongod --fork --logpath /tmp/mongod.log 2>/dev/null \
    || { echo "  ⚠ Could not auto-start MongoDB. Please start it manually (mongod) and re-run this script."; exit 1; }
  echo "  ✓ MongoDB started."
else
  echo "  ✓ MongoDB already running."
fi

# ── 2. Backend ───────────────────────────────
echo ""
echo "▶ Starting FastAPI backend..."
cd "$ROOT/backend"
source venv/bin/activate
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# ── 3. Wait for backend to be ready ──────────
echo "  Waiting for backend to be ready..."
for i in {1..20}; do
  if curl -s http://127.0.0.1:8000/api/seed/ -o /dev/null; then
    break
  fi
  sleep 0.5
done

# ── 4. Seed the database ─────────────────────
echo ""
echo "▶ Seeding the database..."
SEED_RESPONSE=$(curl -s -X POST http://127.0.0.1:8000/api/seed/)
echo "  $SEED_RESPONSE"

# ── 5. Frontend ──────────────────────────────
echo ""
echo "▶ Starting React frontend..."
cd "$ROOT/frontend"
npm run dev &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

# ── 6. Open browser ──────────────────────────
echo ""
echo "  Waiting for frontend..."
sleep 3
open http://localhost:5173

# ── 7. Summary ───────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✓ Everything is running!                    ║"
echo "║                                              ║"
echo "║  App   → http://localhost:5173               ║"
echo "║  API   → http://127.0.0.1:8000              ║"
echo "║  Docs  → http://127.0.0.1:8000/docs         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Press Ctrl+C to stop everything."
echo ""

# ── 8. Cleanup on exit ───────────────────────
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  echo "Done."
}
trap cleanup INT TERM

# Keep script alive
wait
