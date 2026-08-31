#!/usr/bin/env bash
#
# SMEEware Chat -- startet Frontend und Backend zusammen.
#
#   ./start.sh          Entwicklung  (Frontend: next dev, Backend: mit Reload)
#   ./start.sh build    Produktion   (Frontend: next build && next start,
#                                     Backend: ohne Reload)
#
# Beide laufen nebeneinander; ein Strg+C beendet beide. Beim ersten Start
# werden fehlende Abhaengigkeiten eingerichtet (npm ci bzw. uv venv).
#
set -euo pipefail

# Wurzel = Ordner dieses Skripts, egal von wo aufgerufen.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$ROOT/frontend"
BACKEND="$ROOT/backend"

MODE="dev"
if [ "${1:-}" = "build" ]; then
  MODE="build"
elif [ -n "${1:-}" ]; then
  echo "Unbekanntes Argument: $1"
  echo "Aufruf:  ./start.sh [build]"
  exit 2
fi

blau() { printf '\033[1;34m▸ %s\033[0m\n' "$1"; }

# --- Abhaengigkeiten sicherstellen (nur beim ersten Mal) --------------------

ensure_frontend() {
  if [ -d "$FRONTEND/node_modules" ]; then return; fi
  blau "Frontend: installiere Pakete (npm ci) …"
  ( cd "$FRONTEND" && npm ci )
}

ensure_backend() {
  if [ -d "$BACKEND/.venv" ]; then return; fi
  blau "Backend: lege virtuelle Umgebung an …"
  cd "$BACKEND"
  if command -v uv >/dev/null 2>&1; then
    uv venv
    uv pip install -r requirements.txt
  else
    python3 -m venv .venv
    ./.venv/bin/python -m pip install --upgrade pip
    ./.venv/bin/python -m pip install -r requirements.txt
  fi
  cd "$ROOT"
}

# --- Prozessverwaltung: beide zusammen starten und zusammen beenden ---------

PID_BACKEND=""
PID_FRONTEND=""

cleanup() {
  trap - INT TERM EXIT
  echo
  blau "beende …"
  [ -n "$PID_FRONTEND" ] && kill "$PID_FRONTEND" 2>/dev/null || true
  [ -n "$PID_BACKEND" ] && kill "$PID_BACKEND" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

# ENVIRONMENT wird der .env vorgezogen (python-dotenv ueberschreibt nichts,
# was schon in der Umgebung steht): so schaltet build den Reload sicher ab.
start_backend() {
  local env="$1"
  ( cd "$BACKEND" && ENVIRONMENT="$env" exec ./.venv/bin/python run.py ) &
  PID_BACKEND=$!
}

ensure_frontend
ensure_backend

if [ "$MODE" = "build" ]; then
  blau "Frontend: Produktions-Build …"
  ( cd "$FRONTEND" && npm run build )

  blau "starte Produktion  (Frontend :3000  ·  Backend :8000)"
  start_backend production
  ( cd "$FRONTEND" && exec npm run start ) &
  PID_FRONTEND=$!
else
  blau "starte Entwicklung  (Frontend :3000  ·  Backend :8000, mit Reload)"
  start_backend development
  ( cd "$FRONTEND" && exec npm run dev ) &
  PID_FRONTEND=$!
fi

# Laeuft, bis einer der beiden endet -- danach raeumt der EXIT-Trap den
# jeweils anderen ab. (kein `wait -n`, damit es auch mit Bash 3.2 laeuft.)
while kill -0 "$PID_BACKEND" 2>/dev/null && kill -0 "$PID_FRONTEND" 2>/dev/null; do
  sleep 1
done
