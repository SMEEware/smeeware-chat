#!/usr/bin/env bash

# Server Shell Script (mit flags wie -dev und -build und so)

set -euo pipefail

BACKEND_DIR="/home/smee/smeeware-chat/backend"
FRONTEND_DIR="/home/smee/smeeware-chat/frontend"
MODE="dev"

usage() {
  cat <<'EOF'
Usage: start.sh [-dev|-build]

  -dev     Backend + "npm run dev"   (Default)
  -build   Backend + "npm run build && npm run start"
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -dev|--dev)     MODE="dev";   shift ;;
    -build|--build) MODE="build"; shift ;;
    -h|--help)      usage; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; usage; exit 1 ;;
  esac
done

BACKEND_PID=""
cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo ">> Stoppe Backend (PID $BACKEND_PID)"
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ---------- Backend ----------
echo ">> Backend: $BACKEND_DIR"
cd "$BACKEND_DIR"

if [[ ! -f .venv/bin/activate ]]; then
  echo "FEHLER: $BACKEND_DIR/.venv nicht gefunden" >&2
  exit 1
fi

# shellcheck source=/dev/null
source .venv/bin/activate

python run.py &
BACKEND_PID=$!
echo ">> Backend läuft (PID $BACKEND_PID)"

# kurz warten und prüfen, ob das Backend nicht sofort gestorben ist
sleep 2
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "FEHLER: Backend ist beim Start abgestürzt" >&2
  BACKEND_PID=""
  exit 1
fi

# ---------- Frontend ----------
echo ">> Frontend: $FRONTEND_DIR (Modus: $MODE)"
cd "$FRONTEND_DIR"

if [[ "$MODE" == "build" ]]; then
  npm run build
  npm run start
else
  npm run dev
fi
