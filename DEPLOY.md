# Deployment (Debian 12)

Kurzüberblick für den eigenen Server. Zwei Prozesse: **Backend** (FastAPI/uvicorn)
und **Frontend** (Next.js). Der Browser spricht nur mit dem Frontend; das
Frontend reicht serverseitig ans Backend weiter (`LLM_STREAM_URL`). Das Backend
muss also nicht öffentlich sein.

## 0. Wichtig zur Architektur
- **Nur EIN uvicorn-Worker.** Sitzungen (Datenschlüssel der Chats) und der
  Ereignis-Bus (Bild-/Sprach-Streaming) leben im Prozessspeicher. Mit
  `--workers >1` bekämen Anfragen mal den einen, mal den anderen Prozess →
  401 und fehlende Live-Updates. Skaliert wird hier nicht.
- Ein Backend-Neustart meldet alle ab (der Schlüssel liegt nur im RAM). Das ist
  Absicht.

## 1. Pakete
```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip git
# Node 20 (Debian-apt ist zu alt für Next 16):
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```
Optional, je nach genutzten Werkzeugen:
- **MCP-„time“-Server:** braucht `uvx` → `curl -LsSf https://astral.sh/uv/install.sh | sh`
  (oder `MCP_ENABLED=false`).
- **Eigener Speicher (`storage_*`, Bild-Galerie):** MinIO-Client `mc`
  (oder `STORAGE_ENABLED=false`).
- **Lokales Whisper:** `ffmpeg` + whisper.cpp (nicht nötig, solange
  `TRANSCRIBE_MODEL` ein OpenAI-Modell ist).

## 2. Backend
```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env         # dann Schlüssel eintragen (siehe unten)
```
Start (Produktion, EIN Worker):
```bash
. .venv/bin/activate
ENVIRONMENT=production uvicorn src.app:app --host 127.0.0.1 --port 8000 --workers 1
```

## 3. Frontend
```bash
cd frontend
npm ci
npm run build
LLM_STREAM_URL=http://127.0.0.1:8000/api/v1/chat/stream \
  npx next start -p 3000
```
Läuft Backend auf `127.0.0.1:8000`, genügt diese eine Env-Variable; alle
weiteren Endpunkte leitet das Frontend daraus ab.

## 4. Öffentlich stellen (TLS)
Reverse-Proxy vor das **Frontend** (Port 3000). Mit Caddy am einfachsten:
```
deine-domain.de {
    reverse_proxy 127.0.0.1:3000
}
```
Caddy holt das Zertifikat selbst. (nginx + certbot geht genauso.) SSE braucht
keine Sonderconfig, nur kein Antwort-Buffering.

## 5. Dauerbetrieb (systemd)
Je eine Unit für Backend und Frontend (`Restart=always`, `WorkingDirectory` auf
`backend/` bzw. `frontend/`, `User=` nicht root). Nach Reboot laufen beide wieder.

## 6. `.env` — was gesetzt sein muss
- **Pflicht:** `DEEPSEEK_API_KEY`, `SECRET`.
- **Empfohlen:** `OPENAI_API_KEY` (OpenAI-Modelle, Bilder, Transkription),
  `ELEVENLABS_API_KEY` (Vorlesen; ohne ihn greift die gratis Stimme).
- **Zugang:** `SHELL_ENABLED=false` (gesetzt). `REQUIRE_API_KEY=true` nur, wenn
  du das **Backend** direkt (ohne Frontend) im Netz erreichbar machst.
- `.env` ist per `.gitignore` ausgeschlossen — Schlüssel landen nie im Repo.

## 7. Persistenz
`backend/data/` (verschlüsselte `chats.db`, Uploads) muss schreibbar bleiben und
darf beim Deployment nicht gelöscht werden — dort liegt der ganze Zustand.

## Plattform
Läuft ohne Mac-spezifische Software. Der `system_check` nutzt `psutil` und meldet
auf Debian sauber „Linux <kernel> · x86_64"; das Modal ist plattformneutral.
