# SMEEware Chat

Frontend (Next.js) und Backend (FastAPI) in einem Ordner, gestartet über ein
einziges Skript.

```
smeeware-chat/
├── frontend/            Next.js-App (Chat + Docs + Landing)
├── backend/             FastAPI-Server, LLM-Werkzeuge, Chat-Ablage, .env
├── start.sh             Starter für beide (lokale Entwicklung)
├── docker-compose.yml   Deployment: Backend + Frontend (+ optional Ollama)
└── DEPLOY.md            Anleitung: GitHub → Server (Docker oder bare-metal)
```

## Starten

```bash
./start.sh          # Entwicklung: next dev  +  Backend mit Reload
./start.sh build    # Produktion:  next build && next start  +  Backend ohne Reload
```

- Frontend läuft auf **http://localhost:3000**
- Backend läuft auf **http://localhost:8000** (das Frontend spricht es
  standardmäßig unter `127.0.0.1:8000` an – keine weitere Konfiguration nötig)

Ein `Strg+C` beendet beide Prozesse zusammen.

## Erster Start

Fehlen die Abhängigkeiten, richtet `start.sh` sie automatisch ein:

- **Frontend** – `npm ci` (aus `frontend/package-lock.json`)
- **Backend** – `uv venv` + `uv pip install -r requirements.txt`
  (fällt auf `python3 -m venv` zurück, falls `uv` fehlt)

Danach starten weitere Aufrufe sofort.

## Konfiguration

Die Schlüssel und Schalter des Backends stehen in [`backend/.env`](backend/.env)
(Vorlage: `backend/.env.example`). Der Dev/Prod-Unterschied kommt allein aus
dem Startmodus – `start.sh build` setzt `ENVIRONMENT=production` und schaltet
damit den Reload ab.

## Deployment (Server)

Für den eigenen Server gibt es ein Docker-Setup: `docker compose up -d --build`
startet Backend und Frontend (Ollama optional per Profil). Bei Updates genügt
`git pull && docker compose up -d --build`. Der ganze Weg – von GitHub bis TLS,
inklusive der bare-metal-Variante – steht in **[DEPLOY.md](DEPLOY.md)**.
