#!/bin/bash

# ─────────────────────────────────────────────
#  PoshanPal — One-shot startup script
# ─────────────────────────────────────────────

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "╔══════════════════════════════════╗"
echo "║       PoshanPal Launcher         ║"
echo "╚══════════════════════════════════╝"
echo ""

# ── 1. MongoDB ───────────────────────────────
echo "▶ Checking MongoDB..."
if ! pgrep -x "mongod" > /dev/null; then
  echo "  Starting MongoDB via Homebrew..."
  # Remove stale lock file that can block launchctl bootstrap
  rm -f /opt/homebrew/var/mongodb/mongod.lock 2>/dev/null
  brew services stop mongodb/brew/mongodb-community 2>/dev/null
  sleep 1
  brew services start mongodb/brew/mongodb-community
  sleep 3
  if ! pgrep -x "mongod" > /dev/null; then
    echo "  ⚠ MongoDB failed to start. Check: brew services list"
    exit 1
  fi
fi
echo "  ✓ MongoDB is running."

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
for i in {1..30}; do
  if curl -s http://127.0.0.1:8000/docs -o /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

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
echo "  Press Ctrl+C to stop the backend and frontend."
echo "  (MongoDB will keep running in the background via brew services)"
echo ""

# ── 8. Cleanup on exit ───────────────────────
cleanup() {
  echo ""
  echo "Shutting down backend and frontend..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  echo "Done. MongoDB is still running (brew services stop mongodb/brew/mongodb-community to stop it)."
}
trap cleanup INT TERM

wait
