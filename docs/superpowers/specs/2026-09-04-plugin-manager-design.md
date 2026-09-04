# Plugin-Manager

Stand: 2026-09-04 · Status: zur Review · Betrifft: Backend (Registry, Filter, Schema, Routen) + Frontend (Manager, Composer, Kommandos)

## Ziel

Die Werkzeuge, die das Modell benutzt, werden ein- und ausschaltbar -- pro
Konto, gespeichert in der Datenbank, sichtbar und bedienbar in der Oberflaeche.

Und zwar so, dass ein kuenftiges Werkzeug **einen Eintrag im Katalog** kostet
und sonst nichts: kein Anfassen von Routen, Datenbank oder UI.

## Ist-Zustand

- 37 lokale Werkzeuge, zusammengebaut in `create_local_toolbox`
  (`backend/src/services/tools/local/__init__.py`) -- einer imperativen
  Funktion, die nach vorhandenen API-Schluesseln und Env-Flags entscheidet.
- Die Toolbox ist ein prozessweites Singleton (`container.py:411`), im Agenten
  fest verdrahtet.
- Die einzige Steuerung ist `tools: true|false` am Request
  (`container.py:444`): alles oder nur `notify`.
- Werkzeuge tragen keine Metadaten fuer Menschen -- nur `description`, und die
  ist ans Modell gerichtet.
- Die `account`-Tabelle ist einzeilig (`CHECK (id = 1)`): ein Konto je Instanz.

## Entscheidungen

| Frage | Entscheidung |
|---|---|
| Was ist ein Plugin? | Ein **Buendel** zusammengehoeriger Werkzeuge mit Manifest |
| Grundzustand | **Nichts installiert.** Store-Logik; die Datenbank wird ohnehin neu aufgesetzt |
| Sprache der Inhalte | **Englisch** -- Titel, Zusammenfassung, Beschreibung, Kategorien, wie die uebrige Oberflaeche |
| Werkzeuge einzeln abwaehlbar? | Nein. Zwei Zustaende je Plugin waeren viel UI fuer wenig Gewinn |
| API-Schluessel im UI? | Nein. Schluessel gehoeren in die `.env`, nicht hinter ein Web-Login |

## 1. Das Manifest

Neu: `backend/src/services/plugins/`.

```python
@dataclass(frozen=True, slots=True)
class PluginManifest:
    slug: str
    title: str
    category: Category
    summary: str
    description: str
    tools: tuple[str, ...]
    requires: tuple[str, ...]
    icon: str
```

`Category` ist ein `Literal`: `search`, `web`, `media`, `files`, `skills`,
`system`, `security`.

`requires` nennt die Env-Variablen, ohne die das Plugin nicht laufen kann --
**nur zur Anzeige**. Ob es wirklich laeuft, wird nicht hier behauptet, sondern
abgeleitet (siehe "Verfuegbarkeit").

`icon` traegt einen lucide-Namen, damit das Frontend keine Zuordnung raten
muss und ein neues Plugin ohne Frontend-Aenderung ein Symbol bekommt.

Alle Textinhalte sind **englisch**.

## 2. Der Katalog

Eine Liste von Manifesten in `catalog.py`. Der Stand beim Schreiben:

| slug | Titel | Kategorie | Werkzeuge | braucht |
|---|---|---|---|---|
| `web-search` | Web Search | search | web_search, image_search, video_search | BRAVE_API_KEY |
| `answer-engine` | Answer Engine | search | brave_answers | BRAVE_ANSWERS_API_KEY |
| `google-suite` | Google & Marketplaces | search | google_search, social_profile, amazon_search, maps_search, youtube_search, youtube_transcript | SERPAPI_API_KEY |
| `web-reader` | Web Reader | web | fetch_page, batch_fetch, fetch_json, extract_selectors, extract_tables, list_links | -- |
| `image-generation` | Image Generation | media | generate_image | OPENAI_API_KEY, IMAGE_ENABLED |
| `vision` | Image Understanding | media | analyze_image | VISION_ENABLED |
| `speech` | Read Aloud | media | read_aloud | TTS_ENABLED |
| `object-storage` | Object Storage | files | storage_get, storage_put, storage_list, storage_delete | STORAGE_ENABLED |
| `skills` | Skills | skills | skill_list, skill_save, skill_import, skill_delete, use_skill | -- |
| `shell` | Shell Access | system | run_shell | SHELL_ENABLED |
| `system-status` | System & Notifications | system | system_check, notify_user | -- |
| `location` | Location & Weather | system | get_context, get_weather | -- |
| `hackerone` | HackerOne | security | hackerone_programs, hackerone_program, hackerone_reports, hackerone_hacktivity, hackerone_draft_report | HACKERONE_API_TOKEN |

MCP-Server werden **zur Laufzeit** zu Manifesten: je Server eines, Kategorie
`system`, `tools` aus dem, was der Server meldet. Sie stehen nicht in der
Liste, weil sie aus `mcp.json` kommen und sich ohne Codeaenderung aendern.

### Vollstaendigkeit ist pruefbar

Beim Start wird geprueft, ob jedes Werkzeug der gebauten Toolbox in genau
einem Manifest vorkommt. Was fehlt, wird geloggt. Ohne diese Pruefung
verschwindet ein neu hinzugefuegtes Werkzeug stillschweigend aus der
Oberflaeche -- der wahrscheinlichste Fehler beim Erweitern.

## 3. Verfuegbarkeit vs. Installation

Zwei verschiedene Dinge, die nicht vermischt werden duerfen:

- **available** -- kann das Plugin ueberhaupt laufen? Abgeleitet daraus, ob
  seine Werkzeuge in der gebauten Toolbox stehen. Nicht deklariert, sondern
  gemessen: `create_local_toolbox` entscheidet das bereits, und eine zweite
  Quelle wuerde davon abweichen.
- **installed** -- will der Nutzer es? Steht in der Datenbank.

Ein nicht verfuegbares Plugin bleibt im Katalog **sichtbar**, ausgegraut, mit
Nennung dessen, was fehlt. Es zu verstecken hiesse, man erfaehrt nie, dass es
existiert und was es braeuchte. Installieren ist dann abgewiesen (409).

## 4. Persistenz

```sql
CREATE TABLE IF NOT EXISTS plugins (
  slug         TEXT PRIMARY KEY,
  installed_at TEXT NOT NULL
);
```

Eine Zeile heisst installiert; keine Zeile heisst nicht installiert. Kein
`enabled`-Flag: zwei Zustaende ("Zeile da, aber aus") waeren eine Unterscheidung
ohne Nutzen -- dieselbe Ueberlegung wie bei den geteilten Chats.

Die Tabelle haengt am Konto, auch ohne Fremdschluessel: `delete_account` leert
sie mit, in derselben Anweisung, die die Chats abraeumt. **Nicht verschluesselt** --
welche Plugins an sind, ist keine Nutzerdaten, und der Schalter muss auch ohne
Sitzung lesbar sein, wenn spaeter etwas ausserhalb einer Anfrage danach fragt.

## 5. Das Filtern

Eine Huelle um die Toolbox -- dasselbe Muster wie `EncryptedChatStore` um den
Chat-Speicher:

```python
class FilteredToolBox(ToolBox):
    def __init__(self, inner: ToolBox, erlaubt: frozenset[str]) -> None: ...
```

- `specs()` liefert nur erlaubte Werkzeuge -- das Modell **sieht** den Rest gar
  nicht. Das ist die eigentliche Wirkung.
- `invoke()` weist einen nicht erlaubten Namen zusaetzlich ab. Ein Modell kann
  einen Namen auch raten oder aus dem Verlauf wiederholen; die zweite Ebene
  kostet drei Zeilen.

Das Singleton bleibt, wie es ist: HTTP-Client und MCP-Verbindungen werden
weiter genau einmal aufgebaut. Gefiltert wird nur die Sicht darauf.

### Der System-Prompt (beim Bauen dazugekommen)

Das Filtern der Werkzeugliste allein reicht nicht. Der Prompt in
`prompts/default.md` beschreibt Websuche, Seiten abrufen, Shell, Speicher und
Skills in festen Abschnitten -- unabhaengig davon, was geladen ist. Ein Modell
liest diese Prosa und kuendigt eine Suche an, die es gar nicht ausfuehren kann.

Deshalb erzeugt `prompt_block` aus dem tatsaechlichen Zustand einen Abschnitt
"Deine Werkzeuge in diesem Gespräch" und haengt ihn an. Er nennt **beide**
Seiten: was installiert ist mitsamt Werkzeugnamen, und was nicht installiert
ist mitsamt slug. Nur die installierten zu nennen liesse offen, ob der Rest
fehlt oder vergessen wurde; die slugs machen die Antwort an den Nutzer
brauchbar ("nicht installiert -- `/install web-search`").

Der bestehende `WERKZEUGE_AUS`-Block bleibt fuer `tools=false` -- das ist ein
anderer Fall als "nichts installiert".

### Der Agenten-Cache

`agent_for` cacht unter `(runtime, prompt, tools)` und verdrahtet die Toolbox
im Konstruktor (`agent.py:42`). Ohne Aenderung antwortete nach dem Umschalten
weiter der alte Agent mit der alten Werkzeugliste.

Der Cache-Schluessel bekommt deshalb einen **Fingerabdruck der aktiven
Plugin-Menge**. Ein Wechsel erzeugt einen neuen Agenten, ein Zurueckschalten
trifft den alten wieder. Kein Invalidieren von Hand, keine Buchhaltung.

## 6. API

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/v1/plugins` | Katalog mit `available`, `installed`, `missing_requirements` |
| `POST` | `/api/v1/plugins/{slug}` | installieren |
| `DELETE` | `/api/v1/plugins/{slug}` | deinstallieren |

Alle drei hinter der Sitzung. Unbekannter slug -> 404, nicht verfuegbar -> 409
mit der Angabe, was fehlt.

Frontend-Proxys unter `app/api/plugins/` analog zu den bestehenden.

## 7. Oberflaeche

### Der Manager

Eine Komponente, drei Zugaenge -- Dialog nach dem Vorbild von
`workspace-modal.tsx`:

```
┌──────────────────────────────────────────────┐
│  Plugins                        [ Suche… ]   │
├────────────┬─────────────────────────────────┤
│ All     13 │  ┌───────────────────────────┐  │
│ Search   3 │  │ 🔍 Web Search      search │  │
│ Web      1 │  │ Brave-backed web, image…  │  │
│ Media    3 │  │              [ Install ]  │  │
│ Files    1 │  └───────────────────────────┘  │
│ Skills   1 │  ┌───────────────────────────┐  │
│ System   3 │  │ 🛠 Shell Access    system │  │
│ Security 1 │  │ needs SHELL_ENABLED       │  │
│            │  │              (unavailable)│  │
└────────────┴─────────────────────────────────┘
```

Ein Klick auf die Karte klappt die Detailansicht auf: was das Plugin tut,
welche Werkzeuge es mitbringt, was es voraussetzt. Installierte Karten tragen
ein Abzeichen und den Uninstall-Knopf.

### Die drei Zugaenge

1. **Composer** -- Schraubenschluessel-Pille neben der Workspace-Pille
   (`chat-composer.tsx:631`), gleiche Bauform. Zeigt die Anzahl aktiver
   Plugins.
2. **Palette** (⌘K) -- ein Eintrag "Manage plugins".
3. **Seitenleiste** -- neben Einstellungen und Workspaces.

Alle drei feuern dasselbe Kommando; die Verkabelung ist die vorhandene
(`BEFEHL` + `onBefehl`), kein neuer Mechanismus.

## 8. Kommandos

`/install <slug>` und `/deactivate <slug>` im Katalog
(`lib/chat/command-registry.ts`), mit dynamischer Vervollstaendigung aus dem
geladenen Plugin-Katalog -- dasselbe Muster wie die dynamischen Gruppen fuer
Chats und Modelle.

Ein unbekannter slug antwortet mit den naechstliegenden Treffern statt mit
einem stummen Fehlschlag.

## 9. Randfaelle

| Fall | Verhalten |
|---|---|
| Plugin installiert, dann faellt der API-Schluessel weg | Bleibt installiert, wird `unavailable`; seine Werkzeuge fehlen ohnehin in der Toolbox |
| Werkzeug in keinem Manifest | Log-Warnung beim Start; das Werkzeug ist dann fuer niemanden erreichbar |
| MCP-Server verschwindet aus `mcp.json` | Sein Plugin verschwindet aus dem Katalog; die Zeile in der Tabelle bleibt folgenlos stehen |
| Nichts installiert | Das Modell bekommt eine leere Werkzeugliste -- gueltig, es antwortet dann ohne Werkzeuge |
| `tools: false` am Request | Unveraendert: schlaegt alles, auch installierte Plugins |
| Konto geloescht | `plugins` wird mit geleert |

## 10. Testen

Es gibt keine Testinfrastruktur im Projekt. Verifiziert wird wie bei den
bisherigen Aenderungen: `tsc`, eslint, `next build`, `compileall` und ein
Integrationslauf ueber `TestClient` gegen eine temporaere Datenbank --
installieren, Katalog lesen, Werkzeugliste des Agenten vorher/nachher
vergleichen, deinstallieren, Konto loeschen.

Der Lauf muss zeigen: **`specs()` enthaelt nach dem Deinstallieren die
Werkzeuge des Plugins nicht mehr**, und `invoke()` auf einen davon wird
abgewiesen.

## Nicht im Scope

Plugin-Einstellungen je Plugin, Schluesselverwaltung im UI, Nachladen von
Plugins zur Laufzeit, Plugins von Dritten, Nutzungsstatistik, Rechte je Chat.
