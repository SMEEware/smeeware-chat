#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -d "$SCRIPT_DIR/backend" && -d "$SCRIPT_DIR/frontend" ]]; then
  ROOT="$SCRIPT_DIR"
elif [[ -n "${SMEEWARE_ROOT:-}" ]]; then
  ROOT="$SMEEWARE_ROOT"
else
  echo "ERROR: no backend/ and frontend/ next to this script. Set SMEEWARE_ROOT to the project folder." >&2
  exit 1
fi

BACKEND_DIR="${BACKEND_DIR:-$ROOT/backend}"
FRONTEND_DIR="${FRONTEND_DIR:-$ROOT/frontend}"
MODE="dev"

export LLM_STREAM_URL="${LLM_STREAM_URL:-http://127.0.0.1:8000/api/v1/chat/stream}"

SKIP_DEPS="${SKIP_DEPS:-0}"

SHELL_TOOL=0
OLLAMA=0
OLLAMA_MODEL_ARG=""

usage() {
  cat <<'EOF'
Usage: start.sh [-dev|-build] [-shell] [-ollama [MODEL]]

  -dev     Backend + "next dev"                    (default)
  -build   Backend + "next build && next start"    (use this on a server)
  -shell   SHELL_ENABLED=true for this run: the model may run shell commands.
  -ollama [MODEL]
           OLLAMA_ENABLED=true for this run. A model name after it also sets
           OLLAMA_MODEL, e.g. ./start.sh -build -ollama qwen3:8b
           Without one, OLLAMA_MODEL from backend/.env is used. If that is
           empty too, the start is aborted.

Flags can be combined, e.g. ./start.sh -build -shell

Do not use -dev behind a domain: the Next.js dev server only serves its
assets to localhost and answers everything else with 403.

The script finds backend/ and frontend/ next to itself. If you run a copy
from somewhere else, set SMEEWARE_ROOT to the project folder.

Without backend/.env the script starts ./install.sh first, which asks for
your keys. Every start then checks the dependencies (Python venv, npm,
whisper model for whisper-local, Ollama model) and installs what is missing.

Environment:
  LLM_STREAM_URL   Default: http://127.0.0.1:8000/api/v1/chat/stream
  SKIP_DEPS=1      Skip the dependency check
  PYTHON_BIN       Python used to create the venv (default: python3)
  SMEEWARE_ROOT    Project folder, when the script is not inside it
  BACKEND_DIR      Override the backend folder
  FRONTEND_DIR     Override the frontend folder
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -dev|--dev)     MODE="dev";   shift ;;
    -build|--build) MODE="build"; shift ;;
    -shell|--shell) SHELL_TOOL=1;  shift ;;
    -ollama|--ollama)
      OLLAMA=1
      shift
      if [[ $# -gt 0 && "$1" != -* ]]; then
        OLLAMA_MODEL_ARG="$1"
        shift
      fi
      ;;
    -h|--help)      usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

for dir in "$BACKEND_DIR" "$FRONTEND_DIR"; do
  if [[ ! -d "$dir" ]]; then
    echo "ERROR: $dir does not exist" >&2
    exit 1
  fi
done

env_value() {
  local raw
  raw=$(sed -n "s/^$1=//p" "$BACKEND_DIR/.env" 2>/dev/null | head -1)
  raw=${raw%%#*}
  raw=$(printf '%s' "$raw" | tr -d "\"'")
  raw="${raw#"${raw%%[![:space:]]*}"}"
  raw="${raw%"${raw##*[![:space:]]}"}"
  printf '%s' "$raw"
}

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  if [[ -t 0 ]]; then
    echo ">> First start -- running the setup"
    BACKEND_DIR="$BACKEND_DIR" FRONTEND_DIR="$FRONTEND_DIR" "$ROOT/install.sh"
  else
    echo "ERROR: $BACKEND_DIR/.env is missing. Run ./install.sh first." >&2
    exit 1
  fi
elif [[ "$SKIP_DEPS" != "1" ]]; then
  BACKEND_DIR="$BACKEND_DIR" FRONTEND_DIR="$FRONTEND_DIR" "$ROOT/install.sh" --deps
fi

if [[ -z "${DEEPSEEK_API_KEY:-$(env_value DEEPSEEK_API_KEY)}" ]]; then
  echo "ERROR: DEEPSEEK_API_KEY is empty -- run ./install.sh --configure" >&2
  exit 1
fi

if [[ "$MODE" == "build" ]]; then
  export ENVIRONMENT="${ENVIRONMENT:-production}"
else
  export ENVIRONMENT="${ENVIRONMENT:-development}"
fi

if [[ "$MODE" == "dev" ]]; then
  echo ">> WARNING: dev mode. Only reachable via localhost:3000 --"
  echo ">>          behind a domain the dev server blocks its own assets"
  echo ">>          with 403. On a server use: ./start.sh -build"
fi

BACKEND_PID=""
cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo ">> Stopping backend (PID $BACKEND_PID)"
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ "$SHELL_TOOL" == "1" ]]; then
  export SHELL_ENABLED=true
  echo ">> SHELL_ENABLED=true -- run_shell is active (it runs with the"
  echo ">>   backend's permissions; every signed-in user can reach it)"
fi

if [[ "$OLLAMA" == "1" ]]; then
  export OLLAMA_ENABLED=true
  if [[ -n "$OLLAMA_MODEL_ARG" ]]; then
    export OLLAMA_MODEL="$OLLAMA_MODEL_ARG"
  fi

  effective_model="${OLLAMA_MODEL:-$(env_value OLLAMA_MODEL)}"
  if [[ -z "$effective_model" ]]; then
    echo "ERROR: -ollama without a model." >&2
    echo "       OLLAMA_ENABLED=true alone shows nothing -- the backend" >&2
    echo "       also needs OLLAMA_MODEL." >&2
    echo "       Either:  ./start.sh -ollama qwen3:8b" >&2
    echo "       or set OLLAMA_MODEL in $BACKEND_DIR/.env." >&2
    if command -v ollama >/dev/null 2>&1; then
      echo "       Available locally:" >&2
      ollama list 2>/dev/null | tail -n +2 | awk '{print "         " $1}' >&2
    fi
    exit 1
  fi

  if command -v ollama >/dev/null 2>&1; then
    if ! ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx "$effective_model"; then
      echo ">> Pulling Ollama model: $effective_model"
      ollama pull "$effective_model" || {
        echo "ERROR: 'ollama pull $effective_model' failed." >&2
        exit 1
      }
    fi
  else
    echo "WARNING: 'ollama' command not found -- install it from https://ollama.com" >&2
    echo "         The local model will stay hidden until Ollama is running." >&2
  fi

  echo ">> OLLAMA_ENABLED=true, model: $effective_model"
fi

echo ">> Project: $ROOT"
echo ">> Backend: $BACKEND_DIR"
cd "$BACKEND_DIR"

source .venv/bin/activate

python run.py &
BACKEND_PID=$!
echo ">> Backend running (PID $BACKEND_PID)"

sleep 2
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "ERROR: the backend crashed on startup" >&2
  BACKEND_PID=""
  exit 1
fi

echo ">> Frontend: $FRONTEND_DIR (mode: $MODE)"
echo ">> LLM_STREAM_URL=$LLM_STREAM_URL"
cd "$FRONTEND_DIR"

if [[ "$MODE" == "build" ]]; then
  npx next build
  npx next start
else
  npx next dev
fi
