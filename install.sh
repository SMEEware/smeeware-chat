#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="${BACKEND_DIR:-$PROJECT_ROOT/backend}"
FRONTEND_DIR="${FRONTEND_DIR:-$PROJECT_ROOT/frontend}"
ENV_FILE="$BACKEND_DIR/.env"
ENV_EXAMPLE="$BACKEND_DIR/.env.example"
PYTHON_BIN="${PYTHON_BIN:-python3}"
WHISPER_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin"

usage() {
  cat <<'EOF'
Usage: install.sh [--configure | --deps]

  (none)        Set up backend/.env interactively, then install everything
  --configure   Only walk through the keys and switches in backend/.env
  --deps        Only install or update dependencies (start.sh runs this)

Only the DeepSeek API key is required. Every other key is optional; the
features behind a missing key stay switched off and out of the UI.

Environment:
  PYTHON_BIN    Python used to create the venv (default: python3)
EOF
}

STEP_CONFIGURE=1
STEP_DEPS=1
case "${1:-}" in
  "") ;;
  --configure) STEP_DEPS=0 ;;
  --deps) STEP_CONFIGURE=0 ;;
  -h|--help) usage; exit 0 ;;
  *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
esac

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; GREEN=""; YELLOW=""; RED=""; RESET=""
fi

say()  { printf '%s\n' "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
fail() { printf '%sError:%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }
has()  { command -v "$1" >/dev/null 2>&1; }

env_value() {
  local raw
  raw=$(sed -n "s/^$1=//p" "$ENV_FILE" 2>/dev/null | head -1)
  raw=${raw%%#*}
  raw=$(printf '%s' "$raw" | tr -d "\"'")
  raw="${raw#"${raw%%[![:space:]]*}"}"
  raw="${raw%"${raw##*[![:space:]]}"}"
  printf '%s' "$raw"
}

check_prerequisites() {
  has "$PYTHON_BIN" || fail "Python 3.10+ is required ($PYTHON_BIN not found). Install it or set PYTHON_BIN."
  [[ "$STEP_DEPS" == "1" ]] || return 0
  has node || fail "Node.js 20+ is required (https://nodejs.org)."
  has npm || fail "npm is required (it ships with Node.js)."
  local major
  major=$(node -p 'process.versions.node.split(".")[0]')
  [[ "$major" -ge 20 ]] || fail "Node.js 20+ is required, found $(node -v)."
}

ask_yes() {
  local prompt="$1" default="$2" answer hint="[y/N]"
  [[ "$default" == "y" ]] && hint="[Y/n]"
  read -r -p "  $prompt $hint " answer || true
  answer=$(printf '%s' "${answer:-$default}" | tr '[:upper:]' '[:lower:]')
  [[ "$answer" == y* ]]
}

ask_text() {
  local var="$1" prompt="$2" default="$3" answer hint=""
  [[ -n "$default" ]] && hint="${DIM}[$default]${RESET} "
  read -r -p "  $prompt $hint" answer || true
  printf -v "$var" '%s' "${answer:-$default}"
}

ask_key() {
  local var="$1" label="$2" purpose="$3" current answer state
  current=$(env_value "$var")
  state="${DIM}empty${RESET}"
  [[ -n "$current" ]] && state="${GREEN}set${RESET}"
  say "  ${BOLD}$label${RESET} ${DIM}— $purpose${RESET}"
  read -r -s -p "    $var ($state, Enter keeps it): " answer || true
  printf '\n'
  if [[ -n "$answer" ]]; then
    export "SET_$var=$answer"
  fi
}

pending() {
  if printenv "SET_$1" >/dev/null; then printenv "SET_$1"; else env_value "$1"; fi
}

set_value() {
  export "SET_$1=$2"
}

write_env() {
  "$PYTHON_BIN" - "$ENV_FILE" "$ENV_EXAMPLE" <<'PY'
import os
import re
import sys
from pathlib import Path

target, template = Path(sys.argv[1]), Path(sys.argv[2])
LINE = re.compile(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)$")


def unquote(raw):
    raw = raw.strip()
    if len(raw) >= 2 and raw[0] in "\"'" and raw[-1] == raw[0]:
        return raw[1:-1]
    return re.split(r"\s+#", raw, maxsplit=1)[0].strip()


def quote(value):
    if value == "" or re.fullmatch(r"[A-Za-z0-9_./:@,+=\-*]+", value):
        return value
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


values = {}
if target.exists():
    for line in target.read_text().splitlines():
        if match := LINE.match(line):
            values[match.group(1)] = unquote(match.group(2))
for key, value in os.environ.items():
    if key.startswith("SET_"):
        values[key[4:]] = value

out, seen = [], set()
for line in template.read_text().splitlines():
    match = LINE.match(line)
    if match and not line.startswith("#"):
        key = match.group(1)
        seen.add(key)
        out.append(f"{key}={quote(values.get(key, unquote(match.group(2))))}")
    else:
        out.append(line)

extra = [key for key in values if key not in seen]
if extra:
    out += ["", "# --- Advanced (see backend/README.md) ---"]
    out += [f"{key}={quote(values[key])}" for key in extra]

target.write_text("\n".join(out) + "\n")
target.chmod(0o600)
PY
}

configure() {
  [[ -f "$ENV_EXAMPLE" ]] || fail "$ENV_EXAMPLE is missing."
  [[ -t 0 ]] || fail "The setup asks questions; run ./install.sh in a terminal."

  say ""
  say "${BOLD}Smeeware setup${RESET}"
  say "Only the DeepSeek key is required. Press Enter to skip anything optional —"
  say "skipped features simply stay off. Keys are typed hidden and stay in backend/.env."
  say ""

  say "${BOLD}Required${RESET}"
  while :; do
    ask_key DEEPSEEK_API_KEY "DeepSeek" "the chat model (platform.deepseek.com)"
    [[ -n "$(pending DEEPSEEK_API_KEY)" ]] && break
    warn "The DeepSeek key is required — nothing answers without it."
  done
  say ""

  say "${BOLD}Optional keys${RESET}"
  ask_key OPENAI_API_KEY "OpenAI" "GPT models, image generation, voice input"
  ask_key ELEVENLABS_API_KEY "ElevenLabs" "natural read-aloud voices (otherwise a free, English-only voice)"
  ask_key BRAVE_API_KEY "Brave Search" "web and image search"
  ask_key BRAVE_ANSWERS_API_KEY "Brave Answers" "short sourced answers (separate plan)"
  ask_key SERPAPI_API_KEY "SerpApi" "Google Maps, YouTube search and transcripts"
  if ask_yes "Set up HackerOne (bug bounty programs)?" n; then
    local h1_user
    ask_text h1_user "HackerOne username:" "$(env_value HACKERONE_API_USERNAME)"
    set_value HACKERONE_API_USERNAME "$h1_user"
    ask_key HACKERONE_API_TOKEN "HackerOne" "API token"
  fi
  say ""

  say "${BOLD}Features${RESET}"
  if [[ -z "$(pending OPENAI_API_KEY)" ]]; then
    say "  Voice input needs OpenAI — or whisper.cpp running on this machine."
    if ask_yes "Transcribe locally with whisper.cpp? (downloads a 1.6 GB model)" n; then
      set_value TRANSCRIBE_MODEL whisper-local
      has whisper-cli || warn "Install whisper.cpp first: brew install whisper-cpp (or build it from source)."
      has ffmpeg || warn "Install ffmpeg first: brew install ffmpeg / apt install ffmpeg."
    else
      set_value TRANSCRIBE_MODEL gpt-transcribe
    fi
  fi

  say "  The shell tool runs whatever the model writes, with your permissions."
  if ask_yes "Allow shell commands? (only for a local, single-user setup)" n; then
    set_value SHELL_ENABLED true
  else
    set_value SHELL_ENABLED false
  fi

  if has ollama; then
    if ask_yes "Offer a local model through Ollama?" n; then
      local model current_model
      current_model=$(env_value OLLAMA_MODEL)
      ask_text model "Ollama model (must handle tools):" "${current_model:-qwen3:8b}"
      set_value OLLAMA_ENABLED true
      set_value OLLAMA_MODEL "$model"
    else
      set_value OLLAMA_ENABLED false
    fi
  fi

  if has mc; then
    if ask_yes "Connect an S3 bucket through mc?" n; then
      local alias bucket base current_bucket
      say "  ${DIM}Configured aliases: $(mc alias list --json 2>/dev/null | "$PYTHON_BIN" -c 'import sys, json; print(", ".join(json.loads(l).get("alias", "") for l in sys.stdin if l.strip()))' 2>/dev/null || echo "?")${RESET}"
      ask_text alias "mc alias:" "$(env_value STORAGE_ALIAS)"
      current_bucket=$(env_value STORAGE_BUCKET)
      ask_text bucket "Bucket:" "${current_bucket:-llm}"
      ask_text base "Public base URL (e.g. https://storage.example.com):" "$(env_value STORAGE_PUBLIC_BASE)"
      if [[ -n "$alias" && -n "$base" ]]; then
        set_value STORAGE_ENABLED true
        set_value STORAGE_ALIAS "$alias"
        set_value STORAGE_BUCKET "$bucket"
        set_value STORAGE_PUBLIC_BASE "$base"
      else
        warn "Alias and public URL are both needed — storage stays off."
        set_value STORAGE_ENABLED false
      fi
    else
      set_value STORAGE_ENABLED false
    fi
  fi

  local secret
  secret=$(env_value SECRET)
  if [[ -z "$secret" || "$secret" == "0815" ]]; then
    set_value SECRET "$("$PYTHON_BIN" -c 'import secrets; print(secrets.token_urlsafe(32))')"
  fi

  write_env
  say ""
  ok "Saved backend/.env"
  summary
}

summary() {
  say ""
  say "${BOLD}What is switched on${RESET}"
  line() { if [[ -n "$2" ]]; then ok "$1"; else say "  ${DIM}–${RESET} ${DIM}$1${RESET}"; fi; }
  local openai eleven
  openai=$(env_value OPENAI_API_KEY); eleven=$(env_value ELEVENLABS_API_KEY)
  line "Chat with DeepSeek" "$(env_value DEEPSEEK_API_KEY)"
  line "GPT models and image generation" "$openai"
  if [[ "$(env_value TRANSCRIBE_MODEL)" == "whisper-local" ]]; then
    line "Voice input (on this machine)" "yes"
  else
    line "Voice input" "$openai"
  fi
  if [[ -n "$eleven" ]]; then line "Read aloud with ElevenLabs" "yes"; else line "Read aloud (free, English-only voice)" "yes"; fi
  line "Web search" "$(env_value BRAVE_API_KEY)"
  line "Brave Answers" "$(env_value BRAVE_ANSWERS_API_KEY)"
  line "Google Maps & YouTube" "$(env_value SERPAPI_API_KEY)"
  [[ -n "$(env_value HACKERONE_API_USERNAME)" && -n "$(env_value HACKERONE_API_TOKEN)" ]] && line "HackerOne" "yes" || line "HackerOne" ""
  [[ "$(env_value SHELL_ENABLED)" == "true" ]] && line "Shell commands" "yes" || line "Shell commands" ""
  [[ "$(env_value OLLAMA_ENABLED)" == "true" ]] && line "Local model: $(env_value OLLAMA_MODEL)" "yes" || line "Local model (Ollama)" ""
  [[ "$(env_value STORAGE_ENABLED)" == "true" ]] && line "S3 bucket: $(env_value STORAGE_ALIAS)/$(env_value STORAGE_BUCKET)" "yes" || line "S3 bucket" ""
  say ""
  say "  ${DIM}Change anything later with ./install.sh --configure${RESET}"
}

pip_install() {
  local py="$BACKEND_DIR/.venv/bin/python"
  if has uv; then
    uv pip install --quiet --python "$py" "$@"
  elif "$py" -m pip --version >/dev/null 2>&1 || "$py" -m ensurepip --upgrade >/dev/null 2>&1; then
    "$py" -m pip install --quiet --disable-pip-version-check "$@"
  else
    fail "backend/.venv has no pip. Install uv (https://docs.astral.sh/uv/) or delete backend/.venv and run again."
  fi
}

create_venv() {
  if "$PYTHON_BIN" -c 'import sys; sys.exit(sys.version_info < (3, 10))' 2>/dev/null; then
    "$PYTHON_BIN" -m venv "$BACKEND_DIR/.venv" || fail "Could not create a venv with $PYTHON_BIN."
  elif has uv; then
    uv venv --quiet --python 3.12 "$BACKEND_DIR/.venv" || fail "uv could not create a Python 3.12 venv."
  else
    fail "Python 3.10+ is required, found $("$PYTHON_BIN" -V 2>&1). Install a newer Python or set PYTHON_BIN."
  fi
}

ensure_backend() {
  local py="$BACKEND_DIR/.venv/bin/python"
  if [[ ! -x "$py" ]] || ! "$py" -c "import sys" >/dev/null 2>&1; then
    say ">> Creating the Python environment (backend/.venv)"
    rm -rf "$BACKEND_DIR/.venv"
    create_venv
    say ">> Installing backend dependencies"
    pip_install -r "$BACKEND_DIR/requirements.txt"
  elif [[ "$BACKEND_DIR/requirements.txt" -nt "$BACKEND_DIR/.venv/.installed" ]] \
    || ! "$py" -c "import fastapi, uvicorn, edge_tts, yaml, python_multipart" >/dev/null 2>&1; then
    say ">> Updating backend dependencies"
    pip_install -r "$BACKEND_DIR/requirements.txt"
  fi
  touch "$BACKEND_DIR/.venv/.installed"
}

foreign_binaries() {
  [[ "$(uname -s)" == "Darwin" ]] && return 1
  compgen -G "$FRONTEND_DIR/node_modules/*darwin*" >/dev/null 2>&1 && return 0
  compgen -G "$FRONTEND_DIR/node_modules/@*/*darwin*" >/dev/null 2>&1 && return 0
  return 1
}

ensure_frontend() {
  [[ -f "$FRONTEND_DIR/package-lock.json" ]] || fail "frontend/package-lock.json is missing."
  local reason=""
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    reason="Installing frontend dependencies"
  elif foreign_binaries; then
    reason="node_modules came from macOS — reinstalling"
  elif [[ "$FRONTEND_DIR/package-lock.json" -nt "$FRONTEND_DIR/node_modules/.package-lock.json" ]]; then
    reason="Updating frontend dependencies"
  fi
  if [[ -n "$reason" ]]; then
    say ">> $reason (npm ci)"
    rm -rf "$FRONTEND_DIR/node_modules"
    (cd "$FRONTEND_DIR" && npm ci --no-audit --no-fund --loglevel=error)
  fi
}

ensure_whisper_model() {
  [[ "${TRANSCRIBE_MODEL:-$(env_value TRANSCRIBE_MODEL)}" == "whisper-local" ]] || return 0
  local path
  path="${WHISPER_MODEL:-$(env_value WHISPER_MODEL)}"
  path="${path:-data/models/ggml-large-v3-turbo.bin}"
  [[ "$path" = /* ]] || path="$BACKEND_DIR/$path"
  if [[ ! -f "$path" ]]; then
    say ">> Downloading the whisper model (~1.6 GB, one time)"
    mkdir -p "$(dirname "$path")"
    curl -L --fail --progress-bar -o "$path.part" "$WHISPER_URL" \
      || { rm -f "$path.part"; fail "Download failed. Fetch $WHISPER_URL into $path."; }
    mv "$path.part" "$path"
  fi
  has "${WHISPER_BINARY:-whisper-cli}" || warn "whisper-cli not found — install whisper.cpp for local voice input."
  has "${FFMPEG_BINARY:-ffmpeg}" || warn "ffmpeg not found — local voice input needs it."
}

ensure_ollama_model() {
  [[ "${OLLAMA_ENABLED:-$(env_value OLLAMA_ENABLED)}" == "true" ]] || return 0
  local model
  model="${OLLAMA_MODEL:-$(env_value OLLAMA_MODEL)}"
  [[ -n "$model" ]] || return 0
  if ! has ollama; then
    warn "Ollama is not installed (https://ollama.com) — the local model stays hidden."
    return 0
  fi
  if ! ollama list 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx "$model"; then
    say ">> Pulling Ollama model $model"
    ollama pull "$model" || warn "ollama pull $model failed — the local model stays hidden."
  fi
}

check_prerequisites

if [[ "$STEP_CONFIGURE" == "1" ]]; then
  if [[ "${1:-}" == "--configure" || ! -f "$ENV_FILE" ]]; then
    configure
  elif [[ -t 0 ]] && ask_yes "backend/.env exists. Walk through the keys again?" n; then
    configure
  fi
fi

if [[ "$STEP_DEPS" == "1" ]]; then
  [[ -f "$ENV_FILE" ]] || fail "backend/.env is missing — run ./install.sh first."
  ensure_backend
  ensure_frontend
  ensure_whisper_model
  ensure_ollama_model
  if [[ "${1:-}" != "--deps" ]]; then
    say ""
    ok "Ready. Start with ./start.sh and open http://localhost:3000"
  fi
fi
