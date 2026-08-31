# Smeeware Backend

FastAPI-Service fuer den Electron-Client. DeepSeek haengt austauschbar hinter
einem Provider-Interface.

## Start

```bash
cd backend
cp .env.example .env      # DEEPSEEK_API_KEY eintragen
.venv/bin/python run.py   # http://127.0.0.1:8000/docs
```

## Schichten

```
run.py                     Entrypoint (uvicorn)
src/app.py                 App-Factory: Lifecycle, CORS, Fehler-Handler, Routen
│
├─ api/                    HTTP -- kennt Services nur ueber Dependencies
│  ├─ deps.py              Request -> ServiceProvider -> Service
│  └─ v1/routes/           health.py, chat.py
│
├─ schemas/                Pydantic-Modelle der API (stabiler Vertrag nach aussen)
│
├─ core/
│  ├─ config.py            Settings, einmal aus der .env gelesen
│  ├─ container.py         ServiceProvider: baut Services, haelt sie, raeumt auf
│  ├─ exceptions.py        Domaenen-Fehler -> HTTP-Status
│  └─ logging.py
│
├─ services/ai/            Fachlogik -- weiss nichts von HTTP
│  ├─ base.py              LLMProvider, Message, Completion, StreamChunk
│  ├─ agent.py             Agent: System-Prompt, Optionen, Verlauf
│  └─ providers/
│     ├─ openai_compatible.py   gesamte SDK-Logik, einmal
│     └─ deepseek.py            nur base_url + Name
│
├─ services/skills/        SkillLibrary: lokale + Bucket-Skills, Frontmatter
└─ services/tools/         Werkzeuge -- eine ToolBox-Schnittstelle fuer alle
   ├─ composite.py         fasst lokale und MCP-Werkzeuge zu einer Sammlung
   ├─ mcp_toolbox.py       Server aus mcp.json
   └─ local/               im Prozess: Kontext, Wetter, Suche, Shell,
                          storage.py (mc/S3) und web/ (Scraper)
```

Die Abhaengigkeiten zeigen immer nach innen: `api` -> `services` -> `core`.
Kein Service importiert FastAPI, keine Route baut sich einen Client.

## Werkzeuge

Der Agent sieht eine flache Liste; woher ein Werkzeug kommt, entscheidet
`CompositeToolBox`. Fehlt eine Voraussetzung (kein API-Schluessel,
`SHELL_ENABLED=false`), faellt das Werkzeug still weg -- das Modell sieht
dann nur, was wirklich geht.

| Werkzeug            | Wofuer                                                    |
| ------------------- | --------------------------------------------------------- |
| `fetch_page`        | Seite als Markdown, `offset` blaettert weiter              |
| `extract_selectors` | CSS-Selektoren, `'a.item @href'` holt ein Attribut         |
| `extract_tables`    | `<table>` als Markdown-Tabelle, einzeln ueber `index`      |
| `list_links`        | Links mit Ankertext, filterbar ueber `pattern` und `scope` |
| `fetch_json`        | APIs -- erst die Struktur, dann die Daten, `path` greift rein |
| `batch_fetch`       | mehrere Seiten parallel, gedrosselt                        |
| `web_search`        | Brave (braucht `BRAVE_API_KEY`)                            |
| `image_search`      | Brave-Bildersuche, liefert direkte Bild-URLs (`BRAVE_API_KEY`) |
| `brave_answers`     | belegte KI-Antwort in einem Aufruf (`BRAVE_ANSWERS_API_KEY`) |
| `google_search`     | SerpAPI (braucht `SERPAPI_API_KEY`)                        |
| `social_profile`    | Instagram-/Facebook-Profil nachschlagen (SerpAPI)          |
| `amazon_search`     | Produkte, Preise, Bewertungen auf Amazon (SerpAPI)         |
| `maps_search`       | Orte ueber Google Maps (SerpAPI)                           |
| `youtube_search`    | Videos auf YouTube, mit Video-ID (SerpAPI)                 |
| `youtube_transcript`| Transkript eines Videos, mit Kapiteln (SerpAPI)            |
| `analyze_image`     | Bild ansehen und eine Frage dazu beantworten (Vision-Modell) |
| `storage_put`       | Datei ablegen -- Text direkt oder von der Platte, gibt die URL zurueck |
| `storage_list`      | was im Speicher liegt, mit Groesse und URL                 |
| `storage_get`       | zurueckholen: Text in den Chat, Binaeres auf die Platte     |
| `storage_delete`    | loeschen, einzeln oder ein Unterordner                     |
| `get_context`       | Ort, Zeitzone, Datum                                       |
| `get_weather`       | Vorhersage                                                 |
| `skill_list` / `use_skill` | Skills auflisten / vollen Text laden                |
| `skill_save` / `skill_import` / `skill_delete` | Skills anlegen, importieren, loeschen |
| `run_shell`         | Shell-Befehl (`SHELL_ENABLED`)                             |

### Die drei Brave-Suchen

`web_search`, `image_search` und `brave_answers` liegen zusammen in
`services/tools/local/search.py`. `image_search` teilt sich den
`BRAVE_API_KEY` mit `web_search`; die direkte Bild-URL (`properties.url`) ist
der Anschluss an `analyze_image` und `storage_put`.

`brave_answers` ueberschneidet sich bewusst mit dem, was der Agent aus
`web_search` + `fetch_page` selbst kann -- es ist im Kern dasselbe (suchen,
lesen, mit Quellen zusammenfassen). Sein einziger Vorteil sind **Tool-Runden**:
eine Faktenfrage kostet einen Aufruf statt drei. Damit es das Modell nicht
verleitet, seine eigene Recherche aufzugeben, grenzt die Werkzeugbeschreibung
es eng ein (nur schnelle Faktenfragen). Es braucht ein eigenes Abo
(`BRAVE_ANSWERS_API_KEY`) und laeuft ueber den Stream, weil die Quellen nur
dort kommen -- als `<citation>`-Marken im Text, die wir zu einer nummerierten
Quellenliste aufloesen. Abschaltbar ueber `BRAVE_ANSWERS_ENABLED=false`.

`social_profile`, `amazon_search`, `maps_search`, `youtube_search` und
`youtube_transcript` sind weitere SerpApi-Engines am selben
`SERPAPI_API_KEY` wie `google_search`. Sie haben je eigene Parameter
(Profilname, Amazon-Domain, GPS-`ll`, Video-ID), teilen aber Endpunkt
und Fehlerbehandlung ueber eine gemeinsame Basisklasse. `maps_search`
faltet einen als Text gegebenen Ort in die Suchanfrage, wenn er nicht
wie Koordinaten aussieht, statt ein ungueltiges `ll` zu bauen;
`social_profile` und `youtube_transcript` schaelen aus einer ganzen URL
das Handle bzw. die Video-ID. `youtube_search` liefert die Video-ID
gleich mit -- der Anschluss an `youtube_transcript`, mit dem der Agent
ein Video liest, statt es anzusehen.

### Skills

Ein Skill ist ein Ordner mit einer `SKILL.md` (YAML-Frontmatter `name`,
`description`, `enabled` + Anleitung) -- das von Anthropic uebernommene Format,
damit fremde Skills 1:1 hineinpassen. `services/skills/library.py` vereint
zwei Ebenen:

```
skills/<name>/SKILL.md              lokal, im Repo, vertrauenswuerdig (git)
smeeware/skills/<name>/SKILL.md     PRIVATER Bucket, modell-gepflegt
```

Einmalig einzurichten (privat lassen -- Skills sind interne Anweisungen):

```bash
mc mb smeeware/skills            # KEIN anonymous set download
```

**Progressive disclosure:** beim Start rendert der Container Name+Beschreibung
aller aktiven Skills in den System-Prompt (billig); den vollen Text laedt das
Modell bei Bedarf ueber `use_skill`. Der Index wird gecacht (TTL) und nach
jedem Schreibvorgang verworfen, damit ein selbst angelegter Skill sofort in
derselben Session nutzbar ist -- ueber `skill_list` auch ohne Neustart.

Drei Sicherungen, weil das Modell hier schreibt:

- **Lokal gewinnt.** Ein Skill mit gleichem Namen im Repo ueberschreibt den aus
  dem Bucket; `skill_save`/`skill_delete` fassen lokale Skills nicht an.
- **Import in Quarantaene.** `skill_import` legt fremde Skills als
  `enabled: false` ab -- sie tauchen erst im Prompt auf, wenn der Nutzer sie
  freigibt (`skill_save` mit `enabled: true`). Ein fremder Skill sind fremde
  Anweisungen im Agenten.
- **Validierung beim Schreiben.** Kein Frontmatter, keine `description`,
  ungueltiger Name oder > 100 KB -> abgelehnt, statt den Index zu vergiften.
  Der Frontmatter-Name ist die Identitaet: ein Import landet unter seinem
  eigenen Namen, nicht unter dem aus der URL geratenen.

Der Zugriff auf den Bucket laeuft ueber denselben `McClient` wie die
Speicher-Werkzeuge -- `mc` nutzt die Alias-Zugangsdaten, also kommt es auch an
den privaten Bucket heran.

### Der Scraper

`services/tools/local/web/` ist ein Paket aus drei Teilen:

```
fetcher.py    ein httpx-Client fuer alle: Cache, Groessenlimit,
              Parallelitaetsgrenze, Mindestabstand pro Host
markdown.py   HTML -> Markdown, plus abgespeckte Readability fuer den
              Hauptinhalt (Absaetze punkten, Klassennamen wie "sidebar"
              ziehen ab, Navigation und Fusszeile fliegen raus)
tools.py      die sechs Werkzeuge -- alle am selben Fetcher
```

Das Modell waehlt die URLs, nicht wir. Deshalb die Grenzen in `ToolSettings`
(`SCRAPE_*` in der `.env`): ein 200-MB-Download darf den Prozess nicht
fuellen, und `batch_fetch` darf keinen fremden Server ueberfahren. Der Cache
sorgt nebenbei dafuer, dass eine Kette wie `list_links` -> `extract_selectors`
auf dieselbe URL die Seite genau einmal holt.

Markdown statt Rohtext, weil Ueberschriften, Listen, Tabellen und Links die
Struktur tragen, die das Modell sonst raten muesste -- bei einem Bruchteil
der Zeichen, die dasselbe HTML kostet. Jede gekappte Ausgabe sagt am Ende,
wie es weitergeht (`offset=...`, `index=...`, `path=...`); ohne diesen Hinweis
haelt das Modell den Ausschnitt fuer die ganze Seite.

### Das Auge

Das Hauptmodell ist blind, das Vision-Modell kennt die Persona und die
Werkzeuge nicht. Statt jede Nachricht vorsorglich durch ein Vision-Modell zu
schicken, ist das Sehen deshalb ein **Werkzeug**: der Agent fragt gezielt
nach, wenn er ein Bild vor sich hat.

```
Agent --analyze_image(url, "welcher Fehler steht da?")--> VisionService
                                                            |
                                        deepseek-v4-flash-vision-exp
                                                            |
Agent <---------------- Antwort in Worten -------------------+
```

Das hat drei Vorteile gegenueber dem Vorschalten: eine gezielte Frage liefert
bessere Antworten als eine Pauschalbeschreibung, es kostet nur, wenn wirklich
jemand hinsehen muss, und Agent, Tool-Runden und SSE bleiben unberuehrt.

`services/ai/vision.py` nimmt jede Quelle entgegen:

| Quelle | Was passiert |
| ------ | ------------ |
| `https://...` oeffentlich | URL wird durchgereicht, die API laedt selbst |
| `http://localhost/...` | von aussen nicht erreichbar -> wir laden und betten ein |
| `data:image/png;base64,...` | durchgereicht |
| `/pfad/bild.png` | gelesen, geprueft, eingebettet |
| rohe Bytes | nur ueber den Endpunkt (Multipart) |

Das Format wird an den **Magic Bytes** erkannt, nicht an der Endung -- die API
macht es genauso, und ein Fehlschlag hier ist verstaendlicher als ein 400 von
dort. SVG und PDF fallen dabei durch; die Fehlermeldung nennt den richtigen
Weg (SVG ist Text -- lesen statt ansehen). Ein Cache ueber
SHA-256(Bild + Frage) verhindert, dass dasselbe Bild in einer Werkzeugkette
mehrfach bezahlt wird.

Derselbe Dienst haengt an `POST /api/v1/vision` (JSON mit Adressen) und
`POST /api/v1/vision/upload` (Multipart mit Dateien) -- den zweiten braucht
ein Frontend, weil rohe Bytes sich nicht als Werkzeugargument durchreichen
lassen.

### Der Speicher

`services/tools/local/storage.py` ruft das `mc`-Binary auf. Die Zugangsdaten
stehen in `~/.mc/config.json` und bleiben dort -- dieser Code kennt nur den
Alias und den Bucket, kein Schluessel wandert durch Konfiguration oder Log.

```
mc-Adresse   smeeware/llm/<key>          (Alias/Bucket aus der .env)
oeffentlich  https://storage.smeeware.com/llm/<key>
```

Einmalig einzurichten:

```bash
mc mb smeeware/llm
mc anonymous set download smeeware/llm   # oeffentlich lesbar
```

Der Bucket ist absichtlich oeffentlich lesbar: nur so kann das Modell ein
erzeugtes Bild als `![...](URL)` in seine Antwort setzen und der Chat es
anzeigen. Daraus folgen zwei Schranken in `storage.py`:

- **Zielpfade** werden auf den Bucket festgenagelt. `..`, ein fremder Bucket
  und eine URL auf einen anderen Bucket werden abgelehnt; eine URL auf den
  eigenen Bucket wird stillschweigend zum Schluessel zurueckgerechnet, weil
  Modelle gern das zurueckgeben, was sie eben bekommen haben.
- **Quellen** auf der Platte laufen gegen eine Sperrliste (`~/.ssh`, `.env`,
  `.pem`, die mc-Konfiguration selbst). Das ist eine Stolperschwelle, kein
  Zaun -- wer den Endpunkt nach aussen gibt, setzt `STORAGE_LOCAL_ROOT` und
  begrenzt Uploads damit auf ein Verzeichnis.

Aufgerufen wird `mc` immer ueber `create_subprocess_exec` mit argv, nie ueber
eine Shell: das Modell bestimmt Dateinamen, und ueber eine Shell waere jedes
Anfuehrungszeichen ein Einfallstor.

Ein neues lokales Werkzeug ist eine Klasse mit `name`, `description`,
`parameters` (JSON-Schema) und `async def run(...)` -- eingetragen in
`local/__init__.py`. Die `LocalToolBox` wirft erfundene Parameter vorher weg,
statt das Modell an einem `TypeError` scheitern zu lassen.

## Neuer LLM-Provider

Alles OpenAI-kompatible (Groq, Together, vLLM, OpenRouter) ist eine Klasse:

```python
class GroqProvider(OpenAICompatibleProvider):
    name = "groq"
    base_url = "https://api.groq.com/openai/v1"
```

In `providers/__init__.py` in `PROVIDERS` eintragen, `LLM_PROVIDER=groq` in die
`.env` -- fertig. Anbieter mit eigenem Protokoll erben stattdessen direkt von
`LLMProvider`.

## API

| Methode | Pfad                   | Zweck                                    |
| ------- | ---------------------- | ---------------------------------------- |
| GET     | `/api/v1/health`       | Liveness, ohne Upstream-Aufruf           |
| GET     | `/api/v1/ready`        | Readiness, pingt den Provider            |
| POST    | `/api/v1/chat`         | Antwort in einem Stueck                  |
| POST    | `/api/v1/chat/stream`  | Antwort als Server-Sent-Events           |
| POST    | `/api/v1/vision`       | Bilder per URL/Pfad ansehen              |
| POST    | `/api/v1/vision/upload`| Bilddateien hochladen und ansehen        |

### Streaming-Vertrag

`deepseek-v4-*` sind Reasoning-Modelle: sie denken erst laut und antworten dann.
In einem gemessenen Lauf kamen **53 Reasoning-Frames vor dem ersten Content-Frame**.
Deshalb traegt jedes Frame einen Typ -- der Client kann waehrenddessen einen
"denkt nach"-Zustand zeigen, statt vor einem leeren Fenster zu haengen.

```
data: {"type": "reasoning", "delta": "..."}    # Gedankengang
data: {"type": "content",   "delta": "..."}    # eigentliche Antwort
data: {"type": "tool_call",   "tool": "web_search", "call_id": "...",
       "arguments": {"query": "..."}}           # Werkzeug wird aufgerufen
data: {"type": "tool_result", "tool": "web_search", "call_id": "...",
       "ok": true, "preview": "5 Treffer...", "length": 812}  # ... ist fertig
event: error
data: {"type": "error", "error": {"code": "...", "message": "..."}}
data: [DONE]
```

Fehler nach dem ersten Byte koennen keinen HTTP-Status mehr setzen -- sie kommen
als `error`-Event. Der Client muss also **beides** behandeln: HTTP-Fehler *und*
`error`-Frames.

### Werkzeug-Marker

Fuer eine "was passiert gerade"-Anzeige tragen zwei Frame-Typen den Fortschritt,
je Aufruf ueber dieselbe `call_id` verknuepft:

- `tool_call` -- das Modell ruft ein Werkzeug auf. `tool` ist der Name,
  `arguments` die geparsten Argumente. Das Frontend zeigt damit
  "🔧 web_search laeuft ...".
- `tool_result` -- der Aufruf ist fertig. `ok` sagt, ob die Werkzeug-Mechanik
  durchlief; `preview` ist eine gekuerzte, einzeilige Vorschau (max. 240
  Zeichen), `length` die volle Zeichenzahl. Der komplette Ergebnistext geht
  bewusst **nicht** ueber den Stream -- ein Scrape sind schnell 12k Zeichen,
  die keine Statuszeile braucht.

`ok: false` bedeutet, dass das Werkzeug an seiner Aufgabe gescheitert ist:
Seite nicht erreichbar, HTTP-Fehler, ungueltige Eingabe, abgelehnter Shell-
Befehl, fehlende Datei, API-Fehler. Werkzeuge signalisieren das ueber
`raise ToolError(...)`; die `ToolBox` markiert das Ergebnis dann als
`is_error`. Ein **leeres, aber gueltiges** Ergebnis ist *kein* Fehler und
kommt mit `ok: true` -- "keine Treffer" bei einer Suche, ein Shell-Befehl mit
Exit-Code != 0 (er lief ja), eine Datei, die zu gross zum Anzeigen ist. Das
Modell deutet solche Ergebnisse selbst.

### Achtung: `max_tokens` bei Reasoning-Modellen

Reasoning-Tokens zaehlen mit. Bei "Hauptstadt von Frankreich" gingen 21 von 23
Completion-Tokens ins Denken -- ein `max_tokens: 5` liefert eine **leere**
Antwort. Setz die Grenze grosszuegig; `usage.reasoning_tokens` weist den Anteil
in jeder Antwort aus.

## Fehlerformat

Einheitlich fuer alle Endpunkte:

```json
{ "error": { "code": "provider_error", "message": "...", "details": {} } }
```

`validation_error` 422 · `unauthorized` 401 · `rate_limited` 429 ·
`provider_error` 502 · `provider_timeout` 504 · `internal_error` 500

## Tests

`ServiceProvider.override()` ersetzt Services durch Fakes -- ein Test der
Chat-Route braucht kein Netzwerk:

```python
with TestClient(create_app()) as client:
    client.app.state.provider.override(agent=Agent(FakeProvider()))
```
