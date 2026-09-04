# Oeffentliche Chats

Stand: 2026-09-04 · Status: zur Review · Betrifft: Backend (Schema, Krypto, Routen) + Frontend

## Ziel

Einen Chat ueber "Share chat" oeffentlich lesbar machen. Wer die URL
`/chat/<uuid>` aufruft, bekommt:

- **angemeldet** -> den Verlauf wie bisher, voll bearbeitbar
- **nicht angemeldet, Chat geteilt** -> eine reine Lese-Ansicht
- **nicht angemeldet, Chat nicht geteilt** -> wie heute (kein Zugriff)

## Der harte Constraint: die Verschluesselung

Chats liegen verschluesselt. `backend/src/core/container.py:329` verdrahtet den
Speicher als `EncryptedChatStore(speicher, sitzung.dek)`, und der Datenschluessel
wird laut `backend/src/services/account/store.py:135-155` beim Anmelden aus dem
Passwort ausgepackt. Er existiert ausschliesslich im Speicher einer angemeldeten
Sitzung.

**Folge:** Eine Spalte `public_visible` auf der bestehenden Zeile bewirkt
nichts. Ohne Sitzung hat das Backend keinen Schluessel und kann Titel wie
Nachrichten nicht lesen -- es gaebe nichts zu rendern. Oeffentliches Teilen
braucht zwingend eine **zweite Kopie**, die im Moment des Teilens entsteht.
Da ist die Person angemeldet und der Schluessel da.

## Architektur

Eine Tabelle `public_chats` neben `chats`. Beim Teilen wird der Verlauf mit dem
Sitzungsschluessel gelesen und mit einem **App-Schluessel** wieder verschluesselt
abgelegt. Der private Pfad bleibt vollstaendig unberuehrt.

**Die Existenz der Zeile ist die Flagge.** Kein separates `public_visible`.
Zwei Wahrheiten -- ein Flag hier, eine Kopie dort -- laufen auseinander, sobald
ein Schreibvorgang scheitert; dann steht "oeffentlich" an einem Chat, der nicht
abrufbar ist, oder umgekehrt. Nach aussen sieht die API dennoch aus wie
gewuenscht: `ChatSummary` bekommt ein berechnetes `public: bool`.

### Datenmodell

Nach dem Vorbild von `backend/src/services/chats/sqlite.py`:

```sql
CREATE TABLE IF NOT EXISTS public_chats (
  id            TEXT PRIMARY KEY,   -- dieselbe id wie in chats
  title         TEXT NOT NULL,      -- enc:v1: mit App-Schluessel
  model         TEXT,
  messages      TEXT NOT NULL,      -- enc:v1: JSON-Array, ohne versteckte
  message_count INTEGER NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
```

Keine Fremdschluessel-Beziehung zu `chats`: die Kopie soll das Loeschen des
Originals ueberleben koennen, ohne dass eine Constraint das entscheidet. Das
Aufraeumen macht die Route ausdruecklich (siehe Randfaelle).

### Der App-Schluessel

Neu in `backend/src/services/account/crypto.py`:

```python
def app_schluessel(secret: str) -> bytes:
    """32 Byte aus SECRET -- fuer Daten, die ohne Sitzung lesbar sein muessen."""
```

Abgeleitet mit dem vorhandenen `_scrypt` und einem **festen** Salz. Ein festes
Salz ist hier vertretbar und anderswo nicht: SECRET ist hochentropische
Konfiguration, kein Nutzerpasswort, und es gibt genau einen App-Schluessel --
ein Zufallssalz muesste selbst wieder irgendwo liegen und brauechte eine
Migration, ohne etwas zu gewinnen.

Verschluesselt wird mit `feld_ein`/`feld_aus`, also demselben `enc:v1:`-Praefix
wie ueberall sonst.

> **Vor dem Ausrollen zwingend:** `backend/src/core/config.py:416` liest
> `SECRET` mit dem Default `"0815"`. Laeuft die Instanz damit, ist der
> App-Schluessel aus einem oeffentlich bekannten Wert abgeleitet und die
> Verschluesselung der geteilten Chats wertlos. **Das Teilen muss sich
> weigern**, solange SECRET auf dem Default steht -- mit einer klaren Meldung
> statt einer stillen Schwaeche.

### Der Live-Spiegel

Ist ein Chat geteilt, zieht jedes `upsert` die oeffentliche Kopie nach. Der Ort
dafuer ist die Route, nicht der Store: `EncryptedChatStore` kennt nur seinen
eigenen Schluessel, und ihm einen zweiten mitzugeben wuerde seine Aufgabe
verwaessern.

**Versteckte Nachrichten (`hidden: true`, siehe Spec "Zitieren & Verstecken")
werden nicht mitgespiegelt.** Was in der eigenen Ansicht verschwunden ist, darf
oeffentlich nicht auftauchen. Die Filterung passiert beim Schreiben der Kopie,
nicht beim Lesen -- versteckte Inhalte sollen gar nicht erst in der oeffentlich
lesbaren Tabelle liegen.

## API

| Methode | Pfad | Auth | Zweck |
|---|---|---|---|
| `POST` | `/api/v1/chats/{id}/share` | ja | teilen, Kopie anlegen |
| `DELETE` | `/api/v1/chats/{id}/share` | ja | zurueckziehen, Kopie loeschen |
| `GET` | `/api/v1/public/chats/{id}` | **nein** | Verlauf oeffentlich lesen |

Der oeffentliche GET liegt in einem eigenen Router **ohne `ChatStoreDep`** --
diese Dependency ist der Auth-Gate (`container.py:320-329` liefert `None` ohne
Sitzung, die Routen machen daraus 401). Ein eigener Router macht am Import
sichtbar, dass hier bewusst keine Sitzung verlangt wird.

Antwort ist `ChatDetail` ohne Zusatzfelder. Nicht geteilt oder nicht vorhanden
sind **derselbe** 404 -- ein 403 wuerde verraten, dass die UUID existiert.

Frontend-Proxys unter `frontend/app/api/` analog zu den bestehenden.

## Frontend

### Das ⋯-Menue an der Chat-Zeile

`components/chat/chat-sidebar.tsx:580-601` hat heute Rename und Delete. Neu:

```
Copy link          (immer)
Share chat    ⇄    (Umschalter; zeigt "Shared" wenn aktiv)
──────────────
Rename
Delete             (destructive)
```

Ein geteilter Chat traegt in der Seitenleiste ein dezentes Abzeichen, damit man
ohne Menue sieht, welche Verlaeufe offen liegen. Copy link bleibt was es ist --
die URL in die Zwischenablage -- und wird ausdruecklich **nicht** mit dem Teilen
vermengt: einen Link kopieren heisst nicht, ihn veroeffentlichen zu wollen.

Beim ersten Teilen ein Bestaetigungsdialog, der benennt, was passiert: jeder mit
dem Link liest mit, auch kuenftige Nachrichten. Einmalig, danach nur noch der
Umschalter.

### Die oeffentliche Ansicht

Neue Komponente, gerendert wenn `/chat/[id]` ohne Sitzung auf einen geteilten
Chat trifft. Kein Composer, keine Seitenleiste, keine Aktionen. Kopfzeile mit
Titel, Modell und Datum, ein Hinweis "Shared conversation" und ein Weg zum
Login.

Anspruch an die Gestaltung: Diese Seite ist fuer viele Besucher der erste und
einzige Kontakt mit dem Produkt. Sie soll wie eine bewusst gebaute Leseansicht
wirken -- grosszuegige Typografie, ruhige Abstaende, klare Sprecherwechsel --
und nicht wie der Chat mit ausgegrauten Knoepfen.

`<meta name="robots" content="noindex">` fuer diese Route: geteilt heisst per
Link erreichbar, nicht in Suchmaschinen auffindbar.

### Die Verzweigung

In `frontend/app/chat/layout.tsx` stand **kein** Auth-Guard -- das
`?next=%2Fchat` stammt aus einem Link, nicht aus einer Weiterleitung. Die
Verzweigung wurde also neu eingezogen, an zwei Stellen:

**Inhalt** (`chat-view.tsx`): entschieden wird am Konto, nicht an einem
fehlgeschlagenen Ladeversuch. Ein 401 als Steuersignal zu nehmen hiesse, jeden
anderen Fehler mit "dann eben oeffentlich" zu beantworten. Zwei Komponenten
statt zweier Zweige, weil die Hooks sich unterscheiden und bedingt aufgerufen
nicht erlaubt sind.

**Huelle** (`chat-shell.tsx`, beim Bauen dazugekommen): Das war im Entwurf
uebersehen. Die oeffentliche Ansicht laege sonst im vollen Chat-Layout --
Seitenleiste, Palette und Einfuehrung setzen alle eine Anmeldung voraus und
staenden mit leeren Listen und fehlschlagenden Abfragen da. Das Layout ist
deshalb auf eine Client-Komponente umgestellt, die dieselbe Frage stellt und
Unangemeldeten eine schmale Huelle ohne Chrome gibt. `layout.tsx` selbst ist
jetzt vier Zeilen.

## Sicherheit

- Wer den Link hat, liest mit. Die UUID ist die einzige Huerde -- nicht ratbar,
  aber auch nicht widerrufbar ausser durch Un-share.
- Un-share loescht die Kopie sofort. Was Suchmaschinen oder Caches bereits
  gesehen haben, holt das nicht zurueck; `noindex` soll genau das seltener machen.
- Der oeffentliche Endpunkt liefert nur `public_chats`. Es gibt keinen Pfad, auf
  dem er die Tabelle `chats` beruehrt.
- Geteilte Chats sind fuer den Serverbetreiber lesbar. Das ist die bewusst
  gewaehlte Folge der App-Schluessel-Variante und gilt **nur** fuer geteilte
  Chats; private bleiben ohne Passwort unlesbar.

## Randfaelle

| Fall | Verhalten |
|---|---|
| Original wird geloescht | `DELETE /chats/{id}` loescht die oeffentliche Kopie mit |
| Konto wird geloescht | `delete_all` raeumt `public_chats` mit ab |
| Passwortwechsel (DEK-Rotation) | Oeffentliche Kopie unberuehrt -- sie haengt am App-Schluessel, nicht am DEK |
| SECRET aendert sich | Alle Kopien unlesbar. Muss dokumentiert sein; kein automatisches Neuverschluesseln |
| Angemeldet, aber fremder geteilter Chat | Einbenutzer-System, faellt heute nicht an -- die Leseansicht greift trotzdem, wenn `chats` die id nicht kennt |
| Chat geteilt, dann alle Nachrichten versteckt | Oeffentliche Kopie wird leer; Ansicht zeigt einen leeren Zustand statt eines Fehlers |
| Teilen mit SECRET=Default | 400 mit klarer Meldung, keine Kopie |

## Testing

- `app_schluessel` ist deterministisch und liefert 32 Byte.
- Roundtrip: teilen, ohne Sitzung lesen, Inhalt stimmt.
- Versteckte Nachrichten tauchen in der oeffentlichen Kopie nicht auf.
- Un-share -> danach 404, und zwar derselbe wie bei unbekannter id.
- Der oeffentliche GET funktioniert **ohne** Session-Header (der eigentliche Punkt).
- Original loeschen raeumt die Kopie ab.
- Teilen bei Default-SECRET wird abgelehnt.
- Regression: alle bestehenden `/chats`-Routen bleiben ohne Sitzung 401.

## Nicht im Scope

Ablaufdatum fuer Links, Passwortschutz, Zugriffszaehler, Kommentare, Teilen
einzelner Nachrichten, Mehrbenutzer-Sichtbarkeit, Fortsetzen eines geteilten
Chats als Kopie.
