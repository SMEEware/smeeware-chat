# Deployment

Zwei Wege: **Docker** (empfohlen, ein `git pull` + `up` je Update) und
**bare-metal** (ganz unten, ohne Docker). Beide Male gilt dieselbe Architektur.

## Architektur in drei Sätzen
- **Frontend** (Next.js, Port 3000) ist das öffentliche Gesicht. Der Browser
  spricht nur mit ihm; es reicht serverseitig ans **Backend** weiter
  (`LLM_STREAM_URL`). Das Backend (FastAPI, Port 8000) bleibt **privat**.
- **Nur EIN Backend-Worker.** Sitzungen (Chat-Schlüssel) und der Event-Bus
  (Bild-/Sprach-Streaming) leben im Prozessspeicher. Mehrere Worker → mal der
  eine, mal der andere → 401 und tote Streams. Ein Neustart meldet alle ab.
- Im Docker-Setup laufen beide im **Host-Netz**: die Werkzeuge sind damit nicht
  im Container eingesperrt, sondern arbeiten über den Netz-Stack des Servers.

---

## A. Auf GitHub bringen

Im Projektordner (schon ein Git-Repo, `.env`/`data`/`node_modules`/`.venv`
sind ausgeschlossen):

```bash
git add -A
git commit -m "Docker-Deployment"
# leeres Repo auf GitHub anlegen, dann:
git remote add origin git@github.com:<user>/smeeware-chat.git
git branch -M main
git push -u origin main
```

> **Vor dem Push prüfen, dass keine Geheimnisse dabei sind:**
> `git ls-files | grep -E '(^|/)\.env$'` muss **leer** bleiben. Es ist nur
> `backend/.env.example` im Repo, nie `backend/.env`.

## B. Server vorbereiten (Debian 12)

```bash
# Docker Engine + Compose-Plugin (offizielles Skript)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER    # danach neu einloggen
docker compose version           # muss v2 zeigen
```

## C. Deployen

```bash
git clone git@github.com:<user>/smeeware-chat.git
cd smeeware-chat

# Backend-Konfiguration anlegen und Schlüssel eintragen (siehe Abschnitt F)
cp backend/.env.example backend/.env
nano backend/.env

docker compose up -d --build
```

- Frontend läuft auf **`:3000`**, Backend privat auf **`127.0.0.1:8000`**.
- Logs: `docker compose logs -f` · Status: `docker compose ps`.

## D. Öffentlich stellen (TLS)

Reverse-Proxy **vor das Frontend** (3000). Mit Caddy am kürzesten:

```
deine-domain.de {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy holt das Zertifikat selbst (nginx + certbot geht genauso). SSE braucht
keine Sonderconfig, nur **kein** Antwort-Buffering.

## E. Lokales Modell (Ollama) — optional

Der Endpunkt ist **immer** `http://127.0.0.1:11434/v1` (steht so als Default in
der `.env`). Zwei Wege dahin, freie Wahl:

**1) Ollama auf dem Host** (schon installiert / eigener Dienst):
```bash
# in backend/.env:
OLLAMA_ENABLED=true
OLLAMA_MODEL=qwen3:8b          # ein Modell, das DENKEN + WERKZEUGE kann
docker compose up -d           # kein Profil nötig
```

**2) Ollama als Container** (mitgeliefert, Profil `ollama`):
```bash
docker compose --profile ollama up -d --build
docker compose exec ollama ollama pull qwen3:8b   # Modell einmalig holen
# in backend/.env dann wie oben OLLAMA_ENABLED=true + OLLAMA_MODEL=qwen3:8b
docker compose restart backend
```

Das lokale Modell erscheint im Auswahlfeld nur, wenn **beides** gesetzt ist
**und** Ollama gerade antwortet — sonst wird es sauber weggelassen. GPU
(NVIDIA): den `deploy`-Block in `docker-compose.yml` einkommentieren
(braucht `nvidia-container-toolkit`).

## F. `backend/.env` — das Nötige

- **Modus:** `ENVIRONMENT=production` und `DEBUG=false` für den Server.
- **Pflicht:** `DEEPSEEK_API_KEY`, `SECRET`.
- **Empfohlen:** `OPENAI_API_KEY` (OpenAI-Modelle, Bilder, Transkription),
  `ELEVENLABS_API_KEY` (Vorlesen; ohne ihn greift die Gratis-Stimme).
- **Zugang:** `SHELL_ENABLED=false` lassen (siehe unten). `REQUIRE_API_KEY=true`
  nur, wenn du das **Backend** direkt (ohne Frontend) im Netz erreichbar
  machst — sonst reicht die Frontend-Sitzung.
- **Werkzeuge:** was ohne Schlüssel bleibt, schaltet sich still ab (die
  Endpunkte antworten dann sauber, statt zu raten).

## G. Updates

```bash
git pull
docker compose up -d --build       # ollama-Setup: --profile ollama ergänzen
```

Baut nur, was sich geändert hat. Der Zustand bleibt (nächster Abschnitt).

## H. Persistenz & Backup

Chat-DB und Uploads liegen im Named Volume **`smee_data`** (`/app/data` im
Container) — es überlebt jeden Rebuild. Ollama-Modelle liegen in
`ollama_models`. Sichern/zurückspielen:

```bash
# Backup
docker run --rm -v smee_data:/d -v "$PWD":/b alpine \
  tar czf /b/smee_data.tgz -C /d .
# Restore
docker run --rm -v smee_data:/d -v "$PWD":/b alpine \
  sh -c 'cd /d && tar xzf /b/smee_data.tgz'
```

---

## Werkzeuge & Sicherheit im Container

- **Enthalten:** `mc` (MinIO-Client für die `storage_*`-Werkzeuge) und `uv`
  (liefert `uvx` für den MCP-„time"-Server). Nicht enthalten: `ffmpeg`/whisper
  — transkribiert wird über OpenAI.
- **`system_check`** zeigt im Container die **Host-Werte** (RAM, CPU, Last,
  Uptime — gemeinsamer Kernel) und kennzeichnet das: ein „docker"-Badge im
  Modal und eine Zeile, dass der Hostname die Container-ID ist. Keine
  Fantasiezahlen, nur ehrlich beschriftet.
- **`run_shell` ist nicht sandboxed** — es führt aus, was das Modell schreibt,
  mit den Rechten des Prozesses. Der Container ist die einzige Grenze (und dort
  läuft es als unprivilegierter Benutzer, nicht als root). Auf einer geteilten
  oder öffentlichen Instanz **`SHELL_ENABLED=false`** lassen.

## Plattform

Keine Mac-spezifische Software. Auf Debian meldet `system_check` sauber
„Linux <kernel> · x86_64".

---

## Bare-metal (ohne Docker)

Wenn kein Docker gewünscht ist — zwei Prozesse, ein Reverse-Proxy davor.

```bash
sudo apt update && sudo apt install -y python3 python3-venv python3-pip git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
# optional je nach Werkzeug: `mc` (storage_*), `uv`/uvx (MCP-time)

cd backend && python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # Schlüssel eintragen
ENVIRONMENT=production uvicorn src.app:app --host 127.0.0.1 --port 8000 --workers 1

cd ../frontend && npm ci && npm run build
LLM_STREAM_URL=http://127.0.0.1:8000/api/v1/chat/stream npx next start -p 3000
```

Für Dauerbetrieb je eine `systemd`-Unit (`Restart=always`, `User=` nicht root,
`WorkingDirectory` auf `backend/` bzw. `frontend/`). Persistenz liegt hier in
`backend/data/` — nicht löschen.
