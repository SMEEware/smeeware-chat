---
name: svg-diagramm
description: Ein einfaches Diagramm oder Schaubild als SVG erzeugen, im Speicher ablegen und im Chat anzeigen (Ablauf, Flow, Vergleich, einfacher Balken). Nutze das, wenn jemand etwas "zeichnen/visualisieren/als Grafik" will.
why: Bündelt die Kette svg schreiben -> storage_put -> im Chat einbetten, mit einem Stil der im Dark-Chat lesbar ist.
---

# SVG-Diagramm erzeugen und zeigen

Du kannst Bilder nicht malen, aber SVG ist Text — den schreibst du selbst.

## Vorgehen

1. Baue ein SVG als String. Halte dich an den Stil unten, damit es im hellen
   wie im dunklen Chat lesbar ist.
2. `storage_put` mit einem sprechenden `key` (z. B. `diagramme/<thema>.svg`)
   und dem SVG als `content`. Setze `content_type` auf `image/svg+xml`.
3. Binde die zurückgegebene URL als `![Kurzbeschreibung](URL)` in deine Antwort.

## Stil

- `viewBox` statt fester Breite/Höhe; Grundfläche z. B. `0 0 900 260`.
- Kein weißer Hintergrund — nutze eine dezente Fläche oder gar keine, und
  Rahmen/Text in einer Farbe, die auf hell UND dunkel funktioniert
  (z. B. `#e2e8f0` Flächen mit `#0f172a` Text, oder umgekehrt).
- Schrift: `font-family="system-ui, sans-serif"`, Titel ~20px, Text ~14px.
- Kästen mit `rx="10"` für runde Ecken, Pfeile über ein `<marker>`.
- Beschrifte klar; lieber wenige große Elemente als viele kleine.

## Prüfen

Nach dem Ablegen einmal kurz gegen dich selbst prüfen: Ergibt die Beschriftung
Sinn, sind alle Kästen verbunden? Wenn nicht, korrigiere das SVG und lade es
unter demselben `key` erneut hoch (überschreibt).
