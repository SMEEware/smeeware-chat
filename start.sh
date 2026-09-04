#!/usr/bin/env bash

# Server Shell Script (mit flags wie -dev und -build und so)

set -euo pipefail

BACKEND_DIR="/home/smee/smeeware-chat/backend"
FRONTEND_DIR="/home/smee/smeeware-chat/frontend"
MODE="dev"

# Liest das Frontend zur Laufzeit (lib/chat/backend.ts). Von aussen ueberschreibbar:
#   LLM_STREAM_URL=http://... ./start.sh -build
export LLM_STREAM_URL="${LLM_STREAM_URL:-http://127.0.0.1:8000/api/v1/chat/stream}"

# Setzt "npm ci" aus, wenn du die Abhaengigkeiten selbst verwaltest.
SKIP_DEPS="${SKIP_DEPS:-0}"

usage() {
  cat <<'EOF'
Usage: start.sh [-dev|-build]

  -dev     Backend + "next dev"                 (Default)
  -build   Backend + "next build && next start"

Fuer den Server immer -dev NICHT benutzen: der Dev-Server liefert seine
Chunks nur an localhost aus und antwortet hinter einer Domain mit 403.

Env:
  LLM_STREAM_URL   Default: http://127.0.0.1:8000/api/v1/chat/stream
  SKIP_DEPS=1      "npm ci" ueberspringen
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

# ---------- Preflight --------------------------------------------------------
# Alles pruefen, bevor irgendein Prozess laeuft. Ein Abbruch mitten im Start
# laesst sonst ein Backend ohne Frontend zurueck.

for verzeichnis in "$BACKEND_DIR" "$FRONTEND_DIR"; do
  if [[ ! -d "$verzeichnis" ]]; then
    echo "FEHLER: $verzeichnis existiert nicht" >&2
    exit 1
  fi
done

# --- Backend: venv ---
if [[ ! -f "$BACKEND_DIR/.venv/bin/activate" ]]; then
  echo "FEHLER: $BACKEND_DIR/.venv nicht gefunden" >&2
  echo "        python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

# Ein vom Entwicklungsrechner kopiertes .venv sieht vollstaendig aus, laesst
# sich aber nicht starten: die Pfade darin zeigen woanders hin und die
# kompilierten Module sind fuer die falsche Plattform gebaut.
if ! "$BACKEND_DIR/.venv/bin/python" -c "import sys" >/dev/null 2>&1; then
  echo "FEHLER: $BACKEND_DIR/.venv laesst sich nicht ausfuehren." >&2
  echo "        Vermutlich von einem anderen Rechner kopiert -- neu anlegen:" >&2
  echo "        rm -rf .venv && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

# --- Frontend: node_modules ---

# Native Pakete tragen die Plattform im Namen (@next/swc-darwin-arm64,
# lightningcss-darwin-x64 ...). Liegen macOS-Pakete in einem Baum, der hier
# auf Linux laufen soll, stammt node_modules aus einem rsync und ist Schrott.
fremde_binaries() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    return 1
  fi
  compgen -G "node_modules/*darwin*"   >/dev/null 2>&1 && return 0
  compgen -G "node_modules/@*/*darwin*" >/dev/null 2>&1 && return 0
  return 1
}

abhaengigkeiten_pruefen() {
  cd "$FRONTEND_DIR"

  if [[ ! -f package-lock.json ]]; then
    echo "FEHLER: $FRONTEND_DIR/package-lock.json fehlt -- 'npm ci' braucht das Lockfile" >&2
    exit 1
  fi

  if [[ "$SKIP_DEPS" == "1" ]]; then
    echo ">> SKIP_DEPS=1 -- ueberspringe die Pruefung der Abhaengigkeiten"
    return
  fi

  local grund=""
  if [[ ! -d node_modules ]]; then
    grund="node_modules fehlt"
  elif fremde_binaries; then
    grund="node_modules stammt von macOS"
  # npm legt diese Datei bei jeder Installation an. Ist sie aelter als das
  # Lockfile, wurde seither eine Abhaengigkeit geaendert.
  elif [[ package-lock.json -nt node_modules/.package-lock.json ]]; then
    grund="package-lock.json ist neuer als die Installation"
  fi

  if [[ -n "$grund" ]]; then
    echo ">> $grund -- installiere neu (npm ci)"
    # ci braucht die devDependencies: ohne sie laeuft "next build" nicht.
    rm -rf node_modules
    npm ci
  fi
}

abhaengigkeiten_pruefen

if [[ "$MODE" == "dev" ]]; then
  echo ">> WARNUNG: Dev-Modus. Erreichbar nur ueber localhost:3000 --"
  echo ">>          hinter einer Domain blockt der Dev-Server seine eigenen"
  echo ">>          Chunks mit 403. Fuer den Server: ./start.sh -build"
fi

# ---------- Backend ----------------------------------------------------------
BACKEND_PID=""
cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo ">> Stoppe Backend (PID $BACKEND_PID)"
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo ">> Backend: $BACKEND_DIR"
cd "$BACKEND_DIR"

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

# ---------- Frontend ---------------------------------------------------------
echo ">> Frontend: $FRONTEND_DIR (Modus: $MODE)"
echo ">> LLM_STREAM_URL=$LLM_STREAM_URL"
cd "$FRONTEND_DIR"

if [[ "$MODE" == "build" ]]; then
  npx next build
  npx next start
else
  npx next dev
fi
