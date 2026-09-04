# Zitieren per Rechtsklick & Nachrichten verstecken

Stand: 2026-09-04 · Status: zur Review · Betrifft: nur Frontend

## Ziel

Zwei Dinge, die sich ein UI-Element teilen:

1. **Zitieren.** Text in einer Chat-Nachricht markieren, per Rechtsklick in ein
   eigenes Menue, von dort als Zitat in den naechsten Prompt.
2. **Verstecken.** Einzelne Nachrichten aus dem Verlauf nehmen -- unsichtbar in
   der Ansicht und weg aus dem Modellkontext, in der Ablage aber erhalten und
   damit umkehrbar.

Beides haengt am selben Rechtsklick-Menue, deshalb eine gemeinsame Spec.

## Ist-Zustand

Der Befehl `referenceContent` ("Quote selection") ist funktionsunfaehig.
`frontend/components/chat/chat-panel.tsx:242-250`:

```ts
const auswahl = window.getSelection?.()?.toString().trim() ?? "";
const text = auswahl || letzteAntwort();
```

Zwei Ursachen greifen ineinander:

- **Die Auswahl ist zur Laufzeit immer leer.** Der Befehl wird aus Palette oder
  Slash-Menue ausgeloest. Beide ziehen den Fokus in ein Eingabefeld, wodurch der
  Browser die Dokument-Auswahl verwirft, bevor der Handler laeuft. Ein per
  Kommando ausgeloestes "Quote selection" *kann* keine Selektion sehen.
- **Der Fallback maskiert den Fehler.** `|| letzteAntwort()` quotet daraufhin
  stillschweigend die komplette letzte Antwort. Das ist das beobachtete Symptom.

Daraus folgt die Bauform: Das Zitieren muss an einem Ereignis haengen, bei dem
die Auswahl noch lebt. Der Rechtsklick ist genau das.

## Track A -- Zitieren

### Das Menue

`components/ui/context-menu.tsx` (shadcn) liegt bereits im Projekt und wird
verwendet -- kein Neubau.

Ort: `frontend/components/chat/chat-message.tsx`, als Huelle um den gerenderten
Nachrichtentext. Eine Ref auf den Textcontainer haelt fest, was "innerhalb
dieser Nachricht" bedeutet.

**Abweichung vom urspruenglichen Entwurf (beim Bauen entschieden).** Geplant
war, das Menue nur bei vorhandener Auswahl zu oeffnen und sonst das native
Browsermenue durchzulassen. Umgesetzt ist: das Menue oeffnet immer, und die
Eintraege passen sich an.

Zwei Gruende. Erstens die Bedienung: ein Rechtsklick, der mal das eigene und
mal das Browsermenue zeigt, fuehlt sich kaputt an -- kein Produkt mit eigenem
Kontextmenue macht das. Zweitens die Technik: Base UI ruft im Trigger selbst
`preventDefault` auf, das native Menue durchzulassen hiesse, gegen die
Bibliothek zu arbeiten.

Mit Auswahl beziehen sich die Eintraege auf den markierten Teil ("Quote
selection", "Copy selection"), ohne auf die ganze Nachricht ("Quote message",
"Copy message"). Die Auswahl wird im `onContextMenu` eingefroren, bevor das
Menue den Fokus uebernimmt -- genau der Fehler, an dem der alte Befehl
scheiterte.

Beschnitten wird auf die Nachricht, in der geklickt wurde: `intersectsNode`
plus `compareBoundaryPoints` gegen einen Range ueber den Container.

Eintraege: **Quote**, **Copy**, Trenner, **Hide/Show message**.

Zusaetzlich noetig: `select-text` am Trigger. Base UI setzt dort `select-none`
-- ohne die Ueberschreibung liesse sich in einer Nachricht gar nichts
markieren, was den ganzen Zweck aufhebt.

### Vom Zitat zum Prompt

Nicht als Text ins Eingabefeld (heutiges `dispatchInsert`), sondern als eigener
Zustand: eine Karte ueber dem Composer mit dem Ausschnitt, der Rolle des Autors
und einem X zum Verwerfen -- das Reply-Muster aus Slack/Discord.

Begruendung: ein `> `-Block im Textfeld laesst sich nur noch muehsam wieder
herausloeschen, kollidiert mit dem, was man tippen will, und sieht in einem
Composer ohne Markdown-Vorschau nach Rohtext aus.

- **Zustand:** `zitat: { text: string; role: "user" | "assistant"; messageId: string } | null`
  im Composer. Genau eines -- ein zweites Zitat ersetzt das erste.
- **Beim Absenden** wird daraus im Nutzertext ein Markdown-Blockquote mit
  Zuordnung, danach der getippte Text. Das Modell bekommt also weiterhin
  gewoehnliches Markdown, kein Sonderformat.
- **Verwerfen:** X auf der Karte, oder Escape solange der Composer leer ist.
- Zu lange Zitate werden in der Karte auf ~6 Zeilen mit Fade beschnitten. In
  den Prompt geht der volle markierte Text -- die Kuerzung ist Anzeige, keine
  Datenaenderung.

### Was mit den bestehenden Befehlen passiert

- `referenceMessage` ("Quote last answer") **bleibt unveraendert** -- der Befehl
  ist korrekt, er braucht keine Selektion. Er befuellt kuenftig dieselbe
  Zitat-Karte statt das Textfeld.
- `referenceContent` ("Quote selection") **verliert den Fallback**. Ohne
  Selektion sagt er, dass man erst markieren soll, und tut sonst nichts. Der
  Katalogeintrag ist ganz entfallen (mit einem Kommentar an seiner Stelle,
  der erklaert warum); das Ereignis und der Hoerer bleiben, damit ein
  Tastenkuerzel spaeter ohne Fokuswechsel ausloesen kann.

## Track B -- Nachrichten verstecken

### Datenmodell

`hidden?: boolean` an `ChatMessage` in `frontend/lib/chat/types.ts`.

**Keine Backend-Aenderung noetig.** `backend/src/schemas/chats.py` setzt auf
`StoredMessage` ausdruecklich `model_config = {"extra": "allow"}`, mit dem
Hinweis im Modul-Docstring, dass Zusatzfelder des Frontends unveraendert durch
Validierung und Ablage laufen. `hidden` faellt darunter.

Fehlendes Feld = sichtbar. Bestehende Verlaeufe brauchen keine Migration.

### Wirkung

- **Ansicht:** versteckte Nachrichten werden nicht gerendert. An ihrer Stelle
  steht pro zusammenhaengendem Block eine dezente Zeile
  "N Nachrichten ausgeblendet · einblenden", die sie zurueckholt.
- **Modellkontext:** Filter in `frontend/lib/chat/turn-runner.ts:92`
  (`zuWireMessages`).

  **Reihenfolge ist hier kritisch:** Der Filter muss *vor*
  `messages.map((m) => m.role).lastIndexOf("user")` greifen. Sonst zeigt
  `letzterNutzer` auf eine Position im ungefilterten Array, und der
  Workspace-Block landet an der falschen Nachricht oder faellt ganz heraus.
- **Persistenz:** laeuft ueber den bestehenden Upsert mit -- kein neuer Endpunkt.

### Bewusst nicht gebaut

Kein paarweises Verstecken (Frage nimmt Antwort mit). Eine verwaiste Antwort
ohne Frage ist ein Zustand, den man sehen und selbst aufloesen kann; automatisch
zwei Dinge zu loeschen, wo eines angeklickt wurde, ist schwerer zu durchschauen.

## Gestaltung

Das Menue ist das erste eigene Kontextmenue der App und setzt damit einen
Standard. Anspruch: es soll wirken, als gehoere es zum System, nicht als sei es
nachtraeglich angeklebt.

- **Auf das native Menue verzichten heisst, es ersetzen zu muessen.** Wer
  rechtsklickt, erwartet mindestens Kopieren. Darum steht Copy im Menue, auch
  wenn der eigentliche Anlass Quote ist.
- Eintraege mit Icon links und Kuerzel rechts, in der Reihenfolge
  haeufig -> selten: Quote, Copy, Trenner, Hide message.
- Hide ist `variant="destructive"` -- wie Delete in der Seitenleiste, damit die
  Farbe im Produkt dasselbe bedeutet.
- Eroeffnung mit der Bewegung, die `context-menu.tsx` mitbringt. Keine eigene
  Animation: die Menues sollen sich untereinander gleich anfuehlen.
- Die Zitat-Karte ueber dem Composer traegt einen farbigen Streifen links
  (`border-s-2`) wie das Blockquote in `markdown.tsx:190`, damit Zitat im
  Eingabefeld und Zitat im Verlauf sichtbar dasselbe sind.
- Anfassbare Flaechen mindestens 32px hoch, damit Long-Press auf dem Handy
  nicht zum Zielen wird.

## Randfaelle

| Fall | Verhalten |
|---|---|
| Auswahl spannt ueber zwei Nachrichten | Menue oeffnet an der Nachricht, in der der Rechtsklick sitzt; zitiert wird der Teil der Auswahl in dieser Nachricht |
| Auswahl in einem Codeblock | Zitat behaelt den Text roh; Blockquote-Umbruch pro Zeile |
| Alle Nachrichten versteckt | Composer bleibt bedienbar; `zuWireMessages` liefert ein leeres Array, der naechste Prompt startet ohne Verlauf |
| Zitat aus einer Nachricht, die danach versteckt wird | Zitat bleibt in der Karte -- es ist ab dem Kopieren eigenstaendiger Text |
| Rechtsklick auf Auswahl ausserhalb jeder Nachricht | Natives Browsermenue |
| Touch-Geraet ohne Rechtsklick | Long-Press loest `contextmenu` aus; shadcn deckt das ab. Keine Extraarbeit, aber zu pruefen |

## Testing

- `zuWireMessages` mit gemischtem `hidden`: versteckte fehlen im Payload, und
  der Workspace-Block haengt an der letzten *sichtbaren* Nutzernachricht.
- `zuWireMessages` ohne `hidden`-Feld: Payload identisch zu heute (Regression).
- Zitat-Serialisierung: mehrzeiliger Text wird zu korrektem Blockquote,
  leerer/whitespace-Text erzeugt gar kein Zitat.
- Menue-Gate: leere Auswahl oeffnet das eigene Menue nicht.
- Manuell: Rechtsklick in Nutzer- wie Assistenznachricht, Zitat absenden,
  verstecken und wieder einblenden, Reload -- `hidden` ueberlebt.

## Nicht im Scope

Mehrfachzitate, Zitieren ueber Chatgrenzen, echtes Loeschen aus der Ablage,
Zitat-Rueckverlinkung auf die Ursprungsnachricht.
