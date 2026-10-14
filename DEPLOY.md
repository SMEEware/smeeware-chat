# Deployment

Two ways: **Docker** (recommended — one `git pull` + `up` per update) and
**bare-metal** (at the bottom, no Docker). The architecture is the same either
way.

## Architecture in three sentences
- **Frontend** (Next.js, port 3000) is the public face. The browser talks only
  to it; it forwards server-side to the **backend** (`LLM_STREAM_URL`). The
  backend (FastAPI, port 8000) stays **private**.
- **Exactly ONE backend worker.** Sessions (chat keys) and the event bus
  (image/voice streaming) live in process memory. Multiple workers → sometimes
  one, sometimes the other → 401s and dead streams. A restart signs everyone out.
- In the Docker setup both run on the **host network**: the tools are not locked
  inside a container but work over the server's network stack.

---

## A. Push to GitHub

In the project folder (`.env`, `data`, `node_modules`, `.venv` are excluded):

```bash
git add -A
git commit -m "Deployment"
# create an empty repo on GitHub, then:
git remote add origin git@github.com:<user>/smeeware-chat.git
git branch -M main
git push -u origin main
```

> **Before pushing, make sure no secrets are included:**
> `git ls-files | grep -E '(^|/)\.env$'` must stay **empty**. Only
> `backend/.env.example` is in the repo, never `backend/.env`.

## B. Prepare the server (Debian 12)

```bash
# Docker Engine + Compose plugin (official script)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER    # log out and back in afterwards
docker compose version           # must show v2
```

## C. Deploy

```bash
git clone git@github.com:<user>/smeeware-chat.git
cd smeeware-chat

# create backend/.env: asks for your keys (needs only python3)
./install.sh --configure

docker compose up -d --build
```

- Frontend runs on **`:3000`**, backend privately on **`127.0.0.1:8000`**.
- Logs: `docker compose logs -f` · Status: `docker compose ps`.

## D. Go public (TLS)

Put a reverse proxy **in front of the frontend** (3000). Shortest with Caddy:

```
your-domain.com {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy fetches the certificate itself (nginx + certbot works the same). SSE needs
no special config, just **no** response buffering.

## E. Local model (Ollama) — optional

The endpoint is **always** `http://localhost:11434/v1` (the built-in default).
Two ways to get there, your choice:

**1) Ollama on the host** (already installed / your own service):
```bash
# in backend/.env:
OLLAMA_ENABLED=true
OLLAMA_MODEL=qwen3:8b          # a model that can REASON + use TOOLS
docker compose up -d           # no profile needed
```

**2) Ollama as a container** (shipped, profile `ollama`):
```bash
docker compose --profile ollama up -d --build
docker compose exec ollama ollama pull qwen3:8b   # pull the model once
# then in backend/.env set OLLAMA_ENABLED=true + OLLAMA_MODEL=qwen3:8b
docker compose restart backend
```

The local model appears in the picker only when **both** are set **and** Ollama
is currently answering — otherwise it is cleanly left out. GPU (NVIDIA):
uncomment the `deploy` block in `docker-compose.yml` (needs
`nvidia-container-toolkit`).

## F. `backend/.env` — the essentials

- **Required:** `DEEPSEEK_API_KEY`. Every other key is optional — see the
  [API key table](README.md#api-keys) for what each one unlocks.
- **Mode:** Docker runs with `ENVIRONMENT=production` on its own; no need to
  set it.
- **`SECRET`:** `install.sh` generates one. Without it, sharing chats stays off.
- **Access:** leave `SHELL_ENABLED=false` (see below). Set `REQUIRE_API_KEY=true`
  only if you expose the **backend** directly (without the frontend) —
  otherwise the frontend session is enough.
- **Storage in Docker:** the container has no `~/.mc`. Pass the alias as an
  environment variable instead, e.g. `MC_HOST_mybucket=https://KEY:SECRET@s3.example.com`
  in `backend/.env`, plus `STORAGE_ENABLED=true`, `STORAGE_ALIAS=mybucket` and
  `STORAGE_PUBLIC_BASE`.

## G. Updates

```bash
git pull
docker compose up -d --build       # ollama setup: add --profile ollama
```

Rebuilds only what changed. State is kept (next section).

## H. Persistence & backup

The chat DB and uploads live in the named volume **`smee_data`** (`/app/data`
in the container) — it survives every rebuild. Ollama models live in
`ollama_models`. Back up / restore:

```bash
# Backup
docker run --rm -v smee_data:/d -v "$PWD":/b alpine \
  tar czf /b/smee_data.tgz -C /d .
# Restore
docker run --rm -v smee_data:/d -v "$PWD":/b alpine \
  sh -c 'cd /d && tar xzf /b/smee_data.tgz'
```

---

## Tools & security in the container

- **Included:** `mc` (MinIO client for the `storage_*` tools) and `uv`
  (provides `uvx` for the MCP "time" server). Not included: `ffmpeg`/whisper —
  transcription goes through OpenAI by default.
- **`system_check`** shows the **host** values in a container (RAM, CPU, load,
  uptime — shared kernel) and labels it as such: a "docker" badge in the modal
  and a line that the hostname is the container id. No invented numbers, just
  honestly labelled.
- **`run_shell` is not sandboxed** — it runs what the model writes, with the
  process's permissions. The container is the only boundary (and there it runs
  as an unprivileged user, not root). On a shared or public instance, leave
  **`SHELL_ENABLED=false`**.
- **`ROOT=false`** blocks `sudo` and `su` in `run_shell`. Setting it to `true`
  removes that guard while shell enablement and the installed Shell plugin are
  still required. It does not restart the backend as root or change container
  permissions: the supplied image keeps running as `app` (UID 10001), and its
  slim runtime does not include `sudo`. OS permissions and password requirements
  still apply; other command guards and file-tool scopes remain in place.

## Platform

No Mac-specific software. On Debian, `system_check` cleanly reports
"Linux <kernel> · x86_64".

---

## Bare-metal (without Docker)

If you don't want Docker — two processes, a reverse proxy in front.

```bash
sudo apt update && sudo apt install -y python3 python3-venv python3-pip git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
# optional per tool: `mc` (storage_*), `uv`/uvx (MCP time)

./install.sh            # keys, venv, npm ci
cd backend && . .venv/bin/activate
ENVIRONMENT=production uvicorn src.app:app --host 127.0.0.1 --port 8000 --workers 1

cd ../frontend && npm run build
LLM_STREAM_URL=http://127.0.0.1:8000/api/v1/chat/stream npx next start -p 3000
```

For continuous operation, one `systemd` unit each (`Restart=always`, a non-root
`User=`, `WorkingDirectory` on `backend/` and `frontend/`). Persistence here
lives in `backend/data/` — do not delete it.
